import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { APP_CONFIG } from "@/config/app-config";
import { db } from "@/server/db";
import { eleves, inscriptions } from "@/server/db/schema";
import { exigerPage } from "@/server/guard";
import { listerAnnees, listerClassesAnnee } from "@/server/domain/parametres";
import { chargerIdentiteLycee } from "@/server/domain/identite-lycee";
import { BoutonImprimerListe } from "./print-button";
import "./impression.css";

export const metadata: Metadata = {
  title: "Liste nominative des élèves — Impression",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Parametres = { annee?: string; classes?: string };
const formatNaissance = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—";

/**
 * Document d'impression séparé de l'administration.
 * L'URL ne confère jamais les droits d'accès : toutes les autorisations et les
 * classes de l'année sélectionnée sont revérifiées à chaque consultation.
 */
export default async function ImpressionClasses({
  searchParams,
}: { searchParams: Promise<Parametres> }) {
  await exigerPage("classe:lire");
  await exigerPage("eleve:lire");

  const p = await searchParams;
  if (!p.annee || !z.string().uuid().safeParse(p.annee).success || !p.classes) notFound();
  const demandes = p.classes.split(",").map((s) => s.trim()).filter(Boolean);
  if (demandes.length === 0 || demandes.length > 100 ||
      demandes.some((id) => !z.string().uuid().safeParse(id).success)) notFound();
  const ids = [...new Set(demandes)];

  const [annees, classes, identite] = await Promise.all([
    listerAnnees(),
    listerClassesAnnee(p.annee),
    chargerIdentiteLycee(),
  ]);
  const annee = annees.find((a) => a.id === p.annee);
  if (!annee) notFound();
  const autorisees = classes.filter((c) => ids.includes(c.id));
  if (autorisees.length !== ids.length) notFound();

  const lignes = await db.select({
    classeId: inscriptions.classeId,
    matricule: eleves.matricule,
    nom: eleves.nom,
    prenom: eleves.prenom,
    sexe: eleves.sexe,
    dateNaissance: eleves.dateNaissance,
  }).from(inscriptions)
    .innerJoin(eleves, eq(eleves.id, inscriptions.eleveId))
    .where(and(
      eq(inscriptions.anneeId, annee.id),
      eq(inscriptions.active, true),
      inArray(inscriptions.classeId, ids),
    ))
    .orderBy(asc(inscriptions.classeId), asc(eleves.nom), asc(eleves.prenom), asc(eleves.matricule));

  const parClasse = new Map(autorisees.map((c) => [c.id, [] as typeof lignes]));
  for (const eleve of lignes) parClasse.get(eleve.classeId)?.push(eleve);

  const effectifTotal = lignes.length;

  return <main className="classes-impression">
    <div className="actions-impression">
      <div>
        <h1>Listes nominatives des élèves</h1>
        <p>{autorisees.length} classe{autorisees.length > 1 ? "s" : ""} · {effectifTotal} élève{effectifTotal > 1 ? "s" : ""} · {annee.libelle}</p>
      </div>
      <div className="actions-impression-boutons">
        <Link href={`/dashboard/classes?annee=${encodeURIComponent(annee.id)}`} className="bouton-retour">Retour aux classes</Link>
        <BoutonImprimerListe />
      </div>
    </div>

    <div className="feuilles-impression">
      {autorisees.map((classe) => {
        const inscrits = parClasse.get(classe.id) ?? [];
        const filles = inscrits.filter((e) => e.sexe === "F").length;
        const garcons = inscrits.filter((e) => e.sexe === "M").length;
        return <section className="feuille-classe" key={classe.id}>
          <header className="entete-officiel">
            <p className="ministere">Ministère de l'Éducation Nationale</p>
            <img src={APP_CONFIG.logoUrl} alt={"Logo officiel de " + APP_CONFIG.nomComplet} width={84} height={84} className="logo-officiel" />
            <h2>{identite?.nom || APP_CONFIG.nomComplet}</h2>
            <p className="coordonnees">N'Djamena · Tchad</p>
          </header>

          <div className="titre-liste">
            <p className="sur-titre">Registre scolaire · Année {annee.libelle}</p>
            <h3>LISTE NOMINATIVE DES ÉLÈVES</h3>
            <p className="nom-classe">Classe : <strong>{classe.libelle}</strong>{classe.serieCode ? " · Série " + classe.serieCode : ""}</p>
          </div>
          <div className="recapitulatif">
            <span>Effectif inscrit : <strong>{inscrits.length}</strong></span>
            <span>Filles : <strong>{filles}</strong></span>
            <span>Garçons : <strong>{garcons}</strong></span>
          </div>
          <table className="tableau-eleves">
            <colgroup>
              <col style={{ width: "7%" }} /><col style={{ width: "18%" }} />
              <col style={{ width: "37%" }} /><col style={{ width: "8%" }} />
              <col style={{ width: "16%" }} /><col style={{ width: "14%" }} />
            </colgroup>
            <thead><tr>
              <th scope="col">N°</th>
              <th scope="col">Matricule</th>
              <th scope="col">Nom et prénoms</th>
              <th scope="col">Sexe</th>
              <th scope="col">Naissance</th>
              <th scope="col">Émargement</th>
            </tr></thead>
            <tbody>
              {inscrits.map((e, i) => <tr key={e.matricule}>
                <td className="numero-ligne">{i + 1}</td>
                <td className="matricule">{e.matricule}</td>
                <td className="nom-eleve">{e.nom.toLocaleUpperCase("fr-FR")} {e.prenom}</td>
                <td className="centre">{e.sexe === "F" ? "F" : "M"}</td>
                <td className="centre">{formatNaissance(e.dateNaissance)}</td>
                <td aria-label="Case d'émargement"></td>
              </tr>)}
              {inscrits.length === 0 && <tr><td colSpan={6} className="vide">Aucun élève inscrit dans cette classe pour l'année sélectionnée.</td></tr>}
            </tbody>
          </table>
        </section>;
      })}
    </div>
  </main>;
}
