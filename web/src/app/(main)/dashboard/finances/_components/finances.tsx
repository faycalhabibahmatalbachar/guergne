"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Ban, Plus, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formaterFcfa } from "@/lib/finances-format";
import type {
  EcheanceEleve,
  LignePaiement,
  LigneTarif,
  LigneTranche,
  SituationEleve,
} from "@/server/domain/finances";

import {
  annulerPaiement,
  definirTarif,
  definirTranche,
  encaisser,
  exonerer,
  genererEcheanciers,
  supprimerTarif,
} from "../actions";

interface Option {
  id: string;
  libelle: string;
}

const NATURES = [
  { valeur: "INSCRIPTION", libelle: "Droits d'inscription" },
  { valeur: "REINSCRIPTION", libelle: "Droits de réinscription" },
  { valeur: "SCOLARITE", libelle: "Scolarité" },
  { valeur: "APE", libelle: "Association des parents (APE)" },
  { valeur: "TENUE", libelle: "Tenue scolaire" },
  { valeur: "EXAMEN", libelle: "Frais d'examen" },
  { valeur: "FOURNITURES", libelle: "Fournitures" },
  { valeur: "TRANSPORT", libelle: "Transport" },
  { valeur: "CANTINE", libelle: "Cantine" },
  { valeur: "AUTRE", libelle: "Autre" },
];

const MODES = [
  { valeur: "ESPECES", libelle: "Espèces" },
  { valeur: "MOBILE_MONEY", libelle: "Mobile Money" },
  { valeur: "VIREMENT", libelle: "Virement" },
  { valeur: "CHEQUE", libelle: "Chèque" },
  { valeur: "AUTRE", libelle: "Autre" },
];

const MOTIFS_EXO = [
  { valeur: "BOURSE", libelle: "Bourse" },
  { valeur: "FRATRIE", libelle: "Fratrie" },
  { valeur: "CAS_SOCIAL", libelle: "Cas social" },
  { valeur: "ENFANT_PERSONNEL", libelle: "Enfant du personnel" },
  { valeur: "MERITE", libelle: "Mérite" },
  { valeur: "AUTRE", libelle: "Autre" },
];

const LIBELLE_NATURE = Object.fromEntries(NATURES.map((n) => [n.valeur, n.libelle]));
const LIBELLE_MODE = Object.fromEntries(MODES.map((m) => [m.valeur, m.libelle]));
const dateFr = (v: string | null) => (v ? new Date(v).toLocaleDateString("fr-FR") : "—");

export function Finances({
  anneeId,
  anneeLibelle,
  classes,
  niveaux,
  classeId,
  situations,
  paiements,
  tarifs,
  tranches,
  stats,
  recouvrement,
  echeancesEleve,
  inscriptionSelectionnee,
}: {
  anneeId: string;
  anneeLibelle: string;
  classes: Option[];
  niveaux: Option[];
  classeId: string | null;
  situations: SituationEleve[];
  paiements: LignePaiement[];
  tarifs: LigneTarif[];
  tranches: LigneTranche[];
  stats: {
    totalDu: number;
    totalPaye: number;
    totalExonere: number;
    resteDu: number;
    nbEnRetard: number;
    encaisseMois: number;
    tauxRecouvrement: number;
  };
  recouvrement: Array<{
    classeId: string;
    classe: string;
    effectif: number;
    totalDu: number;
    totalPaye: number;
    resteDu: number;
    nbEnRetard: number;
  }>;
  echeancesEleve: EcheanceEleve[];
  inscriptionSelectionnee: SituationEleve | null;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [dialogue, setDialogue] = useState<"tarif" | "tranche" | "encaisser" | "exonerer" | null>(null);

  const erreur = (c: string) =>
    erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null;

  const totalTranches = tranches.reduce((s, t) => s + Number(t.pourcentage), 0);

  function agir(action: () => Promise<{ ok: boolean; message?: string; erreurs?: Record<string, string> }>) {
    setErreurs({});
    demarrer(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(r.message ?? "Enregistré.");
        setDialogue(null);
        routeur.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "Échec.");
      }
    });
  }

  const KPI = [
    { libelle: "Total dû", valeur: formaterFcfa(stats.totalDu) },
    { libelle: "Encaissé", valeur: formaterFcfa(stats.totalPaye), ton: "succes" },
    { libelle: "Reste à recouvrer", valeur: formaterFcfa(stats.resteDu), ton: stats.resteDu > 0 ? "alerte" : undefined },
    { libelle: "Encaissé ce mois", valeur: formaterFcfa(stats.encaisseMois) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI.map((k) => (
          <Card key={k.libelle}>
            <CardContent className="py-4">
              <p className="text-muted-foreground text-xs">{k.libelle}</p>
              <p
                className={`mt-1 font-semibold text-xl tabular-nums ${
                  k.ton === "alerte"
                    ? "text-amber-600 dark:text-amber-400"
                    : k.ton === "succes"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : ""
                }`}
              >
                {k.valeur}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm">Taux de recouvrement</p>
              <p className="text-muted-foreground text-xs">
                Calculé sur le dû net d&apos;exonérations — une bourse n&apos;est pas un impayé.
                {stats.nbEnRetard > 0 ? ` ${stats.nbEnRetard} échéance(s) en retard.` : ""}
              </p>
            </div>
            <span className="font-semibold text-2xl tabular-nums">{stats.tauxRecouvrement} %</span>
          </div>
          <Progress value={stats.tauxRecouvrement} className="mt-3" />
        </CardContent>
      </Card>

      <Tabs defaultValue="situations">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="situations">Situations ({situations.length})</TabsTrigger>
            <TabsTrigger value="paiements">Encaissements ({paiements.length})</TabsTrigger>
            <TabsTrigger value="classes">Par classe</TabsTrigger>
            <TabsTrigger value="tarifs">Tarifs &amp; tranches</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap gap-2">
            <NativeSelect
              value={classeId ?? ""}
              onChange={(e) => routeur.push(`/dashboard/finances?classe=${e.target.value}`)}
              className="w-44"
              aria-label="Filtrer par classe"
            >
              <option value="">Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </NativeSelect>
            <Button size="sm" onClick={() => setDialogue("encaisser")}>
              <Receipt aria-hidden />
              Encaisser
            </Button>
          </div>
        </div>

        {/* --- Situations --- */}
        <TabsContent value="situations" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {situations.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucun élève inscrit sur ce périmètre.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève</TableHead>
                      <TableHead>Classe</TableHead>
                      <TableHead>Dû</TableHead>
                      <TableHead>Payé</TableHead>
                      <TableHead>Exonéré</TableHead>
                      <TableHead>Reste</TableHead>
                      <TableHead>Prochaine échéance</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {situations.map((s) => (
                      <TableRow key={s.inscriptionId}>
                        <TableCell>
                          <Link
                            href={`/dashboard/eleves/${s.eleveId}`}
                            className="font-medium hover:underline"
                          >
                            {s.prenom} {s.nom}
                          </Link>
                          <span className="block text-muted-foreground text-xs">{s.matricule}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.classe}</TableCell>
                        <TableCell className="tabular-nums">{formaterFcfa(s.totalDu)}</TableCell>
                        <TableCell className="tabular-nums">{formaterFcfa(s.totalPaye)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {s.totalExonere > 0 ? formaterFcfa(s.totalExonere) : "—"}
                        </TableCell>
                        <TableCell
                          className={`font-medium tabular-nums ${
                            s.resteDu > 0 ? "text-amber-600 dark:text-amber-400" : ""
                          }`}
                        >
                          {formaterFcfa(s.resteDu)}
                          {s.nbEnRetard > 0 ? (
                            <Badge variant="destructive" className="ml-2">
                              {s.nbEnRetard} en retard
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground text-sm">
                          {dateFr(s.prochaineEcheance)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              routeur.push(
                                `/dashboard/finances?inscription=${s.inscriptionId}${classeId ? `&classe=${classeId}` : ""}`,
                              )
                            }
                          >
                            Détail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {inscriptionSelectionnee ? (
            <Card className="mt-4">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      Échéancier — {inscriptionSelectionnee.prenom} {inscriptionSelectionnee.nom}
                    </CardTitle>
                    <CardDescription>
                      {inscriptionSelectionnee.classe} · reste{" "}
                      {formaterFcfa(inscriptionSelectionnee.resteDu)}
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setDialogue("exonerer")}>
                    Exonérer
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {echeancesEleve.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground text-sm">
                    Aucun échéancier généré pour cet élève.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Échéance</TableHead>
                        <TableHead>Nature</TableHead>
                        <TableHead>Dû</TableHead>
                        <TableHead>Payé</TableHead>
                        <TableHead>Exonéré</TableHead>
                        <TableHead>Limite</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {echeancesEleve.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.libelle}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {LIBELLE_NATURE[e.nature] ?? e.nature}
                          </TableCell>
                          <TableCell className="tabular-nums">{formaterFcfa(e.montantDu)}</TableCell>
                          <TableCell className="tabular-nums">{formaterFcfa(e.montantPaye)}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {e.montantExonere > 0 ? formaterFcfa(e.montantExonere) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">{dateFr(e.dateLimite)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                e.statut === "PAYE" || e.statut === "EXONERE"
                                  ? "default"
                                  : e.statut === "EN_RETARD"
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {e.statut === "PAYE"
                                ? "Payée"
                                : e.statut === "EXONERE"
                                  ? "Exonérée"
                                  : e.statut === "EN_RETARD"
                                    ? "En retard"
                                    : e.statut === "PARTIEL"
                                      ? "Partielle"
                                      : "À payer"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* --- Encaissements --- */}
        <TabsContent value="paiements" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {paiements.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucun encaissement enregistré.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reçu</TableHead>
                      <TableHead>Élève</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paiements.map((p) => {
                      const estAnnulation = p.montantFcfa < 0;
                      return (
                        <TableRow key={p.id} className={p.annule ? "opacity-60" : undefined}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {p.numeroRecu}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {p.elevePrenom} {p.eleveNom}
                            <span className="block text-muted-foreground text-xs">{p.classe}</span>
                          </TableCell>
                          <TableCell
                            className={`font-medium tabular-nums ${
                              estAnnulation ? "text-destructive" : ""
                            }`}
                          >
                            {formaterFcfa(p.montantFcfa)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {LIBELLE_MODE[p.mode] ?? p.mode}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {p.referenceExterne ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">{dateFr(p.datePaiement)}</TableCell>
                          <TableCell className="text-right">
                            {p.annule || estAnnulation ? (
                              <Badge variant="outline">Annulé</Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={enCours}
                                onClick={() => {
                                  const motif = window.prompt(
                                    "Motif de l'annulation (une écriture inverse sera créée) :",
                                  );
                                  if (!motif) return;
                                  agir(() => annulerPaiement(p.id, motif));
                                }}
                              >
                                <Ban aria-hidden />
                                Annuler
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Recouvrement par classe --- */}
        <TabsContent value="classes" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classe</TableHead>
                    <TableHead>Effectif</TableHead>
                    <TableHead>Dû</TableHead>
                    <TableHead>Encaissé</TableHead>
                    <TableHead>Reste</TableHead>
                    <TableHead>Taux</TableHead>
                    <TableHead>En retard</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recouvrement.map((r) => {
                    const taux = r.totalDu > 0 ? Math.round((r.totalPaye / r.totalDu) * 100) : 0;
                    return (
                      <TableRow key={r.classeId}>
                        <TableCell className="font-medium">{r.classe}</TableCell>
                        <TableCell className="tabular-nums">{r.effectif}</TableCell>
                        <TableCell className="tabular-nums">{formaterFcfa(r.totalDu)}</TableCell>
                        <TableCell className="tabular-nums">{formaterFcfa(r.totalPaye)}</TableCell>
                        <TableCell className="tabular-nums">{formaterFcfa(r.resteDu)}</TableCell>
                        <TableCell className="w-32">
                          <div className="flex items-center gap-2">
                            <Progress value={taux} className="w-16" />
                            <span className="text-xs tabular-nums">{taux} %</span>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {r.nbEnRetard > 0 ? (
                            <Badge variant="destructive">{r.nbEnRetard}</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Tarifs & tranches --- */}
        <TabsContent value="tarifs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Grille tarifaire</CardTitle>
                  <CardDescription>Montants par niveau, année {anneeLibelle}.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDialogue("tarif")}>
                  <Plus aria-hidden />
                  Ajouter un tarif
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tarifs.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground text-sm">
                  Aucun tarif défini. Sans grille tarifaire, aucun échéancier ne peut être généré.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Niveau</TableHead>
                      <TableHead>Nature</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Applicable</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tarifs.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.niveauLibelle}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {LIBELLE_NATURE[t.nature] ?? t.nature}
                        </TableCell>
                        <TableCell>{t.libelle}</TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formaterFcfa(t.montantFcfa)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {t.applicableNouveaux && t.applicableAnciens
                            ? "Tous"
                            : t.applicableNouveaux
                              ? "Nouveaux"
                              : "Réinscrits"}
                          {t.obligatoire ? "" : " · facultatif"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={enCours}
                            onClick={() => agir(() => supprimerTarif(t.id))}
                          >
                            Retirer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Tranches de paiement</CardTitle>
                  <CardDescription>
                    La somme doit atteindre 100 % — actuellement {totalTranches} %.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDialogue("tranche")}>
                    <Plus aria-hidden />
                    Ajouter une tranche
                  </Button>
                  <Button
                    size="sm"
                    disabled={enCours || tarifs.length === 0 || Math.abs(totalTranches - 100) > 0.01}
                    onClick={() => agir(() => genererEcheanciers(anneeId, classeId ?? undefined))}
                  >
                    <Wallet aria-hidden />
                    Générer les échéanciers
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tranches.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground text-sm">
                  Aucune tranche. Généralement trois, réparties sur l&apos;année.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead>Date limite</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tranches.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="tabular-nums">{t.numero}</TableCell>
                        <TableCell className="font-medium">{t.libelle}</TableCell>
                        <TableCell className="tabular-nums">{Number(t.pourcentage)} %</TableCell>
                        <TableCell className="tabular-nums">{dateFr(t.dateLimite)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ================= Dialogues ================= */}

      <Dialog open={dialogue === "tarif"} onOpenChange={(v) => !v && setDialogue(null)}>
        <DialogContent>
          <form
            action={(f) =>
              agir(() =>
                definirTarif({
                  anneeId,
                  niveauId: String(f.get("niveauId") ?? ""),
                  nature: String(f.get("nature") ?? "SCOLARITE"),
                  libelle: String(f.get("libelle") ?? ""),
                  montantFcfa: String(f.get("montantFcfa") ?? "0"),
                  obligatoire: f.get("obligatoire") === "on",
                  applicableNouveaux: f.get("applicableNouveaux") === "on",
                  applicableAnciens: f.get("applicableAnciens") === "on",
                }),
              )
            }
          >
            <DialogHeader>
              <DialogTitle>Ajouter un tarif</DialogTitle>
              <DialogDescription>
                Montant en francs CFA, sans décimale. Les droits d&apos;inscription ne s&apos;appliquent
                généralement qu&apos;aux nouveaux élèves.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="niveauId">Niveau *</Label>
                  <NativeSelect id="niveauId" name="niveauId" required>
                    <option value="">Choisir…</option>
                    {niveaux.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                  {erreur("niveauId")}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nature">Nature *</Label>
                  <NativeSelect id="nature" name="nature" defaultValue="SCOLARITE">
                    {NATURES.map((n) => (
                      <option key={n.valeur} value={n.valeur}>
                        {n.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="libelle">Libellé *</Label>
                <Input id="libelle" name="libelle" placeholder="Scolarité annuelle" required />
                {erreur("libelle")}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="montantFcfa">Montant (FCFA) *</Label>
                <Input
                  id="montantFcfa"
                  name="montantFcfa"
                  type="number"
                  min={0}
                  step={500}
                  placeholder="150000"
                  required
                />
                {erreur("montantFcfa")}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="obligatoire" defaultChecked className="size-4 accent-primary" />
                  Frais obligatoire
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="applicableNouveaux" defaultChecked className="size-4 accent-primary" />
                  S&apos;applique aux nouveaux inscrits
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="applicableAnciens" defaultChecked className="size-4 accent-primary" />
                  S&apos;applique aux réinscrits
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogue === "tranche"} onOpenChange={(v) => !v && setDialogue(null)}>
        <DialogContent>
          <form
            action={(f) =>
              agir(() =>
                definirTranche({
                  anneeId,
                  numero: String(f.get("numero") ?? "1"),
                  libelle: String(f.get("libelle") ?? ""),
                  dateLimite: String(f.get("dateLimite") ?? ""),
                  pourcentage: String(f.get("pourcentage") ?? "0"),
                }),
              )
            }
          >
            <DialogHeader>
              <DialogTitle>Ajouter une tranche</DialogTitle>
              <DialogDescription>
                Il reste {Math.max(0, 100 - totalTranches)} % à répartir.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="numero">Numéro *</Label>
                  <Input
                    id="numero"
                    name="numero"
                    type="number"
                    min={1}
                    max={12}
                    defaultValue={tranches.length + 1}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pourcentage">Part (%) *</Label>
                  <Input
                    id="pourcentage"
                    name="pourcentage"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={Math.max(0, 100 - totalTranches)}
                    required
                  />
                  {erreur("pourcentage")}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="libelle-tranche">Libellé *</Label>
                <Input
                  id="libelle-tranche"
                  name="libelle"
                  defaultValue={`${tranches.length + 1}ère tranche`}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dateLimite">Date limite *</Label>
                <Input id="dateLimite" name="dateLimite" type="date" required />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogue === "encaisser"} onOpenChange={(v) => !v && setDialogue(null)}>
        <DialogContent>
          <form
            action={(f) =>
              agir(() =>
                encaisser({
                  inscriptionId: String(f.get("inscriptionId") ?? ""),
                  echeanceId: String(f.get("echeanceId") ?? ""),
                  montantFcfa: String(f.get("montantFcfa") ?? "0"),
                  mode: String(f.get("mode") ?? "ESPECES"),
                  referenceExterne: String(f.get("referenceExterne") ?? ""),
                  nomPayeur: String(f.get("nomPayeur") ?? ""),
                  datePaiement: String(f.get("datePaiement") ?? ""),
                }),
              )
            }
          >
            <DialogHeader>
              <DialogTitle>Enregistrer un encaissement</DialogTitle>
              <DialogDescription>
                Le numéro de reçu est attribué automatiquement. Le montant ne peut pas dépasser le
                reste dû de l&apos;échéance.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="inscriptionId">Élève *</Label>
                <NativeSelect
                  id="inscriptionId"
                  name="inscriptionId"
                  required
                  defaultValue={inscriptionSelectionnee?.inscriptionId ?? ""}
                  onChange={(e) =>
                    routeur.push(
                      `/dashboard/finances?inscription=${e.target.value}${classeId ? `&classe=${classeId}` : ""}`,
                    )
                  }
                >
                  <option value="">Choisir…</option>
                  {situations.map((s) => (
                    <option key={s.inscriptionId} value={s.inscriptionId}>
                      {s.prenom} {s.nom} — {s.classe} — reste {formaterFcfa(s.resteDu)}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="echeanceId">Échéance à régler *</Label>
                <NativeSelect id="echeanceId" name="echeanceId" required>
                  <option value="">
                    {echeancesEleve.length === 0
                      ? "Sélectionnez d'abord l'élève"
                      : "Choisir l'échéance…"}
                  </option>
                  {echeancesEleve
                    .filter((e) => e.montantDu > e.montantPaye + e.montantExonere)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.libelle} — reste{" "}
                        {formaterFcfa(e.montantDu - e.montantPaye - e.montantExonere)}
                      </option>
                    ))}
                </NativeSelect>
                {erreur("echeanceId")}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="montantFcfa">Montant (FCFA) *</Label>
                  <Input
                    id="montantFcfa"
                    name="montantFcfa"
                    type="number"
                    min={1}
                    step={500}
                    required
                  />
                  {erreur("montantFcfa")}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mode">Mode *</Label>
                  <NativeSelect id="mode" name="mode" defaultValue="ESPECES">
                    {MODES.map((m) => (
                      <option key={m.valeur} value={m.valeur}>
                        {m.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="referenceExterne">Référence</Label>
                  <Input
                    id="referenceExterne"
                    name="referenceExterne"
                    placeholder="N° transaction Mobile Money"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="datePaiement">Date *</Label>
                  <Input
                    id="datePaiement"
                    name="datePaiement"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="nomPayeur">Nom du payeur</Label>
                <Input id="nomPayeur" name="nomPayeur" />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                <Receipt aria-hidden />
                {enCours ? "Enregistrement…" : "Encaisser"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogue === "exonerer"} onOpenChange={(v) => !v && setDialogue(null)}>
        <DialogContent>
          <form
            action={(f) =>
              agir(() =>
                exonerer({
                  inscriptionId: inscriptionSelectionnee?.inscriptionId ?? "",
                  echeanceId: String(f.get("echeanceId") ?? "") || null,
                  motif: String(f.get("motif") ?? "BOURSE"),
                  justification: String(f.get("justification") ?? ""),
                  pourcentage: f.get("pourcentage") === "" ? null : f.get("pourcentage"),
                  montantFcfa: f.get("montantFcfa") === "" ? null : f.get("montantFcfa"),
                }),
              )
            }
          >
            <DialogHeader>
              <DialogTitle>Accorder une exonération</DialogTitle>
              <DialogDescription>
                Indiquez soit un pourcentage, soit un montant fixe — pas les deux. L&apos;exonération
                est appliquée immédiatement à l&apos;échéancier.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="motif-exo">Motif *</Label>
                <NativeSelect id="motif-exo" name="motif" defaultValue="BOURSE">
                  {MOTIFS_EXO.map((m) => (
                    <option key={m.valeur} value={m.valeur}>
                      {m.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="echeanceId-exo">Échéance visée</Label>
                <NativeSelect id="echeanceId-exo" name="echeanceId" defaultValue="">
                  <option value="">Toutes les échéances</option>
                  {echeancesEleve.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.libelle}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="pourcentage-exo">Pourcentage</Label>
                  <Input id="pourcentage-exo" name="pourcentage" type="number" min={1} max={100} />
                  {erreur("pourcentage")}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="montantFcfa-exo">ou Montant (FCFA)</Label>
                  <Input id="montantFcfa-exo" name="montantFcfa" type="number" min={1} step={500} />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="justification">Justification *</Label>
                <Textarea id="justification" name="justification" rows={3} required />
                {erreur("justification")}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Enregistrement…" : "Accorder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
