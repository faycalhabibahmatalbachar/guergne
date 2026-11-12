/**
 * Situation scolaire : transfert, abandon, exclusion définitive, suspension,
 * réactivation.
 *
 * L'écriture est `changerStatut`, le parcours de l'écran : historique des
 * statuts, clôture de l'inscription pour un départ, refus de toute décision
 * sur un élève déjà parti, audit, notifications. Le droit réel dépend du statut
 * et c'est l'action qui l'exige (`eleve:exclure`, `eleve:transferer`…).
 *
 * Ce que l'agent ajoute :
 * - les données SANS LESQUELLES la décision n'a pas de sens : l'établissement
 *   d'accueil d'un transfert, la référence de la décision pour une exclusion
 *   (l'agent ne PRONONCE pas une exclusion : il enregistre une décision prise
 *   par l'autorité compétente), une date de fin pour une suspension ;
 * - un récapitulatif des CONSÉQUENCES (inscription close, irréversibilité,
 *   solde restant) relues au backend, avant le oui ;
 * - la relecture après écriture.
 */
import { WRITE } from "./guard.js";
import { jour, nomComplet, val } from "./rendu.js";
import { resoudreEleveParNom } from "./tools-dossiers.js";

const required = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const donnees = (r) => (r && r.ok !== false ? r.data : null);
const fcfa = (v) => `${Number(v ?? 0).toLocaleString("fr-FR")} FCFA`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const STATUTS = {
  TRANSFERE: { dits: ["transfert", "transfere", "transferer", "transferee"], libelle: "transfert vers un autre établissement", depart: true },
  ABANDON: { dits: ["abandon", "abandonne", "abandon de scolarite", "a quitte"], libelle: "abandon de scolarité", depart: true },
  EXCLU: { dits: ["exclusion", "exclu", "exclue", "exclusion definitive", "renvoi definitif"], libelle: "EXCLUSION DÉFINITIVE", depart: true },
  SUSPENDU_DISCIPLINE: { dits: ["suspension", "suspendu", "exclusion temporaire", "mise a pied"], libelle: "suspension disciplinaire", depart: false },
  SUSPENDU_IMPAYE: { dits: ["suspension pour impaye", "suspendu pour impaye", "impaye"], libelle: "suspension pour impayés", depart: false },
  INSCRIT: { dits: ["reactivation", "reactiver", "reintegrer", "reintegration", "fin de suspension"], libelle: "réactivation", depart: false },
};

const plat = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

/** « transfert », « exclusion définitive », « réintégrer »… → statut cible. */
export function statutDe(dit) {
  if (!required(dit)) return null;
  const brut = String(dit).trim().toUpperCase();
  if (STATUTS[brut]) return brut;
  const t = plat(dit);
  // Du plus précis au plus général : « suspension pour impayé » avant « suspension ».
  for (const s of ["SUSPENDU_IMPAYE", "EXCLU", "TRANSFERE", "ABANDON", "INSCRIT", "SUSPENDU_DISCIPLINE"]) {
    if (STATUTS[s].dits.some((f) => t === f || t.includes(f))) return s;
  }
  return null;
}

export const STATUT_TOOLS = [
  {
    name: "eleves.changer_statut",
    module: "eleves",
    description:
      "enregistrer un TRANSFERT (etablissement d'accueil requis), un ABANDON de scolarite, une EXCLUSION DEFINITIVE (reference de la decision requise), une suspension (date de fin) ou une reactivation. Cloture l'inscription pour un depart",
    permission: "eleve:lire",
    sensitivity: WRITE,
    confirmationObligatoire: true,
    // Ces informations ENGAGENT l'établissement : elles doivent avoir été
    // écrites par l'utilisateur. Le moteur retire toute valeur que le modèle
    // aurait complétée de lui-même, et la redemande.
    ditParLUtilisateur: ["decision", "etablissement"],
    action: "changerStatutEleve",
    parametres: {
      eleve: "OBLIGATOIRE, nom, prenom ou matricule de l'eleve",
      statut: "OBLIGATOIRE, transfert | abandon | exclusion definitive | suspension | suspension pour impaye | reactivation",
      motif: "OBLIGATOIRE, le motif, au moins 5 caracteres",
      etablissement: "pour un transfert : OBLIGATOIRE, l'etablissement d'accueil",
      decision: "pour une exclusion definitive : OBLIGATOIRE, la decision de l'autorite competente (ex. « conseil de discipline du 10/11/2026 »)",
      dateEffet: "facultatif, AAAA-MM-JJ, par defaut aujourd'hui",
      dateFinPrevue: "pour une suspension : AAAA-MM-JJ de fin prevue",
    },
    validate: (p) => {
      const e = {};
      const st = statutDe(p.statut);
      if (!required(p.eleve) && !required(p.eleveId)) e.eleve = "Élève requis.";
      if (!st) e.statut = "Statut inconnu : transfert, abandon, exclusion définitive, suspension, réactivation.";
      if (String(p.motif ?? "").trim().length < 5) e.motif = "Motif explicite requis (5 caractères au moins).";
      if (st === "TRANSFERE" && !required(p.etablissement)) e.etablissement = "Établissement d'accueil requis pour un transfert.";
      if (st === "EXCLU" && !required(p.decision)) {
        e.decision = "Une exclusion définitive s'enregistre sur décision de l'autorité compétente : donnez sa référence (instance et date).";
      }
      if (st?.startsWith("SUSPENDU") && required(p.dateFinPrevue) && !DATE.test(String(p.dateFinPrevue))) e.dateFinPrevue = "Date de fin au format AAAA-MM-JJ.";
      if (required(p.dateEffet) && !DATE.test(String(p.dateEffet))) e.dateEffet = "Date d'effet au format AAAA-MM-JJ.";
      return e;
    },
    summarize: (p) => `Changer le statut d'un eleve : ${val(p.statut)}.`,
    preparer: async (p, outils) => {
      const st = statutDe(p.statut);
      const def = STATUTS[st];
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      const f = donnees(await outils.guergne.ficheEleve({ eleveId: r.eleve.id }, outils.ctx));
      if (!f?.identite) return { ok: false, message: "La fiche de l'élève n'a pas pu être relue." };
      const actuel = f.identite.statut;
      if (actuel === st) return { ok: false, message: `${nomComplet(r.eleve)} est déjà dans cet état (${actuel}).` };
      if (["TRANSFERE", "ABANDON", "EXCLU"].includes(actuel)) {
        return { ok: false, message: `${nomComplet(r.eleve)} a déjà quitté l'établissement (${actuel}) : aucune autre décision n'est possible.` };
      }
      // L'exclusion porte la référence de la décision DANS le motif : c'est le
      // motif qui est historisé, et c'est lui qu'on relira en cas de recours.
      const motif = st === "EXCLU" ? `${String(p.motif).trim()} — décision : ${String(p.decision).trim()}` : String(p.motif).trim();
      const params = {
        eleveId: r.eleve.id,
        statut: st,
        motif,
        ...(required(p.dateEffet) ? { dateEffet: String(p.dateEffet) } : {}),
        ...(required(p.dateFinPrevue) ? { dateFinPrevue: String(p.dateFinPrevue) } : {}),
        ...(required(p.etablissement) ? { etablissement: String(p.etablissement).trim() } : {}),
      };
      const reste = Array.isArray(f.scolarite?.echeances) ? f.scolarite.echeances.reduce((s, x) => s + (Number(x?.reste) || 0), 0) : null;
      const texte = [
        `${def.libelle} — ${nomComplet(r.eleve)} (${val(r.eleve.matricule)}), statut actuel ${val(actuel)}`,
        f.inscription && f.inscription.active !== false
          ? `• inscription en cours : ${val(f.inscription.classeLibelle)} (${val(f.inscription.anneeLibelle)})`
          : "• aucune inscription active",
        `• motif : ${motif}`,
        params.etablissement ? `• établissement d'accueil : ${params.etablissement}` : null,
        `• date d'effet : ${params.dateEffet ?? "aujourd'hui"}${params.dateFinPrevue ? `, fin prévue le ${params.dateFinPrevue}` : ""}`,
        def.depart ? "• CONSÉQUENCE : l'inscription de l'année sera close. Seul l'archivage restera possible ensuite." : null,
        st === "EXCLU" ? "⚠️ Décision grave et définitive : vérifiez la référence de la décision avant de confirmer." : null,
        def.depart && reste ? `• solde restant dû : ${fcfa(reste)} (il n'est pas annulé par cette décision)` : null,
        "• les responsables seront informés par la file de notifications de l'établissement.",
      ]
        .filter(Boolean)
        .join("\n");
      return { ok: true, params, texte };
    },
    verifier: async ({ params, guergne, ctx }) => {
      const f = donnees(await guergne.ficheEleve({ eleveId: params.eleveId }, ctx));
      if (!f?.identite) return { ok: false, raison: "la fiche n'a pas pu être relue" };
      if (f.identite.statut !== params.statut) return { ok: false, raison: `statut relu ${f.identite.statut}, attendu ${params.statut}` };
      const depart = STATUTS[params.statut]?.depart;
      // `inscription` est la DERNIÈRE inscription, close ou non : c'est son
      // drapeau `active` qui tranche, pas sa présence.
      if (depart && f.inscription && f.inscription.active !== false) {
        return { ok: false, raison: "l'inscription de l'année apparaît toujours active" };
      }
      const dernier = (f.historique?.statuts ?? [])[0];
      return {
        ok: true,
        texte: [
          `✅ Vérifié : ${nomComplet(f.identite)} est désormais ${params.statut}${depart ? ", inscription close" : ""}.`,
          dernier ? `Historique : ${jour(dernier.dateEffet)}, ${val(dernier.ancienStatut, "—")} → ${val(dernier.nouveauStatut)}.` : null,
          params.statut === "TRANSFERE"
            ? `Certificat de transfert : https://lycee-guergne-renaissance.vercel.app/api/documents/certificat-transfert/${params.eleveId} (connexion requise, droit d'émettre des documents).`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
  },
];
