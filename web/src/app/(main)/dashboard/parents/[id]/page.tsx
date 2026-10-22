import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, ArrowUpRight, BadgeCheck, BriefcaseBusiness, CalendarDays,
  Check, ChevronRight, Clock3, CreditCard, IdCard, Mail,
  MapPin, MessageSquare, MonitorSmartphone, Phone, ShieldCheck, Smartphone,
  UserRound, Users, Building2, MapPinned, MessageSquareText,
} from "lucide-react";

import { peut, exigerPage } from "@/server/guard";
import { chargerDossierTuteur } from "@/server/domain/parents";
import { CoordonneesTuteur } from "./_components/coordonnees-tuteur";
import { ActionsDossierParent, AjouterEnfantParent } from "./_components/actions-dossier-parent";
import { HistoriqueParent } from "./_components/historique-parent";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await exigerPage("tuteur:gerer");
  const { id } = await params;
  const dossier = await chargerDossierTuteur(id).catch(() => null);
  return { title: dossier ? dossier.tuteur.prenom + " " + dossier.tuteur.nom + " — parent" : "Compte parent" };
}

const dateFr = (v: string | null) => v ? new Date(v).toLocaleDateString("fr-FR", {
  day: "2-digit", month: "long", year: "numeric",
}) : "—";

const LIENS: Record<string, string> = {
  PERE: "Père", MERE: "Mère", TUTEUR: "Tuteur",
  ONCLE: "Oncle", TANTE: "Tante", GRAND_PARENT: "Grand-parent",
  FRERE_SOEUR: "Frère / sœur", AUTRE: "Autre",
};

function Champ({ icone: Icone, libelle, valeur }: {
  icone: typeof Phone; libelle: string; valeur: string | null;
}) {
  return <div className="flex min-w-0 items-start gap-3">
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-50 text-[#445779] dark:bg-muted">
      <Icone className="size-[17px]" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] leading-tight text-slate-500 dark:text-muted-foreground">{libelle}</p>
      <p className="mt-1 break-words text-[13px] font-semibold leading-snug text-[#14244b] dark:text-foreground">{valeur?.trim() || "—"}</p>
    </div>
  </div>;
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
    nom: tuteur.nom, prenom: tuteur.prenom, sexe: tuteur.sexe,
    telephoneSecondaire: tuteur.telephoneSecondaire,
    profession: tuteur.profession, employeur: tuteur.employeur,
    adresse: tuteur.adresse, quartier: tuteur.quartier,
  };
  const initiales = (tuteur.prenom[0] ?? "") + (tuteur.nom[0] ?? "");
  const etat = !tuteur.utilisateurId ? { libelle: "Sans compte", classe: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" }
    : tuteur.compteActif === false ? { libelle: "Révoqué", classe: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" }
    : tuteur.derniereConnexion ? { libelle: "Actif", classe: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" }
    : { libelle: "Invité", classe: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" };

  const explicationCanal = canalJoignable === "PUSH"
    ? "Ce responsable reçoit les notifications via l'application lorsqu'un appareil est joignable."
    : canalJoignable === "SMS"
      ? "Aucun appareil actif n’est joignable : les notifications partent par SMS et peuvent être facturées."
      : "Aucun canal actif : les notifications restent en attente jusqu’à l’activation d’un canal.";

  return <main className="mx-auto max-w-[1560px] space-y-5 pb-8 text-[#122449] dark:text-foreground">
    <nav aria-label="Retour" className="print:hidden">
      <Link href="/dashboard/parents" className="inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-900 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300">
        <ArrowLeft className="size-4" aria-hidden />Retour aux comptes parents
      </Link>
    </nav>

    <header className="flex flex-col gap-4 rounded-[22px] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_4px_18px_rgba(16,35,75,0.035)] dark:border-border dark:bg-card sm:px-6 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-center gap-4 sm:gap-5">
        <span aria-hidden className="flex size-[78px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-[26px] font-bold text-[#164588] ring-4 ring-white dark:ring-card sm:size-[86px]">
          {initiales.toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="break-words text-[24px] font-extrabold leading-tight tracking-tight text-[#0b1e43] dark:text-foreground sm:text-[29px]">{nomComplet}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${etat.classe}`}><UserRound className="size-3.5" aria-hidden />{etat.libelle}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-600 dark:text-muted-foreground sm:text-[13px]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Phone className="size-4" aria-hidden />{tuteur.telephone}</span>
            {tuteur.profession ? <span className="inline-flex items-center gap-1.5"><BriefcaseBusiness className="size-4" aria-hidden />{tuteur.profession}</span> : null}
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />Fiche créée le {dateFr(tuteur.creeLe)}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 print:hidden">
        <ActionsDossierParent parent={{
          id: tuteur.id, nomComplet, telephone: tuteur.telephone, email: tuteur.email,
          accepteSms: tuteur.accepteSms, utilisateurId: tuteur.utilisateurId, compteActif: tuteur.compteActif, profil,
        }} peutSms={peutSms} peutInviter={peutInviter} />
      </div>
    </header>

    <section aria-label="Canal de communication du responsable" className="grid gap-4 rounded-[20px] border border-emerald-100/80 bg-gradient-to-r from-emerald-50/70 via-white to-white p-4 shadow-sm dark:border-border dark:from-emerald-950/20 dark:via-card dark:to-card sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,.55fr))] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><MessageSquareText className="size-6" aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#13274d] dark:text-foreground">Comment ce parent est joint ?</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600 dark:text-muted-foreground">{explicationCanal}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3 border-t border-slate-100 pt-3 dark:border-border lg:border-l lg:border-t-0 lg:py-1 lg:pl-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950"><Smartphone className="size-5" aria-hidden /></span>
        <div><p className="text-xs font-semibold">Canal</p><span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{canalJoignable === "PUSH" ? "Application · gratuit" : canalJoignable === "SMS" ? "SMS · facturé" : "Indisponible"}</span></div>
      </div>
      <div className="flex min-w-0 items-center gap-3 border-t border-slate-100 pt-3 dark:border-border lg:border-l lg:border-t-0 lg:py-1 lg:pl-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#46597a] dark:bg-muted"><MonitorSmartphone className="size-5" aria-hidden /></span>
        <div><p className="text-xs font-semibold">Appareils actifs</p><span className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-muted dark:text-foreground">{nbAppareils} appareil{nbAppareils > 1 ? "s" : ""}</span></div>
      </div>
      <div className="flex min-w-0 items-center gap-3 border-t border-slate-100 pt-3 dark:border-border lg:border-l lg:border-t-0 lg:py-1 lg:pl-4">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tuteur.accepteSms ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950" : "bg-red-50 text-red-600 dark:bg-red-950"}`}><Check className="size-5" aria-hidden /></span>
        <div><p className="text-xs font-semibold">SMS acceptés</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tuteur.accepteSms ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950" : "bg-red-50 text-red-600 dark:bg-red-950"}`}>{tuteur.accepteSms ? "Oui" : "Non"}</span></div>
      </div>
    </section>

    <div className="grid items-stretch gap-4 xl:grid-cols-2">
      <section aria-labelledby="parent-coordonnees-titre" className="min-w-0 rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950"><UserRound className="size-5" aria-hidden /></span>
            <h2 id="parent-coordonnees-titre" className="text-[16px] font-bold">Coordonnées</h2>
          </div>
          <CoordonneesTuteur tuteurId={tuteur.id} nomComplet={nomComplet} telephone={tuteur.telephone} email={tuteur.email} accepteSms={tuteur.accepteSms} variante="secondaire" profil={profil} />
        </header>
        <div className="grid gap-5 rounded-2xl border border-slate-100 bg-slate-50/35 px-3 py-4 dark:border-border dark:bg-muted/10 sm:grid-cols-2 sm:gap-x-5 sm:px-4">
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

      <section aria-labelledby="parent-enfants-titre" className="min-w-0 rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950"><Users className="size-5" aria-hidden /></span>
            <h2 id="parent-enfants-titre" className="text-[16px] font-bold">Enfants rattachés ({enfants.length})</h2>
          </div>
          {peutLierEnfant ? <AjouterEnfantParent tuteurId={tuteur.id} /> : null}
        </header>
        {enfants.length ? <div className="space-y-3">
          {enfants.map(e => <article key={e.eleveId} className="rounded-2xl border border-slate-200/90 bg-slate-50/20 px-4 py-4 dark:border-border dark:bg-muted/10">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[15px] font-bold text-violet-700 dark:bg-violet-950">{(e.prenom[0] ?? "") + (e.nom[0] ?? "")}</span>
              <div className="min-w-0 flex-1">
                <Link href={"/dashboard/eleves/" + e.eleveId} className="inline-flex max-w-full items-center gap-1.5 break-words text-sm font-bold text-[#10234b] hover:text-blue-700 hover:underline dark:text-foreground">
                  {e.prenom} {e.nom}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                </Link>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-muted-foreground">{e.matricule}{e.classe ? " · " + e.classe : " · Sans classe active"}</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-border dark:bg-card dark:text-foreground">{LIENS[e.lien] ?? e.lien}</span>
              <Link href={"/dashboard/eleves/" + e.eleveId} title={"Voir le dossier de " + e.prenom} aria-label={"Consulter " + e.prenom + " " + e.nom} className="shrink-0 rounded-full p-1 text-[#254268] hover:bg-blue-50"><ChevronRight className="size-4" aria-hidden /></Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {e.estPrincipal ? <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">Principal</span> : null}
              {e.estTuteurLegal ? <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">Tuteur légal</span> : null}
              {e.estResponsableFinancier ? <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">Responsable financier</span> : null}
              {e.estContactUrgence ? <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">Contact d'urgence</span> : null}
              {e.autoriseRetrait ? <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">Autorisé au retrait</span> : null}
            </div>
          </article>)}
        </div> : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-border">Aucun enfant rattaché à ce responsable.</div>}
      </section>
    </div>

    <HistoriqueParent notifications={notifications} />
  </main>;
}
