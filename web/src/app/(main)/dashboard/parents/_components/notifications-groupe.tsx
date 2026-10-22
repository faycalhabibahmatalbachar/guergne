"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, Check, CheckCheck, LoaderCircle, MessageSquare, Send, Smartphone, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apercuNotificationsGroupe, envoyerNotificationsGroupe, type DevisGroupe } from "../actions-groupe";

export const MODELES_PARENTS = [
  { id: "reunion", nom: "Réunion parents", titre: "Réunion avec les familles", corps: "Chers parents, nous vous invitons à une réunion d’information au sein de l’établissement. Merci de prendre contact avec le secrétariat pour les modalités." },
  { id: "convocation", nom: "Convocation individuelle", titre: "Convocation à l’établissement", corps: "Madame, Monsieur, la direction souhaite vous rencontrer concernant le suivi scolaire de votre enfant. Merci de contacter le secrétariat pour convenir d’un rendez-vous." },
  { id: "documents", nom: "Documents à compléter", titre: "Dossier administratif à compléter", corps: "Madame, Monsieur, des informations restent à compléter dans le dossier scolaire de votre enfant. Merci de prendre contact avec le secrétariat." },
  { id: "information", nom: "Information générale", titre: "Information aux familles", corps: "Chers parents, nous souhaitons vous communiquer une information concernant la vie scolaire. Merci de contacter le secrétariat si vous avez des questions." },
  { id: "rappel", nom: "Relance de rendez-vous", titre: "Rappel de rendez-vous", corps: "Madame, Monsieur, nous vous rappelons votre rendez-vous avec l’établissement. En cas d’indisponibilité, merci d’informer le secrétariat." },
] as const;

type Canal = "AUTO" | "APP" | "SMS" | "APP_ET_SMS";
const CANAUX: { id: Canal; libelle: string; detail: string }[] = [
  { id: "AUTO", libelle: "Automatique", detail: "Politique de l’école" },
  { id: "APP", libelle: "Application", detail: "Gratuit" },
  { id: "SMS", libelle: "SMS", detail: "Consentement requis" },
  { id: "APP_ET_SMS", libelle: "App + SMS", detail: "Double canal" },
];

export function NotificationsGroupe({
  ids, ouvert, onFermer, onSucces,
}: {
  ids: string[];
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
  const [cle, setCle] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const programmeLe = planifier && dateLocale ? new Date(dateLocale).toISOString() : null;
  const signature = JSON.stringify([ids, titre, corps, canal, programmeLe]);
  const valide = titre.trim().length >= 3 && corps.trim().length >= 5 && ids.length > 0 && ids.length <= 30 &&
    (!planifier || (dateLocale && !!programmeLe));
  const apercu = devis?.signature === signature ? devis.valeur : null;

  useEffect(() => {
    if (!ouvert || !valide) return;
    let actif = true;
    const timeout = setTimeout(async () => {
      if (!actif) return;
      setChargement(true); setErreur("");
      try {
        const valeur = await apercuNotificationsGroupe({ ids, titre, corps, canal, programmation: programmeLe });
        if (actif) setDevis({ signature, valeur });
      } catch (e) {
        if (actif) setErreur(e instanceof Error ? e.message : "Impossible de vérifier les destinataires.");
      } finally {
        if (actif) setChargement(false);
      }
    }, 450);
    return () => { actif = false; clearTimeout(timeout); };
  }, [ouvert, valide, signature, ids, titre, corps, canal, programmeLe]);

  function invalider() {
    setDevis(null); setConfirmation(false); setErreur(""); setCle(null);
  }
  function terminer() {
    if (enCours) return;
    onFermer(); setTitre(""); setCorps(""); setCanal("AUTO");
    setPlanifier(false); setDateLocale(""); setDevis(null);
    setErreur(""); setConfirmation(false); setCle(null);
  }
  function envoyer() {
    if (!apercu || !valide || !apercu.total || enCours || chargement || erreur || (apercu.parSms > 0 && !confirmation)) return;
    const idempotence = cle ?? crypto.randomUUID();
    setCle(idempotence);
    demarrer(async () => {
      try {
        const r = await envoyerNotificationsGroupe({
          ids, titre, corps, canal, programmation: programmeLe,
          plafondCoutFcfa: apercu.coutFcfa,
          plafondNotifications: apercu.total,
          cleEnvoi: idempotence,
        });
        if (!r.ok) { setDevis(null); toast.error(r.message); return; }
        toast.success(r.message);
        onSucces();
        onFermer();
      } catch {
        toast.error("Dépôt non confirmé. Consultez l’historique avant de recommencer.");
      }
    });
  }

  const activer = !!apercu && apercu.total > 0 && !chargement && !enCours && !erreur &&
    (!apercu.parSms || confirmation);

  return (
    <Dialog open={ouvert} onOpenChange={v => { if (!v) terminer(); }}>
      <DialogContent className="max-h-[calc(100dvh-16px)] w-[calc(100%-16px)] gap-0 overflow-y-auto rounded-2xl border border-slate-200 p-0 sm:max-w-[880px] dark:border-slate-800">
        <DialogHeader className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-white px-5 py-4 pr-12 text-left dark:border-slate-800 dark:from-emerald-950/30 dark:to-slate-900">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold"><Users className="size-5 text-emerald-700" /> Notification à une sélection de parents</DialogTitle>
          <DialogDescription>{ids.length} parent{ids.length > 1 ? "s" : ""} sélectionné{ids.length > 1 ? "s" : ""}. Limite de 30 parents par opération. Aucun SMS n’est envoyé sans validation du coût.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 px-5 py-4 sm:grid-cols-2">
          <section className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="modele-parent-groupe" className="text-xs font-semibold text-slate-800 dark:text-white">Modèle de message</label>
              <select id="modele-parent-groupe" defaultValue="" onChange={e => {
                const modele = MODELES_PARENTS.find(m => m.id === e.target.value);
                if (modele) {setTitre(modele.titre);setCorps(modele.corps);} invalider();
              }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                <option value="">Rédiger un message personnalisé</option>
                {MODELES_PARENTS.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-white">Canal d’envoi</p>
              <div className="grid grid-cols-2 gap-2">
                {CANAUX.map(c => <button key={c.id} type="button" onClick={() => {setCanal(c.id);invalider();}} aria-pressed={canal === c.id}
                  className={"flex min-h-12 flex-col justify-center gap-0.5 rounded-xl border px-3 py-2 text-left text-xs " + (canal === c.id ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-300" : "border-slate-200 dark:border-slate-700")}>
                  <span className="flex items-center justify-between font-semibold">{c.libelle}{canal === c.id && <Check className="size-3.5" />}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{c.detail}</span>
                </button>)}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800">
              <input type="checkbox" className="size-4 accent-emerald-700" checked={planifier} onChange={e => {setPlanifier(e.target.checked);invalider();}} />
              <CalendarClock className="size-4 text-slate-500" /> Programmer pour plus tard
            </label>
            {planifier && <div className="space-y-1.5">
              <label htmlFor="horaire-envoi-parent" className="text-xs font-semibold">Date et heure souhaitées</label>
              <Input id="horaire-envoi-parent" type="datetime-local" value={dateLocale} onChange={e => {setDateLocale(e.target.value);invalider();}} className="h-10" />
              <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">L’expédition intervient au prochain passage du traitement après cette date (traitement automatique quotidien, horaire non garanti).</p>
            </div>}
          </section>
          <section className="space-y-3">
            <div className="space-y-1.5"><label htmlFor="objet-groupe" className="text-xs font-semibold">Objet *</label>
              <Input id="objet-groupe" value={titre} onChange={e=>{setTitre(e.target.value);invalider();}} maxLength={80} placeholder="Objet de la communication" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="message-groupe" className="flex justify-between text-xs font-semibold">Message * <span className="font-normal text-slate-500">{corps.length}/600</span></label>
              <Textarea id="message-groupe" value={corps} onChange={e=>{setCorps(e.target.value);invalider();}} maxLength={600} rows={4} className="min-h-28" placeholder="Message à adresser aux parents sélectionnés" />
            </div>
            <div aria-live="polite" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800">
              {!valide ? <span className="text-slate-500">Remplissez le message et le canal pour obtenir l’aperçu.</span>
              : chargement || (!apercu && !erreur) ? <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Calcul du devis…</span>
              : erreur ? <span role="alert" className="flex items-start gap-2 text-red-700 dark:text-red-300"><AlertTriangle className="size-4 shrink-0" />{erreur}</span>
              : apercu && <div className="space-y-2">
                  <div className="flex justify-between gap-2"><strong>{apercu.parentsJoignables} parent(s) joignable(s)</strong><strong className="text-emerald-700 dark:text-emerald-300">{apercu.coutFcfa.toLocaleString("fr-FR")} FCFA</strong></div>
                  <p>{apercu.total} notification(s) : {apercu.parPush} PUSH · {apercu.parSms} SMS · {apercu.dansApplication} interne</p>
                  {apercu.nonJoignables > 0 && <p className="text-amber-700">{apercu.nonJoignables} parent(s) sans canal disponible.</p>}
                  {apercu.numerosPartages > 0 && <p className="text-amber-700">{apercu.numerosPartages} numéro(s) partagé(s) : vérifiez les destinataires avant d’envoyer.</p>}
                  {apercu.parSms > 0 && <label className="flex items-start gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                    <input type="checkbox" checked={confirmation} onChange={e => setConfirmation(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-emerald-700" />
                    <span>Je confirme un maximum de <strong>{apercu.coutFcfa.toLocaleString("fr-FR")} FCFA</strong> pour {apercu.parSms} SMS.</span>
                  </label>}
                </div>}
            </div>
          </section>
        </div>
        <DialogFooter className="!m-0 !flex-row !justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Button type="button" variant="outline" onClick={terminer} disabled={enCours}>Annuler</Button>
          <Button type="button" onClick={envoyer} disabled={!activer} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800">
            {planifier ? <CalendarClock className="size-4" /> : <Send className="size-4" />}
            {enCours ? "Enregistrement…" : planifier ? "Programmer" : "Envoyer aux parents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
