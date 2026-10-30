import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  FileBadge2,
  FileCheck2,
  FileText,
  GraduationCap,
  History,
  IdCard,
  Layers3,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  UsersRound,
  Wallet,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DossierComplet } from "@/server/domain/dossier";
import type { DossierScolarite } from "@/server/domain/dossier-eleve";

import { RaccourciOnglet } from "./raccourci-onglet";
import styles from "./vue-ensemble.module.css";

type Bulletin = { periodeLibelle: string; periodeId: string; inscriptionId: string; publie: boolean };

const LIEN: Record<string, string> = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur légal",
  ONCLE: "Oncle",
  TANTE: "Tante",
  GRAND_PARENT: "Grand-parent",
  FRERE_SOEUR: "Frère / sœur",
  AUTRE: "Autre",
};

const heading = "text-base font-bold tracking-tight text-foreground";
const subdued = "text-xs text-muted-foreground";
const valueClass = "mt-0.5 break-words text-sm font-semibold leading-relaxed text-foreground";
const cardClass = styles.card + " card";

function DateCourte({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  return <>{new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</>;
}

function Donnee({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className={subdued}>{label}</span>
      <div className={valueClass}>{children || "—"}</div>
    </div>
  );
}

function TitreSection({
  titre,
  description,
  icon: Icon,
  tone = "blue",
  right,
}: {
  titre: string;
  description?: string;
  icon: typeof IdCard;
  tone?: "blue" | "green" | "navy" | "violet" | "orange" | "rose";
  right?: React.ReactNode;
}) {
  const tones = {
    blue: "bg-info-doux text-info",
    green: "bg-succes-doux text-succes",
    navy: "bg-primary text-primary-foreground",
    violet: "bg-info-doux text-info",
    orange: "bg-alerte-doux text-alerte",
    rose: "bg-danger-doux text-danger",
  };
  return (
    <header className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={styles.sectionIcon + " " + tones[tone]}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className={heading}>{titre}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {right ? <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div> : null}
    </header>
  );
}

function LienOnglet({ onglet, children }: { onglet: string; children: React.ReactNode }) {
  return (
    <RaccourciOnglet
      onglet={onglet}
      className="h-9 gap-1.5 rounded-xl border-border bg-card px-3 text-xs font-medium shadow-none hover:bg-muted/40 dark:bg-background"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </RaccourciOnglet>
  );
}

export function VueEnsembleEleve({
  dossier,
  modifierDossier,
  scolarite,
  peutVoirFinances,
  peutVoirNotes,
  peutVoirAssiduite,
  peutVoirTuteurs,
  actions,
  notification,
  documents,
  gestionTuteurs,
  gestionTuteursHeader,
  bulletins,
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
    ? changementsClasse.find(
        (c) =>
          c.destination === inscription.classeLibelle &&
          c.dateEffet.slice(0, 10) >= inscription.dateInscription.slice(0, 10) &&
          c.origine !== "—",
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
  const progression = netDu > 0 ? Math.max(0, Math.min(100, Math.round((100 * paye) / netDu))) : 0;
  const echeancesFacturees = echeances.filter((e) => e.du - e.exonere > 0);
  const echeancesSoldees = echeancesFacturees.filter((e) => e.reste <= 0).length;
  const activites = [
    ...historiqueStatuts.map((e) => ({
      id: "h-" + e.id,
      date: e.creeLe || e.dateEffet,
      texte: "Situation scolaire : " + e.nouveauStatut.replaceAll("_", " ").toLowerCase(),
      type: "Scolarité",
      dot: "bg-succes",
    })),
    ...changementsClasse.map((e) => ({
      id: "c-" + e.id,
      date: e.dateEffet,
      texte: "Changement de classe : " + e.origine + " → " + e.destination,
      type: "Scolarité",
      dot: "bg-primary",
    })),
    ...(peutVoirAssiduite
      ? (scolarite?.assiduite ?? []).map((e) => ({
          id: "a-" + e.id,
          date: e.date,
          texte: e.type === "absence" ? "Absence enregistrée" : "Retard enregistré",
          type: "Assiduité",
          dot: "bg-alerte",
        }))
      : []),
    ...(peutVoirFinances
      ? (scolarite?.paiements ?? [])
          .filter((p) => !p.annule)
          .map((e) => ({
            id: "p-" + e.id,
            date: e.date,
            texte: "Paiement enregistré : " + montant(e.montant),
            type: "Finances",
            dot: "bg-primary",
          }))
      : []),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div className={"gentelella-v4 " + styles.shell}>
      <div className={styles.layout}>
        <div className={styles.middle}>
          <section className={cardClass} aria-label="Scolarité actuelle">
            <TitreSection
              titre="Scolarité actuelle"
              description="Informations sur le parcours scolaire"
              icon={GraduationCap}
              tone="violet"
              right={
                inscription ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-info-doux px-3 py-2 text-xs font-semibold text-info">
                    <CalendarDays className="size-4" aria-hidden />
                    {inscription.anneeLibelle}
                  </span>
                ) : null
              }
            />
            {inscription ? (
              <>
                <div className={styles.schoolHero + ""}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-info">Classe actuelle</p>
                    <p className="mt-1 break-words text-2xl font-extrabold tracking-tight text-foreground">
                      {inscription.classeLibelle}
                    </p>
                  </div>
                  <div className="min-w-0 border-l border-info-trait pl-3">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Layers3 className="size-4 text-info" aria-hidden />
                      Niveau
                    </p>
                    <p className="mt-1 break-words text-sm font-semibold text-foreground">
                      {inscription.niveauLibelle}
                    </p>
                  </div>
                  <div className="min-w-0 border-l border-info-trait pl-3">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <BookOpen className="size-4 text-info" aria-hidden />
                      Type d’inscription
                    </p>
                    <p className="mt-1 break-words text-sm font-semibold capitalize text-foreground">
                      {inscription.type.replaceAll("_", " ").toLowerCase()}
                    </p>
                  </div>
                </div>
                <div className={"mt-3.5 " + styles.schoolSecondary + ""}>
                  <div className="flex min-w-0 gap-2">
                    <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <Donnee label="Date d’inscription">
                      <DateCourte value={inscription.dateInscription} />
                    </Donnee>
                  </div>
                  <div className="flex min-w-0 gap-2">
                    <RotateCcw className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <Donnee label="Redoublement">{inscription.estRedoublant ? "Oui" : "Non"}</Donnee>
                  </div>
                  {ancienneClasse ? (
                    <div className="flex min-w-0 gap-2">
                      <IdCard className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <Donnee label="Ancienne classe">{ancienneClasse}</Donnee>
                    </div>
                  ) : null}
                  {eleve.ecoleOrigine?.trim() ? (
                    <div className="flex min-w-0 gap-2">
                      <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <Donnee label="Établissement précédent">{eleve.ecoleOrigine}</Donnee>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
                Aucune inscription active enregistrée.
              </p>
            )}
            {informationsManquantes.length ? (
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-alerte-trait bg-alerte-doux px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-alerte">Informations à compléter</p>
                  <p className="mt-1 text-xs leading-relaxed text-alerte">
                    {informationsManquantes.join(", ")}. Une seule modification permet de renseigner ces champs.
                  </p>
                </div>
                {modifierDossier}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end border-t border-border pt-3">
              <LienOnglet onglet="scolarite">Parcours scolaire</LienOnglet>
            </div>
          </section>
          {peutVoirTuteurs ? (
            <section className={cardClass} aria-label="Parents et tuteurs">
              <TitreSection
                titre="Parents & tuteurs"
                description="Responsables rattachés à l’élève"
                icon={UsersRound}
                tone="green"
                right={gestionTuteursHeader}
              />
              {tuteurs.length ? (
                <div className="grid gap-3">
                  {tuteurs.slice(0, 3).map((t) => (
                    <article
                      key={t.id}
                      className="min-w-0 rounded-xl border border-succes-trait bg-succes-doux px-4 py-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-info-doux text-sm font-bold text-info">
                          {t.prenom[0] ?? ""}
                          {t.nom[0] ?? ""}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-bold text-foreground">
                            {t.prenom} {t.nom}
                          </p>
                          <span className="mt-1 inline-flex rounded-full bg-succes-doux px-2.5 py-1 text-xs font-medium text-succes">
                            {LIEN[t.lien] ?? t.lien}
                            {t.estPrincipal ? " · Principal" : ""}
                          </span>
                        </div>
                      </div>
                      <div className={"mt-3 border-t border-succes-trait pt-3 " + styles.tutorInfo}>
                        <div className="flex min-w-0 gap-2">
                          <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <Donnee label="Téléphone">{t.telephone}</Donnee>
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <Donnee label="Profession">{t.profession}</Donnee>
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <Donnee label="Adresse">{t.adresse}</Donnee>
                        </div>
                      </div>
                      {t.email ? (
                        <p className="mt-3 flex min-w-0 gap-2 text-xs text-muted-foreground">
                          <Mail className="size-4 shrink-0" aria-hidden />
                          <span className="break-all">{t.email}</span>
                        </p>
                      ) : null}
                    </article>
                  ))}
                  {tuteurs.length > 3 ? (
                    <p className="text-xs text-muted-foreground">
                      {tuteurs.length - 3} autre(s) responsable(s) dans l’onglet Parents.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
                  Aucun responsable rattaché à cet élève.
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                {gestionTuteurs ? <div className="flex min-w-0 flex-wrap gap-2">{gestionTuteurs}</div> : <span />}
                <LienOnglet onglet="tuteurs">Tous les responsables</LienOnglet>
              </div>
            </section>
          ) : null}
        </div>
        <div className={styles.side}>
          <section className={cardClass} aria-label="Actions rapides">
            <TitreSection
              titre="Actions rapides"
              description="Fonctions essentielles du dossier"
              icon={Zap}
              tone="orange"
            />
            <div className="flex flex-col gap-2.5">
              {notification ? (
                <div className="rounded-xl bg-succes p-1 text-primary-foreground [&_button]:!h-11 [&_button]:!w-full [&_button]:!justify-center [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!text-sm [&_button]:!font-semibold [&_button]:!text-primary-foreground [&_button]:hover:!bg-succes-doux">
                  {notification}
                </div>
              ) : null}
              {actions ? (
                <div className="space-y-2.5 [&>div]:!flex [&>div]:!flex-col [&>div]:!gap-2.5 [&_button]:!h-11 [&_button]:!w-full [&_button]:!justify-center [&_button]:!rounded-xl [&_button]:!border-info-trait [&_button]:!bg-info-doux [&_button]:!text-sm [&_button]:!font-semibold [&_button]:!text-foreground dark:[&_button]:!border-border dark:[&_button]:!bg-muted dark:[&_button]:!text-foreground">
                  {actions}
                </div>
              ) : null}
              {documents ? (
                <a
                  href={"/api/documents/certificat-scolarite/" + eleve.id}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-info-trait bg-info-doux px-3 py-2 text-sm font-semibold text-info hover:bg-info-doux/90 focus-visible:outline-2 focus-visible:outline-violet-600"
                >
                  <FileBadge2 className="size-4" aria-hidden /> Générer un certificat
                </a>
              ) : null}
              <RaccourciOnglet
                onglet="documents"
                className="min-h-11 w-full justify-center gap-2 rounded-xl border-border bg-card px-3 text-sm font-semibold text-foreground shadow-none hover:bg-muted/40 dark:bg-background"
              >
                <FileText className="size-4" aria-hidden /> Dossier documentaire{" "}
                <ChevronRight className="ml-auto size-4" aria-hidden />
              </RaccourciOnglet>
            </div>
          </section>
          <section className={cardClass} aria-label="Documents scolaires">
            <TitreSection
              titre="Documents scolaires"
              description="Pièces administratives et bulletins"
              icon={FileBadge2}
              tone="rose"
              right={<LienOnglet onglet="documents">Voir tous</LienOnglet>}
            />
            <ul className="divide-y divide-border">
              {[
                { nom: "Certificat de scolarité", chemin: "certificat-scolarite" },
                { nom: "Fiche d’inscription", chemin: "fiche-inscription" },
              ].map((item) => (
                <li key={item.chemin} className={styles.documentRow + " py-3"}>
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="size-5 shrink-0 text-info" aria-hidden />
                    <span className="min-w-0">
                      <span className="block break-words text-xs font-semibold text-foreground">{item.nom}</span>
                      <span className="text-xs text-muted-foreground">Document à éditer</span>
                    </span>
                  </div>
                  {documents ? (
                    <a
                      href={"/api/documents/" + item.chemin + "/" + eleve.id}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-info-doux px-2.5 py-1 text-xs font-medium text-info hover:bg-info-doux/90 focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      Éditer
                    </a>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">À éditer</span>
                  )}
                </li>
              ))}
              {bulletins.slice(0, 4).map((b) => (
                <li key={b.periodeId} className={styles.documentRow + " py-3"}>
                  <a
                    href={"/api/bulletins/" + b.inscriptionId + "/" + b.periodeId}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-3 hover:underline"
                  >
                    <FileCheck2 className="size-5 shrink-0 text-succes" aria-hidden />
                    <span className="min-w-0">
                      <span className="block break-words text-xs font-semibold text-foreground">
                        Bulletin {b.periodeLibelle}
                      </span>
                      <span className="text-xs text-muted-foreground">Document scolaire</span>
                    </span>
                  </a>
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold " +
                      (b.publie ? "bg-succes-doux text-succes" : "bg-alerte-doux text-alerte")
                    }
                  >
                    {b.publie ? <Check className="size-3" aria-hidden /> : null}
                    {b.publie ? "Publié" : "Brouillon"}
                  </span>
                </li>
              ))}
            </ul>
            {!bulletins.length ? (
              <p className="mt-2 text-xs text-muted-foreground">Aucun bulletin disponible pour cette période.</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Une pièce à éditer n’est pas une pièce déposée ou validée.
            </p>
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
                  <div className="min-w-0 rounded-xl border border-border bg-muted/40 p-3.5 dark:bg-muted/25">
                    <dt className="text-xs font-medium text-muted-foreground">Montant net dû</dt>
                    <dd className="mt-1 break-words text-lg font-bold tabular-nums leading-snug text-foreground">
                      {montant(netDu)}
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-xl border border-succes-trait bg-succes-doux p-3.5">
                    <dt className="text-xs font-medium text-succes">Montant payé</dt>
                    <dd className="mt-1 break-words text-lg font-bold tabular-nums leading-snug text-succes">
                      {montant(paye)}
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-xl border border-danger-trait bg-danger-doux p-3.5">
                    <dt className="text-xs font-medium text-danger">Reste à payer</dt>
                    <dd className="mt-1 break-words text-lg font-bold tabular-nums leading-snug text-danger">
                      {montant(reste)}
                    </dd>
                  </div>
                </dl>
                <div className="rounded-xl border border-border bg-card px-3.5 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span className="text-xs font-semibold text-foreground">Progression des paiements</span>
                    <span className="rounded-full bg-succes-doux px-2.5 py-1 text-xs font-bold tabular-nums text-succes">
                      {progression} % réglé
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Part du montant net dû déjà payée"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progression}
                    className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full rounded-full bg-succes" style={{ width: progression + "%" }} />
                  </div>
                  {echeancesFacturees.length ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {echeancesSoldees} échéance{echeancesSoldees > 1 ? "s" : ""} soldée
                      {echeancesSoldees > 1 ? "s" : ""} sur {echeancesFacturees.length} facturée
                      {echeancesFacturees.length > 1 ? "s" : ""}.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground dark:bg-muted/20">
                Aucune échéance financière enregistrée pour cette inscription.
              </p>
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
            <ol className="ml-2.5 border-l border-border">
              {activites.map((e) => (
                <li key={e.id} className="relative min-w-0 pb-4 pl-5 last:pb-0">
                  <span
                    aria-hidden
                    className={
                      "absolute -left-[5px] top-1.5 size-[9px] rounded-full ring-[3px] ring-white dark:ring-card " +
                      e.dot
                    }
                  />
                  <p className="break-words text-xs font-semibold leading-snug text-foreground">{e.texte}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <time dateTime={e.date}>
                      <DateCourte value={e.date} />
                    </time>
                    <span aria-hidden className="text-muted-foreground">
                      ·
                    </span>
                    <span>{e.type}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl bg-muted/40 px-4 py-5 text-sm text-muted-foreground dark:bg-muted/20">
              Aucun événement enregistré dans l’historique.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
