"use client";

import { type FormEvent, type ReactNode, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BellRing, CheckCircle2, Clock3, FileText, Megaphone,
  MessageSquareText, Pin, Plus, RefreshCw, Search, Send, Users, Wallet, XCircle,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { COUT_SMS_FCFA } from "@/lib/tarifs";
import { statTile, statusBadge } from "@/vendor/gentelella-v4/markup.js";
import type { EtatFile, LigneAnnonce, LigneMessage, LigneNotification } from "@/server/domain/communication";
import {
  basculerAnnonce, envoyerMessage, epinglerAnnonce, previsualiserAnnonce,
  previsualiserMessageCible, publierAnnonce, traiterFileNotifications,
} from "../actions";
import type { ApercuDiffusion, Resultat } from "../actions";

interface Option { id: string; libelle: string; }
type Filtre = { value: string; label: string };
type TypeFormulaire = "annonce" | "message" | null;
const CIBLE: Record<string, string> = {
  TOUS: "Tout l’établissement", NIVEAU: "Un niveau", CLASSE: "Une classe", ELEVE: "Élèves choisis",
};
const TYPE_NOTIFICATION: Record<string, string> = {
  ABSENCE: "Absence", RETARD: "Retard", NOTE_PUBLIEE: "Note publiée",
  BULLETIN_PUBLIE: "Bulletin", INCIDENT: "Incident", SANCTION: "Sanction",
  ECHEANCE_PAIEMENT: "Échéance", PAIEMENT_RECU: "Paiement", ANNONCE: "Annonce",
  CONVOCATION: "Convocation", CHANGEMENT_STATUT: "Changement de statut",
  DEVOIR: "Devoir", AUTRE: "Autre",
};
const ICONES = {
  annonces: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a2 2 0 0 0 2 2h2l4 4v-4h4l6 3V6l-6 3H5a2 2 0 0 0-2 2Z"/><path d="m7 15 2 5"/></svg>',
  messages: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z"/></svg>',
  epinglees: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5-4 1-4 4-1 4-5-5 4-1 4-4 1-4Z"/><path d="m2 22 7-7"/></svg>',
  parents: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
};
const normaliser = (texte: string) => texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const nombreFr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const dateFr = (v: string | null) => v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const dateHeureFr = (v: string | null) => v ? new Date(v).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function useListe<T>(donnees: T[], texte: (ligne: T) => string, statut: (ligne: T) => string) {
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("TOUS");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(10);
  const filtrees = useMemo(() => {
    const q = normaliser(recherche.trim());
    return donnees.filter((ligne) => (!q || normaliser(texte(ligne)).includes(q)) && (filtre === "TOUS" || statut(ligne) === filtre));
  }, [donnees, recherche, filtre, texte, statut]);
  const pages = Math.max(1, Math.ceil(filtrees.length / taille));
  const pageActive = Math.min(page, pages);
  return {
    recherche,
    setRecherche: (v: string) => { setRecherche(v); setPage(1); },
    filtre,
    setFiltre: (v: string) => { setFiltre(v); setPage(1); },
    taille,
    setTaille: (v: number) => { setTaille(v); setPage(1); },
    page: pageActive,
    setPage,
    pages,
    total: filtrees.length,
    lignes: filtrees.slice((pageActive - 1) * taille, pageActive * taille),
  };
}

function BarreListe(p: {
  recherche: string; setRecherche: (v: string) => void; filtre: string;
  setFiltre: (v: string) => void; options: Filtre[]; placeholder: string;
}) {
  return <div className="communication-toolbar">
    <div className="communication-toolbar-group">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input className="form-control pl-9" type="search" aria-label={p.placeholder} placeholder={p.placeholder}
          value={p.recherche} onChange={(e) => p.setRecherche(e.target.value)} style={{ height: 38, borderRadius: 6 }} />
      </div>
      <select className="form-control" aria-label="Filtrer les résultats" value={p.filtre}
        onChange={(e) => p.setFiltre(e.target.value)} style={{ width: 190, height: 38, borderRadius: 6 }}>
        {p.options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
    </div>
  </div>;
}

function Pagination(p: {
  total: number; page: number; pages: number; taille: number;
  setPage: (n: number) => void; setTaille: (n: number) => void;
}) {
  const debut = p.total === 0 ? 0 : (p.page - 1) * p.taille + 1;
  const fin = Math.min(p.total, p.page * p.taille);
  return <div className="communication-pagination">
    <span>{debut}–{fin} sur {nombreFr(p.total)}</span>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2"><span>Par page</span>
        <select className="form-control" aria-label="Nombre de lignes par page" value={p.taille}
          onChange={(e) => p.setTaille(Number(e.target.value))} style={{ width: 76, height: 32 }}>
          <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
        </select>
      </label>
      <div className="flex items-center gap-1">
        <button className="dt-paging-button" type="button" aria-label="Page précédente" disabled={p.page <= 1} onClick={() => p.setPage(p.page - 1)}>‹</button>
        <span className="px-2 tabular-nums">{p.page} / {p.pages}</span>
        <button className="dt-paging-button" type="button" aria-label="Page suivante" disabled={p.page >= p.pages} onClick={() => p.setPage(p.page + 1)}>›</button>
      </div>
    </div>
  </div>;
}

function Vide(p: { icone: ReactNode; titre: string; detail: string }) {
  return <div className="communication-empty">
    <span className="communication-empty-icon">{p.icone}</span>
    <p className="font-semibold text-sm">{p.titre}</p>
    <p className="max-w-md text-sm">{p.detail}</p>
  </div>;
}

function BadgeGentelella({ texte, couleur = "gray" }: { texte: string; couleur?: "green" | "blue" | "yellow" | "red" | "gray" }) {
  return <span dangerouslySetInnerHTML={{ __html: statusBadge(texte, couleur) }} />;
}

function CarteApercu(p: {
  apercu: ApercuDiffusion;
  confirmerDiffusion: boolean;
  setConfirmerDiffusion: (v: boolean) => void;
  confirmerCout: boolean;
  setConfirmerCout: (v: boolean) => void;
  identifiant: string;
}) {
  const a = p.apercu;
  return <section className="communication-preview" aria-label="Aperçu de la diffusion">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold text-sm">Aperçu de la diffusion</h3>
        <p className="communication-secondary mt-1">Politique actuelle : {a.politique.replaceAll("_", " ").toLocaleLowerCase("fr-FR")}</p>
      </div>
      <Badge variant={a.total > 0 ? "secondary" : "outline"}>{nombreFr(a.total)} notification(s)</Badge>
    </div>
    <div className="communication-preview-grid">
      <div><span>Push</span><strong>{nombreFr(a.parPush)}</strong></div>
      <div><span>SMS</span><strong>{nombreFr(a.parSms)}</strong></div>
      <div><span>Dans l’application</span><strong>{nombreFr(a.dansApplication)}</strong></div>
      <div><span>Sans canal</span><strong>{nombreFr(a.sansCanal)}</strong></div>
    </div>
    {a.parSms > 0
      ? <p className="communication-cost-warning"><Wallet className="size-4 shrink-0" aria-hidden />
          <span>{nombreFr(a.segments)} segment(s) SMS estimé(s), soit <strong>{nombreFr(a.coutFcfa)} F</strong> à {COUT_SMS_FCFA} F par segment. Le coût final dépend du texte transmis et du fournisseur.</span>
        </p>
      : null}
    {a.total === 0
      ? <p className="communication-preview-note">Aucune alerte immédiate ne sera déposée avec les canaux actuellement disponibles. Vérifiez la politique, le consentement SMS et les comptes destinataires.</p>
      : null}
    <label className="form-check">
      <input type="checkbox" checked={p.confirmerDiffusion} onChange={(e) => p.setConfirmerDiffusion(e.target.checked)} />
      <span>Je confirme l’audience et les canaux ci-dessus.</span>
    </label>
    {a.parSms > 0 ? <label className="form-check">
      <input type="checkbox" checked={p.confirmerCout} onChange={(e) => p.setConfirmerCout(e.target.checked)} />
      <span>Je confirme le coût SMS estimé de {nombreFr(a.coutFcfa)} F.</span>
    </label> : null}
  </section>;
}

export function Communication(p: {
  anneeId: string;
  anneeLibelle: string;
  niveaux: Option[];
  classes: Option[];
  eleves: Array<{ id: string; nom: string; prenom: string; classe: string }>;
  tuteurs: Array<{ utilisateurId: string; nom: string; prenom: string; elevesIds: string[] }>;
  annonces: LigneAnnonce[];
  messages: LigneMessage[];
  notifications: LigneNotification[];
  file: EtatFile | null;
  peutPublierAnnonce: boolean;
  peutVoirAnnonces: boolean;
  peutVoirMessages: boolean;
  peutEnvoyerMessage: boolean;
  peutTraiterFile: boolean;
  messageRequiresStudent: boolean;
}) {
  const router = useRouter();
  const [enCours, transition] = useTransition();
  const [dialogue, setDialogue] = useState<"annonce" | "message" | null>(null);
  const [erreursAnnonce, setErreursAnnonce] = useState<Record<string, string>>({});
  const [erreursMessage, setErreursMessage] = useState<Record<string, string>>({});
  const [cible, setCible] = useState("TOUS");
  const [elevesChoisis, setElevesChoisis] = useState<string[]>([]);
  const [rechercheEleve, setRechercheEleve] = useState("");
  const [destinataireId, setDestinataireId] = useState("");
  const [eleveMessageId, setEleveMessageId] = useState("");
  const [apercuAnnonce, setApercuAnnonce] = useState<ApercuDiffusion | null>(null);
  const [apercuMessage, setApercuMessage] = useState<ApercuDiffusion | null>(null);
  const [confirmerAnnonce, setConfirmerAnnonce] = useState(false);
  const [confirmerCoutAnnonce, setConfirmerCoutAnnonce] = useState(false);
  const [confirmerMessage, setConfirmerMessage] = useState(false);
  const [confirmerCoutMessage, setConfirmerCoutMessage] = useState(false);
  const formulaireAnnonce = useRef<HTMLFormElement>(null);
  const formulaireMessage = useRef<HTMLFormElement>(null);

  const a = useListe(p.annonces,
    (x) => [x.titre, x.contenu, CIBLE[x.cible] ?? x.cible, x.classeLibelle ?? "", x.niveauLibelle ?? ""].join(" "),
    (x) => x.publiee ? "PUBLIEE" : "RETIREE");
  const m = useListe(p.messages,
    (x) => [x.objet, x.contenu, x.destinataire ?? "", x.elevePrenom ?? "", x.eleveNom ?? ""].join(" "),
    (x) => x.lu ? "LU" : "NON_LU");
  const n = useListe(p.notifications,
    (x) => [x.titre, x.corps, x.telephone ?? "", TYPE_NOTIFICATION[x.type] ?? x.type, x.canal].join(" "),
    (x) => x.statut);

  const parentChoisi = p.tuteurs.find((x) => x.utilisateurId === destinataireId);
  const elevesDuParent = parentChoisi ? p.eleves.filter((x) => parentChoisi.elevesIds.includes(x.id)) : [];
  const filtresA = [
    { value: "TOUS", label: "Toutes les annonces" },
    { value: "PUBLIEE", label: "Publiées" },
    { value: "RETIREE", label: "Retirées" },
  ];
  const filtresM = [
    { value: "TOUS", label: "Tous les messages" },
    { value: "NON_LU", label: "Non lus" },
    { value: "LU", label: "Lus" },
  ];
  const filtresN = [
    { value: "TOUS", label: "Tous les états" },
    { value: "EN_ATTENTE", label: "En attente d’envoi" },
    { value: "ENVOYE", label: "Envoyées" },
    { value: "ECHOUE", label: "En échec" },
    { value: "LU", label: "Lues" },
  ];

  function effacerApercuAnnonce() {
    setApercuAnnonce(null);
    setConfirmerAnnonce(false);
    setConfirmerCoutAnnonce(false);
  }

  function effacerApercuMessage() {
    setApercuMessage(null);
    setConfirmerMessage(false);
    setConfirmerCoutMessage(false);
  }

  function agir(action: () => Promise<Resultat>, formulaire: TypeFormulaire = null) {
    if (formulaire === "annonce") setErreursAnnonce({});
    if (formulaire === "message") setErreursMessage({});
    transition(async () => {
      try {
        const resultat = await action();
        if (resultat.ok) {
          toast.success(resultat.message ?? "Enregistré.");
          setDialogue(null);
          setElevesChoisis([]);
          setRechercheEleve("");
          setDestinataireId("");
          setEleveMessageId("");
          effacerApercuAnnonce();
          effacerApercuMessage();
          router.refresh();
        } else {
          if (formulaire === "annonce") setErreursAnnonce(resultat.erreurs ?? {});
          if (formulaire === "message") setErreursMessage(resultat.erreurs ?? {});
          toast.error(resultat.message ?? Object.values(resultat.erreurs ?? {})[0] ?? "Échec.");
          if (resultat.message?.includes("Recalculez") || resultat.message?.includes("Aucun destinataire")) {
            if (formulaire === "annonce") effacerApercuAnnonce();
            if (formulaire === "message") effacerApercuMessage();
          }
        }
      } catch {
        toast.error("La requête a échoué. Réessayez.");
      }
    });
  }

  function calculerApercuAnnonce() {
    const form = formulaireAnnonce.current;
    if (!form) return;
    const fd = new FormData(form);
    const envoyerPush = fd.get("envoyerPush") === "on";
    if (!envoyerPush) {
      effacerApercuAnnonce();
      toast.info("La publication se fera sans notification immédiate.");
      return;
    }
    transition(async () => {
      const resultat = await previsualiserAnnonce({
        anneeId: p.anneeId,
        titre: String(fd.get("titre") ?? ""),
        contenu: String(fd.get("contenu") ?? ""),
        cible,
        niveauId: String(fd.get("niveauId") ?? "") || null,
        classeId: String(fd.get("classeId") ?? "") || null,
        elevesIds: elevesChoisis,
        epinglee: fd.get("epinglee") === "on",
        envoyerPush: true,
        expireLe: String(fd.get("expireLe") ?? ""),
      });
      if (resultat.ok && resultat.apercu) {
        setApercuAnnonce(resultat.apercu);
        setConfirmerAnnonce(false);
        setConfirmerCoutAnnonce(false);
        setErreursAnnonce({});
      } else {
        setApercuAnnonce(null);
        setErreursAnnonce(resultat.erreurs ?? {});
        toast.error(resultat.message ?? Object.values(resultat.erreurs ?? {})[0] ?? "L’aperçu a échoué.");
      }
    });
  }

  function calculerApercuMessage() {
    const form = formulaireMessage.current;
    if (!form) return;
    const fd = new FormData(form);
    transition(async () => {
      const resultat = await previsualiserMessageCible({
        anneeId: p.anneeId,
        destinataireId: String(fd.get("destinataireId") ?? ""),
        eleveId: String(fd.get("eleveId") ?? "") || null,
        objet: String(fd.get("objet") ?? ""),
        contenu: String(fd.get("contenu") ?? ""),
      });
      if (resultat.ok && resultat.apercu) {
        setApercuMessage(resultat.apercu);
        setConfirmerMessage(false);
        setConfirmerCoutMessage(false);
        setErreursMessage({});
      } else {
        setApercuMessage(null);
        setErreursMessage(resultat.erreurs ?? {});
        toast.error(resultat.message ?? Object.values(resultat.erreurs ?? {})[0] ?? "L’aperçu a échoué.");
      }
    });
  }

  function soumettreAnnonce(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const envoyerPush = fd.get("envoyerPush") === "on";
    if (envoyerPush && !apercuAnnonce) {
      toast.error("Calculez d’abord l’aperçu de l’audience et du coût.");
      return;
    }
    if (envoyerPush && !confirmerAnnonce) {
      toast.error("Confirmez la population et les canaux de l’aperçu.");
      return;
    }
    if (envoyerPush && apercuAnnonce && apercuAnnonce.parSms > 0 && !confirmerCoutAnnonce) {
      toast.error("Confirmez le coût SMS avant de publier.");
      return;
    }
    agir(() => publierAnnonce({
      anneeId: p.anneeId,
      titre: String(fd.get("titre") ?? ""),
      contenu: String(fd.get("contenu") ?? ""),
      cible,
      niveauId: String(fd.get("niveauId") ?? "") || null,
      classeId: String(fd.get("classeId") ?? "") || null,
      elevesIds: elevesChoisis,
      epinglee: fd.get("epinglee") === "on",
      envoyerPush,
      expireLe: String(fd.get("expireLe") ?? ""),
      confirmerDiffusion: confirmerAnnonce,
      confirmerCout: confirmerCoutAnnonce,
      plafondNotifications: apercuAnnonce?.total,
      plafondCoutFcfa: apercuAnnonce?.coutFcfa,
    }), "annonce");
  }

  function soumettreMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    if (!apercuMessage) {
      toast.error("Calculez d’abord l’aperçu du canal et du coût.");
      return;
    }
    if (!confirmerMessage) {
      toast.error("Confirmez le destinataire et les canaux de l’aperçu.");
      return;
    }
    if (apercuMessage.parSms > 0 && !confirmerCoutMessage) {
      toast.error("Confirmez le coût SMS avant d’enregistrer le message.");
      return;
    }
    agir(() => envoyerMessage({
      anneeId: p.anneeId,
      destinataireId: String(fd.get("destinataireId") ?? ""),
      eleveId: String(fd.get("eleveId") ?? "") || null,
      objet: String(fd.get("objet") ?? ""),
      contenu: String(fd.get("contenu") ?? ""),
      confirmerDiffusion: confirmerMessage,
      confirmerCout: confirmerCoutMessage,
      plafondNotifications: apercuMessage.total,
      plafondCoutFcfa: apercuMessage.coutFcfa,
    }), "message");
  }

  const ongletDefaut = p.peutVoirAnnonces ? "annonces" : p.peutVoirMessages ? "messages" : "journal";

  return <div className="communication-page min-w-0 space-y-6 pb-6">
    <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 xl:flex-row xl:items-end xl:justify-between dark:border-border">
      <div className="flex min-w-0 items-start gap-3">
        <span className="communication-kpi-icon mt-1"><MessageSquareText className="size-5" aria-hidden /></span>
        <div>
          <h1 className="text-[29px] font-bold leading-tight tracking-tight text-slate-950 dark:text-foreground sm:text-[34px]">Communication</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-muted-foreground">{p.anneeLibelle} · Annonces, messages et suivi des envois</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {p.peutEnvoyerMessage ? <Button size="sm" variant="outline" className="h-10 rounded-lg" onClick={() => {
          setErreursMessage({});
          effacerApercuMessage();
          setDestinataireId(p.tuteurs[0]?.utilisateurId ?? "");
          setEleveMessageId("");
          setDialogue("message");
        }}><Send aria-hidden /> Message ciblé</Button> : null}
        {p.peutPublierAnnonce ? <Button size="sm" className="h-10 rounded-lg" onClick={() => {
          setErreursAnnonce({});
          effacerApercuAnnonce();
          setDialogue("annonce");
        }}><Plus aria-hidden /> Nouvelle annonce</Button> : null}
      </div>
    </header>

    <section className="communication-stats" aria-label="Indicateurs réels">
      {p.peutVoirAnnonces ? <div className="communication-stat-tile" dangerouslySetInnerHTML={{ __html: statTile({
        label: "Annonces publiées",
        value: nombreFr(p.annonces.filter((x) => x.publiee).length),
        color: "teal",
        iconHtml: ICONES.annonces,
        subtext: "sur " + nombreFr(p.annonces.length) + " annonces chargées",
      }) }} /> : null}
      {p.peutVoirMessages ? <div className="communication-stat-tile" dangerouslySetInnerHTML={{ __html: statTile({
        label: "Messages",
        value: nombreFr(p.messages.length),
        color: "blue",
        iconHtml: ICONES.messages,
        subtext: nombreFr(p.messages.filter((x) => !x.lu).length) + " non lus parmi les résultats chargés",
      }) }} /> : null}
      {p.peutVoirAnnonces ? <div className="communication-stat-tile" dangerouslySetInnerHTML={{ __html: statTile({
        label: "Annonces épinglées",
        value: nombreFr(p.annonces.filter((x) => x.epinglee).length),
        color: "purple",
        iconHtml: ICONES.epinglees,
        subtext: "en tête de liste côté familles",
      }) }} /> : null}
      {p.peutEnvoyerMessage ? <div className="communication-stat-tile" dangerouslySetInnerHTML={{ __html: statTile({
        label: "Parents disponibles",
        value: nombreFr(p.tuteurs.length),
        color: "green",
        iconHtml: ICONES.parents,
        subtext: p.messageRequiresStudent ? "liés aux classes de l’enseignant" : "avec compte et élève inscrit",
      }) }} /> : null}
    </section>

    {p.file && p.peutTraiterFile ? <section className="communication-panel" aria-labelledby="queue-title">
      <div className="communication-toolbar">
        <div>
          <h2 id="queue-title" className="font-semibold text-base">File d’expédition</h2>
          <p className="communication-secondary mt-1">Seuls les SMS et push sortants occupent cette file ; les notifications internes restent dans l’application.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={enCours || p.file.enAttente === 0} className="rounded-lg"><RefreshCw aria-hidden /> Traiter un lot</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Traiter jusqu’à {Math.min(200, p.file.enAttente)} notification(s) ?</AlertDialogTitle>
              <AlertDialogDescription asChild><div className="space-y-2 text-sm">
                <p>La file sortante contient {nombreFr(p.file.enAttente)} notification(s), dont {nombreFr(p.file.pushEnAttente)} en push et {nombreFr(p.file.smsEnAttente)} en SMS.</p>
                <p>Un traitement réserve les lignes pour éviter qu’un cron et un clic manuel n’envoient la même notification en parallèle.</p>
                <p>Estimation de toute la file SMS : {nombreFr(p.file.smsSegmentsEstimes)} segment(s), soit {nombreFr(p.file.coutSmsEstime)} F à {COUT_SMS_FCFA} F par segment. Le montant final dépend du texte expédié.</p>
              </div></AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => agir(() => traiterFileNotifications())}>Traiter le lot</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-200/70 sm:grid-cols-3 xl:grid-cols-5 dark:bg-border">
        {[
          { label: "En attente", value: p.file.enAttente, Icon: Clock3, warning: p.file.enAttente > 0 },
          { label: "Push en attente", value: p.file.pushEnAttente, Icon: BellRing, warning: false },
          { label: "SMS en attente", value: p.file.smsEnAttente, Icon: MessageSquareText, warning: false },
          { label: "Envoyées", value: p.file.envoyees, Icon: CheckCircle2, warning: false },
          { label: "Échecs définitifs", value: p.file.echouees, Icon: XCircle, warning: p.file.echouees > 0 },
        ].map((x) => <div key={x.label} className="bg-white p-4 dark:bg-card">
          <div className="flex items-center justify-between gap-2"><p className="communication-kpi-label">{x.label}</p><x.Icon className={"size-4 " + (x.warning ? "text-amber-600" : "text-muted-foreground")} aria-hidden /></div>
          <p className="communication-kpi-value">{nombreFr(x.value)}</p>
        </div>)}
      </div>
      <div className="communication-chart-wrap">
        <div className="chart-header">
          <div className="chart-header-left"><h3 className="card-title">État des envois par canal</h3><p className="card-subtitle">Volumes réels historisés dans la base ; les notifications internes sont exclues.</p></div>
        </div>
        <div className="communication-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={p.file.parCanal.map((x) => ({
              canal: x.canal === "PUSH" ? "Push" : "SMS",
              enAttente: x.enAttente,
              envoyees: x.envoyees,
              echouees: x.echouees,
            }))} margin={{ top: 8, right: 10, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color-light)" />
              <XAxis dataKey="canal" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="enAttente" stackId="etat" name="En attente" fill="var(--yellow)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="envoyees" stackId="etat" name="Envoyées" fill="var(--green)" />
              <Bar dataKey="echouees" stackId="etat" name="Échecs" fill="var(--red)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {p.file.smsEnAttente > 0 ? <div className="flex items-start gap-3 border-t border-slate-200/80 p-4 text-sm dark:border-border">
        <Wallet className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <p>Coût estimé de la file SMS : <strong className="tabular-nums">{nombreFr(p.file.coutSmsEstime)} F</strong><span className="communication-secondary"> · calcul par segments, signature comprise.</span></p>
      </div> : null}
      {p.file.echouees > 0 ? <div className="flex items-start gap-2 border-t border-rose-200/80 p-4 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{nombreFr(p.file.echouees)} notification(s) en échec définitif.
      </div> : null}
    </section> : null}

    <Tabs defaultValue={ongletDefaut}>
      <div className="communication-toolbar mb-4 rounded-lg"><TabsList className="communication-tabs-list">
        {p.peutVoirAnnonces ? <TabsTrigger className="communication-tab-trigger" value="annonces">Annonces ({p.annonces.length})</TabsTrigger> : null}
        {p.peutVoirMessages ? <TabsTrigger className="communication-tab-trigger" value="messages">Messages ({p.messages.length})</TabsTrigger> : null}
        {p.peutTraiterFile ? <TabsTrigger className="communication-tab-trigger" value="journal">Journal ({p.notifications.length})</TabsTrigger> : null}
      </TabsList></div>

      {p.peutVoirAnnonces ? <TabsContent value="annonces" className="mt-0">
        <section className="communication-panel">
          <BarreListe recherche={a.recherche} setRecherche={a.setRecherche} filtre={a.filtre} setFiltre={a.setFiltre} options={filtresA} placeholder="Rechercher une annonce…" />
          {a.lignes.length === 0 ? <Vide icone={<FileText className="size-5" />} titre={p.annonces.length === 0 ? "Aucune annonce cette année" : "Aucun résultat"} detail={p.annonces.length === 0 ? "Les annonces publiées apparaîtront ici." : "Modifiez la recherche ou le filtre."} /> : <>
            <div className="overflow-x-auto"><Table className="communication-data-table">
              <TableHeader><TableRow><TableHead>Annonce</TableHead><TableHead>Destinataires</TableHead><TableHead>Publication</TableHead><TableHead>Diffusion</TableHead><TableHead>Lectures</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{a.lignes.map((x) => <TableRow key={x.id} className={x.publiee ? "" : "opacity-60"}>
                <TableCell className="max-w-sm"><div className="flex items-start gap-2">{x.epinglee ? <Pin className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-label="Épinglée" /> : null}<div className="min-w-0"><p className="font-semibold">{x.titre}</p><p className="communication-secondary line-clamp-2" title={x.contenu}>{x.contenu}</p></div></div></TableCell>
                <TableCell><span className="font-medium">{CIBLE[x.cible] ?? x.cible}</span>{x.classeLibelle || x.niveauLibelle ? <p className="communication-secondary">{[x.classeLibelle, x.niveauLibelle].filter(Boolean).join(" · ")}</p> : null}</TableCell>
                <TableCell><p>{dateFr(x.publierLe)}</p><p className="communication-secondary">{x.auteur ? "Par " + x.auteur : "Auteur non renseigné"}</p></TableCell>
                <TableCell>{x.envoyerPush ? <Badge variant="secondary">{nombreFr(x.nbNotifications)} notification(s) déposée(s)</Badge> : <span className="communication-secondary">Affichage seul</span>}</TableCell>
                <TableCell className="tabular-nums">{nombreFr(x.nbLectures)}</TableCell>
                <TableCell className="text-right"><div className="flex flex-wrap justify-end gap-1">
                  {p.peutPublierAnnonce ? <>
                    <Button size="sm" variant="ghost" className="rounded-md" disabled={enCours} onClick={() => agir(() => epinglerAnnonce(x.id, !x.epinglee))}><Pin aria-hidden />{x.epinglee ? "Désépingler" : "Épingler"}</Button>
                    <Button size="sm" variant="ghost" className="rounded-md" disabled={enCours} onClick={() => agir(() => basculerAnnonce(x.id, !x.publiee))}>{x.publiee ? "Retirer" : "Réactiver"}</Button>
                  </> : null}
                </div></TableCell>
              </TableRow>)}</TableBody>
            </Table></div>
            <Pagination total={a.total} page={a.page} pages={a.pages} taille={a.taille} setPage={a.setPage} setTaille={a.setTaille} />
          </>}
        </section>
        <p className="communication-secondary mt-2">Résultats limités aux {nombreFr(p.annonces.length)} annonces les plus récentes de l’année active.</p>
      </TabsContent> : null}

      {p.peutVoirMessages ? <TabsContent value="messages" className="mt-0">
        <section className="communication-panel">
          <BarreListe recherche={m.recherche} setRecherche={m.setRecherche} filtre={m.filtre} setFiltre={m.setFiltre} options={filtresM} placeholder="Rechercher un message, un parent, un élève…" />
          {m.lignes.length === 0 ? <Vide icone={<MessageSquareText className="size-5" />} titre={p.messages.length === 0 ? "Aucun message pour ce compte" : "Aucun résultat"} detail={p.messages.length === 0 ? "Les échanges associés au compte connecté apparaîtront ici." : "Modifiez la recherche ou le filtre d’état."} /> : <>
            <div className="overflow-x-auto"><Table className="communication-data-table">
              <TableHeader><TableRow><TableHead>Objet</TableHead><TableHead>Destinataire</TableHead><TableHead>Élève</TableHead><TableHead>Date</TableHead><TableHead>État</TableHead></TableRow></TableHeader>
              <TableBody>{m.lignes.map((x) => <TableRow key={x.id}>
                <TableCell className="max-w-sm"><p className="font-semibold">{x.objet}</p><p className="communication-secondary line-clamp-2">{x.contenu}</p></TableCell>
                <TableCell>{x.destinataire ?? "—"}</TableCell>
                <TableCell>{x.elevePrenom ? x.elevePrenom + " " + x.eleveNom : "—"}</TableCell>
                <TableCell className="tabular-nums">{dateHeureFr(x.creeLe)}</TableCell>
                <TableCell><Badge variant={x.lu ? "secondary" : "outline"}>{x.lu ? "Lu" : "Non lu"}</Badge></TableCell>
              </TableRow>)}</TableBody>
            </Table></div>
            <Pagination total={m.total} page={m.page} pages={m.pages} taille={m.taille} setPage={m.setPage} setTaille={m.setTaille} />
          </>}
        </section>
        <p className="communication-secondary mt-2">Échanges associés au compte connecté, limités aux {nombreFr(p.messages.length)} résultats les plus récents (100 au maximum).</p>
      </TabsContent> : null}

      {p.peutTraiterFile ? <TabsContent value="journal" className="mt-0">
        <section className="communication-panel">
          <BarreListe recherche={n.recherche} setRecherche={n.setRecherche} filtre={n.filtre} setFiltre={n.setFiltre} options={filtresN} placeholder="Rechercher par contenu, type ou numéro masqué…" />
          {n.lignes.length === 0 ? <Vide icone={<BellRing className="size-5" />} titre={p.notifications.length === 0 ? "Aucune notification récente" : "Aucun résultat"} detail={p.notifications.length === 0 ? "Le journal apparaîtra lors de la création de notifications." : "Modifiez la recherche ou le filtre d’état."} /> : <>
            <div className="overflow-x-auto"><Table className="communication-data-table">
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Canal</TableHead><TableHead>Notification</TableHead><TableHead>Destinataire</TableHead><TableHead>Créée</TableHead><TableHead>État</TableHead></TableRow></TableHeader>
              <TableBody>{n.lignes.map((x) => <TableRow key={x.id}>
                <TableCell><Badge variant="outline">{TYPE_NOTIFICATION[x.type] ?? x.type}</Badge></TableCell>
                <TableCell>{x.canal === "IN_APP" ? "Application" : x.canal}</TableCell>
                <TableCell className="max-w-sm"><p className="font-semibold">{x.titre}</p><p className="communication-secondary line-clamp-2">{x.corps}</p></TableCell>
                <TableCell className="communication-secondary">{x.telephone ?? "Compte applicatif"}</TableCell>
                <TableCell className="tabular-nums">{dateHeureFr(x.creeLe)}</TableCell>
                <TableCell>
                  <BadgeGentelella
                    texte={x.canal === "IN_APP" && x.statut === "EN_ATTENTE" ? "Dans l’application" :
                      x.statut === "EN_ATTENTE" ? "En attente" : x.statut === "ENVOYE" ? "Envoyée" :
                      x.statut === "ECHOUE" ? "Échec" : "Lue"}
                    couleur={x.statut === "ENVOYE" || x.statut === "LU" ? "green" : x.statut === "ECHOUE" ? "red" : x.canal === "IN_APP" ? "blue" : "yellow"}
                  />
                  {x.tentatives > 0 ? <p className="communication-secondary mt-1">{x.tentatives} tentative(s)</p> : null}
                </TableCell>
              </TableRow>)}</TableBody>
            </Table></div>
            <Pagination total={n.total} page={n.page} pages={n.pages} taille={n.taille} setPage={n.setPage} setTaille={n.setTaille} />
          </>}
        </section>
        <p className="communication-secondary mt-2">Les 100 notifications les plus récentes sont affichées. Les détails techniques des erreurs restent côté serveur.</p>
      </TabsContent> : null}
    </Tabs>

    {p.peutPublierAnnonce ? <Dialog open={dialogue === "annonce"} onOpenChange={(v) => { if (!v) { setDialogue(null); effacerApercuAnnonce(); } }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
        <form ref={formulaireAnnonce} onSubmit={soumettreAnnonce} onChange={(event) => {
          const champ = (event.target as HTMLInputElement).name;
          if (["titre", "contenu", "niveauId", "classeId", "expireLe", "envoyerPush"].includes(champ)) effacerApercuAnnonce();
        }}>
          <DialogHeader><DialogTitle>Nouvelle annonce</DialogTitle><DialogDescription>Vérifiez l’audience et les éventuels coûts de canal avant de publier. Aucun envoi ne part pendant l’aperçu.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label htmlFor="titre">Titre *</Label><Input id="titre" name="titre" maxLength={180} minLength={3} required />{erreursAnnonce.titre ? <p className="text-destructive text-sm">{erreursAnnonce.titre}</p> : null}</div>
            <div className="grid gap-2"><Label htmlFor="contenu">Contenu *</Label><Textarea id="contenu" name="contenu" rows={4} maxLength={5000} minLength={10} required />{erreursAnnonce.contenu ? <p className="text-destructive text-sm">{erreursAnnonce.contenu}</p> : null}</div>
            <div className="grid gap-2"><Label htmlFor="cible">Destinataires *</Label><NativeSelect id="cible" value={cible} onChange={(e) => { setCible(e.target.value); setElevesChoisis([]); effacerApercuAnnonce(); }}><option value="TOUS">Tout l’établissement</option><option value="NIVEAU">Un niveau</option><option value="CLASSE">Une classe</option><option value="ELEVE">Élèves choisis</option></NativeSelect></div>
            {cible === "NIVEAU" ? <div className="grid gap-2"><Label htmlFor="niveauId">Niveau *</Label><NativeSelect id="niveauId" name="niveauId" required><option value="">Choisir…</option>{p.niveaux.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</NativeSelect>{erreursAnnonce.niveauId ? <p className="text-destructive text-sm">{erreursAnnonce.niveauId}</p> : null}</div> : null}
            {cible === "CLASSE" ? <div className="grid gap-2"><Label htmlFor="classeId">Classe *</Label><NativeSelect id="classeId" name="classeId" required><option value="">Choisir…</option>{p.classes.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</NativeSelect>{erreursAnnonce.classeId ? <p className="text-destructive text-sm">{erreursAnnonce.classeId}</p> : null}</div> : null}
            {cible === "ELEVE" ? <div className="grid gap-2">
              <div className="flex items-center justify-between"><Label>Élèves concernés *</Label><span className="communication-secondary">{elevesChoisis.length} sélectionné(s)</span></div>
              <input type="search" className="form-control" value={rechercheEleve} placeholder="Rechercher un élève…" aria-label="Rechercher un élève" onChange={(e) => setRechercheEleve(e.target.value)} style={{ height: 36 }} />
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                {p.eleves.filter((x) => normaliser(x.prenom + " " + x.nom + " " + x.classe).includes(normaliser(rechercheEleve))).map((x) => <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted">
                  <input type="checkbox" className="size-4 accent-primary" checked={elevesChoisis.includes(x.id)}
                    onChange={(e) => { setElevesChoisis((prev) => e.target.checked ? [...prev, x.id] : prev.filter((id) => id !== x.id)); effacerApercuAnnonce(); }} />
                  <span className="min-w-0 flex-1">{x.prenom} {x.nom}</span><span className="communication-secondary">{x.classe}</span>
                </label>)}
                {p.eleves.length === 0 ? <p className="p-2 text-muted-foreground text-sm">Aucun élève inscrit dans le périmètre disponible.</p> : null}
              </div>
              {erreursAnnonce.elevesIds ? <p className="text-destructive text-sm">{erreursAnnonce.elevesIds}</p> : null}
            </div> : null}
            <div className="grid gap-2"><Label htmlFor="expireLe">Date d’expiration</Label><Input id="expireLe" name="expireLe" type="date" /></div>
            <div className="grid gap-3 rounded-lg border p-3">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="envoyerPush" defaultChecked className="mt-0.5 size-4 accent-primary" /><span>Notifier les familles selon la politique actuelle (push, SMS ou application)</span></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="epinglee" className="mt-0.5 size-4 accent-primary" /><span>Épingler l’annonce en tête de liste</span></label>
            </div>
            {apercuAnnonce ? <CarteApercu apercu={apercuAnnonce} confirmerDiffusion={confirmerAnnonce} setConfirmerDiffusion={setConfirmerAnnonce} confirmerCout={confirmerCoutAnnonce} setConfirmerCout={setConfirmerCoutAnnonce} identifiant="annonce" /> : null}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={enCours} className="rounded-lg" onClick={calculerApercuAnnonce}><RefreshCw aria-hidden /> Calculer audience et coût</Button>
            <Button type="submit" disabled={enCours || (formulaireAnnonce.current ? new FormData(formulaireAnnonce.current).get("envoyerPush") === "on" && (!apercuAnnonce || !confirmerAnnonce || (apercuAnnonce.parSms > 0 && !confirmerCoutAnnonce)) : true)} className="rounded-lg"><Megaphone aria-hidden />{enCours ? "Publication…" : "Publier l’annonce"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog> : null}

    {p.peutEnvoyerMessage ? <Dialog open={dialogue === "message"} onOpenChange={(v) => { if (!v) { setDialogue(null); effacerApercuMessage(); } }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl sm:max-w-2xl">
        <form ref={formulaireMessage} onSubmit={soumettreMessage} onChange={(event) => {
          const champ = (event.target as HTMLInputElement).name;
          if (["destinataireId", "eleveId", "objet", "contenu"].includes(champ)) effacerApercuMessage();
        }}>
          <DialogHeader><DialogTitle>Message ciblé</DialogTitle><DialogDescription>Le message est enregistré dans la messagerie du parent. L’aperçu vérifie aussi l’alerte éventuelle et le coût avant confirmation.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="destinataireId">Parent destinataire *</Label>
              <NativeSelect id="destinataireId" name="destinataireId" value={destinataireId} required onChange={(e) => { setDestinataireId(e.target.value); setEleveMessageId(""); effacerApercuMessage(); }}>
                <option value="">Choisir un parent…</option>{p.tuteurs.map((x) => <option key={x.utilisateurId} value={x.utilisateurId}>{x.prenom} {x.nom}</option>)}
              </NativeSelect>
              {erreursMessage.destinataireId ? <p className="text-destructive text-sm">{erreursMessage.destinataireId}</p> : null}
              {p.tuteurs.length === 0 ? <p className="text-amber-600 text-sm">Aucun parent avec compte et élève inscrit dans le périmètre disponible.</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eleveId">Élève concerné{p.messageRequiresStudent ? " *" : ""}</Label>
              <NativeSelect id="eleveId" name="eleveId" value={eleveMessageId} required={p.messageRequiresStudent}
                onChange={(e) => { setEleveMessageId(e.target.value); effacerApercuMessage(); }}>
                <option value="">Sans élève associé</option>{elevesDuParent.map((x) => <option key={x.id} value={x.id}>{x.prenom} {x.nom} — {x.classe}</option>)}
              </NativeSelect>
              {erreursMessage.eleveId ? <p className="text-destructive text-sm">{erreursMessage.eleveId}</p> : null}
            </div>
            <div className="grid gap-2"><Label htmlFor="objet">Objet *</Label><Input id="objet" name="objet" maxLength={180} minLength={3} required />{erreursMessage.objet ? <p className="text-destructive text-sm">{erreursMessage.objet}</p> : null}</div>
            <div className="grid gap-2"><Label htmlFor="contenu-msg">Message *</Label><Textarea id="contenu-msg" name="contenu" rows={5} maxLength={5000} minLength={5} required /><p className="communication-secondary">5 à 5 000 caractères maximum.</p>{erreursMessage.contenu ? <p className="text-destructive text-sm">{erreursMessage.contenu}</p> : null}</div>
            {apercuMessage ? <CarteApercu apercu={apercuMessage} confirmerDiffusion={confirmerMessage} setConfirmerDiffusion={setConfirmerMessage} confirmerCout={confirmerCoutMessage} setConfirmerCout={setConfirmerCoutMessage} identifiant="message" /> : null}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={enCours || p.tuteurs.length === 0 || (p.messageRequiresStudent && !eleveMessageId)} className="rounded-lg" onClick={calculerApercuMessage}><RefreshCw aria-hidden /> Calculer canal et coût</Button>
            <Button type="submit" disabled={enCours || p.tuteurs.length === 0 || !apercuMessage || !confirmerMessage || (apercuMessage.parSms > 0 && !confirmerCoutMessage) || (p.messageRequiresStudent && !eleveMessageId)} className="rounded-lg"><Send aria-hidden />{enCours ? "Enregistrement…" : "Enregistrer le message"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog> : null}
  </div>;
}
