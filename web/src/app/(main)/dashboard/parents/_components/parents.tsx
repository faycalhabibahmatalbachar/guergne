"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleOff,
  KeyRound,
  MessageSquare,
  Search,
  Send,
  ShieldOff,
  Smartphone,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Statistique, type TonStatistique } from "@/components/socle/statistique";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { etatCompteParent } from "@/lib/etat-compte-parent";
import type { LigneTuteur, StatistiquesParents } from "@/server/domain/parents";

import { ActionsParent } from "./actions-parent";
import { InvitationClasse } from "./invitation-classe";
import { NotificationParent } from "./notification-parent";
import { NotificationsGroupe } from "./notifications-groupe";
import statistiquesStyles from "./statistiques-parents.module.css";

interface Option {
  id: string;
  libelle: string;
}

const dateFr = (valeur: string | null) =>
  valeur ? new Date(valeur).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function CanalParent({ t }: { t: LigneTuteur }) {
  const push = t.canalJoignable === "PUSH" && t.compteActif === true;
  const sms = t.canalJoignable === "SMS" && !!t.telephone && t.accepteSms;
  const interne = t.canalJoignable === "IN_APP" && !!t.utilisateurId && t.compteActif === true;
  const styles = push
    ? "bg-info-doux text-info"
    : sms
      ? "bg-info-doux text-info"
      : interne
        ? "bg-muted text-foreground"
        : "bg-alerte-doux text-alerte";
  const texte = push ? "Push" : sms ? "SMS" : interne ? "Interne" : "Indisponible";
  const Icon = push || interne ? Smartphone : sms ? MessageSquare : CircleOff;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold " + styles
      }
      title={
        push
          ? "Appareil enregistré"
          : sms
            ? "SMS autorisé"
            : interne
              ? "Le message reste dans l’application jusqu’à consultation"
              : "Aucun moyen de contact confirmé"
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {texte}
    </span>
  );
}

function EtatCompte({ t }: { t: LigneTuteur }) {
  const classe = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium";
  switch (etatCompteParent(t)) {
    case "sans_compte":
      return (
        <span className={classe + " bg-muted text-muted-foreground"}>
          <span className="size-2 rounded-full bg-muted" />
          Sans compte
        </span>
      );
    case "revoque":
      return (
        <span className={classe + " bg-danger-doux text-danger"}>
          <span className="size-2 rounded-full bg-danger" />
          Révoqué
        </span>
      );
    case "invite":
      return (
        <span className={classe + " bg-info-doux text-info"}>
          <span className="size-2 rounded-full bg-primary" />
          Invité
        </span>
      );
    case "actif":
      return (
        <span className={classe + " bg-succes-doux text-succes"}>
          <span className="size-2 rounded-full bg-succes" />
          Actif
        </span>
      );
  }
}

export function Parents({
  tuteurs,
  total,
  page,
  parPage,
  classes,
  stats,
  filtres,
  peutInviter,
  peutNotifier,
}: {
  tuteurs: LigneTuteur[];
  total: number;
  page: number;
  parPage: number;
  classes: Option[];
  stats: StatistiquesParents;
  peutInviter: boolean;
  peutNotifier: boolean;
  filtres: { recherche: string; etat: string; classeId: string };
}) {
  const routeur = useRouter();
  const [recherche, setRecherche] = useState(filtres.recherche);
  const [destinataire, setDestinataire] = useState<LigneTuteur | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionTous, setSelectionTous] = useState(false);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [groupeOuvert, setGroupeOuvert] = useState(false);
  const idsVisibles = tuteurs.map((t) => t.id);
  const nombreSelectionnes = selectionTous ? Math.max(0, total - exclusions.length) : selection.length;
  const selectionPage = selectionTous
    ? idsVisibles.filter((id) => !exclusions.includes(id))
    : idsVisibles.filter((id) => selection.includes(id));
  const tousPage =
    idsVisibles.length > 0 &&
    idsVisibles.every((id) => (selectionTous ? !exclusions.includes(id) : selection.includes(id)));

  const basculerParent = (id: string, cocher: boolean) => {
    if (selectionTous) {
      setExclusions((actuels) => (cocher ? actuels.filter((x) => x !== id) : [...new Set([...actuels, id])]));
    } else {
      setSelection((actuels) => (cocher ? [...new Set([...actuels, id])] : actuels.filter((x) => x !== id)));
    }
  };
  const basculerPage = () => {
    if (selectionTous) {
      setExclusions((actuels) =>
        tousPage ? [...new Set([...actuels, ...idsVisibles])] : actuels.filter((id) => !idsVisibles.includes(id)),
      );
    } else {
      setSelection((actuels) =>
        tousPage ? actuels.filter((id) => !idsVisibles.includes(id)) : [...new Set([...actuels, ...idsVisibles])],
      );
    }
  };
  const toutSelectionner = () => {
    setSelectionTous(true);
    setSelection([]);
    setExclusions([]);
  };
  const effacerSelection = () => {
    setSelectionTous(false);
    setSelection([]);
    setExclusions([]);
  };
  const selectionMessage = selectionTous
    ? {
        mode: "filtres" as const,
        filtres: {
          recherche: filtres.recherche,
          etat: filtres.etat,
          classeId: filtres.classeId,
        },
        exclureIds: exclusions,
      }
    : { mode: "ids" as const, ids: selection };

  const naviguer = (params: Record<string, string>) => {
    const url = new URLSearchParams({
      recherche: filtres.recherche,
      etat: filtres.etat,
      classe: filtres.classeId,
      parPage: String(parPage),
      ...params,
    });
    for (const [cle, valeur] of [...url.entries()]) if (!valeur) url.delete(cle);
    // Conserver une sélection entre les pages ; effacer quand le périmètre des filtres change.
    if (
      ["recherche", "etat", "classe"].some(
        (k) =>
          Object.hasOwn(params, k) &&
          params[k] !== (k === "classe" ? filtres.classeId : filtres[k as "recherche" | "etat"]),
      )
    ) {
      effacerSelection();
    }
    routeur.push(`/dashboard/parents?${url}`);
  };

  const nbPages = Math.max(1, Math.ceil(total / parPage));
  const premier = total ? (page - 1) * parPage + 1 : 0;
  const dernier = Math.min(page * parPage, total);

  const cartes: Array<{
    titre: string;
    valeur: number;
    icone: typeof Users;
    ton: TonStatistique;
    detail: string;
  }> = [
    {
      titre: "Tuteurs enregistrés",
      valeur: stats.total,
      icone: Users,
      ton: "neutre",
      detail: "Responsables recensés",
    },
    {
      titre: "Comptes actifs",
      valeur: stats.actifs,
      icone: UserRoundCheck,
      ton: "succes",
      detail: "Au moins une connexion",
    },
    {
      titre: "Sans compte",
      valeur: stats.sansCompte,
      icone: KeyRound,
      ton: "alerte",
      detail: "Accès non créé",
    },
    {
      titre: "Invitations en attente",
      valeur: stats.invites,
      icone: Send,
      ton: "info",
      detail: "Jamais connectés",
    },
    {
      titre: "Appareil actif",
      valeur: stats.avecAppareil,
      icone: Smartphone,
      ton: "info",
      detail: "Compte actif avec appareil",
    },
  ];

  const pages = [...new Set([1, Math.max(1, page - 1), page, Math.min(nbPages, page + 1), nbPages])].filter(
    (n) => n >= 1 && n <= nbPages,
  );
  const naviguerPage = (numero: number, taille = parPage) => {
    if (numero < 1 || numero > (taille === parPage ? nbPages : Math.max(1, Math.ceil(total / taille)))) return;
    naviguer({ page: String(numero), parPage: String(taille) });
  };

  return (
    <div className="space-y-4">
      {peutNotifier && <NotificationParent parent={destinataire} onFermer={() => setDestinataire(null)} />}
      {peutNotifier && (
        <NotificationsGroupe
          selection={selectionMessage}
          nombreSelectionnes={nombreSelectionnes}
          ouvert={groupeOuvert}
          onFermer={() => setGroupeOuvert(false)}
          onSucces={() => {
            effacerSelection();
            setGroupeOuvert(false);
            routeur.refresh();
          }}
        />
      )}
      <section aria-label="Indicateurs des comptes parents" className={statistiquesStyles.region}>
        <div className={statistiquesStyles.grid}>
          {cartes.map((c) => (
            <Statistique
              key={c.titre}
              libelle={c.titre}
              valeur={c.valeur}
              icone={c.icone}
              ton={c.ton}
              aide={c.detail}
            />
          ))}
        </div>
      </section>

      {stats.doublons > 0 || stats.revoques > 0 ? (
        <section
          aria-label="Contrôles de qualité des comptes parents"
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-alerte-trait bg-alerte-doux px-4 py-3 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-alerte" aria-hidden />
          <span className="mr-1 text-xs font-semibold text-alerte">Comptes à contrôler :</span>
          {stats.doublons > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-alerte-trait text-alerte"
              onClick={() => naviguer({ etat: "doublon", page: "" })}
            >
              {stats.doublons.toLocaleString("fr-FR")} fiche(s) partageant un numéro
            </Button>
          ) : null}
          {stats.revoques > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-danger-trait text-danger"
              onClick={() => naviguer({ etat: "revoque", page: "" })}
            >
              <ShieldOff className="size-3.5" aria-hidden />
              {stats.revoques.toLocaleString("fr-FR")} compte(s) révoqué(s)
            </Button>
          ) : null}
          <span className="text-xs text-alerte">Ces fiches ne sont pas fusionnées automatiquement.</span>
        </section>
      ) : null}

      {peutInviter && stats.sansCompte > 0 ? (
        <InvitationClasse classes={classes} sansCompte={stats.sansCompte} />
      ) : null}

      <section
        aria-label="Filtres des tuteurs"
        className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-sm"
      >
        <form
          className="relative min-w-[220px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            naviguer({ recherche, page: "" });
          }}
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="border-border pl-9 shadow-none"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, prénom, téléphone…"
            aria-label="Rechercher un parent"
          />
        </form>
        <NativeSelect
          value={filtres.etat}
          onChange={(e) => naviguer({ etat: e.target.value, page: "" })}
          className="h-10 w-full rounded-lg border-border bg-card sm:w-48"
          aria-label="Filtrer par état du compte"
        >
          <option value="">Tous les états</option>
          <option value="sans_compte">Sans compte</option>
          <option value="invite">Invité, jamais connecté</option>
          <option value="actif">Compte actif</option>
          <option value="revoque">Compte révoqué</option>
          <option value="doublon">Numéro partagé / à vérifier</option>
        </NativeSelect>
        <NativeSelect
          value={filtres.classeId}
          onChange={(e) => naviguer({ classe: e.target.value, page: "" })}
          className="h-10 w-full rounded-lg border-border bg-card sm:w-48"
          aria-label="Filtrer par classe"
        >
          <option value="">Toutes les classes</option>
          {classes.map((c) => (
            <option value={c.id} key={c.id}>
              {c.libelle}
            </option>
          ))}
        </NativeSelect>
      </section>

      {peutNotifier && (
        <section
          aria-label="Actions groupées sur les parents"
          className={
            "space-y-3 rounded-xl border px-4 py-3 shadow-sm " +
            (nombreSelectionnes ? "border-succes-trait bg-succes-doux" : "border-border bg-card")
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-succes-doux text-succes">
                <CheckCheck className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Sélection des parents</p>
                <p className="text-xs text-muted-foreground">
                  {nombreSelectionnes.toLocaleString("fr-FR")} parent(s) sélectionné(s){" "}
                  {selectionTous ? "sur l’ensemble des résultats filtrés" : "individuellement"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={basculerPage}>
                {tousPage ? "Désélectionner cette page" : "Sélectionner cette page"}
              </Button>
              {total > 0 && (
                <Button
                  type="button"
                  variant={selectionTous ? "default" : "outline"}
                  size="sm"
                  onClick={toutSelectionner}
                  className={selectionTous ? "bg-succes text-primary-foreground hover:bg-succes/90" : ""}
                >
                  <CheckCheck className="size-3.5" /> Sélectionner les {total.toLocaleString("fr-FR")} résultats
                </Button>
              )}
              {nombreSelectionnes > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={effacerSelection}>
                  <X className="size-3.5" /> Effacer
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={!nombreSelectionnes}
                onClick={() => setGroupeOuvert(true)}
                className="gap-2 bg-succes font-semibold text-primary-foreground hover:bg-succes/90"
              >
                <BellRing className="size-4" /> Notifier ({nombreSelectionnes.toLocaleString("fr-FR")})
              </Button>
            </div>
          </div>
          {selectionTous && (
            <p className="rounded-lg border border-succes-trait bg-white/70 px-3 py-2 text-xs leading-relaxed text-succes">
              Tous les parents correspondant aux filtres actuels sont inclus, même sur les autres pages.
              {exclusions.length > 0 && ` ${exclusions.length} fiche(s) exclue(s) manuellement.`}
              L’aperçu vérifie à nouveau les destinataires et le coût avant tout envoi.
            </p>
          )}
        </section>
      )}

      <section
        aria-label="Liste des comptes parents"
        className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        {tuteurs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <Users className="size-9 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">Aucun tuteur ne correspond à cette recherche.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRecherche("");
                naviguer({ recherche: "", etat: "", classe: "", page: "" });
              }}
            >
              Réinitialiser les filtres
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground dark:bg-muted/30">
                <tr className="border-b border-border">
                  {peutNotifier && (
                    <th scope="col" className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="Sélectionner les parents de cette page"
                        checked={tousPage}
                        onChange={basculerPage}
                        className="size-4 accent-emerald-700"
                      />
                    </th>
                  )}
                  <th scope="col" className="px-4 py-3 font-medium">
                    Parent / Tuteur
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Téléphone
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Enfants
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Accès
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Canal disponible
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Dernière connexion
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tuteurs.map((t) => {
                  return (
                    <tr
                      key={t.id}
                      className={
                        "border-b border-border transition-colors last:border-b-0 hover:bg-succes-doux/90 dark:hover:bg-muted/30 " +
                        ((selectionTous ? !exclusions.includes(t.id) : selection.includes(t.id))
                          ? "bg-succes-doux"
                          : "")
                      }
                    >
                      {peutNotifier && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectionTous ? !exclusions.includes(t.id) : selection.includes(t.id)}
                            onChange={(e) => basculerParent(t.id, e.target.checked)}
                            aria-label={"Sélectionner " + t.prenom + " " + t.nom}
                            className="size-4 accent-emerald-700"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info-doux text-xs font-bold text-info">
                            {(t.prenom[0] ?? "") + (t.nom[0] ?? "")}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/parents/${t.id}`}
                              className="block max-w-[225px] truncate font-semibold text-foreground hover:text-succes hover:underline"
                              title={t.prenom + " " + t.nom}
                            >
                              {t.prenom} {t.nom}
                            </Link>
                            <span className="block text-xs text-muted-foreground">
                              {t.profession || "Profession non renseignée"}
                            </span>
                            {t.doublonTelephone ? (
                              <span
                                title="Au moins une autre fiche porte le même numéro. Vérification humaine requise."
                                className="mt-1 inline-flex items-center gap-1 rounded-md bg-alerte-doux px-1.5 py-0.5 text-xs font-semibold text-alerte"
                              >
                                <AlertTriangle className="size-3" aria-hidden />
                                Numéro partagé
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        <a
                          href={`tel:${t.telephone.replace(/[^+0-9]/g, "")}`}
                          className="text-foreground hover:underline"
                        >
                          {t.telephone}
                        </a>
                        {!t.accepteSms ? <span className="block text-xs text-alerte">SMS refusé</span> : null}
                      </td>
                      <td className="max-w-[275px] px-4 py-3">
                        <span className="font-medium tabular-nums">
                          {t.nbEnfants} enfant{t.nbEnfants > 1 ? "s" : ""}
                        </span>
                        <span className="block max-w-[270px] truncate text-xs text-muted-foreground" title={t.enfants}>
                          {t.enfants || "Aucun enfant rattaché"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <EtatCompte t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <CanalParent t={t} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                        {dateFr(t.derniereConnexion)}
                      </td>
                      <td className="px-4 py-3">
                        <ActionsParent
                          t={t}
                          peutInviter={peutInviter}
                          peutNotifier={peutNotifier}
                          onNotifier={setDestinataire}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer
          aria-label="Pied du tableau des parents"
          className="border-t border-border bg-muted/40 px-4 py-3.5 text-sm dark:bg-muted/15 sm:px-5"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="whitespace-nowrap text-muted-foreground" aria-live="polite">
                <span className="font-semibold text-foreground tabular-nums">
                  {premier}–{dernier}
                </span>{" "}
                sur <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString("fr-FR")}</span>{" "}
                parents
              </p>
              <span aria-hidden className="hidden h-5 w-px bg-muted dark:bg-border sm:block" />
              <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                Par page
                <select
                  aria-label="Nombre de parents par page"
                  className="h-9 min-w-16 rounded-lg border border-border bg-card px-2.5 text-sm font-medium text-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-background"
                  value={parPage}
                  onChange={(e) => naviguerPage(1, Number(e.target.value))}
                >
                  {[8, 16, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <nav aria-label="Pagination des parents" className="flex items-center justify-between gap-3 sm:justify-end">
              <span className="text-xs font-medium text-muted-foreground tabular-nums sm:hidden">
                Page {page} sur {nbPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="hidden size-9 sm:inline-flex"
                  disabled={page <= 1}
                  onClick={() => naviguerPage(1)}
                  aria-label="Première page"
                >
                  <ChevronsLeft className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  disabled={page <= 1}
                  onClick={() => naviguerPage(page - 1)}
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <div className="hidden items-center gap-1 sm:flex">
                  {pages.map((numero, index) => (
                    <span key={numero} className="flex items-center gap-1">
                      {index > 0 && numero - pages[index - 1] > 1 ? (
                        <span className="px-1 text-muted-foreground" aria-hidden>
                          …
                        </span>
                      ) : null}
                      <Button
                        size="icon"
                        variant={numero === page ? "default" : "outline"}
                        className={`size-9 font-semibold tabular-nums shadow-none ${numero === page ? "bg-succes text-primary-foreground hover:bg-succes/90" : "bg-card"}`}
                        aria-label={`Aller à la page ${numero}`}
                        aria-current={numero === page ? "page" : undefined}
                        onClick={() => naviguerPage(numero)}
                      >
                        {numero}
                      </Button>
                    </span>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  disabled={page >= nbPages}
                  onClick={() => naviguerPage(page + 1)}
                  aria-label="Page suivante"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="hidden size-9 sm:inline-flex"
                  disabled={page >= nbPages}
                  onClick={() => naviguerPage(nbPages)}
                  aria-label="Dernière page"
                >
                  <ChevronsRight className="size-4" aria-hidden />
                </Button>
              </div>
            </nav>
          </div>
        </footer>
      </section>
    </div>
  );
}
