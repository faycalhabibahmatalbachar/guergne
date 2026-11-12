/**
 * Notifier des parents : cibler exactement, chiffrer, confirmer, mettre en file.
 *
 * L'envoi passe par l'action de l'écran « Notifier un groupe »
 * (`envoyerNotificationsGroupe`). C'est ELLE qui garantit : consentement SMS
 * respecté, SMS dédoublonnés par numéro, audience figée par empreinte (si la
 * liste change entre le devis et l'envoi, l'envoi est refusé), plafond de coût,
 * clé d'envoi idempotente.
 *
 * Ce que l'agent ajoute : traduire « uniquement le père de Mahamat » ou « les
 * parents de 4e B qui n'ont pas activé leur compte » en une sélection EXACTE ;
 * montrer le devis du backend avant le oui ; et ne jamais dire « envoyé » ni
 * « délivré » de messages qui sont MIS EN FILE.
 */
import { randomUUID } from "node:crypto";

import { SENSITIVE } from "./guard.js";
import { nomComplet, val } from "./rendu.js";
import { resoudreClasseParLibelle } from "./tools-dossiers.js";
import { choisirTuteur } from "./tools-parents.js";
import { resoudreEleveParNom } from "./tools-dossiers.js";
import { etatParent } from "./tools-scolarite.js";

const required = (v) => v !== undefined && v !== null && v !== "";
const donnees = (r) => (r && r.ok !== false ? r.data : null);
const fcfa = (v) => `${Number(v ?? 0).toLocaleString("fr-FR")} FCFA`;

const CANAUX = {
  AUTO: ["auto", "automatique", "par defaut"],
  APP: ["app", "application", "push", "notification", "boite", "boite interne", "interne"],
  SMS: ["sms", "texto", "sms uniquement", "par sms"],
  APP_ET_SMS: ["app et sms", "application et sms", "les deux", "app + sms", "application + sms"],
};

/** « par SMS », « application et SMS »… → le canal du backend (AUTO par défaut). */
export function canalDe(dit) {
  if (!required(dit)) return { canal: "AUTO" };
  const brut = String(dit).trim().toUpperCase();
  if (Object.keys(CANAUX).includes(brut)) return { canal: brut };
  const t = String(dit).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
  // L'ordre compte : « app et sms » contient « sms ».
  for (const c of ["APP_ET_SMS", "SMS", "APP", "AUTO"]) if (CANAUX[c].some((f) => t === f || t.includes(f))) return { canal: c };
  return { erreur: `Canal inconnu : « ${dit} ». Possibles : automatique, application, SMS, application et SMS.` };
}

export function rendreDevis(d, { titre, corps, canal, cible }) {
  return [
    `Notification « ${titre} » — ${cible}`,
    `Message : ${corps}`,
    `Canal demandé : ${canal}`,
    `• ${d.parentsSelectionnes} parent(s) ciblé(s), ${d.parentsJoignables} joignable(s)${d.nonJoignables ? `, ${d.nonJoignables} NON joignable(s)` : ""}`,
    `• ${d.total} notification(s) : ${d.parPush} push, ${d.parSms} SMS, ${d.dansApplication} dans l'application`,
    d.parSms ? `• Coût SMS estimé : ${fcfa(d.coutFcfa)} (${d.segments} segment(s)${d.smsDedoublonnes ? `, ${d.smsDedoublonnes} SMS évité(s) par numéro partagé` : ""})` : "• Aucun SMS : aucun coût",
    "Les SMS ne partent qu'aux parents qui les ont acceptés.",
  ].join("\n");
}

/** Au-delà, on prévient une classe entière, pas une liste. */
const MAX_ELEVES_GROUPE = 80;

export const NOTIFICATIONS_TOOLS = [
  {
    name: "notifications.parents",
    module: "notifications",
    description:
      "envoyer une notification aux parents : ceux d'un eleve (tous, ou un seul : « uniquement le pere »), ou un groupe (parents d'une classe, filtrables par etat de compte). Montre le devis (canaux, cout SMS) avant confirmation",
    permission: "message:envoyer",
    sensitivity: SENSITIVE,
    confirmationObligatoire: true,
    action: "envoyerNotificationParents",
    parametres: {
      eleve: "nom ou matricule de l'eleve dont on previent les parents (OU eleves, OU classe)",
      eleves: "plusieurs eleves a la fois : ecris « @eleves_du_resultat » pour ceux que la derniere consultation vient de lister (« leurs parents », « ces eleves »)",
      responsable: "facultatif, avec eleve : un seul responsable (« le pere », un prenom) ; par defaut tous",
      classe: "libelle de la classe dont on previent les parents (OU eleve)",
      etat: "facultatif, avec classe : sans compte | invite | actif",
      titre: "facultatif, objet court (3 a 80 caracteres) ; a defaut « Information du lycée »",
      message: "OBLIGATOIRE, texte du message (5 a 600 caracteres)",
      canal: "facultatif, automatique (defaut) | application | SMS | application et SMS",
    },
    validate: (p) => {
      const e = {};
      const plusieurs = Array.isArray(p.eleveIds) ? p.eleveIds.length > 0 : required(p.eleves);
      if (!required(p.eleve) && !required(p.eleveId) && !required(p.classe) && !plusieurs) e.destinataires = "Précisez l'élève ou la classe dont il faut prévenir les parents.";
      if (!required(p.titre)) p.titre = "Information du lycée";
      const titre = String(p.titre ?? "").trim();
      const corps = String(p.message ?? p.corps ?? "").trim();
      if (titre.length < 3 || titre.length > 80) e.titre = "Objet de 3 à 80 caractères.";
      if (corps.length < 5 || corps.length > 600) e.message = "Message de 5 à 600 caractères.";
      return e;
    },
    summarize: (p) => `Notifier des parents : « ${val(p.titre)} ».`,
    preparer: async (p, outils) => {
      const c = canalDe(p.canal);
      if (c.erreur) return { ok: false, message: c.erreur };
      const titre = String(p.titre).trim();
      const corps = String(p.message ?? p.corps).trim();

      let selection;
      let cible;
      if (Array.isArray(p.eleveIds) && p.eleveIds.length) {
        // Un ENSEMBLE d'élèves — ceux qu'une consultation vient de lister. Leurs
        // responsables sont relus un à un : la liste ne vient pas de la mémoire.
        const ids = [...new Set(p.eleveIds)].slice(0, MAX_ELEVES_GROUPE);
        const tuteurs = new Set();
        let sansResponsable = 0;
        for (let i = 0; i < ids.length; i += 8) {
          const lot = await Promise.all(ids.slice(i, i + 8).map((eleveId) => outils.guergne.tuteursDeLEleve({ eleveId }, outils.ctx)));
          for (const r of lot) {
            if (r?.ok === false) return { ok: false, message: r.message ?? "Les responsables n'ont pas pu être relus." };
            const liste = Array.isArray(r?.data) ? r.data : [];
            if (!liste.length) sansResponsable += 1;
            for (const x of liste) tuteurs.add(x.id ?? x.tuteurId);
          }
        }
        tuteurs.delete(undefined);
        if (!tuteurs.size) return { ok: false, message: "Aucun de ces élèves n'a de responsable rattaché." };
        selection = { mode: "ids", ids: [...tuteurs] };
        cible =
          `responsables de ${ids.length} élève(s)` +
          (p.eleveIds.length > ids.length ? ` (limité aux ${ids.length} premiers sur ${p.eleveIds.length})` : "") +
          (sansResponsable ? ` — ${sansResponsable} élève(s) sans responsable rattaché` : "");
      } else if (required(p.eleve) || required(p.eleveId)) {
        const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
        if (!r.ok) return r;
        const f = donnees(await outils.guergne.ficheEleve({ eleveId: r.eleve.id }, outils.ctx));
        const tuteurs = Array.isArray(f?.tuteurs) ? f.tuteurs : [];
        if (!tuteurs.length) return { ok: false, message: `${nomComplet(r.eleve)} n'a aucun responsable rattaché.` };
        let choisis = tuteurs;
        if (required(p.responsable)) {
          const t = choisirTuteur(tuteurs, p.responsable);
          if (!t.ok) return t;
          choisis = [t.tuteur];
        }
        selection = { mode: "ids", ids: choisis.map((t) => t.id) };
        cible = `${choisis.map((t) => `${nomComplet(t)} (${t.lien})`).join(", ")}, pour ${nomComplet(r.eleve)}`;
      } else {
        const cl = await resoudreClasseParLibelle(p.classe, outils);
        if (!cl.ok) return cl;
        const e = etatParent(p.etat);
        if (e.erreur) return { ok: false, message: e.erreur };
        selection = { mode: "filtres", filtres: { recherche: "", etat: e.etat ?? "", classeId: cl.classe.id }, exclureIds: [] };
        cible = `parents de ${cl.classe.libelle}${e.etat ? ` (${e.etat})` : ""}`;
      }

      const contenu = { selection, titre, corps, canal: c.canal, programmation: null };
      const devis = await outils.guergne.devisNotificationParents(contenu, outils.ctx);
      if (devis?.ok === false) return { ok: false, message: devis.message ?? "Le devis n'a pas pu être établi." };
      const d = donnees(devis);
      if (!d || typeof d.total !== "number") return { ok: false, message: "Le devis rendu par la plateforme est illisible." };
      if (d.total === 0) return { ok: false, message: `Aucun parent joignable pour ${cible} : rien ne serait envoyé.` };

      return {
        ok: true,
        // Tout ce qui borne l'envoi vient du DEVIS : si l'audience ou le coût
        // changent avant le oui, le backend refusera.
        params: {
          ...contenu,
          plafondCoutFcfa: d.coutFcfa,
          plafondNotifications: d.total,
          parentsConfirmes: d.parentsSelectionnes,
          empreinteAudience: d.empreinteAudience,
          confirmationDiffusion: true,
          // Figée avec la confirmation : un second oui, une reprise, ne
          // produisent pas un second envoi.
          cleEnvoi: randomUUID(),
        },
        texte: rendreDevis(d, { titre, corps, canal: c.canal, cible }),
      };
    },
    verifier: async ({ result, params }) => {
      const msg = result?.data?.message ?? result?.message;
      if (result?.ok === false || result?.data?.ok === false) return { ok: false, raison: msg ?? "envoi refusé" };
      // Le backend met en FILE ; la livraison se constate plus tard, message
      // par message. Ne jamais dire « délivré » ici.
      return {
        ok: true,
        texte: `✅ Notification mise en file (${params.plafondNotifications} message(s) au plus). ${msg ?? ""}\nLa livraison effective se vérifie ensuite dans l'historique des notifications.`.trim(),
      };
    },
  },
];
