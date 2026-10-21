import {
  ArrowRight, CalendarDays, Check, ChevronRight, Zap, FileBadge2, FileCheck2, FileText, GraduationCap, History, IdCard, Mail, MapPin, Phone, UsersRound, Wallet, BriefcaseBusiness, Building2, RotateCcw, Layers3, BookOpen
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

const heading = "text-base font-bold tracking-tight text-[#101e3f] dark:text-foreground";
const subdued = "text-xs text-slate-500 dark:text-muted-foreground";
const valueClass = "mt-0.5 break-words text-sm font-semibold leading-relaxed text-[#12234c] dark:text-foreground";
const cardClass = styles.card + " dark:bg-card dark:border-border";

function DateCourte({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  return <>{new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</>;
}

function Donnee({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><span className={subdued}>{label}</span><div className={valueClass}>{children || "—"}</div></div>;
}

function TitreSection({
  titre, description, icon: Icon, tone = "blue", right,
}: {
  titre: string; description?: string; icon: typeof IdCard;
  tone?: "blue" | "green" | "navy" | "violet" | "orange" | "rose";
  right?: React.ReactNode;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    navy: "bg-[#0d2d69] text-white",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300",
  };
  return <header className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2.5">
    <div className="flex min-w-0 items-center gap-3">
      <span className={styles.sectionIcon + " " + tones[tone]}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className={heading}>{titre}</h2>
        {description ? <p className="mt-0.5 text-[11px] text-slate-500 dark:text-muted-foreground">{description}</p> : null}
      </div>
    </div>
    {right ? <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div> : null}
  </header>;
}

function LienOnglet({
  onglet, children,
}: { onglet: string; children: React.ReactNode }) {
  return <RaccourciOnglet onglet={onglet} className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white px-3 text-xs font-medium shadow-none hover:bg-slate-50 dark:border-border dark:bg-background">
    {children}<ArrowRight className="size-3.5" aria-hidden />
  </RaccourciOnglet>;
}

export function VueEnsembleEleve({
  dossier, modifierDossier, scolarite, peutVoirFinances, peutVoirNotes, peutVoirAssiduite,
  peutVoirTuteurs, actions, notification, documents, gestionTuteurs, gestionTuteursHeader, bulletins,
}: {
  dossier: DossierComplet;
  modifierDossier: React.ReactNode;
  scolarite: DossierScolarite | null;
  peutVoirFinances: boolean;
  peutVoirNotes: boolean;
  peutVoirAssiduite: boolean;
  peutVoirTuteurs: boolean;
  actions: React.ReactNode;
  notification: React.ReactNode;
  documents: React.ReactNode;
  gestionTuteurs: React.ReactNode;
  gestionTuteursHeader: React.ReactNode;
  bulletins: Bulletin[];
}) {
  const { eleve, inscription, tuteurs, parcours, historiqueStatuts, changementsClasse } = dossier;
  // Ancienne classe vérifiée : changement lié à cette inscription, puis
  // historique d'une année antérieure. Jamais de classe inférée de l'âge.
  const changementCourant = inscription
    ? changementsClasse.find((c) =>
        c.destination === inscription.classeLibelle &&
        c.dateEffet.slice(0, 10) >= inscription.dateInscription.slice(0, 10) &&
        c.origine !== "—"
      )
    : null;
  const parcoursPrecedent = parcours.find((p) => p.anneeLibelle !== inscription?.anneeLibelle);
  const ancienneClasse = changementCourant?.origine ?? parcoursPrecedent?.classeLibelle ?? null;
  const informationsManquantes = [
    !eleve.ecoleOrigine?.trim() ? "établissement précédent" : null,
    !eleve.telephone?.trim() ? "téléphone" : null,
    !eleve.email?.trim() ? "adresse e-mail" : null,
    !eleve.nationalite?.trim() ? "nationalité" : null,
    !eleve.lieuNaissance?.trim() ? "lieu de naissance" : null,
    !eleve.adresse?.trim() ? "adresse" : null,
    !eleve.acteNaissanceNumero?.trim() ? "numéro d’acte de naissance" : null,
  ].filter((x): x is string => Boolean(x));
  const montant = (n: number) => n.toLocaleString("fr-FR") + " FCFA";
  const echeances = scolarite?.echeances ?? [];
  const netDu = echeances.reduce((acc, e) => acc + e.du - e.exonere, 0);
  const paye = echeances.reduce((acc, e) => acc + e.paye, 0);
  const reste = echeances.reduce((acc, e) => acc + e.reste, 0);
  const progression = netDu > 0 ? Math.max(0, Math.min(100, Math.round(100 * paye / netDu))) : 0;
  const echeancesFacturees = echeances.filter((e) => e.du - e.exonere > 0);
  const echeancesSoldees = echeancesFacturees.filter((e) => e.reste <= 0).length;
  const activites = [
    ...historiqueStatuts.map((e) => ({
      id: "h-" + e.id, date: e.creeLe || e.dateEffet,
      texte: "Situation scolaire : " + e.nouveauStatut.replaceAll("_", " ").toLowerCase(),
      type: "Scolarité", dot: "bg-emerald-500",
    })),
    ...changementsClasse.map((e) => ({
      id: "c-" + e.id, date: e.dateEffet,
      texte: "Changement de classe : " + e.origine + " → " + e.destination,
      type: "Scolarité", dot: "bg-blue-500",
    })),
    ...(peutVoirAssiduite ? (scolarite?.assiduite ?? []).map((e) => ({
      id: "a-" + e.id, date: e.date,
      texte: e.type === "absence" ? "Absence enregistrée" : "Retard enregistré",
      type: "Assiduité", dot: "bg-amber-500",
    })) : []),
    ...(peutVoirFinances ? (scolarite?.paiements ?? []).filter((p) => !p.annule).map((e) => ({
      id: "p-" + e.id, date: e.date, texte: "Paiement enregistré : " + montant(e.montant),
      type: "Finances", dot: "bg-violet-500",
    })) : []),
  ].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5);

  return <div className={styles.shell}>
    <div className={styles.layout}>
      <div className={styles.middle}>
      <section className={cardClass} aria-label="Scolarité actuelle">
        <TitreSection titre="Scolarité actuelle" description="Informations sur le parcours scolaire" icon={GraduationCap} tone="violet"
          right={inscription ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"><CalendarDays className="size-4" aria-hidden />{inscription.anneeLibelle}</span> : null} />
        {inscription ? <>
          <div className={styles.schoolHero + " dark:bg-muted"}>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-blue-600">Classe actuelle</p>
              <p className="mt-1 break-words text-2xl font-extrabold tracking-tight text-[#0e2d61] dark:text-foreground">{inscription.classeLibelle}</p>
            </div>
            <div className="min-w-0 border-l border-blue-100 pl-3 dark:border-border">
              <p className="flex items-center gap-2 text-[11px] text-slate-500"><Layers3 className="size-4 text-blue-600" aria-hidden />Niveau</p>
              <p className="mt-1 break-words text-sm font-semibold text-[#12234c] dark:text-foreground">{inscription.niveauLibelle}</p>
            </div>
            <div className="min-w-0 border-l border-blue-100 pl-3 dark:border-border">
              <p className="flex items-center gap-2 text-[11px] text-slate-500"><BookOpen className="size-4 text-blue-600" aria-hidden />Type d’inscription</p>
              <p className="mt-1 break-words text-sm font-semibold capitalize text-[#12234c] dark:text-foreground">{inscription.type.replaceAll("_", " ").toLowerCase()}</p>
            </div>
          </div>
          <div className={"mt-3.5 " + styles.schoolSecondary + " dark:bg-muted"}>
            <div className="flex min-w-0 gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden /><Donnee label="Date d’inscription"><DateCourte value={inscription.dateInscription} /></Donnee></div>
            <div className="flex min-w-0 gap-2"><RotateCcw className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden /><Donnee label="Redoublement">{inscription.estRedoublant ? "Oui" : "Non"}</Donnee></div>
            {ancienneClasse ? <div className="flex min-w-0 gap-2"><IdCard className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden /><Donnee label="Ancienne classe">{ancienneClasse}</Donnee></div> : null}
            {eleve.ecoleOrigine?.trim() ? <div className="flex min-w-0 gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden /><Donnee label="Établissement précédent">{eleve.ecoleOrigine}</Donnee></div> : null}
          </div>
        </> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-muted">Aucune inscription active enregistrée.</p>}
        {informationsManquantes.length ? (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">Informations à compléter</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                {informationsManquantes.join(", ")}. Une seule modification permet de renseigner ces champs.
              </p>
            </div>
            {modifierDossier}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-border">
          <LienOnglet onglet="scolarite">Parcours scolaire</LienOnglet>
        </div>
      </section>
      {peutVoirTuteurs ? <section className={cardClass} aria-label="Parents et tuteurs">
        <TitreSection titre="Parents & tuteurs" description="Responsables rattachés à l’élève" icon={UsersRound} tone="green" right={gestionTuteursHeader} />
        {tuteurs.length ? <div className="grid gap-3">
          {tuteurs.slice(0,3).map(t => <article key={t.id} className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/30 px-4 py-3.5 dark:border-emerald-950 dark:bg-emerald-950/10">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{t.prenom[0] ?? ""}{t.nom[0] ?? ""}</span>
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-[#101e3f] dark:text-foreground">{t.prenom} {t.nom}</p>
                <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{LIEN[t.lien] ?? t.lien}{t.estPrincipal ? " · Principal" : ""}</span></div>
            </div>
            <div className={"mt-3 border-t border-emerald-100 pt-3 dark:border-border " + styles.tutorInfo}>
              <div className="flex min-w-0 gap-2"><Phone className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden /><Donnee label="Téléphone">{t.telephone}</Donnee></div>
              <div className="flex min-w-0 gap-2"><BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden /><Donnee label="Profession">{t.profession}</Donnee></div>
              <div className="flex min-w-0 gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden /><Donnee label="Adresse">{t.adresse}</Donnee></div>
            </div>
            {t.email ? <p className="mt-3 flex min-w-0 gap-2 text-xs text-slate-600"><Mail className="size-4 shrink-0" aria-hidden /><span className="break-all">{t.email}</span></p> : null}
          </article>)}
          {tuteurs.length > 3 ? <p className="text-xs text-muted-foreground">{tuteurs.length - 3} autre(s) responsable(s) dans l’onglet Parents.</p> : null}
        </div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-muted">Aucun responsable rattaché à cet élève.</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-border">
          {gestionTuteurs ? <div className="flex min-w-0 flex-wrap gap-2">{gestionTuteurs}</div> : <span />}
          <LienOnglet onglet="tuteurs">Tous les responsables</LienOnglet>
        </div>
      </section> : null}
      </div>
      <div className={styles.side}>
      <section className={cardClass} aria-label="Actions rapides">
        <TitreSection titre="Actions rapides" description="Fonctions essentielles du dossier" icon={Zap} tone="orange" />
        <div className="flex flex-col gap-2.5">
          {notification ? <div className="rounded-xl bg-emerald-700 p-1 text-white [&_button]:!h-11 [&_button]:!w-full [&_button]:!justify-center [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!text-[13px] [&_button]:!font-semibold [&_button]:!text-white [&_button]:hover:!bg-emerald-800/40">
            {notification}
          </div> : null}
          {actions ? (
            <div className="space-y-2.5 [&>div]:!flex [&>div]:!flex-col [&>div]:!gap-2.5 [&_button]:!h-11 [&_button]:!w-full [&_button]:!justify-center [&_button]:!rounded-xl [&_button]:!border-blue-100 [&_button]:!bg-blue-50/70 [&_button]:!text-[13px] [&_button]:!font-semibold [&_button]:!text-[#143568] dark:[&_button]:!border-border dark:[&_button]:!bg-muted dark:[&_button]:!text-foreground">
              {actions}
            </div>
          ) : null}
          {documents ? (
            <a href={"/api/documents/certificat-scolarite/" + eleve.id} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[13px] font-semibold text-violet-700 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-600 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-300">
              <FileBadge2 className="size-4" aria-hidden /> Générer un certificat
            </a>
          ) : null}
          <RaccourciOnglet onglet="documents" className="min-h-11 w-full justify-center gap-2 rounded-xl border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#142450] shadow-none hover:bg-slate-50 dark:border-border dark:bg-background dark:text-foreground">
            <FileText className="size-4" aria-hidden /> Dossier documentaire <ChevronRight className="ml-auto size-4" aria-hidden />
          </RaccourciOnglet>
        </div>
      </section>
      <section className={cardClass} aria-label="Documents scolaires">
        <TitreSection titre="Documents scolaires" description="Pièces administratives et bulletins" icon={FileBadge2} tone="rose"
          right={<LienOnglet onglet="documents">Voir tous</LienOnglet>} />
        <ul className="divide-y divide-slate-100 dark:divide-border">
          {[
            { nom:"Certificat de scolarité", chemin:"certificat-scolarite" },
            { nom:"Fiche d’inscription", chemin:"fiche-inscription" },
          ].map(item => <li key={item.chemin} className={styles.documentRow + " py-3"}>
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="size-5 shrink-0 text-blue-600" aria-hidden />
              <span className="min-w-0"><span className="block break-words text-xs font-semibold text-[#142450] dark:text-foreground">{item.nom}</span><span className="text-[11px] text-slate-500">Document à éditer</span></span>
            </div>
            {documents ? <a href={"/api/documents/" + item.chemin + "/" + eleve.id} target="_blank" rel="noopener noreferrer" className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600">Éditer</a> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">À éditer</span>}
          </li>)}
          {bulletins.slice(0,4).map(b => <li key={b.periodeId} className={styles.documentRow + " py-3"}>
            <a href={"/api/bulletins/" + b.inscriptionId + "/" + b.periodeId} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3 hover:underline">
              <FileCheck2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
              <span className="min-w-0"><span className="block break-words text-xs font-semibold text-[#142450] dark:text-foreground">Bulletin {b.periodeLibelle}</span><span className="text-[11px] text-slate-500">Document scolaire</span></span>
            </a>
            <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold " + (b.publie ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950" : "bg-amber-50 text-amber-700 dark:bg-amber-950")}>{b.publie ? <Check className="size-3" aria-hidden /> : null}{b.publie ? "Publié" : "Brouillon"}</span>
          </li>)}
        </ul>
        {!bulletins.length ? <p className="mt-2 text-xs text-muted-foreground">Aucun bulletin disponible pour cette période.</p> : null}
        <p className="mt-2 text-[11px] text-slate-500">Une pièce à éditer n’est pas une pièce déposée ou validée.</p>
      </section>
      </div>
      {peutVoirFinances ? (
        <section className={cardClass + " " + styles.finance} aria-label="Situation financière">
          <TitreSection
            titre="Situation financière"
            description="Solde et progression des règlements"
            icon={Wallet}
            tone="green"
            right={<LienOnglet onglet="finances">Détail des paiements</LienOnglet>}
          />
          {echeances.length ? (
            <div className="space-y-3.5">
              <dl className="grid gap-2.5 sm:grid-cols-3">
                <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/85 p-3.5 dark:border-border dark:bg-muted/25">
                  <dt className="text-[11px] font-medium text-slate-600 dark:text-muted-foreground">Montant net dû</dt>
                  <dd className="mt-1 break-words text-[17px] font-bold tabular-nums leading-snug text-[#12234c] dark:text-foreground">{montant(netDu)}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/75 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <dt className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">Montant payé</dt>
                  <dd className="mt-1 break-words text-[17px] font-bold tabular-nums leading-snug text-emerald-700 dark:text-emerald-300">{montant(paye)}</dd>
                </div>
                <div className="min-w-0 rounded-xl border border-rose-100 bg-rose-50/70 p-3.5 dark:border-rose-900 dark:bg-rose-950/20">
                  <dt className="text-[11px] font-medium text-rose-800 dark:text-rose-300">Reste à payer</dt>
                  <dd className="mt-1 break-words text-[17px] font-bold tabular-nums leading-snug text-rose-700 dark:text-rose-300">{montant(reste)}</dd>
                </div>
              </dl>
              <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-3 dark:border-border dark:bg-card">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <span className="text-xs font-semibold text-[#12234c] dark:text-foreground">Progression des paiements</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{progression} % réglé</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Part du montant net dû déjà payée"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progression}
                  className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted"
                >
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: progression + "%" }} />
                </div>
                {echeancesFacturees.length ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-muted-foreground">
                    {echeancesSoldees} échéance{echeancesSoldees > 1 ? "s" : ""} soldée{echeancesSoldees > 1 ? "s" : ""} sur {echeancesFacturees.length} facturée{echeancesFacturees.length > 1 ? "s" : ""}.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-sm text-muted-foreground dark:border-border dark:bg-muted/20">Aucune échéance financière enregistrée pour cette inscription.</p>
          )}
        </section>
      ) : null}
      <section className={cardClass + " " + styles.activity} aria-label="Dernières activités">
        <TitreSection
          titre="Dernières activités"
          description="Les événements récents du dossier"
          icon={History}
          tone="violet"
          right={<LienOnglet onglet="historique">Tout l’historique</LienOnglet>}
        />
        {activites.length ? (
          <ol className="ml-2.5 border-l border-slate-200 dark:border-border">
            {activites.map((e) => (
              <li key={e.id} className="relative min-w-0 pb-4 pl-5 last:pb-0">
                <span aria-hidden className={"absolute -left-[5px] top-1.5 size-[9px] rounded-full ring-[3px] ring-white dark:ring-card " + e.dot} />
                <p className="break-words text-[12px] font-semibold leading-snug text-[#142450] dark:text-foreground">{e.texte}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-muted-foreground">
                  <time dateTime={e.date}><DateCourte value={e.date} /></time>
                  <span aria-hidden className="text-slate-300">·</span>
                  <span>{e.type}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-muted-foreground dark:bg-muted/20">Aucun événement enregistré dans l’historique.</p>
        )}
      </section>
    </div>
  </div>;
}
