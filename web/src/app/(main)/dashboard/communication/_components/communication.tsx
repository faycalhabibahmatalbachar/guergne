"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Megaphone, Pin, Send, Users } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  EtatFile,
  LigneAnnonce,
  LigneMessage,
  LigneNotification,
} from "@/server/domain/communication";

import {
  basculerAnnonce,
  envoyerMessage,
  epinglerAnnonce,
  publierAnnonce,
  traiterFileNotifications,
} from "../actions";

interface Option {
  id: string;
  libelle: string;
}

const dateFr = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const LIBELLE_CIBLE: Record<string, string> = {
  TOUS: "Tout l'établissement",
  NIVEAU: "Un niveau",
  CLASSE: "Une classe",
  ELEVE: "Élèves choisis",
};

const LIBELLE_TYPE_NOTIF: Record<string, string> = {
  ABSENCE: "Absence",
  RETARD: "Retard",
  NOTE_PUBLIEE: "Note publiée",
  BULLETIN_PUBLIE: "Bulletin",
  INCIDENT: "Incident",
  SANCTION: "Sanction",
  ECHEANCE_PAIEMENT: "Échéance",
  PAIEMENT_RECU: "Paiement",
  ANNONCE: "Annonce",
  CONVOCATION: "Convocation",
  CHANGEMENT_STATUT: "Changement de statut",
  DEVOIR: "Devoir",
  AUTRE: "Autre",
};

export function Communication({
  anneeId,
  anneeLibelle,
  niveaux,
  classes,
  eleves,
  tuteurs,
  annonces,
  messages,
  notifications,
  file,
}: {
  anneeId: string;
  anneeLibelle: string;
  niveaux: Option[];
  classes: Option[];
  eleves: Array<{ id: string; nom: string; prenom: string; classe: string }>;
  tuteurs: Array<{ utilisateurId: string; nom: string; prenom: string; telephone: string | null }>;
  annonces: LigneAnnonce[];
  messages: LigneMessage[];
  notifications: LigneNotification[];
  file: EtatFile;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [dialogue, setDialogue] = useState<"annonce" | "message" | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [cible, setCible] = useState("TOUS");
  const [elevesChoisis, setElevesChoisis] = useState<string[]>([]);

  const erreur = (c: string) =>
    erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null;

  function agir(action: () => Promise<Resultat>) {
    setErreurs({});
    demarrer(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(r.message ?? "Enregistré.");
        setDialogue(null);
        setElevesChoisis([]);
        routeur.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "Échec.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* File d'expédition */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">File d&apos;expédition</CardTitle>
              <CardDescription>
                Les notifications sont mises en file par l&apos;application, puis expédiées en push
                pour les familles équipées et en SMS pour les autres.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={enCours || file.enAttente === 0}
              onClick={() => agir(() => traiterFileNotifications())}
            >
              <Send aria-hidden />
              Traiter la file
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { libelle: "En attente", valeur: file.enAttente, alerte: file.enAttente > 0 },
              { libelle: "Push en attente", valeur: file.pushEnAttente },
              { libelle: "SMS en attente", valeur: file.smsEnAttente },
              { libelle: "Envoyées", valeur: file.envoyees },
            ].map((k) => (
              <div key={k.libelle}>
                <p className="text-muted-foreground text-xs">{k.libelle}</p>
                <p
                  className={`mt-0.5 font-semibold text-xl tabular-nums ${
                    k.alerte ? "text-amber-600 dark:text-amber-400" : ""
                  }`}
                >
                  {k.valeur}
                </p>
              </div>
            ))}
          </div>

          {file.smsEnAttente > 0 ? (
            <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-400">
              {file.smsEnAttente} SMS en attente, soit environ{" "}
              <span className="font-medium tabular-nums">
                {new Intl.NumberFormat("fr-FR").format(file.coutSmsEstime)} F
              </span>{" "}
              à 25 F le message. Le SMS est le seul poste de dépense variable du projet.
            </p>
          ) : null}

          {file.echouees > 0 ? (
            <p className="mt-3 text-destructive text-sm">
              {file.echouees} notification(s) en échec après trois tentatives.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="annonces">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="annonces">Annonces ({annonces.length})</TabsTrigger>
            <TabsTrigger value="messages">Messages ({messages.length})</TabsTrigger>
            <TabsTrigger value="journal">Journal d&apos;envoi</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialogue("message")}>
              <Send aria-hidden />
              Message ciblé
            </Button>
            <Button size="sm" onClick={() => setDialogue("annonce")}>
              <Megaphone aria-hidden />
              Nouvelle annonce
            </Button>
          </div>
        </div>

        {/* --- Annonces --- */}
        <TabsContent value="annonces" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {annonces.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucune annonce publiée cette année.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Annonce</TableHead>
                      <TableHead>Destinataires</TableHead>
                      <TableHead>Publiée le</TableHead>
                      <TableHead>Diffusion</TableHead>
                      <TableHead>Lectures</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {annonces.map((a) => (
                      <TableRow key={a.id} className={a.publiee ? undefined : "opacity-55"}>
                        <TableCell className="max-w-sm">
                          <span className="flex items-center gap-1.5 font-medium">
                            {a.epinglee ? <Pin className="size-3.5" aria-label="Épinglée" /> : null}
                            {a.titre}
                          </span>
                          <p className="truncate text-muted-foreground text-xs" title={a.contenu}>
                            {a.contenu}
                          </p>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {LIBELLE_CIBLE[a.cible] ?? a.cible}
                          {a.classeLibelle ? ` — ${a.classeLibelle}` : ""}
                          {a.niveauLibelle ? ` — ${a.niveauLibelle}` : ""}
                        </TableCell>
                        <TableCell className="tabular-nums">{dateFr(a.publierLe)}</TableCell>
                        <TableCell>
                          {a.envoyerPush ? (
                            <Badge variant="secondary">{a.nbNotifications} envoi(s)</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Affichage seul</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{a.nbLectures}</TableCell>
                        <TableCell className="space-x-1 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={enCours}
                            onClick={() => agir(() => epinglerAnnonce(a.id, !a.epinglee))}
                          >
                            {a.epinglee ? "Désépingler" : "Épingler"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={enCours}
                            onClick={() => agir(() => basculerAnnonce(a.id, !a.publiee))}
                          >
                            {a.publiee ? "Retirer" : "Republier"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Messages --- */}
        <TabsContent value="messages" className="mt-6">
          <Card>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucun message échangé.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Objet</TableHead>
                      <TableHead>Destinataire</TableHead>
                      <TableHead>Élève concerné</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>État</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="max-w-sm">
                          <span className="font-medium">{m.objet}</span>
                          <p className="truncate text-muted-foreground text-xs">{m.contenu}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.destinataire ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.elevePrenom ? `${m.elevePrenom} ${m.eleveNom}` : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">{dateFr(m.creeLe)}</TableCell>
                        <TableCell>
                          <Badge variant={m.lu ? "secondary" : "outline"}>
                            {m.lu ? "Lu" : "Non lu"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Journal --- */}
        <TabsContent value="journal" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Journal d&apos;envoi</CardTitle>
              <CardDescription>
                Toute notification produite par le système, quel que soit son canal. Rien n&apos;est
                marqué « envoyé » tant qu&apos;un canal ne l&apos;a pas réellement acheminé.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {notifications.length === 0 ? (
                <p className="py-14 text-center text-muted-foreground text-sm">
                  Aucune notification produite.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Destinataire</TableHead>
                      <TableHead>Créée</TableHead>
                      <TableHead>État</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell>
                          <Badge variant="outline">{LIBELLE_TYPE_NOTIF[n.type] ?? n.type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{n.canal}</TableCell>
                        <TableCell className="max-w-sm">
                          <span className="font-medium text-sm">{n.titre}</span>
                          <p className="truncate text-muted-foreground text-xs">{n.corps}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {n.telephone ?? "Compte applicatif"}
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">{dateFr(n.creeLe)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              n.statut === "ENVOYE" || n.statut === "LU"
                                ? "default"
                                : n.statut === "ECHOUE"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {n.statut === "EN_ATTENTE"
                              ? "En attente"
                              : n.statut === "ENVOYE"
                                ? "Envoyée"
                                : n.statut === "ECHOUE"
                                  ? "Échec"
                                  : "Lue"}
                          </Badge>
                          {n.tentatives > 0 ? (
                            <span className="ml-1 text-muted-foreground text-xs">
                              {n.tentatives} tentative(s)
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ================= Annonce ================= */}
      <Dialog open={dialogue === "annonce"} onOpenChange={(v) => !v && setDialogue(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form
            action={(f) =>
              agir(() =>
                publierAnnonce({
                  anneeId,
                  titre: String(f.get("titre") ?? ""),
                  contenu: String(f.get("contenu") ?? ""),
                  cible,
                  niveauId: String(f.get("niveauId") ?? "") || null,
                  classeId: String(f.get("classeId") ?? "") || null,
                  elevesIds: elevesChoisis,
                  epinglee: f.get("epinglee") === "on",
                  envoyerPush: f.get("envoyerPush") === "on",
                  expireLe: String(f.get("expireLe") ?? ""),
                }),
              )
            }
          >
            <DialogHeader>
              <DialogTitle>Nouvelle annonce</DialogTitle>
              <DialogDescription>
                Une annonce générale ne part qu&apos;au tuteur principal de chaque famille : inonder
                les deux parents du même message double le coût SMS sans rien apporter.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="titre">Titre *</Label>
                <Input id="titre" name="titre" placeholder="Réunion de parents" required />
                {erreur("titre")}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contenu">Contenu *</Label>
                <Textarea id="contenu" name="contenu" rows={4} required />
                {erreur("contenu")}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cible">Destinataires *</Label>
                <NativeSelect id="cible" value={cible} onChange={(e) => setCible(e.target.value)}>
                  <option value="TOUS">Tout l&apos;établissement</option>
                  <option value="NIVEAU">Un niveau</option>
                  <option value="CLASSE">Une classe</option>
                  <option value="ELEVE">Élèves choisis</option>
                </NativeSelect>
              </div>

              {cible === "NIVEAU" ? (
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
              ) : null}

              {cible === "CLASSE" ? (
                <div className="grid gap-2">
                  <Label htmlFor="classeId">Classe *</Label>
                  <NativeSelect id="classeId" name="classeId" required>
                    <option value="">Choisir…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.libelle}
                      </option>
                    ))}
                  </NativeSelect>
                  {erreur("classeId")}
                </div>
              ) : null}

              {cible === "ELEVE" ? (
                <div className="grid gap-2">
                  <Label>
                    <Users className="mr-1 inline size-3.5" aria-hidden />
                    Élèves concernés * ({elevesChoisis.length} sélectionné
                    {elevesChoisis.length > 1 ? "s" : ""})
                  </Label>
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                    {eleves.length === 0 ? (
                      <p className="p-2 text-muted-foreground text-sm">Aucun élève inscrit.</p>
                    ) : (
                      eleves.map((e) => (
                        <label key={e.id} className="flex items-center gap-2 rounded p-1 text-sm hover:bg-muted">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={elevesChoisis.includes(e.id)}
                            onChange={(ev) =>
                              setElevesChoisis((p) =>
                                ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id),
                              )
                            }
                          />
                          {e.prenom} {e.nom}
                          <span className="text-muted-foreground text-xs">{e.classe}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {erreur("elevesIds")}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="expireLe">Expire le</Label>
                <Input id="expireLe" name="expireLe" type="date" />
                <p className="text-muted-foreground text-xs">
                  Au-delà de cette date, l&apos;annonce disparaît de l&apos;application parent.
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="envoyerPush" defaultChecked className="size-4 accent-primary" />
                  Notifier les familles (push, puis SMS pour les non équipées)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="epinglee" className="size-4 accent-primary" />
                  Épingler en tête de liste
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                <Megaphone aria-hidden />
                {enCours ? "Publication…" : "Publier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= Message ================= */}
      <Dialog open={dialogue === "message"} onOpenChange={(v) => !v && setDialogue(null)}>
        <DialogContent>
          <form
            action={(f) =>
              agir(() =>
                envoyerMessage({
                  destinataireId: String(f.get("destinataireId") ?? ""),
                  eleveId: String(f.get("eleveId") ?? "") || null,
                  objet: String(f.get("objet") ?? ""),
                  contenu: String(f.get("contenu") ?? ""),
                }),
              )
            }
          >
            <DialogHeader>
              <DialogTitle>Message ciblé</DialogTitle>
              <DialogDescription>
                Destiné à un tuteur disposant d&apos;un compte sur l&apos;application. Pour les
                familles non équipées, utilisez une annonce : elle bascule automatiquement en SMS.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="destinataireId">Destinataire *</Label>
                <NativeSelect id="destinataireId" name="destinataireId" required>
                  <option value="">Choisir…</option>
                  {tuteurs.map((t) => (
                    <option key={t.utilisateurId} value={t.utilisateurId}>
                      {t.prenom} {t.nom}
                      {t.telephone ? ` — ${t.telephone}` : ""}
                    </option>
                  ))}
                </NativeSelect>
                {erreur("destinataireId")}
                {tuteurs.length === 0 ? (
                  <p className="text-amber-600 text-sm dark:text-amber-400">
                    Aucun tuteur n&apos;a encore activé son compte.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="eleveId">Élève concerné</Label>
                <NativeSelect id="eleveId" name="eleveId" defaultValue="">
                  <option value="">Sans rapport à un élève</option>
                  {eleves.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.prenom} {e.nom} — {e.classe}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="objet">Objet *</Label>
                <Input id="objet" name="objet" required />
                {erreur("objet")}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contenu-msg">Message *</Label>
                <Textarea id="contenu-msg" name="contenu" rows={5} required />
                {erreur("contenu")}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                <Send aria-hidden />
                {enCours ? "Envoi…" : "Envoyer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface Resultat {
  ok: boolean;
  message?: string;
  erreurs?: Record<string, string>;
}
