"use client";

import { useEffect, useState, useTransition } from "react";

import { BellRing, MessageSquare, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  apercuClasse,
  apercuEleve,
  notifierClasse,
  notifierEleve,
  type Apercu,
} from "../_actions/notifier";

type Cible = { type: "eleve"; id: string; nom: string } | { type: "classe"; id: string; nom: string };

/**
 * Prévenir les familles sans quitter la page.
 *
 * DEUX CHOSES SONT MONTRÉES AVANT L'ENVOI, ET C'EST L'ESSENTIEL
 * -------------------------------------------------------------
 * Combien de personnes seront touchées, et combien cela coûtera. Le SMS est le
 * seul poste variable du budget de l'établissement : un envoi de routine à une
 * classe entière peut représenter plusieurs milliers de francs, et personne ne
 * peut le deviner en tapant son message.
 *
 * L'aperçu est recalculé côté serveur avec la MÊME fonction que les
 * déclencheurs — `fn_canal_tuteur` — pour qu'il ne puisse pas annoncer autre
 * chose que ce qui partira.
 */
export function BoutonNotifier({
  cible,
  variante = "outline",
}: {
  cible: Cible;
  variante?: "default" | "outline" | "ghost";
}) {
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, demarrer] = useTransition();

  // L'aperçu suit la frappe, mais avec un délai : recalculer à chaque touche
  // ferait une requête par caractère.
  useEffect(() => {
    if (!ouvert) return;

    const minuteur = setTimeout(async () => {
      try {
        const a =
          cible.type === "eleve"
            ? await apercuEleve(cible.id, titre || "Message", corps || "…")
            : await apercuClasse(cible.id, titre || "Message", corps || "…");
        setApercu(a);
      } catch {
        // Un aperçu indisponible ne doit pas bloquer l'envoi : on le masque.
        setApercu(null);
      }
    }, 400);

    return () => clearTimeout(minuteur);
  }, [ouvert, titre, corps, cible]);

  function envoyer() {
    setErreurs({});
    demarrer(async () => {
      const r =
        cible.type === "eleve"
          ? await notifierEleve(cible.id, { titre, corps })
          : await notifierClasse(cible.id, { titre, corps });

      if (r.ok) {
        toast.success(r.message ?? "Message déposé.");
        setOuvert(false);
        setTitre("");
        setCorps("");
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "Envoi impossible.");
      }
    });
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button variant={variante} size="sm">
          <BellRing aria-hidden />
          Prévenir les parents
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prévenir les parents</DialogTitle>
          <DialogDescription>
            {cible.type === "eleve"
              ? `Les tuteurs de ${cible.nom} seront prévenus.`
              : `Les tuteurs de tous les élèves de ${cible.nom} seront prévenus.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titre-notif">Titre</Label>
            <Input
              id="titre-notif"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Réunion de parents"
              maxLength={80}
              aria-invalid={Boolean(erreurs.titre)}
            />
            {erreurs.titre ? <p className="text-destructive text-xs">{erreurs.titre}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="corps-notif">Message</Label>
            <Textarea
              id="corps-notif"
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={4}
              placeholder="Une réunion se tiendra samedi 30 août à 9 h dans la cour."
              maxLength={600}
              aria-invalid={Boolean(erreurs.corps)}
            />
            <div className="flex justify-between">
              {erreurs.corps ? (
                <p className="text-destructive text-xs">{erreurs.corps}</p>
              ) : (
                <span />
              )}
              <p className="text-muted-foreground text-xs tabular-nums">{corps.length}/600</p>
            </div>
          </div>

          {apercu && apercu.total > 0 ? (
            <div className="bg-muted/50 space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">{apercu.total} destinataire(s)</p>
              <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <Smartphone aria-hidden className="size-3.5" />
                  {apercu.parPush} par notification — gratuit
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageSquare aria-hidden className="size-3.5" />
                  {apercu.parSms} par SMS
                </span>
              </div>

              {apercu.parSms > 0 ? (
                <p>
                  Coût estimé :{" "}
                  <strong className="tabular-nums">
                    {apercu.coutFcfa.toLocaleString("fr-FR")} F
                  </strong>
                  {apercu.segments > 1 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      — {apercu.segments} segments par message, votre texte dépasse la longueur
                      d&apos;un SMS
                    </span>
                  ) : null}
                </p>
              ) : null}

              {apercu.sansCanal > 0 ? (
                <p className="text-amber-600 dark:text-amber-400">
                  {apercu.sansCanal} tuteur(s) sans application ni consentement SMS : le message
                  les attendra dans l&apos;application.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOuvert(false)}>
            Annuler
          </Button>
          <Button onClick={envoyer} disabled={enCours || titre.length < 3 || corps.length < 5}>
            {enCours ? "Envoi…" : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
