"use server";

import { chargerDossierComplet } from "@/server/domain/dossier";
import { chargerDossierScolarite } from "@/server/domain/dossier-eleve";
import { peut, requirePermission } from "@/server/guard";

export type ApercuDossier = {
  naissance: string;
  inscriptionId: string | null;
  classeId: string | null;
  statut: string;
  sexe: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  statutDossier: string | null;
  annee: string | null;
  classe: string | null;
  typeInscription: string | null;
  estRedoublant: boolean;
  parents: Array<{
    id: string; nom: string; prenom: string; lien: string;
    telephone: string; email: string | null; principal: boolean;
  }>;
  scolarite: {
    moyenne: number | null; periode: string | null;
  } | null;
  finances: {
    reste: number; dernierPaiement: string | null; paiements: number;
  } | null;
  assiduite: {
    absences: number; retards: number; nonJustifiees: number;
  } | null;
  discipline: { incidents: number; sanctions: number } | null;
  activite: Array<{ texte: string; date: string }>;
};

/**
 * Aperçu volontairement plus léger que le dossier complet : déclenché seulement
 * à l'ouverture du panneau, recontrôle chaque permission et ne renvoie aucune
 * note, finance, famille ou santé hors du périmètre de l'agent.
 */
export async function chargerApercuEleve(id: string): Promise<ApercuDossier | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const principal = await requirePermission("eleve:lire", { eleveId: id });
  const dossier = await chargerDossierComplet(id);
  if (!dossier) return null;

  const { eleve, inscription, tuteurs, historiqueStatuts, changementsClasse } = dossier;
  const scope = { eleveId: id, classeId: inscription?.classeId };
  const [parentsAutorises, notesAutorisees, financesAutorisees, assiduiteAutorisee, disciplineAutorisee] = await Promise.all([
    peut(principal, "tuteur:gerer", scope),
    peut(principal, "note:lire", scope),
    peut(principal, "finance:lire", scope),
    peut(principal, "assiduite:lire", scope),
    peut(principal, "discipline:lire", scope),
  ]);
  const scolaires = inscription && (notesAutorisees || financesAutorisees || assiduiteAutorisee || disciplineAutorisee)
    ? await chargerDossierScolarite(inscription.id, null)
    : null;

  const derniersMoyennes = scolaires?.evolution.filter((p) => p.moyenne !== null) ?? [];
  const moyenne = derniersMoyennes.length ? derniersMoyennes[derniersMoyennes.length - 1] : null;
  const paiements = scolaires?.paiements.filter((p) => !p.annule) ?? [];
  const activite = [
    ...historiqueStatuts.slice(0, 3).map((h) => ({ texte: "Statut : " + h.nouveauStatut.replaceAll("_", " ").toLowerCase(), date: h.creeLe })),
    ...changementsClasse.slice(0, 3).map((c) => ({ texte: "Changement de classe : " + c.destination, date: c.dateEffet })),
    ...(inscription ? [{ texte: "Inscription : " + inscription.classeLibelle, date: inscription.dateInscription }] : []),
  ].sort((a,b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 4);

  return {
    naissance: eleve.dateNaissance,
    inscriptionId: inscription?.id ?? null,
    classeId: inscription?.classeId ?? null,
    statut: eleve.statut,
    sexe: eleve.sexe,
    adresse: eleve.adresse,
    telephone: eleve.telephone,
    email: eleve.email,
    statutDossier: inscription?.statutDossier ?? null,
    annee: inscription?.anneeLibelle ?? null,
    classe: inscription?.classeLibelle ?? null,
    typeInscription: inscription?.type ?? null,
    estRedoublant: inscription?.estRedoublant ?? false,
    parents: parentsAutorises ? tuteurs.map((t) => ({
      id: t.id, nom: t.nom, prenom: t.prenom, lien: t.lien,
      telephone: t.telephone, email: t.email, principal: t.estPrincipal,
    })) : [],
    scolarite: notesAutorisees ? { moyenne: moyenne?.moyenne ?? null, periode: moyenne?.periode ?? null } : null,
    finances: financesAutorisees ? {
      reste: scolaires?.echeances.reduce((s,e) => s + Math.max(0,e.reste), 0) ?? 0,
      dernierPaiement: paiements[0]?.date ?? null,
      paiements: paiements.length,
    } : null,
    assiduite: assiduiteAutorisee ? {
      absences: scolaires?.assiduite.filter((e) => e.type === "absence").length ?? 0,
      retards: scolaires?.assiduite.filter((e) => e.type === "retard").length ?? 0,
      nonJustifiees: scolaires?.assiduite.filter((e) => e.statut === "NON_JUSTIFIEE" || e.statut === "NON_JUSTIFIE").length ?? 0,
    } : null,
    discipline: disciplineAutorisee ? {
      incidents: scolaires?.discipline.filter((e) => e.nature === "incident").length ?? 0,
      sanctions: scolaires?.discipline.filter((e) => e.nature === "sanction").length ?? 0,
    } : null,
    activite,
  };
}
