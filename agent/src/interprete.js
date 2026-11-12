/**
 * L'interprète : du message au plan.
 *
 * Il vivait dans `app.js`, au milieu du démarrage du service (WhatsApp, verrou,
 * serveur de santé). Impossible, donc, de l'éprouver sans lancer tout le
 * service : le banc d'essai conversationnel aurait dû en recopier la logique —
 * et un banc qui teste une copie ne prouve rien sur l'original.
 *
 * Il est ici une fabrique, à dépendances injectées. `app.js` et le banc
 * d'essai construisent le MÊME interprète ; seul le transport diffère.
 *
 * CE QUE LE MODÈLE VOIT (dans l'ordre)
 * ------------------------------------
 *   1. le contrat de réponse et le registre des outils, en MOTS : aucun
 *      identifiant technique (`ToolRegistry.invitePourNlu`) ;
 *   2. les libellés des classes et des périodes (`Referentiel.enLibelles`) ;
 *   3. la date du jour et les intervalles usuels (`contexteDates`) — sans
 *      eux, « cette semaine » était deviné ;
 *   4. le FIL : la dernière consultation en clair, et les jetons du foyer
 *      (`@eleve_courant`, `@eleves_du_resultat`) ;
 *   5. les préférences mémorisées, une question restée en suspens ;
 *   6. les derniers messages DE L'UTILISATEUR et les questions de l'agent —
 *      jamais le contenu d'une consultation ;
 *   7. le message.
 *
 * Le modèle ne reçoit donc ni résultat scolaire, ni identifiant : il planifie,
 * il ne lit pas.
 */
import { Referentiel } from "./referentiel.js";
import { resoudreNomsEleves } from "./resolution-eleves.js";
import { resoudreClasse } from "./resolveur.js";
import { completerParametresContexte, resoudreDemandeSuivi } from "./memory-policy.js";
import { parametresLisibles } from "./foyer.js";

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 86_400_000);

/**
 * La date, et ce que les gens en disent.
 *
 * Le modèle ne connaît pas la date du jour. Lui demander « les retards de la
 * semaine » revenait à lui faire inventer un intervalle. On lui donne donc le
 * jour (heure de N'Djamena) et les bornes déjà calculées.
 */
export function contexteDates(maintenant = new Date(), fuseau = "Africa/Ndjamena") {
  // Le jour civil dans le fuseau de l'établissement, ramené à minuit UTC pour
  // que l'arithmétique des jours soit exacte.
  const local = new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  const j = new Date(local + "T00:00:00Z");
  const lundi = plus(j, -((j.getUTCDay() + 6) % 7));
  const debutMois = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 1));
  const finMois = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() + 1, 0));
  const debutMoisDernier = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() - 1, 1));
  const finMoisDernier = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 0));
  return [
    `Date du jour : ${JOURS[j.getUTCDay()]} ${iso(j)}. Hier : ${iso(plus(j, -1))}. Demain : ${iso(plus(j, 1))}.`,
    `Cette semaine : du ${iso(lundi)} au ${iso(plus(lundi, 6))}. La semaine derniere : du ${iso(plus(lundi, -7))} au ${iso(plus(lundi, -1))}.`,
    `Ce mois-ci : du ${iso(debutMois)} au ${iso(finMois)}. Le mois dernier : du ${iso(debutMoisDernier)} au ${iso(finMoisDernier)}.`,
    "Toute expression de date (« aujourd'hui », « cette semaine », « en janvier », « du 3 au 7 ») devient depuis/jusqua (ou la date de l'outil), au format AAAA-MM-JJ.",
    "L'ANNEE SCOLAIRE en cours ne se deduit PAS de la date : c'est une donnee de l'etablissement (outil etablissement.annee_courante).",
  ].join("\n");
}

/** Le fil : ce dont on vient de parler, dit au modèle sans aucun identifiant. */
export function contexteFil({ lastTask = null, foyer = null }, listes) {
  const lignes = [];
  if (lastTask?.tool) {
    lignes.push(`- derniere consultation : outil=${lastTask.tool}, params=${JSON.stringify(parametresLisibles(lastTask.params ?? {}, listes))}`);
  }
  if (foyer?.eleveId) lignes.push('- un eleve est EN COURS dans ce fil : designe-le par "eleve":"@eleve_courant"');
  if (Array.isArray(foyer?.eleveIds) && foyer.eleveIds.length > 0) {
    lignes.push(`- le dernier resultat liste ${foyer.eleveIds.length} eleve(s) : designe-les par "eleves":"@eleves_du_resultat"`);
  }
  if (!lignes.length) return null;
  return [
    "FIL DE LA CONVERSATION (ce dont on vient de parler) :",
    ...lignes,
    "COMMENT T'EN SERVIR :",
    "- si le message PRECISE, RESTREINT, ETEND ou CORRIGE la derniere consultation (« et les retards ? », « seulement les non justifiees »,",
    "  « pour janvier », « non, la 6e B », « et en 3e B ? », « fais pareil pour l'autre classe »), reprends ses parametres et ne change QUE ce que",
    "  le message change. « et les X ? » change l'outil et garde les filtres ; « et pour la classe Y ? » garde l'outil et change la classe ;",
    "- si le message designe l'eleve en cours par un pronom ou un possessif (« sa fiche », « ses notes », « ses parents », « il », « elle »,",
    '  « combien doit-il », « change sa classe »), mets "eleve":"@eleve_courant" ;',
    '- si le message designe les eleves du dernier resultat (« leurs parents », « ces eleves », « parmi eux », « previens-les »), mets "eleves":"@eleves_du_resultat" ;',
    "- si le message ouvre un AUTRE sujet, ignore ce fil.",
    "Ne demande jamais « de quel eleve » ou « de quelle classe » quand le fil le dit.",
  ].join("\n");
}

/**
 * @param {object} o
 * @param {object|null} o.ia           MoteurIA (ou null : compréhension indisponible)
 * @param {object} o.outils            ToolRegistry
 * @param {object} o.referentiel       Referentiel
 * @param {object} o.guergne           client du backend scolaire
 * @param {boolean} [o.resolutionCentrale] le moteur dispose du résolveur central :
 *        l'interprète transmet alors les NOMS tels quels et ne résout rien lui-même
 * @param {() => Date} [o.maintenant]
 * @param {(e:object)=>void} [o.journal] reçoit la taille de l'invite (jamais son contenu)
 * @returns {(texte:string, ctx?:object) => Promise<object>}
 */
export function creerInterprete({ ia, outils, referentiel, guergne, resolutionCentrale = false, maintenant = () => new Date(), journal = null }) {
  /** Assemble exactement ce qui part au modèle. Exposé pour l'audit et les tests. */
  async function assembler(texte, ctx = {}) {
    const listes = await referentiel.pour(ctx.staff?.id);
    const mem = ctx.memory ?? {};
    const pending = mem.pending ?? null;
    const messages = [
      { role: "system", content: outils.invitePourNlu() },
      { role: "system", content: resolutionCentrale ? Referentiel.enLibelles(listes) : Referentiel.enTexte(listes) },
      { role: "system", content: contexteDates(maintenant()) },
    ];
    for (const resume of mem.summaries ?? []) {
      messages.push({ role: "system", content: "Résumé antérieur : " + resume });
    }
    for (const fait of mem.facts ?? []) {
      messages.push({
        role: "system",
        content: "Préférence mémorisée de l'utilisateur (" + fait.category + ") : " + fait.key + " = " + fait.value,
      });
    }
    const fil = contexteFil(mem, listes);
    if (fil) messages.push({ role: "system", content: fil });
    if (pending?.intention === "clarification" && pending.tool) {
      const { __choix, ...deja } = pending.params ?? {};
      messages.push({
        role: "system",
        content: "REPRISE : tu viens de poser une question pour l'outil " + pending.tool + ". Parametres deja collectes : " +
          JSON.stringify(parametresLisibles(deja, listes)) + ". Informations manquantes : " + JSON.stringify(pending.missingFields ?? []) + ". " +
          "Si le message y repond, renvoie CET outil avec TOUS les parametres deja collectes, completes par la reponse. " +
          "S'il s'agit d'une autre demande, traite-la normalement.",
      });
    }
    for (const message of (mem.history ?? []).slice(-10)) {
      if (["user", "assistant"].includes(message.role) && typeof message.content === "string") {
        messages.push({ role: message.role, content: message.content.slice(-2_000) });
      }
    }
    messages.push({ role: "user", content: texte });
    return { messages, listes };
  }

  async function interpret(texte, ctx = {}) {
    if (!ia) throw new Error("Aucun fournisseur IA configuré : compréhension indisponible.");
    const mem = ctx.memory ?? {};
    const pending = mem.pending ?? null;

    if (!resolutionCentrale) {
      // --- Chemin d'origine : sans résolveur central, quelques cas fréquents
      // sont résolus ici, sans modèle. Conservé pour les assemblages qui n'ont
      // pas le résolveur (tests historiques).
      const listes = await referentiel.pour(ctx.staff?.id);
      if (
        pending?.intention === "clarification" &&
        pending.tool === "eleves.rechercher" &&
        (pending.missingFields ?? []).includes("classeId")
      ) {
        const resolution = resoudreClasse(listes.classes, texte);
        if (resolution.statut === "unique") {
          return { intention: "outil", outil: "eleves.rechercher", params: { ...(pending.params ?? {}), classeId: resolution.classe.id } };
        }
        const candidats = (resolution.candidats ?? []).map((c) => c.libelle ?? c.code ?? c.nom ?? "?");
        return {
          intention: "clarifier",
          question: resolution.statut === "ambigu"
            ? "Plusieurs classes correspondent. Précisez laquelle : " + candidats.join(", ") + "."
            : "Je ne retrouve pas cette classe dans le référentiel. Indiquez son libellé exact.",
          outil: "eleves.rechercher",
          params: pending.params ?? {},
          missingFields: ["classeId"],
        };
      }
    }

    // Relance courte et sans équivoque (« et les retards ? ») : même périmètre,
    // autre consultation — sans modèle. Jamais quand le message porte un
    // possessif : « et ses absences ? » parle d'un élève, pas de la classe.
    if (!/\b(ses|son|sa|leurs?|lui|eux)\b/i.test(texte)) {
      const suivi = resoudreDemandeSuivi({ texte, dernierTravail: mem.lastTask });
      if (suivi) {
        // Les filtres de dates et de statut suivent aussi : « et les retards ? »
        // après « les absences de janvier » parle toujours de janvier.
        const source = mem.lastTask?.params ?? {};
        const outil = outils.get(suivi.outil);
        for (const cle of ["depuis", "jusqua", "eleveId"]) {
          if (source[cle] && outil?.parametres && cle in outil.parametres) suivi.params[cle] = source[cle];
        }
        return suivi;
      }
    }

    const { messages } = await assembler(texte, ctx);
    journal?.({
      type: "invite_assemblee",
      messages: messages.length,
      caracteres: messages.reduce((s, m) => s + m.content.length, 0),
      historique: (mem.history ?? []).length,
      fil: Boolean(mem.lastTask || mem.foyer),
    });

    const r = await ia.completerJson(messages);
    const plan = r.objet;
    if (!plan) return { clarify: "Je n'ai pas compris la demande." };
    if (plan.clarify) {
      return {
        intention: "clarifier",
        question: plan.clarify,
        outil: plan.tool ?? plan.outil ?? undefined,
        params: plan.params ?? {},
        missingFields: plan.missingFields ?? [],
      };
    }
    const nomOutil = plan.tool ?? plan.outil;
    if (!nomOutil) return plan;
    if (resolutionCentrale) return { ...plan, tool: nomOutil, params: plan.params ?? {} };

    const outil = outils.get(nomOutil);
    const contexte = completerParametresContexte({
      texte,
      dernierTravail: mem.lastTask,
      outilLecture: outil?.sensitivity === "read",
      parametres: plan.params ?? {},
    });
    const conv = await resoudreNomsEleves({ outil, params: contexte.parametres, guergne, acteurId: ctx.staff?.id });
    if (conv.statut === "clarifier") {
      return { intention: "clarifier", question: conv.question, outil: nomOutil, params: plan.params ?? {}, missingFields: ["recherche"] };
    }
    return { ...plan, tool: nomOutil, params: conv.params };
  }

  interpret.assembler = assembler;
  return interpret;
}
