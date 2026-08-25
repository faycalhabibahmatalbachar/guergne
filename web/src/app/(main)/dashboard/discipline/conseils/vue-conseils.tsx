"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AlertTriangle, Gavel, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { DossierDiscipline, LigneConseil } from "@/server/domain/conseil-discipline";

import { annulerConvocation, convoquerConseil, enregistrerDeliberation } from "../actions-conseil";

/**
 * Conseils de discipline (E-54).
 *
 * LE DOSSIER EST OUVERT AVANT LA DÉLIBÉRATION, PAS APRÈS
 * --------------------------------------------------------
 * Un conseil se tient sur un élève, pas sur un incident. Convoqué sur le
 * dernier fait, il sanctionne une bagarre isolée aussi lourdement qu'une
 * cinquième récidive — ou l'inverse. Le dossier complet de l'année est donc
 * affiché à l'endroit où l'on écrit la décision.
 *
 * DEUX MOMENTS, DEUX FORMULAIRES
 * -------------------------------
 * Convoquer fixe une date et prévient la famille. Délibérer arrive après la
 * séance. Les réunir obligerait à saisir la décision au moment de convoquer,
 * c'est-à-dire à l'avoir prise d'avance — ce qui vide le conseil de son objet.
 */

const dateFr = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("fr-FR");

const LIBELLE_SANCTION: Record<string, string> = {
  AVERTISSEMENT: "Avertissement",
  BLAME: "Blâme",
  RETENUE: "Retenue",
  TRAVAIL_INTERET_GENERAL: "Travail d'intérêt général",
  EXCLUSION_TEMPORAIRE: "Exclusion temporaire",
  EXCLUSION_DEFINITIVE: "Exclusion définitive",
};

export function VueConseils({
  conseils,
  classes,
  eleves,
  classeId,
  dossier,
  dossierPour,
  peutConvoquer,
}: {
  conseils: LigneConseil[];
  classes: Array<{ id: string; libelle: string }>;
  /** Élèves de la classe filtrée, pour la convocation. */
  eleves: Array<{ inscriptionId: string; libelle: string }>;
  classeId: string;
  dossier: DossierDiscipline | null;
  dossierPour: string | null;
  peutConvoquer: boolean;
}) {
  const routeur = useRouter();
  const params = useSearchParams();
  const [enCours, demarrer] = useTransition();

  const [convocation, setConvocation] = useState(false);
  const [inscriptionId, setInscriptionId] = useState("");
  const [dateSeance, setDateSeance] = useState("");
  const [motif, setMotif] = useState("");
  const [participants, setParticipants] = useState("");
  const [tuteurConvoque, setTuteurConvoque] = useState(true);

  const [deliberation, setDeliberation] = useState("");
  const [decision, setDecision] = useState("");
  const [tuteurPresent, setTuteurPresent] = useState("");

  function naviguer(cle: string, valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(cle, valeur);
    else p.delete(cle);
    routeur.push(`/dashboard/discipline/conseils?${p.toString()}`);
  }

  function convoquer() {
    demarrer(async () => {
      const r = await convoquerConseil({
        inscriptionId,
        dateSeance,
        motif,
        participants,
        tuteurConvoque,
      });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) {
        setConvocation(false);
        setInscriptionId("");
        setDateSeance("");
        setMotif("");
        setParticipants("");
        routeur.refresh();
      }
    });
  }

  function deliberer(conseilId: string) {
    demarrer(async () => {
      const r = await enregistrerDeliberation({
        conseilId,
        deliberation,
        decision,
        tuteurPresent: tuteurPresent === "" ? null : tuteurPresent === "oui",
      });
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) {
        setDeliberation("");
        setDecision("");
        setTuteurPresent("");
        naviguer("dossier", "");
        routeur.refresh();
      }
    });
  }

  function annuler(conseilId: string) {
    demarrer(async () => {
      const r = await annulerConvocation(conseilId);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  const ouvert = conseils.find((c) => c.id === dossierPour) ?? null;
  const enAttente = conseils.filter((c) => c.enAttente);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div className="grid gap-2">
            <Label htmlFor="cd-classe">Classe</Label>
            <NativeSelect
              id="cd-classe"
              className="w-44"
              value={classeId}
              onChange={(e) => naviguer("classe", e.target.value)}
            >
              <option value="">Toutes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </NativeSelect>
          </div>

          {peutConvoquer ? (
            <Button onClick={() => setConvocation(true)} disabled={!classeId}>
              <UserPlus aria-hidden />
              Convoquer un conseil
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!classeId && peutConvoquer ? (
        <p className="text-muted-foreground text-sm">
          Choisissez une classe pour convoquer : la liste des élèves en dépend.
        </p>
      ) : null}

      {enAttente.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              <span className="font-medium">
                {enAttente.length} conseil(s) sans décision enregistrée.
              </span>{" "}
              Une séance tenue dont le procès-verbal n&apos;est pas écrit n&apos;est opposable à
              personne — et c&apos;est la première chose que conteste une famille.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {conseils.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Aucun conseil de discipline cette année.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conseils.map((c) => (
            <Card key={c.id} className={c.enAttente ? "border-amber-500/40" : ""}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <Gavel aria-hidden className="size-4" />
                      <Link
                        href={`/dashboard/eleves/${c.eleveId}`}
                        className="hover:underline"
                      >
                        {c.eleve}
                      </Link>
                      <span className="text-muted-foreground font-normal">{c.classe}</span>
                      {c.enAttente ? (
                        <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                          en attente de décision
                        </Badge>
                      ) : (
                        <Badge variant="secondary">décidé</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Séance du {dateFr(c.dateSeance)} · convoqué le {dateFr(c.dateConvocation)}
                      {c.tuteurConvoque
                        ? c.tuteurPresent === null
                          ? " · famille convoquée"
                          : c.tuteurPresent
                            ? " · famille présente"
                            : " · famille convoquée, absente"
                        : " · famille non convoquée"}
                    </CardDescription>
                  </div>

                  {peutConvoquer ? (
                    <div className="flex gap-2">
                      {c.enAttente ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => naviguer("dossier", c.id === dossierPour ? "" : c.id)}
                          >
                            {c.id === dossierPour ? "Fermer" : "Ouvrir le dossier"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={enCours}
                            onClick={() => annuler(c.id)}
                            title="Annuler la convocation"
                          >
                            <Trash2 aria-hidden />
                            <span className="sr-only">Annuler</span>
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Faits reprochés : </span>
                  {c.motif}
                </p>
                {c.participants ? (
                  <p className="text-muted-foreground text-xs">Participants : {c.participants}</p>
                ) : null}

                {c.decision ? (
                  <div className="space-y-2 rounded-md border px-3 py-2">
                    <p>
                      <span className="text-muted-foreground">Délibération : </span>
                      {c.deliberation}
                    </p>
                    <p className="font-medium">Décision : {c.decision}</p>
                    {c.sanctionType ? (
                      <Badge variant="outline">
                        {LIBELLE_SANCTION[c.sanctionType] ?? c.sanctionType}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}

                {/* --- Dossier + délibération, sur le conseil ouvert --- */}
                {c.id === dossierPour && dossier ? (
                  <div className="space-y-4 border-t pt-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <Compteur libelle="Incidents" valeur={dossier.nbIncidents} />
                      <Compteur
                        libelle="Dont graves"
                        valeur={dossier.nbGraves}
                        alerte={dossier.nbGraves > 0}
                      />
                      <Compteur libelle="Sanctions" valeur={dossier.nbSanctions} />
                      <Compteur
                        libelle="Abs. non just."
                        valeur={dossier.absencesNonJustifiees}
                      />
                      <Compteur
                        libelle="Conseils passés"
                        valeur={dossier.conseilsAnterieurs}
                        alerte={dossier.conseilsAnterieurs > 0}
                      />
                    </div>

                    {dossier.conduites.some((x) => x.note !== null) ? (
                      <p className="text-muted-foreground text-xs">
                        Conduite :{" "}
                        {dossier.conduites
                          .map((x) => `${x.periode} ${x.note === null ? "—" : `${x.note}/20`}`)
                          .join(" · ")}
                      </p>
                    ) : null}

                    <div>
                      <p className="mb-2 font-medium">Chronologie de l&apos;année</p>
                      {dossier.faits.length === 0 ? (
                        <p className="text-muted-foreground text-xs">
                          Aucun fait antérieur. Ce conseil porte sur un premier manquement — ce qui
                          doit peser dans la décision.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {dossier.faits.map((f, i) => (
                            <li key={`${f.date}-${i}`} className="flex flex-wrap gap-x-2 text-xs">
                              <span className="text-muted-foreground tabular-nums">
                                {dateFr(f.date)}
                              </span>
                              <Badge
                                variant="outline"
                                className={
                                  f.nature === "SANCTION"
                                    ? "text-destructive"
                                    : f.libelle === "GRAVE" || f.libelle === "TRES_GRAVE"
                                      ? "text-amber-700 dark:text-amber-400"
                                      : ""
                                }
                              >
                                {f.nature === "SANCTION"
                                  ? (LIBELLE_SANCTION[f.libelle] ?? f.libelle)
                                  : f.libelle.toLowerCase().replace("_", " ")}
                              </Badge>
                              <span className="min-w-0 flex-1">{f.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="grid gap-3 border-t pt-4">
                      <div className="grid gap-2">
                        <Label htmlFor={`del-${c.id}`}>Délibération</Label>
                        <Textarea
                          id={`del-${c.id}`}
                          rows={3}
                          value={deliberation}
                          onChange={(e) => setDeliberation(e.target.value)}
                          placeholder="Ce qui a été dit en séance, les explications de l'élève et de la famille…"
                        />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                        <div className="grid gap-2">
                          <Label htmlFor={`dec-${c.id}`}>Décision</Label>
                          <Input
                            id={`dec-${c.id}`}
                            value={decision}
                            maxLength={300}
                            onChange={(e) => setDecision(e.target.value)}
                            placeholder="Exclusion temporaire de 3 jours, avec travail à rendre"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`tp-${c.id}`}>Famille présente ?</Label>
                          <NativeSelect
                            id={`tp-${c.id}`}
                            value={tuteurPresent}
                            onChange={(e) => setTuteurPresent(e.target.value)}
                          >
                            <option value="">Non renseigné</option>
                            <option value="oui">Présente</option>
                            <option value="non">Absente</option>
                          </NativeSelect>
                        </div>
                      </div>

                      <p className="text-muted-foreground text-xs">
                        Convoquée et absente n&apos;est pas la même chose que non convoquée.
                        C&apos;est la première chose que conteste une famille qui apprend une
                        exclusion.
                      </p>

                      <Button
                        onClick={() => deliberer(c.id)}
                        disabled={
                          enCours || deliberation.trim().length < 10 || decision.trim().length < 5
                        }
                        className="justify-self-start"
                      >
                        Enregistrer la décision
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* --- Convocation --- */}
      <Dialog open={convocation} onOpenChange={setConvocation}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convoquer un conseil de discipline</DialogTitle>
            <DialogDescription>
              La famille est prévenue immédiatement, par le canal qu&apos;elle peut recevoir. Un
              conseil sans convocation régulière est attaquable.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cv-eleve">Élève</Label>
              <NativeSelect
                id="cv-eleve"
                value={inscriptionId}
                onChange={(e) => setInscriptionId(e.target.value)}
              >
                <option value="">Choisir…</option>
                {eleves.map((e) => (
                  <option key={e.inscriptionId} value={e.inscriptionId}>
                    {e.libelle}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cv-date">Date de séance</Label>
              <Input
                id="cv-date"
                type="date"
                value={dateSeance}
                onChange={(e) => setDateSeance(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cv-motif">Faits reprochés</Label>
              <Textarea
                id="cv-motif"
                rows={3}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Exposer précisément les faits, leur date et leur lieu."
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cv-part">Participants (facultatif)</Label>
              <Input
                id="cv-part"
                value={participants}
                maxLength={500}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="Proviseur, censeur, professeur principal, délégué de classe"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={tuteurConvoque}
                onCheckedChange={(v) => setTuteurConvoque(v === true)}
              />
              Convoquer la famille
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvocation(false)}>
              Annuler
            </Button>
            <Button
              onClick={convoquer}
              disabled={enCours || !inscriptionId || !dateSeance || motif.trim().length < 10}
            >
              {enCours ? "Enregistrement…" : "Convoquer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Compteur({
  libelle,
  valeur,
  alerte,
}: {
  libelle: string;
  valeur: number;
  alerte?: boolean;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-xs">{libelle}</p>
      <p
        className={`font-semibold text-lg tabular-nums ${
          alerte && valeur > 0 ? "text-destructive" : ""
        }`}
      >
        {valeur}
      </p>
    </div>
  );
}
