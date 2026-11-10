"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CheckCircle2, CircleAlert, Loader2, QrCode, RefreshCw, Smartphone, WifiOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Écran de connexion WhatsApp : état réel de la session, et QR réel.
 *
 * POURQUOI CE COMPOSANT EXISTE
 * ----------------------------
 * Un QR WhatsApp est renouvelé toutes les vingt secondes. Une page statique
 * montrerait donc, l'essentiel du temps, un code mort — et c'est exactement la
 * panne vécue : « le QR est expiré » après avoir scanné une image figée.
 * Ce composant interroge le serveur en continu et remplace l'image dès que le
 * code change ; l'opérateur n'a jamais à recharger.
 *
 * CE QU'IL NE FAIT PAS
 * --------------------
 * Il ne reçoit jamais la valeur du QR, seulement une image servie par une
 * route authentifiée, et jamais le moindre jeton : tout secret reste sur le
 * serveur. L'image n'est pas mise en cache, et elle disparaît de l'écran dès
 * que la session est liée.
 */

type Etat = "attente" | "pret" | "expire" | "authentifie";

type Reponse = {
  appairage: { etat: Etat; qrDisponible: boolean; resteMs: number };
  transport: {
    whatsapp: string;
    etatDetaille: string | null;
    depuis: string | null;
    jamaisConnecte: boolean | null;
    reconnexions: number | null;
    derniereErreur: { le: string; message: string } | null;
    marcheS: number | null;
  } | null;
  agentJoignable: boolean;
  indisponibilite: string | null;
};

/** Assez court pour attraper un QR de 20 s, assez long pour ne pas marteler. */
const PERIODE_MS = 5_000;
/** Quand l'agent ne répond pas, on espace : l'acharnement n'aide personne. */
const PERIODE_PANNE_MS = 15_000;

function duree(secondes: number | null): string {
  if (secondes == null) return "inconnue";
  if (secondes < 60) return `${Math.round(secondes)} s`;
  if (secondes < 3600) return `${Math.floor(secondes / 60)} min`;
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function WhatsAppConnexion({ initial }: { initial: Reponse }) {
  const [etat, setEtat] = useState<Reponse>(initial);
  const [chargement, setChargement] = useState(false);
  /** Change à chaque nouveau QR : c'est ce qui force le navigateur à recharger l'image. */
  const [versionQr, setVersionQr] = useState(() => Date.now());
  const [erreurImage, setErreurImage] = useState(false);
  const precedent = useRef<string>(`${initial.appairage.etat}:${initial.appairage.resteMs}`);

  const rafraichir = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch("/api/whatsapp/etat", { cache: "no-store" });
      if (r.status === 401 || r.status === 403) {
        // La session a expiré pendant que la page vivait. On le dit ; on ne
        // boucle pas en silence sur une page qui n'a plus le droit d'exister.
        setEtat((v) => ({ ...v, agentJoignable: false, indisponibilite: "Votre session n'autorise plus cette page." }));
        return;
      }
      if (!r.ok) return;
      const suivant = (await r.json()) as Reponse;
      setEtat(suivant);

      // Un QR neuf se reconnaît à la remontée du temps restant : l'agent vient
      // d'en émettre un autre. On ne recharge l'image que dans ce cas, pour ne
      // pas clignoter à chaque sondage.
      const signature = `${suivant.appairage.etat}:${suivant.appairage.resteMs}`;
      const [, resteAvant] = precedent.current.split(":");
      if (suivant.appairage.qrDisponible && suivant.appairage.resteMs > Number(resteAvant ?? 0)) {
        setVersionQr(Date.now());
        setErreurImage(false);
      }
      precedent.current = signature;
    } catch {
      setEtat((v) => ({
        ...v,
        agentJoignable: false,
        indisponibilite: "Le serveur n'a pas répondu à la demande d'état.",
      }));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    // La session est liée : plus rien à surveiller, et surtout plus de QR à
    // demander. On arrête la boucle au lieu de la laisser tourner à vide.
    if (etat.appairage.etat === "authentifie") return;
    const periode = etat.agentJoignable ? PERIODE_MS : PERIODE_PANNE_MS;
    const minuteur = setInterval(rafraichir, periode);
    return () => clearInterval(minuteur);
  }, [rafraichir, etat.appairage.etat, etat.agentJoignable]);

  const { appairage, transport } = etat;

  return (
    <div className="space-y-6">
      {!etat.agentJoignable && etat.indisponibilite ? (
        <Alert variant="destructive">
          <WifiOff className="size-4" aria-hidden />
          <AlertTitle>Agent WhatsApp injoignable</AlertTitle>
          <AlertDescription>
            {etat.indisponibilite} Cet écran ne peut rien affirmer de la session tant que l'agent ne répond pas.
          </AlertDescription>
        </Alert>
      ) : null}

      {etat.agentJoignable && etat.indisponibilite ? (
        <Alert>
          <CircleAlert className="size-4" aria-hidden />
          <AlertTitle>Lecture partielle</AlertTitle>
          <AlertDescription>{etat.indisponibilite}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {appairage.etat === "authentifie" ? (
                  <CheckCircle2 className="size-5 text-succes" aria-hidden />
                ) : (
                  <QrCode className="size-5 text-primary" aria-hidden />
                )}
                {appairage.etat === "authentifie" ? "WhatsApp connecté" : "Connexion WhatsApp requise"}
              </CardTitle>
              <CardDescription>
                {appairage.etat === "authentifie"
                  ? "La session est liée et aucun scan n'est nécessaire."
                  : "Associez le téléphone de l'établissement en scannant le code ci-dessous."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={appairage.etat === "authentifie" ? "default" : "outline"}>
                {
                  {
                    attente: "En attente d'un code",
                    pret: "Code à scanner",
                    expire: "Code expiré",
                    authentifie: "Session prête",
                  }[appairage.etat]
                }
              </Badge>
              <Button variant="outline" size="sm" onClick={rafraichir} disabled={chargement}>
                {chargement ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-4" aria-hidden />
                )}
                Actualiser
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {appairage.etat === "authentifie" ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium">Authentification validée.</p>
              <p className="mt-1 text-muted-foreground">
                {transport?.whatsapp === "ready"
                  ? "Le client est prêt : l'agent reçoit et envoie des messages."
                  : "La session est liée, mais le client n'a pas encore annoncé être prêt. Cet écran ne confirme « prêt » que lorsque l'agent le dit lui-même."}
              </p>
            </div>
          ) : null}

          {appairage.etat === "pret" ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="rounded-xl border bg-white p-3">
                {erreurImage ? (
                  <div className="flex size-[256px] items-center justify-center text-center text-muted-foreground text-xs">
                    Le code n'a pas pu être chargé. Il a probablement expiré ; le suivant arrive.
                  </div>
                ) : (
                  // `key` ET requête distincte : le navigateur ne doit jamais
                  // réutiliser l'image d'un code périmé.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={versionQr}
                    src={`/api/whatsapp/qr?v=${versionQr}`}
                    alt="Code QR d'association WhatsApp"
                    width={256}
                    height={256}
                    className="size-[256px]"
                    onError={() => setErreurImage(true)}
                  />
                )}
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>Ouvrez WhatsApp sur le téléphone de l'établissement.</li>
                <li>
                  Touchez <strong>Appareils connectés</strong>, puis{" "}
                  <strong>Connecter un appareil</strong>.
                </li>
                <li>Scannez le code affiché ici.</li>
                <li className="text-muted-foreground">
                  Le code se renouvelle toutes les vingt secondes et cette page le remplace seule : il n'y a rien à
                  recharger.
                </li>
              </ol>
            </div>
          ) : null}

          {appairage.etat === "expire" ? (
            <Alert>
              <CircleAlert className="size-4" aria-hidden />
              <AlertTitle>Code expiré</AlertTitle>
              <AlertDescription>
                Le code affiché n'est plus valable. Le suivant est récupéré automatiquement dès que l'agent l'émet —
                restez sur cette page.
              </AlertDescription>
            </Alert>
          ) : null}

          {appairage.etat === "attente" && etat.agentJoignable ? (
            <Alert>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <AlertTitle>Authentification en cours</AlertTitle>
              <AlertDescription>
                L'agent n'a pas de code à proposer pour l'instant. Soit il démarre son navigateur, soit il tente de
                restaurer la session enregistrée. Cette page affichera le code dès qu'il existe.
              </AlertDescription>
            </Alert>
          ) : null}

          {transport ? (
            <dl className="grid gap-x-6 gap-y-2 border-t pt-4 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground text-xs">État du transport</dt>
                <dd className="font-medium tabular-nums">{transport.whatsapp}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground text-xs">État détaillé</dt>
                <dd className="font-medium">{transport.etatDetaille ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground text-xs">Agent en marche depuis</dt>
                <dd className="font-medium tabular-nums">{duree(transport.marcheS)}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground text-xs">Reconnexions</dt>
                <dd className="font-medium tabular-nums">{transport.reconnexions ?? "—"}</dd>
              </div>
              {transport.jamaisConnecte ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Dernière connexion connue</dt>
                  <dd className="font-medium">
                    Aucune depuis le démarrage de ce processus — la session enregistrée n'a pas été acceptée.
                  </dd>
                </div>
              ) : null}
              {transport.derniereErreur ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Dernière erreur signalée</dt>
                  <dd className="font-medium break-words">
                    {new Date(transport.derniereErreur.le).toLocaleString("fr-FR")} — {transport.derniereErreur.message}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Alert>
        <Smartphone className="size-4" aria-hidden />
        <AlertTitle>Ce code vaut un mot de passe</AlertTitle>
        <AlertDescription>
          Qui scanne ce code lie son téléphone au numéro de l'établissement et lit les conversations. Ne le montrez à
          personne, ne le photographiez pas, ne le partagez par aucun moyen. Il n'est ni enregistré, ni journalisé, ni
          mis en cache, et il disparaît de cet écran dès que la session est liée.
        </AlertDescription>
      </Alert>
    </div>
  );
}
