import {
  Activity, CalendarDays, ClipboardList, CreditCard, FileCheck2, FileText,
  GraduationCap, History, Mail, MapPin, Phone, UserRound, Users, Wallet,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DossierComplet } from "@/server/domain/dossier";
import type { DossierScolarite } from "@/server/domain/dossier-eleve";
import { RaccourciOnglet } from "./raccourci-onglet";
import styles from "./vue-ensemble.module.css";

type Bulletin = { periodeLibelle: string; periodeId: string; inscriptionId: string; publie: boolean };

const LIEN: Record<string, string> = {
  PERE: "Père", MERE: "Mère", TUTEUR: "Tuteur légal", ONCLE: "Oncle",
  TANTE: "Tante", GRAND_PARENT: "Grand-parent", FRERE_SOEUR: "Frère / sœur", AUTRE: "Autre",
};

const classCard = "min-w-0 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-4.5";
const classTitre = "flex min-w-0 items-center gap-2.5 text-[15px] font-bold tracking-tight text-slate-900 dark:text-foreground";
const classIcone = "size-5 shrink-0 text-[#102b53] dark:text-foreground";

const dt = "text-[11px] font-medium leading-4 text-slate-500 dark:text-muted-foreground";
const dd = "mt-1 break-words text-[13px] font-semibold leading-5 text-[#142450] dark:text-foreground";

function DateCourte({ value }: { value: string | null }) {
  return <>{value ? new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</>;
}

function Valeur({ nom, valeur, className = "" }: { nom: string; valeur: React.ReactNode; className?: string }) {
  return <div className={"min-w-0 " + className}><dt className={dt}>{nom}</dt><dd className={dd}>{valeur || "—"}</dd></div>;
}

function EnteteCarte({
  icon: Icon, titre, action,
}: {
  icon: typeof UserRound; titre: string; action?: React.ReactNode;
}) {
  return (
    <header className="mb-3.5 flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-border">
      <h2 className={classTitre}><Icon className={classIcone} aria-hidden />{titre}</h2>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </header>
  );
}

/**
 * Gabarit conforme aux trois colonnes de la maquette, sans surcharge
 * horizontale : le navigateur choisit 1, 2 ou 3 colonnes selon l'espace réel
 * restant après le menu de l'administration.
 *
 * Tous les nombres, dates, parents, bulletins et événements sont issus des
 * vrais domaines de l'application. Aucun document absent n'est dit « validé ».
 */
export function VueEnsembleEleve({
  dossier, scolarite, peutVoirFinances, peutVoirNotes, peutVoirAssiduite,
  peutVoirTuteurs, actions, notification, documents, gestionTuteurs, bulletins,
}: {
  dossier: DossierComplet;
  scolarite: DossierScolarite | null;
  peutVoirFinances: boolean;
  peutVoirNotes: boolean;
  peutVoirAssiduite: boolean;
  peutVoirTuteurs: boolean;
  actions: React.ReactNode;
  notification: React.ReactNode;
  documents: React.ReactNode;
  gestionTuteurs: React.ReactNode;
  bulletins: Bulletin[];
}) {
  const { eleve, inscription, tuteurs, parcours, historiqueStatuts, changementsClasse } = dossier;
  const argent = (v: number) => v.toLocaleString("fr-FR") + " FCFA";
  const echeances = scolarite?.echeances ?? [];
  const netDu = echeances.reduce((s, e) => s + e.du - e.exonere, 0);
  const paye = echeances.reduce((s, e) => s + e.paye, 0);
  const reste = echeances.reduce((s, e) => s + e.reste, 0);
  const pourcentage = netDu > 0 ? Math.max(0, Math.min(100, Math.round(100 * paye / netDu))) : 0;

  const activites = [
    ...historiqueStatuts.map((h) => ({
      id: "statut-" + h.id, date: h.creeLe || h.dateEffet,
      libelle: "Situation : " + h.nouveauStatut.replaceAll("_", " ").toLowerCase(),
      categorie: "Scolarité", couleur: "bg-emerald-500",
    })),
    ...changementsClasse.map((c) => ({
      id: "classe-" + c.id, date: c.dateEffet,
      libelle: c.origine + " → " + c.destination,
      categorie: "Scolarité", couleur: "bg-blue-500",
    })),
    ...(peutVoirAssiduite ? (scolarite?.assiduite ?? []).map((a) => ({
      id: "assiduite-" + a.id, date: a.date,
      libelle: a.type === "absence" ? "Absence enregistrée" : "Retard enregistré",
      categorie: "Assiduité", couleur: "bg-orange-400",
    })) : []),
    ...(peutVoirFinances ? (scolarite?.paiements ?? []).filter((p) => !p.annule).map((p) => ({
      id: "paiement-" + p.id, date: p.date,
      libelle: "Paiement : " + argent(p.montant),
      categorie: "Finances", couleur: "bg-violet-500",
    })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <div className={styles.shell}>
      <div className={styles.layout}>
        <section className={classCard + " " + styles.personal} aria-label="Informations personnelles">
          <EnteteCarte icon={UserRound} titre="Informations personnelles" action={<RaccourciOnglet onglet="identite">Détails <ArrowRight className="size-3.5" aria-hidden /></RaccourciOnglet>} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 rounded-lg border border-slate-100 p-3 dark:border-border">
            <Valeur nom="Nom complet" valeur={eleve.prenom + " " + eleve.nom} />
            <Valeur nom="Sexe" valeur={eleve.sexe === "F" ? "Féminin" : eleve.sexe === "M" ? "Masculin" : "Non renseigné"} />
            <Valeur nom="Date de naissance" valeur={<DateCourte value={eleve.dateNaissance} />} />
            <Valeur nom="Lieu de naissance" valeur={eleve.lieuNaissance} />
            <Valeur nom="Nationalité" valeur={eleve.nationalite} className="col-span-2 border-t border-slate-100 pt-3 dark:border-border" />
            <Valeur nom="Adresse" valeur={[eleve.quartier, eleve.adresse].filter(Boolean).join(", ")} className="col-span-2 border-t border-slate-100 pt-3 dark:border-border" />
            <div className="col-span-2 flex items-start gap-2 border-t border-slate-100 pt-3 dark:border-border">
              <Phone className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
              <Valeur nom="Téléphone" valeur={eleve.telephone} />
            </div>
            <div className="col-span-2 flex items-start gap-2 border-t border-slate-100 pt-3 dark:border-border">
              <Mail className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
              <Valeur nom="E-mail" valeur={eleve.email} />
            </div>
          </div>
        </section>

        <section className={classCard + " " + styles.school} aria-label="Scolarité actuelle">
          <EnteteCarte icon={GraduationCap} titre="Scolarité actuelle" action={<RaccourciOnglet onglet="scolarite">Détails <ArrowRight className="size-3.5" aria-hidden /></RaccourciOnglet>} />
          {inscription ? <div className={styles.schoolFacts + " rounded-lg border border-slate-100 p-3 dark:border-border"}>
            <Valeur nom="Année scolaire" valeur={inscription.anneeLibelle} />
            <Valeur nom="Classe" valeur={inscription.classeLibelle} />
            <Valeur nom="Niveau" valeur={inscription.niveauLibelle} />
            <Valeur nom="Régime" valeur="Non renseigné" />
            <Valeur nom="Date d’inscription" valeur={<DateCourte value={inscription.dateInscription} />} />
            <Valeur nom="Redoublement" valeur={inscription.estRedoublant ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Oui</Badge> : "Non"} />
            <Valeur nom="Ancienne classe" valeur={parcours[1]?.classeLibelle ?? "—"} />
            <Valeur nom="Établissement précédent" valeur={eleve.ecoleOrigine ?? "—"} />
          </div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">Aucune inscription active.</p>}
        </section>

        {peutVoirTuteurs ? <section className={classCard + " " + styles.guardians} aria-label="Parents et tuteurs">
          <EnteteCarte icon={Users} titre="Parents & tuteurs" action={gestionTuteurs} />
          {tuteurs.length ? <div className="grid gap-2 sm:grid-cols-2">
            {tuteurs.slice(0, 4).map((t) => (
              <article key={t.id} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/40 p-3 dark:border-border dark:bg-muted/20">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{t.prenom[0] ?? ""}{t.nom[0] ?? ""}</span>
                  <div className="min-w-0">
                    <p className="break-words text-[13px] font-bold leading-tight text-slate-900 dark:text-foreground">{t.prenom} {t.nom}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{LIEN[t.lien] ?? t.lien}{t.estPrincipal ? " · Principal" : ""}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-[11px] text-slate-600 dark:text-muted-foreground">
                  <p className="flex min-w-0 gap-2"><Phone className="size-3.5 shrink-0" aria-hidden /><span className="break-all">{t.telephone}</span></p>
                  {t.email ? <p className="flex min-w-0 gap-2"><Mail className="size-3.5 shrink-0" aria-hidden /><span className="break-all">{t.email}</span></p> : null}
                  {t.profession ? <p className="break-words">{t.profession}</p> : null}
                  {t.adresse ? <p className="flex min-w-0 gap-2"><MapPin className="size-3.5 shrink-0" aria-hidden /><span className="break-words">{t.adresse}</span></p> : null}
                </div>
              </article>
            ))}
          </div> : <p className="py-5 text-center text-sm text-muted-foreground">Aucun tuteur rattaché.</p>}
          {tuteurs.length > 4 ? <p className="mt-2 text-xs text-muted-foreground">+{tuteurs.length - 4} autre(s) responsable(s) dans l’onglet Parents.</p> : null}
        </section> : null}

        <section className={classCard + " " + styles.actions} aria-label="Actions rapides">
          <EnteteCarte icon={Activity} titre="Actions rapides" />
          {actions || notification ? <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-emerald-100 bg-emerald-50/40 px-2 py-2 dark:border-emerald-950 dark:bg-emerald-950/20 [&>div]:flex [&>div]:flex-wrap [&>div]:gap-2">{notification}{actions}</div> : null}
          <div className="grid grid-cols-2 gap-2">
            {peutVoirNotes ? <RaccourciOnglet onglet="notes" className="h-9 w-full justify-start gap-1.5 rounded-lg px-2 text-[11px]"><GraduationCap className="size-4" aria-hidden />Notes</RaccourciOnglet> : null}
            {peutVoirAssiduite ? <RaccourciOnglet onglet="assiduite" className="h-9 w-full justify-start gap-1.5 rounded-lg px-2 text-[11px]"><CalendarDays className="size-4" aria-hidden />Assiduité</RaccourciOnglet> : null}
            {peutVoirFinances ? <RaccourciOnglet onglet="finances" className="h-9 w-full justify-start gap-1.5 rounded-lg px-2 text-[11px]"><CreditCard className="size-4" aria-hidden />Paiements</RaccourciOnglet> : null}
            <RaccourciOnglet onglet="documents" className="h-9 w-full justify-start gap-1.5 rounded-lg px-2 text-[11px]"><FileText className="size-4" aria-hidden />Documents</RaccourciOnglet>
          </div>
        </section>

        <section className={classCard + " " + styles.documents} aria-label="Documents scolaires">
          <EnteteCarte icon={FileText} titre="Documents scolaires" action={documents ?? <RaccourciOnglet onglet="documents">Voir tout</RaccourciOnglet>} />
          <ul className="divide-y divide-slate-100 dark:divide-border">
            {[
              ["Certificat de scolarité", "À éditer"],
              ["Fiche d’inscription", "À éditer"],
            ].map(([nom, etat]) => <li key={nom} className="flex min-w-0 items-center justify-between gap-2 py-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-2"><FileCheck2 className="size-4 shrink-0 text-blue-600" aria-hidden /><span className="break-words">{nom}</span></span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-muted">{etat}</span>
            </li>)}
            {bulletins.slice(0, 3).map((b) => <li key={b.periodeId} className="flex items-center justify-between gap-2 py-2 text-[12px]">
              <a href={"/api/bulletins/" + b.inscriptionId + "/" + b.periodeId} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-blue-700 hover:underline dark:text-blue-300">
                <FileText className="size-4 shrink-0" aria-hidden /><span className="break-words">Bulletin {b.periodeLibelle}</span>
              </a>
              <span className={"shrink-0 rounded-full px-2 py-1 text-[10px] " + (b.publie ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{b.publie ? "Publié" : "Brouillon"}</span>
            </li>)}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Les pièces à éditer ne sont pas des documents déposés ou validés.</p>
        </section>

        {peutVoirFinances ? <section className={classCard + " " + styles.finance} aria-label="Situation financière">
          <EnteteCarte icon={Wallet} titre="Situation financière" action={<RaccourciOnglet onglet="finances">Voir les paiements</RaccourciOnglet>} />
          {echeances.length ? <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="min-w-0 rounded-xl bg-amber-50/80 px-3 py-3 dark:bg-amber-950/20"><p className={dt}>Montant net dû</p><p className="mt-1 break-words text-base font-bold tabular-nums text-amber-700">{argent(netDu)}</p></div>
              <div className="min-w-0 rounded-xl bg-emerald-50/80 px-3 py-3 dark:bg-emerald-950/20"><p className={dt}>Montant payé</p><p className="mt-1 break-words text-base font-bold tabular-nums text-emerald-700">{argent(paye)}</p></div>
              <div className="min-w-0 rounded-xl bg-rose-50/80 px-3 py-3 dark:bg-rose-950/20"><p className={dt}>Reste à payer</p><p className="mt-1 break-words text-base font-bold tabular-nums text-rose-700">{argent(reste)}</p></div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div role="progressbar" aria-label="Progression des paiements" aria-valuenow={pourcentage} aria-valuemin={0} aria-valuemax={100} className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: pourcentage + "%" }} /></div>
              <span className="text-xs font-semibold tabular-nums">{pourcentage} % payé</span>
            </div>
          </> : <p className="py-4 text-sm text-muted-foreground">Aucune échéance enregistrée pour cette scolarité.</p>}
        </section> : <div className={styles.finance} />}

        <section className={classCard + " " + styles.activity} aria-label="Dernières activités">
          <EnteteCarte icon={History} titre="Dernières activités" action={<RaccourciOnglet onglet="historique">Voir tout</RaccourciOnglet>} />
          {activites.length ? <ol className="space-y-3">
            {activites.map((a) => <li key={a.id} className="flex min-w-0 items-start gap-2 text-[11px]">
              <span className={"mt-1.5 size-2.5 shrink-0 rounded-full " + a.couleur} aria-hidden />
              <time className="w-[72px] shrink-0 text-slate-500"><DateCourte value={a.date} /></time>
              <div className="min-w-0 flex-1">
                <p className="break-words leading-4 text-[#142450] dark:text-foreground">{a.libelle}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{a.categorie}</p>
              </div>
            </li>)}
          </ol> : <p className="py-4 text-sm text-muted-foreground">Aucune activité enregistrée.</p>}
        </section>
      </div>
    </div>
  );
}
