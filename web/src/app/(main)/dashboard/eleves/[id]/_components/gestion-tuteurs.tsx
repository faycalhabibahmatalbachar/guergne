"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { Link2, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

import {
  detacherTuteur,
  rattacherTuteur,
  rechercherTuteurParTelephone,
  type TuteurTrouve,
} from "../../actions";

/**
 * Rattacher et détacher un tuteur depuis la fiche élève (E-35).
 *
 * LES DEUX ACTIONS EXISTAIENT ET N'ÉTAIENT APPELÉES PAR AUCUN ÉCRAN
 * ------------------------------------------------------------------
 * `rattacherTuteur` et `detacherTuteur` étaient écrites, testées par le typage,
 * et mortes. Rattacher un parent supposait de repasser par l'inscription.
 *
 * LE TÉLÉPHONE EST DEMANDÉ EN PREMIER, ET C'EST TOUTE L'IDÉE
 * ------------------------------------------------------------
 * Un parent de trois enfants saisi trois fois donne trois comptes dans
 * l'application — chacun ne montrant qu'un enfant —, trois SMS pour la même
 * annonce, donc trois fois le coût, et un numéro qui n'apparaît nulle part
 * comme étant le même.
 *
 * Le serveur réutilise déjà le tuteur existant quand le numéro correspond, mais
 * en silence, après la saisie du formulaire entier. Ici on le DIT avant : « ce
 * numéro est celui de X, parent de deux élèves ». La personne au guichet cesse
 * alors de retaper un nom — et ne crée pas une seconde orthographe du même.
 */

const LIENS: Array<[string, string]> = [
  ["PERE", "Père"],
  ["MERE", "Mère"],
  ["TUTEUR", "Tuteur"],
  ["ONCLE", "Oncle"],
  ["TANTE", "Tante"],
  ["GRAND_PARENT", "Grand-parent"],
  ["FRERE_SOEUR", "Frère ou sœur"],
  ["AUTRE", "Autre"],
];

export function GestionTuteurs({
  eleveId,
  tuteurs,
}: {
  eleveId: string;
  tuteurs: Array<{ id: string; nom: string; prenom: string }>;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);

  const [telephone, setTelephone] = useState("");
  const [trouve, setTrouve] = useState<TuteurTrouve | null>(null);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [profession, setProfession] = useState("");
  const [lien, setLien] = useState("PERE");
  const [estPrincipal, setEstPrincipal] = useState(false);
  const [estResponsableFinancier, setEstResponsableFinancier] = useState(false);
  const [estTuteurLegal, setEstTuteurLegal] = useState(false);
  const [estContactUrgence, setEstContactUrgence] = useState(false);
  const [autoriseRetrait, setAutoriseRetrait] = useState(true);

  // La recherche suit la frappe, avec un délai : interroger à chaque touche
  // ferait une requête par chiffre du numéro.
  useEffect(() => {
    if (!ouvert || telephone.trim().length < 8) {
      setTrouve(null);
      return;
    }
    const minuteur = setTimeout(async () => {
      try {
        const t = await rechercherTuteurParTelephone(telephone, eleveId);
        setTrouve(t);
        // On pré-remplit sans verrouiller : un nom mal orthographié à la
        // première saisie doit pouvoir être corrigé ici, et la correction
        // profitera aux autres enfants du même parent.
        if (t) {
          setNom(t.nom);
          setPrenom(t.prenom);
          setEmail(t.email ?? "");
          setProfession(t.profession ?? "");
        }
      } catch {
        setTrouve(null);
      }
    }, 400);
    return () => clearTimeout(minuteur);
  }, [ouvert, telephone, eleveId]);

  function rattacher() {
    demarrer(async () => {
      const r = await rattacherTuteur(eleveId, {
        nom,
        prenom,
        telephone,
        email,
        profession,
        lien,
        estPrincipal,
        estResponsableFinancier,
        estTuteurLegal,
        estContactUrgence,
        autoriseRetrait,
      });
      if (r.ok) {
        toast.success(
          trouve
            ? "Tuteur existant rattaché — aucun doublon créé."
            : "Nouveau tuteur enregistré et rattaché.",
        );
        setOuvert(false);
        setTelephone("");
        setNom("");
        setPrenom("");
        setEmail("");
        setProfession("");
        setTrouve(null);
        routeur.refresh();
      } else {
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "Le rattachement a échoué.");
      }
    });
  }

  function detacher(tuteurId: string, libelle: string) {
    demarrer(async () => {
      const r = await detacherTuteur(eleveId, tuteurId);
      toast[r.ok ? "success" : "error"](r.ok ? `${libelle} retiré.` : (r.message ?? "Échec."));
      if (r.ok) routeur.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => setOuvert(true)}>
        <UserPlus aria-hidden />
        Rattacher un tuteur
      </Button>

      {tuteurs.map((t) => (
        <Button
          key={t.id}
          size="sm"
          variant="ghost"
          disabled={enCours}
          onClick={() => detacher(t.id, `${t.prenom} ${t.nom}`)}
        >
          <UserMinus aria-hidden />
          Retirer {t.prenom} {t.nom}
        </Button>
      ))}

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rattacher un tuteur</DialogTitle>
            <DialogDescription>
              Commencez par le téléphone. S&apos;il est déjà connu, le tuteur existant est
              réutilisé au lieu d&apos;être recréé — c&apos;est ce qui évite qu&apos;un parent de
              trois enfants ait trois comptes et reçoive trois fois chaque SMS.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
            <div className="grid gap-2">
              <Label htmlFor="gt-tel">Téléphone</Label>
              <Input
                id="gt-tel"
                inputMode="tel"
                autoFocus
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="66 12 34 56"
              />
            </div>

            {trouve ? (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  trouve.dejaRattache
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-primary/40 bg-primary/5"
                }`}
              >
                <p className="flex items-center gap-2 font-medium">
                  <Link2 aria-hidden className="size-4" />
                  {trouve.prenom} {trouve.nom} — déjà enregistré
                </p>
                {trouve.dejaRattache ? (
                  <p className="text-destructive mt-1">
                    Ce tuteur est déjà rattaché à cet élève.
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-1 flex items-start gap-1.5">
                    <Users aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {trouve.enfants.length === 0
                        ? "Aucun autre enfant rattaché."
                        : `Déjà parent de ${trouve.enfants
                            .map((e) => `${e.nom}${e.classe ? ` (${e.classe})` : ""}`)
                            .join(", ")}. Il sera rattaché, pas dupliqué.`}
                    </span>
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="gt-nom">Nom</Label>
                <Input id="gt-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gt-prenom">Prénom</Label>
                <Input id="gt-prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="gt-lien">Lien avec l&apos;élève</Label>
                <NativeSelect id="gt-lien" value={lien} onChange={(e) => setLien(e.target.value)}>
                  {LIENS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gt-email">E-mail (facultatif)</Label>
                <Input
                  id="gt-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="gt-prof">Profession (facultatif)</Label>
              <Input
                id="gt-prof"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Rôles</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Case
                  libelle="Contact principal"
                  aide="Reçoit les notifications en premier"
                  valeur={estPrincipal}
                  onChange={setEstPrincipal}
                />
                <Case
                  libelle="Responsable financier"
                  aide="Destinataire des relances de paiement"
                  valeur={estResponsableFinancier}
                  onChange={setEstResponsableFinancier}
                />
                <Case
                  libelle="Tuteur légal"
                  aide="Signe les décisions du conseil"
                  valeur={estTuteurLegal}
                  onChange={setEstTuteurLegal}
                />
                <Case
                  libelle="Contact d'urgence"
                  aide="Appelé en cas d'accident"
                  valeur={estContactUrgence}
                  onChange={setEstContactUrgence}
                />
                <Case
                  libelle="Autorisé à retirer l'élève"
                  aide="Peut venir le chercher à la sortie"
                  valeur={autoriseRetrait}
                  onChange={setAutoriseRetrait}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
            <Button
              onClick={rattacher}
              disabled={
                enCours ||
                Boolean(trouve?.dejaRattache) ||
                telephone.trim().length < 8 ||
                nom.trim().length < 2 ||
                prenom.trim().length < 2
              }
            >
              {enCours ? "Enregistrement…" : trouve ? "Rattacher" : "Créer et rattacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Case({
  libelle,
  aide,
  valeur,
  onChange,
}: {
  libelle: string;
  aide: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <Checkbox checked={valeur} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span>
        {libelle}
        <span className="text-muted-foreground block text-xs">{aide}</span>
      </span>
    </label>
  );
}
