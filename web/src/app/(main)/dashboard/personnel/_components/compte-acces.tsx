"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Copy, KeyRound, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import {
  basculerCompte,
  creerCompteEnseignant,
  reinitialiserMotDePasse,
} from "../actions-compte";

/**
 * Compte d'accès d'un enseignant (E-62).
 *
 * AUCUN DES QUINZE ENSEIGNANTS N'EN AVAIT
 * ----------------------------------------
 * `enseignants.utilisateur_id` était nul partout. Aucun professeur ne pouvait
 * ouvrir le portail, donc aucun ne saisissait ses notes ni ses appréciations :
 * tout passait par le secrétariat, qui recopiait des feuilles. C'était le seul
 * point du logiciel qui empêchait encore des modules entiers de servir.
 *
 * LE MOT DE PASSE S'AFFICHE UNE FOIS, ET ON LE DIT
 * -------------------------------------------------
 * Il est montré à la création, puis n'existe plus que sous forme d'empreinte.
 * L'écran l'annonce explicitement : sans cet avertissement, la personne ferme
 * la fenêtre et rappelle le lendemain.
 */

const ROLES: Array<[string, string]> = [
  ["ENSEIGNANT", "Enseignant"],
  ["SURVEILLANT", "Surveillant"],
  ["SECRETARIAT", "Secrétariat"],
  ["COMPTABLE", "Comptable"],
  ["CENSEUR", "Censeur"],
  ["DIRECTION", "Direction"],
];

const LIBELLE_ROLE = Object.fromEntries(ROLES);

export function CompteAcces({
  enseignantId,
  nom,
  aCompte,
  compteActif,
  roleCompte,
}: {
  enseignantId: string;
  nom: string;
  aCompte: boolean;
  compteActif: boolean;
  roleCompte: string | null;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [role, setRole] = useState("ENSEIGNANT");
  const [motDePasse, setMotDePasse] = useState<string | null>(null);

  function creer() {
    demarrer(async () => {
      const r = await creerCompteEnseignant({ enseignantId, role });
      if (r.ok && r.motDePasse) {
        setMotDePasse(r.motDePasse);
        routeur.refresh();
      } else {
        toast.error(r.message ?? "La création a échoué.");
      }
    });
  }

  function reinitialiser() {
    demarrer(async () => {
      const r = await reinitialiserMotDePasse(enseignantId);
      if (r.ok && r.motDePasse) {
        setMotDePasse(r.motDePasse);
        setOuvert(true);
        routeur.refresh();
      } else {
        toast.error(r.message ?? "La réinitialisation a échoué.");
      }
    });
  }

  function basculer() {
    demarrer(async () => {
      const r = await basculerCompte(enseignantId, !compteActif);
      toast[r.ok ? "success" : "error"](r.message ?? "Terminé.");
      if (r.ok) routeur.refresh();
    });
  }

  return (
    <>
      {!aCompte ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setMotDePasse(null);
            setOuvert(true);
          }}
        >
          <UserPlus aria-hidden />
          Créer l&apos;accès
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={compteActif ? "secondary" : "outline"}>
            {compteActif ? (LIBELLE_ROLE[roleCompte ?? ""] ?? roleCompte) : "compte désactivé"}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={enCours}
            onClick={reinitialiser}
            title="Réinitialiser le mot de passe"
          >
            <KeyRound className="size-3.5" aria-hidden />
            <span className="sr-only">Réinitialiser le mot de passe</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={enCours}
            onClick={basculer}
            title={compteActif ? "Désactiver le compte" : "Réactiver le compte"}
          >
            <ShieldOff className="size-3.5" aria-hidden />
            <span className="sr-only">{compteActif ? "Désactiver" : "Réactiver"}</span>
          </Button>
        </div>
      )}

      <Dialog
        open={ouvert}
        onOpenChange={(o) => {
          setOuvert(o);
          if (!o) setMotDePasse(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {motDePasse ? "Mot de passe provisoire" : `Créer l'accès de ${nom}`}
            </DialogTitle>
            <DialogDescription>
              {motDePasse
                ? "Notez-le maintenant : il ne sera plus jamais affiché. L'enseignant devra le remplacer à sa première connexion."
                : "L'identifiant sera son numéro de téléphone, ou son e-mail s'il en a un."}
            </DialogDescription>
          </DialogHeader>

          {motDePasse ? (
            <div className="space-y-3">
              <div className="bg-muted flex items-center justify-between gap-3 rounded-md border px-3 py-3">
                <code className="font-mono text-lg tracking-wider">{motDePasse}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(motDePasse);
                    toast.success("Copié.");
                  }}
                >
                  <Copy aria-hidden />
                  <span className="sr-only">Copier</span>
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Sans lettres ni chiffres ambigus — pas de O contre 0, pas de I contre 1 — pour
                pouvoir être dicté au téléphone sans erreur.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="ca-role">Rôle</Label>
              <NativeSelect id="ca-role" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                Le rôle décide de ce que la personne voit et peut faire. Il n&apos;y a pas
                d&apos;administrateur général dans cette liste : donner les pleins pouvoirs en
                créant une fiche professeur est une erreur qui ne se remarque jamais.
              </p>
            </div>
          )}

          <DialogFooter>
            {motDePasse ? (
              <Button onClick={() => setOuvert(false)}>J&apos;ai noté</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOuvert(false)}>
                  Annuler
                </Button>
                <Button onClick={creer} disabled={enCours}>
                  {enCours ? "Création…" : "Créer le compte"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
