import { RaccourciOnglet } from "./raccourci-onglet";
import {
  Activity, CalendarDays, ClipboardList,
  CreditCard, FileCheck2, FileText, GraduationCap, History, Mail, MapPin,
  Phone, UserRound, Users, Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DossierComplet } from "@/server/domain/dossier";
import type { DossierScolarite } from "@/server/domain/dossier-eleve";

/**
 * Vue d'ensemble du dossier : uniquement des données déjà présentes dans les
 * domaines métier. Les documents générables ne sont pas présentés comme des
 * pièces déjà déposées ou validées.
 */
export function VueEnsembleEleve({
  dossier,
  scolarite,
  peutVoirFinances,
  peutVoirNotes,
  peutVoirAssiduite,
  peutVoirTuteurs,
  actions,
  documents,
  gestionTuteurs,
  bulletins,
}: {
  dossier: DossierComplet;
  scolarite: DossierScolarite | null;
  peutVoirFinances: boolean;
  peutVoirNotes: boolean;
  peutVoirAssiduite: boolean;
  peutVoirTuteurs: boolean;
  actions: React.ReactNode;
  documents: React.ReactNode;
  gestionTuteurs: React.ReactNode;
  bulletins: Array<{ periodeLibelle: string; periodeId: string; inscriptionId: string; publie: boolean }>;
}) {
  const { eleve, inscription, tuteurs, parcours, historiqueStatuts, changementsClasse } = dossier;
  const argent = (valeur: number) => valeur.toLocaleString("fr-FR") + " FCFA";
  const date = (valeur: string | null) => valeur
    ? new Date(valeur).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  const netDu = scolarite?.echeances.reduce((s, e) => s + e.du - e.exonere, 0) ?? 0;
  const paye = scolarite?.echeances.reduce((s, e) => s + e.paye, 0) ?? 0;
  const reste = scolarite?.echeances.reduce((s, e) => s + e.reste, 0) ?? 0;
  const progression = netDu > 0 ? Math.max(0, Math.min(100, Math.round(paye / netDu * 100))) : 0;

  const activites = [
    ...historiqueStatuts.map((s) => ({
      id: "statut-" + s.id, date: s.creeLe || s.dateEffet,
      texte: "Situation scolaire : " + s.nouveauStatut.replaceAll("_", " ").toLowerCase(),
      type: "Scolarité", nuance: "emerald",
    })),
    ...changementsClasse.map((c) => ({
      id: "classe-" + c.id, date: c.dateEffet,
      texte: "Changement de classe : " + c.origine + " → " + c.destination,
      type: "Scolarité", nuance: "blue",
    })),
    ...(scolarite?.assiduite ?? []).map((a) => ({
      id: "assiduite-" + a.id, date: a.date,
      texte: a.type === "absence" ? "Absence enregistrée" : "Retard enregistré",
      type: "Assiduité", nuance: "amber",
    })),
    ...(peutVoirFinances ? (scolarite?.paiements ?? []).filter((p) => !p.annule).map((p) => ({
      id: "paiement-" + p.id, date: p.date,
      texte: "Paiement enregistré : " + argent(p.montant),
      type: "Finances", nuance: "violet",
    })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  const precedent = parcours[1]?.classeLibelle ?? null;
  const informations = [
    ["Nom complet", eleve.prenom + " " + eleve.nom],
    ["Sexe", eleve.sexe === "F" ? "Féminin" : eleve.sexe === "M" ? "Masculin" : "Non renseigné"],
    ["Date de naissance", date(eleve.dateNaissance)],
    ["Lieu de naissance", eleve.lieuNaissance],
    ["Nationalité", eleve.nationalite],
    ["Adresse", [eleve.quartier, eleve.adresse].filter(Boolean).join(", ")],
  ] as const;

  const panneau = "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5";
  const titre = "flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 dark:text-foreground";
  const icon = "size-5 text-slate-800 dark:text-foreground";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)]">
        <section className={panneau} aria-label="Informations personnelles">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className={titre}><UserRound className={icon} aria-hidden />Informations personnelles</h2>
            <RaccourciOnglet onglet="identite">Voir tout</RaccourciOnglet>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-xl border border-slate-100 p-3 dark:border-border">
            {informations.map(([nom, valeur], index) => (
              <div key={nom} className={"min-w-0 " + (index >= 4 ? "col-span-2 border-t border-slate-100 pt-3 dark:border-border" : "")}>
                <p className="text-xs text-slate-500 dark:text-muted-foreground">{nom}</p>
                <p className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-foreground">{valeur || "—"}</p>
              </div>
            ))}
            <div className="col-span-2 border-t border-slate-100 pt-3 dark:border-border">
              <p className="flex items-center gap-2 text-xs text-slate-500"><Phone className="size-3.5 text-blue-600" aria-hidden /> Téléphone</p>
              <p className="mt-1 break-all text-sm font-medium">{eleve.telephone || "Non renseigné"}</p>
            </div>
            <div className="col-span-2 border-t border-slate-100 pt-3 dark:border-border">
              <p className="flex items-center gap-2 text-xs text-slate-500"><Mail className="size-3.5 text-blue-600" aria-hidden /> E-mail</p>
              <p className="mt-1 break-all text-sm font-medium">{eleve.email || "Non renseigné"}</p>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className={panneau} aria-label="Scolarité actuelle">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className={titre}><GraduationCap className={icon} aria-hidden />Scolarité actuelle</h2>
              <RaccourciOnglet onglet="scolarite">Détails</RaccourciOnglet>
            </div>
            {inscription ? (
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 p-3 dark:border-border sm:grid-cols-4">
                {[
                  ["Année scolaire", inscription.anneeLibelle],
                  ["Classe", inscription.classeLibelle],
                  ["Niveau", inscription.niveauLibelle],
                  ["Régime", "Non renseigné"],
                  ["Inscrit le", date(inscription.dateInscription)],
                  ["Redoublant", inscription.estRedoublant ? "Oui" : "Non"],
                  ["Classe précédente", precedent || "—"],
                  ["École précédente", eleve.ecoleOrigine || "—"],
                ].map(([nom, valeur]) => (
                  <div key={nom} className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-muted-foreground">{nom}</p>
                    <p className="mt-1 break-words text-sm font-semibold">{valeur}</p>
                  </div>
                ))}
              </div>
            ) : <p className="rounded-xl border p-4 text-sm text-muted-foreground">Aucune inscription scolaire enregistrée.</p>}
          </section>

          {peutVoirTuteurs ? (
            <section className={panneau} aria-label="Parents et tuteurs">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className={titre}><Users className={icon} aria-hidden />Parents & tuteurs</h2>
                {gestionTuteurs}
              </div>
              {tuteurs.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {tuteurs.slice(0, 4).map((t) => (
                    <article key={t.id} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/40 p-3 dark:border-border dark:bg-muted/20">
                      <div className="flex items-start gap-2.5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><UserRound className="size-5" aria-hidden /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{t.prenom} {t.nom}</p>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                            <span>{({ PERE: "Père", MERE: "Mère", TUTEUR: "Tuteur", ONCLE: "Oncle", TANTE: "Tante", GRAND_PARENT: "Grand-parent", FRERE_SOEUR: "Frère/sœur", AUTRE: "Autre" } as Record<string, string>)[t.lien] ?? t.lien}</span>
                            {t.estPrincipal ? <Badge className="h-5 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">Principal</Badge> : null}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-muted-foreground">
                        <p className="flex min-w-0 items-center gap-2"><Phone className="size-3.5 shrink-0" aria-hidden /><span className="break-all">{t.telephone}</span></p>
                        {t.email ? <p className="flex min-w-0 items-center gap-2"><Mail className="size-3.5 shrink-0" aria-hidden /><span className="break-all">{t.email}</span></p> : null}
                        {t.profession ? <p className="break-words">{t.profession}</p> : null}
                        {t.adresse ? <p className="flex items-start gap-2"><MapPin className="size-3.5 shrink-0" aria-hidden /><span>{t.adresse}</span></p> : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Aucun tuteur rattaché.</p>}
              {tuteurs.length > 4 ? <p className="mt-2 text-xs text-muted-foreground">{tuteurs.length - 4} autre(s) tuteur(s) dans l’onglet dédié.</p> : null}
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className={panneau} aria-label="Actions rapides">
            <div className="mb-4 flex items-center gap-2.5">
              <Activity className={icon} aria-hidden />
              <h2 className="text-base font-bold">Actions rapides</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {actions}
              {peutVoirNotes ? <RaccourciOnglet onglet="notes" className="h-9 justify-start gap-2 text-xs"><GraduationCap className="size-4" aria-hidden />Voir les notes</RaccourciOnglet> : null}
              {peutVoirAssiduite ? <RaccourciOnglet onglet="assiduite" className="h-9 justify-start gap-2 text-xs"><CalendarDays className="size-4" aria-hidden />Assiduité</RaccourciOnglet> : null}
              {peutVoirFinances ? <RaccourciOnglet onglet="finances" className="h-9 justify-start gap-2 text-xs"><CreditCard className="size-4" aria-hidden />Paiements</RaccourciOnglet> : null}
              <RaccourciOnglet onglet="documents" className="h-9 justify-start gap-2 text-xs"><FileText className="size-4" aria-hidden />Documents</RaccourciOnglet>
            </div>
          </section>

          <section className={panneau} aria-label="Documents scolaires">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className={titre}><FileText className={icon} aria-hidden />Documents scolaires</h2>
              {documents}
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 dark:border-border">
                <span className="flex min-w-0 items-center gap-2"><FileCheck2 className="size-4 shrink-0 text-blue-600" aria-hidden />Certificat de scolarité</span>
                <span className="shrink-0 text-[11px] text-slate-500">À éditer</span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 dark:border-border">
                <span className="flex min-w-0 items-center gap-2"><ClipboardList className="size-4 shrink-0 text-blue-600" aria-hidden />Fiche d’inscription</span>
                <span className="shrink-0 text-[11px] text-slate-500">À éditer</span>
              </li>
              {bulletins.slice(0, 3).map((b) => (
                <li key={b.periodeId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 dark:border-border">
                  <a className="flex min-w-0 items-center gap-2 text-blue-700 hover:underline" target="_blank" rel="noopener noreferrer" href={"/api/bulletins/" + b.inscriptionId + "/" + b.periodeId}>
                    <FileText className="size-4 shrink-0" aria-hidden /> Bulletin {b.periodeLibelle}
                  </a>
                  <span className={"shrink-0 text-[11px] " + (b.publie ? "text-emerald-700" : "text-amber-700")}>{b.publie ? "Publié" : "Brouillon"}</span>
                </li>
              ))}
            </ul>
            {bulletins.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Aucun bulletin enregistré pour l’instant.</p> : null}
          </section>
        </div>
      </div>

      <div className={"grid gap-4 " + (peutVoirFinances ? "xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1.1fr)]" : "")}>
        {peutVoirFinances ? (
          <section className={panneau} aria-label="Situation financière">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className={titre}><Wallet className={icon} aria-hidden />Situation financière</h2>
              <RaccourciOnglet onglet="finances">Voir les paiements</RaccourciOnglet>
            </div>
            {scolarite?.echeances.length ? (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/20"><p className="text-xs text-slate-500">Montant net dû</p><p className="mt-1 text-lg font-bold tabular-nums text-amber-700">{argent(netDu)}</p></div>
                  <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/20"><p className="text-xs text-slate-500">Montant payé</p><p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">{argent(paye)}</p></div>
                  <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/20"><p className="text-xs text-slate-500">Reste à payer</p><p className="mt-1 text-lg font-bold tabular-nums text-rose-700">{argent(reste)}</p></div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div role="progressbar" aria-label="Progression des paiements" aria-valuenow={progression} aria-valuemin={0} aria-valuemax={100} className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: progression + "%" }} /></div>
                  <span className="text-xs font-semibold tabular-nums">{progression} % payé</span>
                </div>
              </>
            ) : <p className="text-sm text-muted-foreground">Aucune échéance enregistrée pour cette scolarité.</p>}
          </section>
        ) : null}

        <section className={panneau} aria-label="Dernières activités">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className={titre}><History className={icon} aria-hidden />Dernières activités</h2>
            <RaccourciOnglet onglet="historique">Voir tout</RaccourciOnglet>
          </div>
          {activites.length ? (
            <ol className="space-y-3">
              {activites.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-xs">
                  <span className={"mt-1.5 size-2.5 shrink-0 rounded-full " + (a.nuance === "emerald" ? "bg-emerald-500" : a.nuance === "blue" ? "bg-blue-500" : a.nuance === "amber" ? "bg-amber-500" : "bg-violet-500")} aria-hidden />
                  <time className="w-[76px] shrink-0 text-slate-500">{date(a.date)}</time>
                  <span className="min-w-0 flex-1 break-words">{a.texte}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600 dark:bg-muted dark:text-foreground">{a.type}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted-foreground">Aucun événement enregistré à ce jour.</p>}
        </section>
      </div>
    </div>
  );
}
