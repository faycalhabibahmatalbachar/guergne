"use client";

import { useState, useTransition } from "react";

import { ArrowRightLeft, Ban, Check, MoreHorizontal, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { changerClasse, changerStatut, validerDossier, type StatutCible } from "../../actions";

interface Props {
  eleveId: string;
  statut: string;
  inscriptionId: string | null;
  classeActuelleId: string | null;
  statutDossier: string | null;
  classes: Array<{ id: string; libelle: string }>;
}

type Dialogue =
  | { type: "statut"; cible: StatutCible; titre: string; description: string; avecDates?: boolean; avecEtablissement?: boolean }
  | { type: "classe" }
  | { type: "dossier"; cible: "VALIDE" | "INCOMPLET" | "REFUSE" }
  | null;

const PARTI = ["TRANSFERE", "ABANDON", "EXCLU", "ARCHIVE"];

/**
 * Actions du dossier élève.
 *
 * Toute action qui change la situation d'un élève exige un motif écrit :
 * une suspension ou une exclusion se contestent, et l'établissement doit
 * pouvoir produire qui a décidé quoi, quand et pourquoi.
 */
export function ActionsDossier({
  eleveId,
  statut,
  inscriptionId,
  classeActuelleId,
  statutDossier,
  classes,
}: Props) {
  const [enCours, demarrer] = useTransition();
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [motif, setMotif] = useState("");
  const [dateEffet, setDateEffet] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [etablissement, setEtablissement] = useState("");
  const [nouvelleClasse, setNouvelleClasse] = useState("");

  const estParti = PARTI.includes(statut);
  const estSuspendu = statut.startsWith("SUSPENDU");

  function fermer() {
    setDialogue(null);
    setMotif("");
    setDateEffet("");
    setDateFin("");
    setEtablissement("");
    setNouvelleClasse("");
  }

  function executer() {
    if (!dialogue) return;

    demarrer(async () => {
      let resultat;

      if (dialogue.type === "classe") {
        if (!nouvelleClasse) {
          toast.error("Choisissez la classe de destination.");
          return;
        }
        resultat = await changerClasse(inscriptionId!, nouvelleClasse, motif);
      } else if (dialogue.type === "dossier") {
        resultat = await validerDossier(inscriptionId!, dialogue.cible, motif);
      } else {
        resultat = await changerStatut(eleveId, dialogue.cible, {
          motif,
          dateEffet: dateEffet || undefined,
          dateFinPrevue: dateFin || undefined,
          etablissement: etablissement || undefined,
        });
      }

      if (resultat.ok) {
        toast.success("Opération enregistrée.");
        fermer();
      } else {
        toast.error(resultat.message ?? Object.values(resultat.erreurs ?? {})[0] ?? "Échec.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {inscriptionId && statutDossier !== "VALIDE" ? (
          <Button
            size="sm"
            onClick={() => setDialogue({ type: "dossier", cible: "VALIDE" })}
            disabled={enCours}
          >
            <Check aria-hidden />
            Valider le dossier
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={enCours}>
              <MoreHorizontal aria-hidden />
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Scolarité</DropdownMenuLabel>

            <DropdownMenuItem
              disabled={!inscriptionId || estParti}
              onSelect={() => setDialogue({ type: "classe" })}
            >
              <ArrowRightLeft aria-hidden />
              Changer de classe
            </DropdownMenuItem>

            {inscriptionId ? (
              <DropdownMenuItem onSelect={() => setDialogue({ type: "dossier", cible: "INCOMPLET" })}>
                Marquer le dossier incomplet
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Situation de l&apos;élève</DropdownMenuLabel>

            {estSuspendu ? (
              <DropdownMenuItem
                onSelect={() =>
                  setDialogue({
                    type: "statut",
                    cible: "INSCRIT",
                    titre: "Réactiver l'élève",
                    description:
                      "L'élève reprend sa scolarité normale. La suspension reste consignée dans son historique.",
                  })
                }
              >
                <PlayCircle aria-hidden />
                Réactiver
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  disabled={estParti}
                  onSelect={() =>
                    setDialogue({
                      type: "statut",
                      cible: "SUSPENDU_DISCIPLINE",
                      titre: "Suspendre pour motif disciplinaire",
                      description:
                        "Exclusion temporaire. L'élève reste inscrit et ses tuteurs sont notifiés.",
                      avecDates: true,
                    })
                  }
                >
                  <PauseCircle aria-hidden />
                  Suspendre (discipline)
                </DropdownMenuItem>

                <DropdownMenuItem
                  disabled={estParti}
                  onSelect={() =>
                    setDialogue({
                      type: "statut",
                      cible: "SUSPENDU_IMPAYE",
                      titre: "Suspendre pour impayés",
                      description:
                        "Suspension distincte de la sanction disciplinaire. À lever dès régularisation.",
                      avecDates: true,
                    })
                  }
                >
                  <PauseCircle aria-hidden />
                  Suspendre (impayés)
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Départ de l&apos;établissement</DropdownMenuLabel>

            <DropdownMenuItem
              disabled={estParti}
              onSelect={() =>
                setDialogue({
                  type: "statut",
                  cible: "TRANSFERE",
                  titre: "Transférer vers un autre établissement",
                  description:
                    "L'inscription de l'année est close. Un certificat de transfert pourra être édité.",
                  avecEtablissement: true,
                })
              }
            >
              <ArrowRightLeft aria-hidden />
              Transférer
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled={estParti}
              onSelect={() =>
                setDialogue({
                  type: "statut",
                  cible: "ABANDON",
                  titre: "Enregistrer un abandon",
                  description: "L'élève a cessé de fréquenter l'établissement sans transfert.",
                })
              }
            >
              Abandon de scolarité
            </DropdownMenuItem>

            <DropdownMenuItem
              variant="destructive"
              disabled={estParti}
              onSelect={() =>
                setDialogue({
                  type: "statut",
                  cible: "EXCLU",
                  titre: "Prononcer une exclusion définitive",
                  description:
                    "Décision grave et irréversible, normalement prise en conseil de discipline. Les tuteurs seront notifiés.",
                })
              }
            >
              <Ban aria-hidden />
              Exclure définitivement
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={dialogue !== null} onOpenChange={(v) => !v && fermer()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogue?.type === "classe"
                ? "Changer de classe"
                : dialogue?.type === "dossier"
                  ? dialogue.cible === "VALIDE"
                    ? "Valider le dossier"
                    : "Signaler un dossier incomplet"
                  : (dialogue?.titre ?? "")}
            </DialogTitle>
            <DialogDescription>
              {dialogue?.type === "classe"
                ? "L'élève garde ses notes déjà saisies. Le changement est consigné dans son historique."
                : dialogue?.type === "dossier"
                  ? dialogue.cible === "VALIDE"
                    ? "Confirme que les pièces justificatives ont été vérifiées."
                    : "Précisez les pièces manquantes : le message sera visible du secrétariat."
                  : (dialogue?.description ?? "")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {dialogue?.type === "classe" ? (
              <div className="grid gap-2">
                <Label htmlFor="nouvelleClasse">Nouvelle classe</Label>
                <NativeSelect
                  id="nouvelleClasse"
                  value={nouvelleClasse}
                  onChange={(e) => setNouvelleClasse(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {classes
                    .filter((c) => c.id !== classeActuelleId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.libelle}
                      </option>
                    ))}
                </NativeSelect>
              </div>
            ) : null}

            {dialogue?.type === "statut" && dialogue.avecEtablissement ? (
              <div className="grid gap-2">
                <Label htmlFor="etablissement">Établissement destinataire</Label>
                <Input
                  id="etablissement"
                  value={etablissement}
                  onChange={(e) => setEtablissement(e.target.value)}
                  placeholder="Lycée…"
                />
              </div>
            ) : null}

            {dialogue?.type === "statut" && dialogue.avecDates ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="dateEffet">Date d&apos;effet</Label>
                  <Input
                    id="dateEffet"
                    type="date"
                    value={dateEffet}
                    onChange={(e) => setDateEffet(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dateFin">Retour prévu</Label>
                  <Input
                    id="dateFin"
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="motif">
                {dialogue?.type === "dossier" && dialogue.cible === "VALIDE"
                  ? "Observations (facultatif)"
                  : "Motif *"}
              </Label>
              <Textarea
                id="motif"
                rows={3}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ce motif est conservé de façon permanente dans l'historique de l'élève."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fermer} disabled={enCours}>
              Annuler
            </Button>
            <Button
              onClick={executer}
              disabled={enCours}
              variant={dialogue?.type === "statut" && dialogue.cible === "EXCLU" ? "destructive" : "default"}
            >
              {enCours ? "Enregistrement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
