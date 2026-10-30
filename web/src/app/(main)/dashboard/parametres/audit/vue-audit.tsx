"use client";

import { type ReactNode, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Database,
  FileClock,
  Fingerprint,
  Globe2,
  History,
  Laptop,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateAudit, libelleChamp } from "@/lib/audit-presentation";
import type { LigneAudit, ResultatAudit } from "@/server/domain/audit";

const ROLES: Record<string, string> = {
  SUPER_ADMIN: "Super administrateur",
  DIRECTION: "Direction",
  CENSEUR: "Censeur",
  SURVEILLANT: "Surveillance",
  SECRETARIAT: "Secrétariat",
  COMPTABLE: "Comptabilité",
  ENSEIGNANT: "Enseignant",
  PARENT: "Parent",
  ELEVE: "Élève",
};
const ENTITES: Record<string, string> = {
  utilisateurs: "Compte utilisateur",
  eleves: "Dossier élève",
  tuteurs: "Responsable légal",
  classes: "Classe",
  bulletins: "Bulletin",
  messages: "Communication",
  evaluations: "Évaluation",
  periodes: "Période",
  journal_audit: "Journal d'audit",
};

function formatCourt(date: string) {
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? "Date inconnue"
    : new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Africa/Ndjamena",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
}
function etiquettePreuve(ligne: LigneAudit): string {
  return ligne.preuve.typePreuve === "comparaison"
    ? "Avant / après disponible"
    : ligne.preuve.typePreuve === "resultat"
      ? "Résultat enregistré"
      : "Sans état détaillé";
}
function categorie(ligne: LigneAudit) {
  if (/connexion|mot_de_passe|deconnexion|permission|session/i.test(ligne.action)) {
    return { icon: LockKeyhole, tonalite: "border-alerte-trait bg-alerte-doux text-alerte" };
  }
  if (/notification|message|tuteur/i.test(ligne.action)) {
    return { icon: UsersRound, tonalite: "border-info-trait bg-info-doux text-info" };
  }
  return { icon: Activity, tonalite: "border-border bg-muted/40 text-foreground" };
}
function TitreValeur({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}
function Stat({
  titre,
  valeur,
  legende,
  icon: Icon,
}: {
  titre: string;
  valeur: string | number;
  legende: string;
  icon: typeof Activity;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span>{titre}</span>
        <Icon className="size-4 shrink-0" aria-hidden />
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{valeur}</div>
      <p className="mt-1 text-xs text-muted-foreground">{legende}</p>
    </div>
  );
}
function Ensemble({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-bold text-foreground">{titre}</h3>
      {children}
    </section>
  );
}

function PanneauDetails({
  ligne,
  onClose,
  onCorrelate,
}: {
  ligne: LigneAudit | null;
  onClose: () => void;
  onCorrelate: (id: string) => void;
}) {
  return (
    <Sheet
      open={Boolean(ligne)}
      onOpenChange={(ouvert) => {
        if (!ouvert) onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[min(740px,94vw)]">
        {ligne ? (
          <>
            <SheetHeader className="shrink-0 border-b border-border px-5 pb-4 pt-6 sm:px-7">
              <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-succes-trait bg-succes-doux px-2.5 py-1 text-xs font-medium text-succes">
                <ShieldCheck className="size-3.5" aria-hidden /> Événement enregistré
              </div>
              <SheetTitle className="pr-8 text-xl font-bold tracking-tight sm:text-2xl">
                {ligne.actionLibelle}
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs leading-relaxed">
                Trace n° {ligne.id} · {formatDateAudit(ligne.date)} · heure du Tchad (UTC+1)
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
              <Tabs key={ligne.id} defaultValue="synthese" className="gap-5">
                <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl bg-muted p-1">
                  <TabsTrigger value="synthese" className="text-xs sm:text-sm">
                    1. Synthèse
                  </TabsTrigger>
                  <TabsTrigger value="evolution" className="text-xs sm:text-sm">
                    2. Avant / après
                  </TabsTrigger>
                  <TabsTrigger value="trace" className="text-xs sm:text-sm">
                    3. Traçabilité
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="synthese" className="space-y-4">
                  <Ensemble titre="Qui a effectué cette action ?">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                        <UserRound className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{ligne.acteur}</p>
                        <p className="text-xs text-muted-foreground">
                          {ROLES[ligne.role ?? ""] ?? ligne.role ?? "Rôle non enregistré"}
                        </p>
                      </div>
                    </div>
                  </Ensemble>
                  <Ensemble titre="Résumé de l'opération">
                    <dl className="grid gap-5 sm:grid-cols-2">
                      <TitreValeur label="Action">{ligne.actionLibelle}</TitreValeur>
                      <TitreValeur label="Domaine">{ligne.familleLibelle}</TitreValeur>
                      <TitreValeur label="Dossier concerné">
                        {ligne.eleve || ENTITES[ligne.entite] || libelleChamp(ligne.entite)}
                      </TitreValeur>
                      <TitreValeur label="Date et heure">{formatDateAudit(ligne.date)}</TitreValeur>
                    </dl>
                    {ligne.motif ? (
                      <div className="mt-5 rounded-lg border-l-2 border-border bg-muted/40 px-4 py-3">
                        <p className="text-xs font-semibold text-muted-foreground">Motif consigné</p>
                        <p className="mt-1 text-sm leading-relaxed">{ligne.motif}</p>
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-muted-foreground">
                        Aucun motif explicite n'a été consigné pour cet événement.
                      </p>
                    )}
                  </Ensemble>
                  <Ensemble titre="Qualité des preuves">
                    <div className="flex items-center gap-2">
                      {ligne.preuve.typePreuve === "comparaison" ? (
                        <Check className="size-4 text-succes" aria-hidden />
                      ) : (
                        <ShieldAlert className="size-4 text-alerte" aria-hidden />
                      )}
                      <p className="text-sm font-semibold">{etiquettePreuve(ligne)}</p>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {ligne.preuve.typePreuve === "comparaison"
                        ? "Le journal contient un état avant et un état après. Seuls les champs effectivement présents sont comparés."
                        : ligne.preuve.typePreuve === "resultat"
                          ? "Le résultat a été consigné, mais l'état antérieur n'a pas été enregistré. Il ne peut pas être reconstitué avec certitude."
                          : "Le journal atteste l'événement et son contexte, mais ne contient pas de valeurs métiers détaillées."}
                    </p>
                  </Ensemble>
                </TabsContent>

                <TabsContent value="evolution" className="space-y-4">
                  <Ensemble titre="Évolution constatée">
                    {ligne.preuve.changements.length ? (
                      <div className="space-y-3">
                        {ligne.preuve.changements.map((v, i) => (
                          <div key={i} className="rounded-xl border border-border p-3">
                            <p className="mb-2 text-xs font-semibold text-foreground">{v.champ}</p>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-xs">
                              <div className="min-w-0 rounded-lg bg-muted/40 p-2.5">
                                <span className="text-xs font-semibold uppercase text-muted-foreground">Avant</span>
                                <p className="mt-1 break-words font-medium">{v.avant}</p>
                              </div>
                              <ArrowRight className="mt-6 size-4 text-muted-foreground" aria-hidden />
                              <div className="min-w-0 rounded-lg bg-succes-doux p-2.5 text-succes">
                                <span className="text-xs font-semibold uppercase">Après</span>
                                <p className="mt-1 break-words font-medium">{v.apres}</p>
                              </div>
                            </div>
                            {v.nature === "information" && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Une des deux valeurs n'a pas été enregistrée ; ce n'est pas une comparaison complète.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Aucune évolution détaillée exploitable pour cette action.
                      </p>
                    )}
                  </Ensemble>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(
                      [
                        { titre: "État avant", lignes: ligne.preuve.lignesAvant },
                        { titre: "État après", lignes: ligne.preuve.lignesApres },
                      ] as const
                    ).map((bloc) => (
                      <Ensemble key={bloc.titre} titre={bloc.titre}>
                        {bloc.lignes.length ? (
                          <dl className="space-y-3">
                            {bloc.lignes.map((v, i) => (
                              <div key={i} className="border-b border-border pb-2 last:border-0">
                                <dt className="text-xs text-muted-foreground">{v.label}</dt>
                                <dd className="mt-1 break-words text-sm font-medium">{v.valeur}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="text-xs text-muted-foreground">Non enregistré dans le journal.</p>
                        )}
                      </Ensemble>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Les mots de passe, codes, jetons et autres champs sensibles sont systématiquement masqués. Les
                    données absentes ne sont jamais inventées.
                  </p>
                </TabsContent>

                <TabsContent value="trace" className="space-y-4">
                  <Ensemble titre="Quand et comment ?">
                    <dl className="grid gap-5 sm:grid-cols-2">
                      <TitreValeur label="Horodatage précis">{formatDateAudit(ligne.date)}</TitreValeur>
                      <TitreValeur label="Fuseau d'affichage">Tchad — UTC+1</TitreValeur>
                      <TitreValeur label="Navigateur / appareil">{ligne.appareil}</TitreValeur>
                      <TitreValeur label="Origine réseau">{ligne.ip || "Adresse IP non consignée"}</TitreValeur>
                      <TitreValeur label="Route métier">
                        {ligne.routeOrigine || "Non consignée (ancienne trace)"}
                      </TitreValeur>
                      <TitreValeur label="Méthode HTTP">
                        {ligne.methodeHttp || "Non consignée (ancienne trace)"}
                      </TitreValeur>
                    </dl>
                    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                      L'adresse IP identifie une origine réseau observée, pas une adresse physique exacte. La position
                      géographique n'est pas enregistrée par ce journal.
                    </p>
                  </Ensemble>
                  <Ensemble titre="Références de traçabilité">
                    <dl className="grid gap-4">
                      <TitreValeur label="Identifiant de l'événement">N° {ligne.id}</TitreValeur>
                      <TitreValeur label="Objet enregistré">
                        {ligne.entiteId ? "Référence ···" + ligne.entiteId.slice(-8) : "Non renseigné"}
                      </TitreValeur>
                      <TitreValeur label="Compte à l'origine">
                        {ligne.acteurId ? "Référence ···" + ligne.acteurId.slice(-8) : "Non renseigné"}
                      </TitreValeur>
                      <TitreValeur label="Code d'action (identifiant technique)">{ligne.action}</TitreValeur>
                      <TitreValeur label="Version des preuves">
                        {ligne.versionPreuve === 2 ? "V2 · écriture atomique" : "Historique · couverture partielle"}
                      </TitreValeur>
                      <TitreValeur label="Corrélation">
                        {ligne.correlationId
                          ? "Opération ···" + ligne.correlationId.slice(-12)
                          : "Non enregistré (ancienne trace)"}
                      </TitreValeur>
                      <TitreValeur label="Canal">
                        {ligne.typeSource === "server_action" ? "Action serveur" : ligne.typeSource || "Non enregistré"}
                      </TitreValeur>
                    </dl>
                  </Ensemble>
                  {ligne.correlationId && (
                    <Button variant="outline" className="w-full" onClick={() => onCorrelate(ligne.correlationId!)}>
                      <Fingerprint className="size-4" aria-hidden />
                      Voir toutes les traces de la même opération
                    </Button>
                  )}
                  <div className="rounded-xl border border-alerte-trait bg-alerte-doux p-4 text-xs leading-relaxed text-alerte">
                    <p className="mb-1 flex items-center gap-2 font-semibold">
                      <ShieldAlert className="size-4" aria-hidden /> Limites des traces
                    </p>
                    Un contexte absent n'est pas une preuve qu'il n'existait pas. Pour une enquête, rapprocher cet
                    événement des autres journaux applicatifs et de l'infrastructure.
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function VueAudit({
  journal,
  familles,
  acteurs,
  filtres,
}: {
  journal: ResultatAudit;
  familles: Array<{ famille: string; label: string; nombre: number }>;
  acteurs: Array<{ id: string; nom: string; role: string | null; nombre: number }>;
  filtres: {
    action: string;
    entite: string;
    acteur: string;
    recherche: string;
    depuis: string;
    jusqua: string;
    correlation: string;
  };
}) {
  const routeur = useRouter();
  const params = useSearchParams();
  const [selection, setSelection] = useState<LigneAudit | null>(null);
  const [recherche, setRecherche] = useState(filtres.recherche);
  useEffect(() => setRecherche(filtres.recherche), [filtres.recherche]);
  const base = "/dashboard/parametres/audit";

  function naviguer(changements: Record<string, string>) {
    setSelection(null);
    const p = new URLSearchParams(params.toString());
    for (const [cle, valeur] of Object.entries(changements)) {
      if (valeur) p.set(cle, valeur);
      else p.delete(cle);
    }
    p.delete("page");
    routeur.push(base + "?" + p.toString());
  }
  function paginer(n: number) {
    setSelection(null);
    const p = new URLSearchParams(params.toString());
    p.set("page", String(n));
    routeur.push(base + "?" + p.toString());
  }
  const pourcentage = (n: number) => (journal.total ? Math.round((n * 100) / journal.total) : 0);
  const actif = Boolean(
    filtres.action ||
      filtres.entite ||
      filtres.acteur ||
      filtres.recherche ||
      filtres.depuis ||
      filtres.jusqua ||
      filtres.correlation,
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          titre="Événements trouvés"
          valeur={journal.total.toLocaleString("fr-FR")}
          legende="Pour les filtres sélectionnés"
          icon={History}
        />
        <Stat
          titre="Origine réseau"
          valeur={pourcentage(journal.couverture.adresseIp) + " %"}
          legende="Avec une adresse IP conservée"
          icon={Globe2}
        />
        <Stat
          titre="Appareil identifié"
          valeur={pourcentage(journal.couverture.appareil) + " %"}
          legende="Avec un agent utilisateur"
          icon={Laptop}
        />
        <Stat
          titre="État avant disponible"
          valeur={pourcentage(journal.couverture.avant) + " %"}
          legende="Taux de comparaison possible"
          icon={Database}
        />
        <Stat
          titre="Preuves V2 atomiques"
          valeur={journal.couverture.v2}
          legende="Actions couvertes par le moteur V2"
          icon={ShieldCheck}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-bold">Rechercher dans les traces</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(150px,190px)_minmax(150px,190px)_140px_140px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              naviguer({ recherche });
            }}
            className="space-y-1.5"
          >
            <Label htmlFor="audit-recherche" className="text-xs">
              Action, nom, dossier ou motif
            </Label>
            <div className="flex gap-2">
              <Input
                id="audit-recherche"
                type="search"
                value={recherche}
                maxLength={90}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher…"
                className="h-10 min-w-0 flex-1"
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                className="size-10 shrink-0"
                aria-label="Lancer la recherche"
              >
                <Search className="size-4" />
              </Button>
            </div>
          </form>
          <div className="space-y-1.5">
            <Label htmlFor="audit-famille" className="text-xs">
              Domaine d'activité
            </Label>
            <NativeSelect
              id="audit-famille"
              className="w-full"
              value={filtres.action}
              onChange={(e) => naviguer({ action: e.target.value })}
            >
              <option value="">Toutes les activités</option>
              {familles.map((f) => (
                <option value={f.famille} key={f.famille}>
                  {f.label} ({f.nombre})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-acteur" className="text-xs">
              Auteur
            </Label>
            <NativeSelect
              id="audit-acteur"
              className="w-full"
              value={filtres.acteur}
              onChange={(e) => naviguer({ acteur: e.target.value })}
            >
              <option value="">Tous les utilisateurs</option>
              {acteurs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom} ({a.nombre})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-depuis" className="text-xs">
              Du
            </Label>
            <Input
              id="audit-depuis"
              type="date"
              value={filtres.depuis}
              onChange={(e) => naviguer({ depuis: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-jusqua" className="text-xs">
              Au
            </Label>
            <Input
              id="audit-jusqua"
              type="date"
              value={filtres.jusqua}
              onChange={(e) => naviguer({ jusqua: e.target.value })}
            />
          </div>
        </div>
        {filtres.correlation && (
          <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Opération filtrée : ···{filtres.correlation.slice(-12)}
          </p>
        )}
        {actif && (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRecherche("");
                routeur.push(base);
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden /> Réinitialiser les filtres
            </Button>
          </div>
        )}
      </section>

      <section
        className="overflow-hidden rounded-xl border border-border bg-card"
        aria-label="Chronologie des événements"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-sm font-bold">Chronologie des actions</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {journal.total.toLocaleString("fr-FR")} événement(s) · du plus récent au plus ancien
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-4" aria-hidden /> Heure du Tchad (UTC+1)
          </span>
        </div>
        <div className="divide-y divide-border">
          {journal.lignes.length ? (
            journal.lignes.map((l) => {
              const info = categorie(l),
                Icon = info.icon;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelection(l)}
                  className="group flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-muted/90 sm:gap-4 sm:px-5"
                >
                  <span className={"grid size-10 shrink-0 place-items-center rounded-xl border " + info.tonalite}>
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <strong className="text-sm font-semibold text-foreground">{l.actionLibelle}</strong>
                      <Badge
                        variant="outline"
                        className="max-w-full truncate text-xs font-normal text-muted-foreground"
                      >
                        {l.familleLibelle}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{l.acteur}</span>
                      <span aria-hidden>·</span>
                      <span>{ROLES[l.role ?? ""] ?? "Rôle inconnu"}</span>
                      <span aria-hidden>·</span>
                      <span>{l.eleve || ENTITES[l.entite] || libelleChamp(l.entite)}</span>
                    </div>
                    {l.motif ? (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{l.motif}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FileClock className="size-3.5" aria-hidden />
                        {etiquettePreuve(l)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Laptop className="size-3.5" aria-hidden />
                        {l.appareil}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 self-center">
                    <span className="text-right text-xs font-medium tabular-nums text-muted-foreground">
                      {formatCourt(l.date)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground opacity-80 group-hover:text-info">
                      Examiner <ChevronRight className="size-4" aria-hidden />
                    </span>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-5 py-16 text-center">
              <Search className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden />
              <p className="text-sm font-semibold">Aucun événement pour ces critères</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Modifiez la période ou effacez les filtres pour élargir la recherche.
              </p>
            </div>
          )}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs sm:px-5">
          <span className="text-muted-foreground">
            Page {journal.page} sur {journal.nbPages} · {journal.parPage} traces par page
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={journal.page <= 1} onClick={() => paginer(journal.page - 1)}>
              <ArrowLeft className="size-3.5" aria-hidden /> Précédent
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={journal.page >= journal.nbPages}
              onClick={() => paginer(journal.page + 1)}
            >
              Suivant <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </div>
        </footer>
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <Fingerprint className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          La traçabilité reflète les événements réellement écrits par l'application. L'absence d'une valeur « avant »,
          d'une IP ou d'un motif est clairement signalée. Les données sensibles sont masquées et aucune position
          géographique n'est déduite d'une adresse IP.
        </p>
      </div>
      <PanneauDetails
        ligne={selection}
        onClose={() => setSelection(null)}
        onCorrelate={(id) => naviguer({ correlation: id })}
      />
    </div>
  );
}
