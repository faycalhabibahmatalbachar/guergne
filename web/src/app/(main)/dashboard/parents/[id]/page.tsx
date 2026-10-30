import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  IdCard,
  Mail,
  MapPin,
  MapPinned,
  MessageSquare,
  MessageSquareText,
  MonitorSmartphone,
  Phone,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { chargerDossierTuteur } from "@/server/domain/parents";
import { exigerPage, peut } from "@/server/guard";

import { ActionsDossierParent, AjouterEnfantParent } from "./_components/actions-dossier-parent";
import { CoordonneesTuteur } from "./_components/coordonnees-tuteur";
import { HistoriqueParent } from "./_components/historique-parent";
import { RolesFamiliaux } from "./_components/roles-familiaux";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await exigerPage("tuteur:gerer");
  const { id } = await params;
  const dossier = await chargerDossierTuteur(id).catch(() => null);
  return { title: dossier ? dossier.tuteur.prenom + " " + dossier.tuteur.nom + " — parent" : "Compte parent" };
}

const dateFr = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

const LIENS: Record<string, string> = {
  PERE: "Père",
  MERE: "Mère",
  TUTEUR: "Tuteur",
  ONCLE: "Oncle",
  TANTE: "Tante",
  GRAND_PARENT: "Grand-parent",
  FRERE_SOEUR: "Frère / sœur",
  AUTRE: "Autre",
};

function Champ({ icone: Icone, libelle, valeur }: { icone: typeof Phone; libelle: string; valeur: string | null }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/40 text-muted-foreground"
      >
        <Icone className="size-[17px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-tight text-muted-foreground">{libelle}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{valeur?.trim() || "—"}</p>
      </div>
    </div>
  );
}

export default async function PageDossierParent({ params }: { params: Promise<{ id: string }> }) {
  const principal = await exigerPage("tuteur:gerer");
  const { id } = await params;
  const dossier = await chargerDossierTuteur(id);
  if (!dossier) notFound();

  const [peutSms, peutInviter, peutLierEnfant] = await Promise.all([
    peut(principal, "message:envoyer"),
    peut(principal, "tuteur:inviter"),
    peut(principal, "eleve:modifier"),
  ]);

  const { tuteur, enfants, notifications, canalJoignable, nbAppareils } = dossier;
  const nomComplet = tuteur.prenom + " " + tuteur.nom;
  const profil = {
    nom: tuteur.nom,
    prenom: tuteur.prenom,
    sexe: tuteur.sexe,
    telephoneSecondaire: tuteur.telephoneSecondaire,
    profession: tuteur.profession,
    employeur: tuteur.employeur,
    adresse: tuteur.adresse,
    quartier: tuteur.quartier,
  };
  const initiales = (tuteur.prenom[0] ?? "") + (tuteur.nom[0] ?? "");
  const etat = !tuteur.utilisateurId
    ? { libelle: "Sans compte", classe: "bg-alerte-doux text-alerte" }
    : tuteur.compteActif === false
      ? { libelle: "Révoqué", classe: "bg-danger-doux text-danger" }
      : tuteur.derniereConnexion
        ? { libelle: "Actif", classe: "bg-succes-doux text-succes" }
        : { libelle: "Invité", classe: "bg-info-doux text-info" };

  const explicationCanal =
    canalJoignable === "PUSH"
      ? "Ce responsable reçoit les notifications via l'application lorsqu'un appareil est joignable."
      : canalJoignable === "SMS"
        ? "Aucun appareil actif n’est joignable : les notifications partent par SMS et peuvent être facturées."
        : "Aucun canal actif : les notifications restent en attente jusqu’à l’activation d’un canal.";

  return (
    <main className="mx-auto max-w-[1560px] space-y-5 pb-8 text-foreground">
      <nav aria-label="Retour" className="print:hidden">
        <Link
          href="/dashboard/parents"
          className="inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-semibold text-info transition-colors hover:text-info hover:underline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux comptes parents
        </Link>
      </nav>

      <header className="flex flex-col gap-4 rounded-[22px] border border-border bg-card px-5 py-5 shadow-[0_4px_18px_rgba(16,35,75,0.035)] sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <span
            aria-hidden
            className="flex size-[78px] shrink-0 items-center justify-center rounded-full bg-info-doux text-2xl font-bold text-info ring-4 ring-card dark:ring-card sm:size-[86px]"
          >
            {initiales.toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="break-words leading-tight tracking-tight text-foreground">{nomComplet}</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${etat.classe}`}
              >
                <UserRound className="size-3.5" aria-hidden />
                {etat.libelle}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Phone className="size-4" aria-hidden />
                {tuteur.telephone}
              </span>
              {tuteur.profession ? (
                <span className="inline-flex items-center gap-1.5">
                  <BriefcaseBusiness className="size-4" aria-hidden />
                  {tuteur.profession}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                Fiche créée le {dateFr(tuteur.creeLe)}
              </span>
            </div>
          </div>
        </div>
        <div className="shrink-0 print:hidden">
          <ActionsDossierParent
            parent={{
              id: tuteur.id,
              nomComplet,
              telephone: tuteur.telephone,
              email: tuteur.email,
              accepteSms: tuteur.accepteSms,
              utilisateurId: tuteur.utilisateurId,
              compteActif: tuteur.compteActif,
              profil,
            }}
            peutSms={peutSms}
            peutInviter={peutInviter}
          />
        </div>
      </header>

      <section
        aria-label="Canal de communication du responsable"
        className="grid gap-4 rounded-[20px] border border-succes-trait bg-card p-4 shadow-sm dark:via-card dark:to-card sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,.55fr))] lg:items-center"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-succes-doux text-succes">
            <MessageSquareText className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">Comment ce parent est joint ?</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{explicationCanal}</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:py-1 lg:pl-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-succes-doux text-succes">
            <Smartphone className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold">Canal</p>
            <span className="mt-1 inline-flex rounded-full bg-succes-doux px-2.5 py-1 text-xs font-semibold text-succes">
              {canalJoignable === "PUSH"
                ? "Application · gratuit"
                : canalJoignable === "SMS"
                  ? "SMS · facturé"
                  : "Indisponible"}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:py-1 lg:pl-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MonitorSmartphone className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold">Appareils actifs</p>
            <span className="mt-1 inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
              {nbAppareils} appareil{nbAppareils > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:py-1 lg:pl-4">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tuteur.accepteSms ? "bg-succes-doux text-succes" : "bg-danger-doux text-danger"}`}
          >
            <Check className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold">SMS acceptés</p>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tuteur.accepteSms ? "bg-succes-doux text-succes" : "bg-danger-doux text-danger"}`}
            >
              {tuteur.accepteSms ? "Oui" : "Non"}
            </span>
          </div>
        </div>
      </section>

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <section
          aria-labelledby="parent-coordonnees-titre"
          className="min-w-0 rounded-[20px] border border-border bg-card p-4 shadow-sm sm:p-5"
        >
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-info-doux text-info">
                <UserRound className="size-5" aria-hidden />
              </span>
              <h2 id="parent-coordonnees-titre" className="text-base font-bold">
                Coordonnées
              </h2>
            </div>
            <CoordonneesTuteur
              tuteurId={tuteur.id}
              nomComplet={nomComplet}
              telephone={tuteur.telephone}
              email={tuteur.email}
              accepteSms={tuteur.accepteSms}
              variante="secondaire"
              profil={profil}
            />
          </header>
          <div className="grid gap-5 rounded-2xl border border-border bg-muted/40 px-3 py-4 dark:bg-muted/10 sm:grid-cols-2 sm:gap-x-5 sm:px-4">
            <Champ icone={Phone} libelle="Téléphone" valeur={tuteur.telephone} />
            <Champ icone={Phone} libelle="Second numéro" valeur={tuteur.telephoneSecondaire} />
            <Champ icone={Mail} libelle="Adresse électronique" valeur={tuteur.email} />
            <Champ icone={IdCard} libelle="Pièce d’identité" valeur={tuteur.pieceIdentite} />
            <Champ icone={BriefcaseBusiness} libelle="Profession" valeur={tuteur.profession} />
            <Champ icone={Building2} libelle="Employeur" valeur={tuteur.employeur} />
            <Champ icone={MapPin} libelle="Adresse" valeur={tuteur.adresse} />
            <Champ icone={MapPinned} libelle="Quartier" valeur={tuteur.quartier} />
            <Champ icone={Smartphone} libelle="Application activée le" valeur={dateFr(tuteur.appActiveeLe)} />
            <Champ icone={Clock3} libelle="Dernière connexion" valeur={dateFr(tuteur.derniereConnexion)} />
          </div>
        </section>

        <section
          id="enfants-rattaches"
          aria-labelledby="parent-enfants-titre"
          className="min-w-0 rounded-[20px] border border-border bg-card p-4 shadow-sm sm:p-5"
        >
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-info-doux text-info">
                <Users className="size-5" aria-hidden />
              </span>
              <h2 id="parent-enfants-titre" className="text-base font-bold">
                Enfants rattachés ({enfants.length})
              </h2>
            </div>
            {peutLierEnfant ? <AjouterEnfantParent tuteurId={tuteur.id} /> : null}
          </header>
          {enfants.length ? (
            <div className="space-y-3">
              {enfants.map((e) => (
                <article
                  key={e.eleveId}
                  className="rounded-2xl border border-border bg-muted/40 px-4 py-4 dark:bg-muted/10"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-info-doux text-base font-bold text-info"
                    >
                      {(e.prenom[0] ?? "") + (e.nom[0] ?? "")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={"/dashboard/eleves/" + e.eleveId}
                        className="inline-flex max-w-full items-center gap-1.5 break-words text-sm font-bold text-foreground hover:text-info hover:underline"
                      >
                        {e.prenom} {e.nom}
                        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.matricule}
                        {e.classe ? " · " + e.classe : " · Sans classe active"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {LIENS[e.lien] ?? e.lien}
                    </span>
                    <Link
                      href={"/dashboard/eleves/" + e.eleveId}
                      title={"Voir le dossier de " + e.prenom}
                      aria-label={"Consulter " + e.prenom + " " + e.nom}
                      className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-info-doux/90"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {e.estPrincipal ? (
                      <span className="rounded-lg bg-info-doux px-2.5 py-1 text-xs font-semibold text-info">
                        Principal
                      </span>
                    ) : null}
                    {e.estTuteurLegal ? (
                      <span className="rounded-lg bg-info-doux px-2.5 py-1 text-xs font-semibold text-info">
                        Tuteur légal
                      </span>
                    ) : null}
                    {e.estResponsableFinancier ? (
                      <span className="rounded-lg bg-info-doux px-2.5 py-1 text-xs font-semibold text-info">
                        Responsable financier
                      </span>
                    ) : null}
                    {e.estContactUrgence ? (
                      <span className="rounded-lg bg-info-doux px-2.5 py-1 text-xs font-semibold text-info">
                        Contact d'urgence
                      </span>
                    ) : null}
                    {e.autoriseRetrait ? (
                      <span className="rounded-lg bg-info-doux px-2.5 py-1 text-xs font-semibold text-info">
                        Autorisé au retrait
                      </span>
                    ) : null}
                  </div>
                  {peutLierEnfant ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <RolesFamiliaux
                        roles={{
                          tuteurId: tuteur.id,
                          eleveId: e.eleveId,
                          enfant: e.prenom + " " + e.nom,
                          lien: e.lien,
                          estPrincipal: e.estPrincipal,
                          estTuteurLegal: e.estTuteurLegal,
                          estResponsableFinancier: e.estResponsableFinancier,
                          estContactUrgence: e.estContactUrgence,
                          autoriseRetrait: e.autoriseRetrait,
                        }}
                      />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Aucun enfant rattaché à ce responsable.
            </div>
          )}
        </section>
      </div>

      <HistoriqueParent notifications={notifications} />
    </main>
  );
}
