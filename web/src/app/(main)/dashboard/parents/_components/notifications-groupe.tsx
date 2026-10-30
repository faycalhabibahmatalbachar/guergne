"use client";

import { useEffect, useState, useTransition } from "react";

import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCheck,
  LoaderCircle,
  MessageSquare,
  Send,
  Smartphone,
  Users,
  X,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  apercuNotificationsGroupe,
  type DevisGroupe,
  envoyerNotificationsGroupe,
  type SelectionGroupe,
} from "../actions-groupe";

export const MODELES_PARENTS = [
  {
    id: "reunion",
    nom: "Réunion parents",
    titre: "Réunion avec les familles",
    corps:
      "Chers parents, nous vous invitons à une réunion d’information au sein de l’établissement. Merci de prendre contact avec le secrétariat pour les modalités.",
  },
  {
    id: "convocation",
    nom: "Convocation individuelle",
    titre: "Convocation à l’établissement",
    corps:
      "Madame, Monsieur, la direction souhaite vous rencontrer concernant le suivi scolaire de votre enfant. Merci de contacter le secrétariat pour convenir d’un rendez-vous.",
  },
  {
    id: "documents",
    nom: "Documents à compléter",
    titre: "Dossier administratif à compléter",
    corps:
      "Madame, Monsieur, des informations restent à compléter dans le dossier scolaire de votre enfant. Merci de prendre contact avec le secrétariat.",
  },
  {
    id: "information",
    nom: "Information générale",
    titre: "Information aux familles",
    corps:
      "Chers parents, nous souhaitons vous communiquer une information concernant la vie scolaire. Merci de contacter le secrétariat si vous avez des questions.",
  },
  {
    id: "rappel",
    nom: "Relance de rendez-vous",
    titre: "Rappel de rendez-vous",
    corps:
      "Madame, Monsieur, nous vous rappelons votre rendez-vous avec l’établissement. En cas d’indisponibilité, merci d’informer le secrétariat.",
  },
] as const;

type Canal = "AUTO" | "APP" | "SMS" | "APP_ET_SMS";
const CANAUX: { id: Canal; libelle: string; detail: string }[] = [
  { id: "AUTO", libelle: "Automatique", detail: "Politique de l’école" },
  { id: "APP", libelle: "Application", detail: "Gratuit" },
  { id: "SMS", libelle: "SMS", detail: "Consentement requis" },
  { id: "APP_ET_SMS", libelle: "App + SMS", detail: "Double canal" },
];

export function NotificationsGroupe({
  selection,
  nombreSelectionnes,
  ouvert,
  onFermer,
  onSucces,
}: {
  selection: SelectionGroupe;
  nombreSelectionnes: number;
  ouvert: boolean;
  onFermer: () => void;
  onSucces: () => void;
}) {
  const [titre, setTitre] = useState("");
  const [corps, setCorps] = useState("");
  const [canal, setCanal] = useState<Canal>("AUTO");
  const [planifier, setPlanifier] = useState(false);
  const [dateLocale, setDateLocale] = useState("");
  const [devis, setDevis] = useState<{ signature: string; valeur: DevisGroupe } | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [confirmationDiffusion, setConfirmationDiffusion] = useState(false);
  const [cle, setCle] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const tempsLocal = planifier && dateLocale ? Date.parse(dateLocale) : NaN;
  const programmeLe = Number.isFinite(tempsLocal) ? new Date(tempsLocal).toISOString() : null;
  const signature = JSON.stringify([selection, titre, corps, canal, programmeLe]);
  const valide =
    titre.trim().length >= 3 && corps.trim().length >= 5 && nombreSelectionnes > 0 && (!planifier || !!programmeLe);
  const apercu = devis?.signature === signature ? devis.valeur : null;

  useEffect(() => {
    if (!ouvert || !valide) return;
    let actif = true;
    const timeout = setTimeout(async () => {
      if (!actif) return;
      setChargement(true);
      setErreur("");
      try {
        const valeur = await apercuNotificationsGroupe({ selection, titre, corps, canal, programmation: programmeLe });
        if (actif) setDevis({ signature, valeur });
      } catch (e) {
        if (actif) setErreur(e instanceof Error ? e.message : "Impossible de vérifier les destinataires.");
      } finally {
        if (actif) setChargement(false);
      }
    }, 450);
    return () => {
      actif = false;
      clearTimeout(timeout);
    };
  }, [ouvert, valide, signature]);

  function invalider() {
    setDevis(null);
    setConfirmation(false);
    setConfirmationDiffusion(false);
    setErreur("");
    setCle(null);
  }
  function terminer() {
    if (enCours) return;
    onFermer();
    setTitre("");
    setCorps("");
    setCanal("AUTO");
    setPlanifier(false);
    setDateLocale("");
    setDevis(null);
    setErreur("");
    setConfirmation(false);
    setConfirmationDiffusion(false);
    setCle(null);
  }
  function envoyer() {
    if (
      !apercu ||
      !valide ||
      !apercu.total ||
      enCours ||
      chargement ||
      erreur ||
      (apercu.parSms > 0 && !confirmation) ||
      ((selection.mode === "filtres" || apercu.parentsSelectionnes > 30) && !confirmationDiffusion)
    )
      return;
    const idempotence = cle ?? crypto.randomUUID();
    setCle(idempotence);
    demarrer(async () => {
      try {
        const r = await envoyerNotificationsGroupe({
          selection,
          titre,
          corps,
          canal,
          programmation: programmeLe,
          plafondCoutFcfa: apercu.coutFcfa,
          plafondNotifications: apercu.total,
          parentsConfirmes: apercu.parentsSelectionnes,
          empreinteAudience: apercu.empreinteAudience,
          confirmationDiffusion,
          cleEnvoi: idempotence,
        });
        if (!r.ok) {
          setDevis(null);
          toast.error(r.message);
          return;
        }
        toast.success(r.message);
        onSucces();
        onFermer();
      } catch {
        toast.error("Dépôt non confirmé. Consultez l’historique avant de recommencer.");
      }
    });
  }

  const activer =
    !!apercu &&
    apercu.total > 0 &&
    !chargement &&
    !enCours &&
    !erreur &&
    (!apercu.parSms || confirmation) &&
    (!(selection.mode === "filtres" || apercu.parentsSelectionnes > 30) || confirmationDiffusion);

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(v) => {
        if (!v) terminer();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] gap-0 overflow-y-auto rounded-2xl border border-border p-0 sm:max-w-[880px]">
        <DialogHeader className="border-b border-border bg-card px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Users className="size-5 text-succes" /> Notification à une sélection de parents
          </DialogTitle>
          <DialogDescription>
            {nombreSelectionnes.toLocaleString("fr-FR")} parent(s) ciblé(s){" "}
            {selection.mode === "filtres"
              ? "dans tous les résultats filtrés (toutes les pages)"
              : "dans votre sélection"}
            . Le nombre exact, les doublons et le coût sont vérifiés avant l’envoi.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 px-5 py-4 sm:grid-cols-2">
          <section className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="modele-parent-groupe" className="text-xs font-semibold text-foreground">
                Modèle de message
              </label>
              <select
                id="modele-parent-groupe"
                defaultValue=""
                onChange={(e) => {
                  const modele = MODELES_PARENTS.find((m) => m.id === e.target.value);
                  if (modele) {
                    setTitre(modele.titre);
                    setCorps(modele.corps);
                  }
                  invalider();
                }}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="">Rédiger un message personnalisé</option>
                {MODELES_PARENTS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">Canal d’envoi</p>
              <div className="grid grid-cols-2 gap-2">
                {CANAUX.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCanal(c.id);
                      invalider();
                    }}
                    aria-pressed={canal === c.id}
                    className={
                      "flex min-h-12 flex-col justify-center gap-0.5 rounded-xl border px-3 py-2 text-left text-xs " +
                      (canal === c.id ? "border-succes-trait bg-succes-doux text-succes" : "border-border")
                    }
                  >
                    <span className="flex items-center justify-between font-semibold">
                      {c.libelle}
                      {canal === c.id && <Check className="size-3.5" />}
                    </span>
                    <span className="text-xs text-muted-foreground">{c.detail}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-emerald-700"
                checked={planifier}
                onChange={(e) => {
                  setPlanifier(e.target.checked);
                  invalider();
                }}
              />
              <CalendarClock className="size-4 text-muted-foreground" /> Programmer pour plus tard
            </label>
            {planifier && (
              <div className="space-y-1.5">
                <label htmlFor="horaire-envoi-parent" className="text-xs font-semibold">
                  Date et heure souhaitées
                </label>
                <Input
                  id="horaire-envoi-parent"
                  type="datetime-local"
                  value={dateLocale}
                  onChange={(e) => {
                    setDateLocale(e.target.value);
                    invalider();
                  }}
                  className="h-10"
                />
                <p className="text-xs leading-snug text-alerte">
                  L’expédition intervient au prochain passage du traitement après cette date (traitement automatique
                  quotidien, horaire non garanti).
                </p>
              </div>
            )}
          </section>
          <section className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="objet-groupe" className="text-xs font-semibold">
                Objet *
              </label>
              <Input
                id="objet-groupe"
                value={titre}
                onChange={(e) => {
                  setTitre(e.target.value);
                  invalider();
                }}
                maxLength={80}
                placeholder="Objet de la communication"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="message-groupe" className="flex justify-between text-xs font-semibold">
                Message * <span className="font-normal text-muted-foreground">{corps.length}/600</span>
              </label>
              <Textarea
                id="message-groupe"
                value={corps}
                onChange={(e) => {
                  setCorps(e.target.value);
                  invalider();
                }}
                maxLength={600}
                rows={4}
                className="min-h-28"
                placeholder="Message à adresser aux parents sélectionnés"
              />
            </div>
            <div aria-live="polite" className="space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs">
              {!valide ? (
                <span className="text-muted-foreground">Remplissez le message et le canal pour obtenir l’aperçu.</span>
              ) : chargement || (!apercu && !erreur) ? (
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" /> Calcul du devis…
                </span>
              ) : erreur ? (
                <span role="alert" className="flex items-start gap-2 text-danger">
                  <AlertTriangle className="size-4 shrink-0" />
                  {erreur}
                </span>
              ) : (
                apercu && (
                  <div className="space-y-2">
                    <div className="flex justify-between gap-2">
                      <strong>{apercu.parentsJoignables} parent(s) joignable(s)</strong>
                      <strong className="text-succes">{apercu.coutFcfa.toLocaleString("fr-FR")} FCFA</strong>
                    </div>
                    <p>
                      {apercu.total.toLocaleString("fr-FR")} notification(s) pour{" "}
                      {apercu.parentsSelectionnes.toLocaleString("fr-FR")} fiche(s) : {apercu.parPush} PUSH ·{" "}
                      {apercu.parSms} SMS · {apercu.dansApplication} interne
                    </p>
                    {apercu.nonJoignables > 0 && (
                      <p className="text-alerte">{apercu.nonJoignables} parent(s) sans canal disponible.</p>
                    )}
                    {apercu.numerosPartages > 0 && (
                      <p className="text-alerte">
                        {apercu.numerosPartages} parent(s) portent un numéro partagé ; vérifiez la liste avant l’envoi.
                      </p>
                    )}
                    {apercu.smsDedoublonnes > 0 && (
                      <p className="text-succes">
                        {apercu.smsDedoublonnes} SMS en double supprimé(s) pour les numéros partagés.
                      </p>
                    )}
                    {(selection.mode === "filtres" || apercu.parentsSelectionnes > 30) && (
                      <label className="flex items-start gap-2 border-t border-border pt-2">
                        <input
                          type="checkbox"
                          checked={confirmationDiffusion}
                          onChange={(e) => setConfirmationDiffusion(e.target.checked)}
                          className="mt-0.5 size-4 shrink-0 accent-emerald-700"
                        />
                        <span>
                          Je confirme cette communication à{" "}
                          <strong>{apercu.parentsSelectionnes.toLocaleString("fr-FR")} parents</strong> (toutes les
                          pages sélectionnées).
                        </span>
                      </label>
                    )}
                    {apercu.parSms > 0 && (
                      <label className="flex items-start gap-2 border-t border-border pt-2">
                        <input
                          type="checkbox"
                          checked={confirmation}
                          onChange={(e) => setConfirmation(e.target.checked)}
                          className="mt-0.5 size-4 shrink-0 accent-emerald-700"
                        />
                        <span>
                          Je confirme un maximum de <strong>{apercu.coutFcfa.toLocaleString("fr-FR")} FCFA</strong> pour{" "}
                          {apercu.parSms} SMS.
                        </span>
                      </label>
                    )}
                  </div>
                )
              )}
            </div>
          </section>
        </div>
        <DialogFooter className="!m-0 !flex-row !justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <Button type="button" variant="outline" onClick={terminer} disabled={enCours}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={envoyer}
            disabled={!activer}
            className="bg-succes text-primary-foreground hover:bg-succes/90"
          >
            {planifier ? <CalendarClock className="size-4" /> : <Send className="size-4" />}
            {enCours ? "Enregistrement…" : planifier ? "Programmer" : "Envoyer aux parents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
