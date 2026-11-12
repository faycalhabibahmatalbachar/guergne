/**
 * La fiche complète d'un élève, lisible sur un téléphone.
 *
 * Le backend (`ficheEleve`) charge exactement ce qu'affiche la page
 * `/dashboard/eleves/[id]`, filtré section par section selon les droits de
 * l'acteur. Ici, on ne fait que METTRE EN FORME : aucun calcul métier, aucune
 * donnée inventée. Une section absente est dite absente ; une section masquée
 * faute de droit est nommée comme telle.
 */
import { READ } from "./guard.js";
import { jour, nomComplet, val } from "./rendu.js";
import { resoudreEleveParNom } from "./tools-dossiers.js";

const fcfa = (v) => `${Number(v ?? 0).toLocaleString("fr-FR")} FCFA`;
const sur20 = (v) =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}/20`;
const tableau = (v) => (Array.isArray(v) ? v : []);

const CHAMPS_ATTENDUS = [
  ["lieuNaissance", "lieu de naissance"],
  ["acteNaissanceNumero", "numéro d'acte de naissance"],
  ["adresse", "adresse"],
  ["quartier", "quartier"],
  ["photoUrl", "photo"],
];

const rolesTuteur = (t) =>
  [
    t.estPrincipal && "principal",
    t.estTuteurLegal && "tuteur légal",
    t.estResponsableFinancier && "responsable financier",
    t.estContactUrgence && "contact d'urgence",
    t.autoriseRetrait && "autorisé au retrait",
  ].filter(Boolean);

export function rendreFiche(f) {
  if (!f || typeof f !== "object" || !f.identite || typeof f.identite !== "object") return null;
  const e = f.identite;
  const out = [];

  // Identité
  out.push(`📋 Fiche de ${nomComplet(e)} — matricule ${val(e.matricule)}`);
  const ne = e.sexe === "M" ? "né" : "née";
  out.push(
    `• ${e.sexe === "F" ? "Fille" : e.sexe === "M" ? "Garçon" : "Sexe non renseigné"}` +
      (e.dateNaissance ? `, ${ne} le ${jour(e.dateNaissance)}` : ", date de naissance non renseignée") +
      (Number.isInteger(e.age) ? ` (${e.age} ans)` : "") +
      (e.lieuNaissance ? ` à ${e.lieuNaissance}` : ""),
  );
  out.push(`• Statut : ${val(e.statut)}${e.nationalite ? ` · nationalité ${e.nationalite}` : ""}`);
  const manquants = CHAMPS_ATTENDUS.filter(([c]) => !e[c]).map(([, l]) => l);
  if (manquants.length) out.push(`• Dossier incomplet : ${manquants.join(", ")}`);
  if (e.sante && typeof e.sante === "object") {
    const s = e.sante;
    const parts = [s.groupeSanguin && `groupe ${s.groupeSanguin}`, s.allergies && `allergies : ${s.allergies}`].filter(Boolean);
    out.push(`• Santé : ${parts.length ? parts.join(" ; ") : "rien de renseigné"}`);
  }

  // Scolarité
  const i = f.inscription;
  out.push("", "🎓 Scolarité");
  out.push(
    i && typeof i === "object"
      ? `• ${val(i.anneeLibelle)} : ${val(i.classeLibelle)}${i.serieCode ? ` (série ${i.serieCode})` : ""}` +
          `${i.estRedoublant ? ", redoublant" : ""}${i.estBoursier ? ", boursier" : ""} — inscrit le ${jour(i.dateInscription)}`
      : "• Aucune inscription active pour l'année en cours",
  );
  // La dernière inscription peut être CLOSE (transfert, abandon, exclusion) :
  // la présenter sans le dire ferait croire l'élève toujours en classe.
  if (i && typeof i === "object" && i.active === false) {
    out.push(
      `• ⚠️ Inscription CLOSE${i.dateSortie ? ` le ${jour(i.dateSortie)}` : ""}${i.motifSortie ? ` — ${i.motifSortie}` : ""}` +
        `${i.etablissementDestination ? ` — vers ${i.etablissementDestination}` : ""}`,
    );
  }
  const anciens = tableau(f.parcours).filter((p) => p && !p.active);
  if (anciens.length) out.push(`• Parcours : ${anciens.slice(0, 4).map((p) => `${val(p.anneeLibelle)} ${val(p.classeLibelle)}`).join(" · ")}`);

  // Responsables
  const tuteurs = tableau(f.tuteurs).filter(Boolean);
  out.push("", `👪 Responsables (${tuteurs.length})`);
  if (!tuteurs.length) out.push("• Aucun responsable rattaché");
  for (const t of tuteurs.slice(0, 5)) {
    const roles = rolesTuteur(t);
    out.push(
      `• ${nomComplet(t)} — ${val(t.lien)}, ${val(t.telephone, "sans téléphone")}` +
        `${roles.length ? ` (${roles.join(", ")})` : ""}${t.appActivee ? ", application activée" : ""}`,
    );
  }

  // Notes, assiduité, discipline, finances : seulement ce que le backend a ouvert
  const sc = f.scolarite && typeof f.scolarite === "object" ? f.scolarite : null;
  if (sc && Array.isArray(sc.releve)) {
    const notees = sc.releve.filter((m) => m && m.moyenne !== null && m.moyenne !== undefined);
    out.push("", `📝 Notes${sc.periodeReleve ? ` — ${sc.periodeReleve}` : ""}`);
    if (!notees.length) out.push("• Aucune moyenne pour cette période");
    for (const m of notees.slice(0, 8)) out.push(`• ${val(m.matiere)} : ${sur20(m.moyenne)}${m.rang ? `, rang ${m.rang}` : ""}`);
    const ev = tableau(sc.evolution).filter((p) => p && p.moyenne !== null && p.moyenne !== undefined);
    if (ev.length) {
      out.push(`• Moyenne générale : ${ev.map((p) => `${val(p.periode)} ${sur20(p.moyenne)}${p.rang ? ` (rang ${p.rang}/${val(p.effectif)})` : ""}`).join(" · ")}`);
    }
  }
  if (sc && Array.isArray(sc.assiduite)) {
    const a = sc.assiduite.filter(Boolean);
    const abs = a.filter((x) => x.type === "absence");
    const nonJ = abs.filter((x) => /NON_JUSTIFIEE/i.test(String(x.statut)));
    const ret = a.filter((x) => x.type === "retard");
    out.push("", "🕒 Assiduité", `• ${abs.length} absence(s), dont ${nonJ.length} non justifiée(s) · ${ret.length} retard(s)`);
    if (a[0]) out.push(`• Dernier événement : ${val(a[0].type)} le ${jour(a[0].date)} (${val(a[0].statut)})`);
  }
  if (sc && Array.isArray(sc.discipline)) {
    const d = sc.discipline.filter(Boolean);
    out.push(
      "",
      "⚖️ Discipline",
      d.length ? `• ${d.length} fait(s) : ${d.slice(0, 3).map((x) => `${jour(x.date)} ${val(x.libelle)}`).join(" · ")}` : "• Aucun incident ni sanction",
    );
  }
  if (sc && Array.isArray(sc.echeances)) {
    const ech = sc.echeances.filter(Boolean);
    const somme = (k) => ech.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    out.push("", "💰 Finances");
    out.push(
      ech.length
        ? `• Facturé ${fcfa(somme("du"))} · payé ${fcfa(somme("paye"))}${somme("exonere") ? ` · exonéré ${fcfa(somme("exonere"))}` : ""} · reste ${fcfa(somme("reste"))}`
        : "• Aucune échéance pour cette inscription",
    );
    const retard = ech.filter((x) => x.enRetard).length;
    if (retard) out.push(`• ${retard} échéance(s) en retard`);
    const p = tableau(sc.paiements).filter((x) => x && !x.annule);
    if (p[0]) out.push(`• Dernier paiement : ${fcfa(p[0].montant)} le ${jour(p[0].date)} (reçu ${val(p[0].numeroRecu)})`);
  }

  // Pièces
  const pieces = tableau(f.pieces).filter(Boolean);
  out.push(
    "",
    "📎 Pièces du dossier",
    pieces.length ? `• ${pieces.length} pièce(s) : ${[...new Set(pieces.map((x) => val(x.type)))].join(", ")}` : "• Aucune pièce déposée",
  );

  // Historique
  const h = f.historique && typeof f.historique === "object" ? f.historique : {};
  const evenements = [
    ...tableau(h.statuts).filter(Boolean).map((x) => ({ d: x.dateEffet, t: `statut ${val(x.ancienStatut, "—")} → ${val(x.nouveauStatut)} (${val(x.motif)})` })),
    ...tableau(h.changementsClasse).filter(Boolean).map((x) => ({ d: x.dateEffet, t: `classe ${val(x.origine)} → ${val(x.destination)}` })),
  ].sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const journal = tableau(h.journal).filter(Boolean);
  out.push("", "🗂️ Historique");
  if (!evenements.length && !journal.length) out.push("• Aucun changement de statut ni de classe enregistré");
  for (const ev of evenements.slice(0, 4)) out.push(`• ${jour(ev.d)} — ${ev.t}`);
  for (const j of journal.slice(0, 3)) out.push(`• ${jour(j.le)} — ${val(j.action)}${j.acteur ? ` par ${j.acteur}` : ""}`);

  const masquees = tableau(f.masquees).filter((x) => typeof x === "string");
  if (masquees.length) out.push("", `🔒 Non affiché faute de droit : ${masquees.join(", ")}.`);
  return out.join("\n");
}

export const FICHE_TOOLS = [
  {
    name: "eleves.fiche",
    module: "eleves",
    description:
      "fiche COMPLETE d'un eleve : identite, age, scolarite et parcours, responsables et leurs roles, notes, assiduite, discipline, finances, pieces du dossier, historique — selon les droits de l'utilisateur",
    permission: "eleve:lire",
    sensitivity: READ,
    action: "ficheEleve",
    parametres: { eleve: "OBLIGATOIRE, nom, prenom ou matricule de l'eleve tel que l'utilisateur l'a dit" },
    validate: (p) => (p.eleve || p.eleveId ? {} : { eleve: "Élève requis." }),
    summarize: () => "Fiche complete d'un eleve.",
    preparer: async (p, outils) => {
      const r = await resoudreEleveParNom(p.eleveId ?? p.eleve, outils);
      if (!r.ok) return r;
      return { ok: true, params: { eleveId: r.eleve.id } };
    },
    rendre: (f) => rendreFiche(f),
  },
];
