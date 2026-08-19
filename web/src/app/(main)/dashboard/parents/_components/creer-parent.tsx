"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Check, Copy, KeyRound, Plus, Search, Trash2, UserPlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";

import { creerCompteParent, rechercherEleves } from "../actions-creation";

const LIENS = [
  { valeur: "PERE", libelle: "Père" },
  { valeur: "MERE", libelle: "Mère" },
  { valeur: "TUTEUR", libelle: "Tuteur légal" },
  { valeur: "ONCLE", libelle: "Oncle" },
  { valeur: "TANTE", libelle: "Tante" },
  { valeur: "GRAND_PARENT", libelle: "Grand-parent" },
  { valeur: "FRERE_SOEUR", libelle: "Frère / Sœur" },
  { valeur: "AUTRE", libelle: "Autre" },
];

interface EleveTrouve {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe: string;
}

interface Rattachement extends EleveTrouve {
  lien: string;
  estPrincipal: boolean;
  estTuteurLegal: boolean;
  estResponsableFinancier: boolean;
  estContactUrgence: boolean;
  autoriseRetrait: boolean;
}

/**
 * Création d'un compte parent en une passe.
 *
 * Le formulaire couvre l'état civil, la situation, les rattachements aux
 * enfants et l'ouverture de l'accès. Le tout en une transaction : un tuteur
 * enregistré sans enfant rattaché serait invisible et inutilisable.
 */
export function CreerParent() {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<EleveTrouve[]>([]);
  const [rattachements, setRattachements] = useState<Rattachement[]>([]);
  const [creerAcces, setCreerAcces] = useState(true);

  // Identifiants affichés après création — une seule fois.
  const [identifiants, setIdentifiants] = useState<{
    nom: string;
    telephone: string;
    motDePasse?: string;
    code?: string;
  } | null>(null);

  const erreur = (c: string) =>
    erreurs[c] ? <p className="text-destructive text-sm">{erreurs[c]}</p> : null;

  function chercher(terme: string) {
    setRecherche(terme);
    if (terme.trim().length < 2) {
      setResultats([]);
      return;
    }
    demarrer(async () => setResultats(await rechercherEleves(terme)));
  }

  function rattacher(eleve: EleveTrouve) {
    if (rattachements.some((r) => r.id === eleve.id)) return;
    // Le premier enfant fait du tuteur le responsable par défaut : c'est le
    // cas le plus fréquent, et l'oubli de cocher laisserait l'élève sans
    // contact principal.
    const premier = rattachements.length === 0;
    setRattachements((liste) => [
      ...liste,
      {
        ...eleve,
        lien: "PERE",
        estPrincipal: premier,
        estTuteurLegal: premier,
        estResponsableFinancier: premier,
        estContactUrgence: premier,
        autoriseRetrait: true,
      },
    ]);
    setRecherche("");
    setResultats([]);
  }

  const majRattachement = (id: string, champ: keyof Rattachement, valeur: unknown) =>
    setRattachements((liste) =>
      liste.map((r) => (r.id === id ? { ...r, [champ]: valeur } : r)),
    );

  function soumettre(f: FormData) {
    setErreurs({});
    demarrer(async () => {
      const r = await creerCompteParent({
        nom: String(f.get("nom") ?? ""),
        prenom: String(f.get("prenom") ?? ""),
        sexe: String(f.get("sexe") ?? "") || null,
        telephone: String(f.get("telephone") ?? ""),
        telephoneSecondaire: String(f.get("telephoneSecondaire") ?? ""),
        email: String(f.get("email") ?? ""),
        profession: String(f.get("profession") ?? ""),
        employeur: String(f.get("employeur") ?? ""),
        adresse: String(f.get("adresse") ?? ""),
        quartier: String(f.get("quartier") ?? ""),
        pieceIdentite: String(f.get("pieceIdentite") ?? ""),
        accepteSms: f.get("accepteSms") === "on",
        creerAcces,
        enfants: rattachements.map((r) => ({
          eleveId: r.id,
          lien: r.lien,
          estPrincipal: r.estPrincipal,
          estTuteurLegal: r.estTuteurLegal,
          estResponsableFinancier: r.estResponsableFinancier,
          estContactUrgence: r.estContactUrgence,
          autoriseRetrait: r.autoriseRetrait,
        })),
      });

      if (r.ok) {
        setOuvert(false);
        setRattachements([]);
        if (r.motDePasse || r.code) {
          setIdentifiants({
            nom: `${String(f.get("prenom"))} ${String(f.get("nom"))}`,
            telephone: String(f.get("telephone")),
            motDePasse: r.motDePasse,
            code: r.code,
          });
        } else {
          toast.success(r.message ?? "Tuteur enregistré.");
        }
        routeur.refresh();
      } else {
        setErreurs(r.erreurs ?? {});
        toast.error(r.message ?? Object.values(r.erreurs ?? {})[0] ?? "Échec.");
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOuvert(true)}>
        <UserPlus aria-hidden />
        Nouveau compte parent
      </Button>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <form action={soumettre}>
            <DialogHeader>
              <DialogTitle>Nouveau compte parent</DialogTitle>
              <DialogDescription>
                Le mot de passe est généré automatiquement et affiché une seule fois. Le parent
                devra en choisir un autre à sa première connexion.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* État civil */}
              <section className="space-y-4">
                <h3 className="font-medium text-sm">État civil</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="nom">Nom *</Label>
                    <Input id="nom" name="nom" required />
                    {erreur("nom")}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="prenom">Prénom *</Label>
                    <Input id="prenom" name="prenom" required />
                    {erreur("prenom")}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sexe">Sexe</Label>
                    <NativeSelect id="sexe" name="sexe" defaultValue="">
                      <option value="">—</option>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </NativeSelect>
                  </div>
                </div>
              </section>

              <Separator />

              {/* Coordonnées */}
              <section className="space-y-4">
                <h3 className="font-medium text-sm">Coordonnées</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="telephone">Téléphone *</Label>
                    <Input id="telephone" name="telephone" placeholder="66 00 00 00" required />
                    {erreur("telephone")}
                    <p className="text-muted-foreground text-xs">
                      C&apos;est son identifiant de connexion.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="telephoneSecondaire">Second numéro</Label>
                    <Input id="telephoneSecondaire" name="telephoneSecondaire" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" />
                    {erreur("email")}
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="adresse">Adresse</Label>
                    <Input id="adresse" name="adresse" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="quartier">Quartier</Label>
                    <Input id="quartier" name="quartier" placeholder="Chagoua" />
                  </div>
                </div>
              </section>

              <Separator />

              {/* Situation */}
              <section className="space-y-4">
                <h3 className="font-medium text-sm">Situation</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="profession">Profession</Label>
                    <Input id="profession" name="profession" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="employeur">Employeur</Label>
                    <Input id="employeur" name="employeur" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pieceIdentite">Pièce d&apos;identité</Label>
                    <Input id="pieceIdentite" name="pieceIdentite" placeholder="CNI n° …" />
                  </div>
                </div>
              </section>

              <Separator />

              {/* Enfants */}
              <section className="space-y-4">
                <h3 className="font-medium text-sm">
                  Enfants rattachés
                  {rattachements.length > 0 ? ` (${rattachements.length})` : ""}
                </h3>

                <div className="relative">
                  <Search
                    className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={recherche}
                    onChange={(e) => chercher(e.target.value)}
                    placeholder="Rechercher un élève par nom ou matricule…"
                    className="pl-9"
                  />
                  {resultats.length > 0 ? (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                      {resultats.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => rattacher(e)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span>
                            {e.prenom} {e.nom}
                            <span className="block text-muted-foreground text-xs">{e.matricule}</span>
                          </span>
                          <Badge variant="outline">{e.classe}</Badge>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {rattachements.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
                    Aucun enfant rattaché. Un tuteur sans enfant n&apos;aurait rien à consulter.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {rattachements.map((r) => (
                      <div key={r.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-medium text-sm">
                              {r.prenom} {r.nom}
                            </span>
                            <span className="ml-2 text-muted-foreground text-xs">
                              {r.matricule} · {r.classe}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <NativeSelect
                              value={r.lien}
                              onChange={(e) => majRattachement(r.id, "lien", e.target.value)}
                              className="h-8 w-36"
                              aria-label={`Lien avec ${r.prenom}`}
                            >
                              {LIENS.map((l) => (
                                <option key={l.valeur} value={l.valeur}>
                                  {l.libelle}
                                </option>
                              ))}
                            </NativeSelect>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() =>
                                setRattachements((liste) => liste.filter((x) => x.id !== r.id))
                              }
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                              <span className="sr-only">Retirer</span>
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                          {(
                            [
                              ["estPrincipal", "Tuteur principal — reçoit les communications"],
                              ["estTuteurLegal", "Tuteur légal — signe les documents"],
                              ["estResponsableFinancier", "Responsable financier"],
                              ["estContactUrgence", "Contact d'urgence"],
                              ["autoriseRetrait", "Autorisé à récupérer l'élève"],
                            ] as const
                          ).map(([champ, libelle]) => (
                            <label key={champ} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={r[champ] as boolean}
                                onChange={(e) => majRattachement(r.id, champ, e.target.checked)}
                                className="size-3.5 accent-primary"
                              />
                              {libelle}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <Separator />

              {/* Accès */}
              <section className="space-y-3">
                <h3 className="font-medium text-sm">Accès à l&apos;application</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={creerAcces}
                    onChange={(e) => setCreerAcces(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Ouvrir un accès (mot de passe généré + code d&apos;activation)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="accepteSms"
                    defaultChecked
                    className="size-4 accent-primary"
                  />
                  Envoyer les identifiants par SMS
                </label>
              </section>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                <UserPlus aria-hidden />
                {enCours ? "Création…" : "Créer le compte"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Identifiants — affichés une seule fois */}
      <Dialog open={identifiants !== null} onOpenChange={(v) => !v && setIdentifiants(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5" aria-hidden />
              Identifiants de {identifiants?.nom}
            </DialogTitle>
            <DialogDescription>
              Notez-les ou remettez-les au parent maintenant. Ils ne seront plus affichés : le mot
              de passe est stocké chiffré, le code sous forme d&apos;empreinte — personne ne peut
              les relire, pas même un administrateur.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {[
              { libelle: "Identifiant", valeur: identifiants?.telephone },
              { libelle: "Mot de passe provisoire", valeur: identifiants?.motDePasse },
              { libelle: "Code d'activation mobile", valeur: identifiants?.code },
            ]
              .filter((l) => l.valeur)
              .map((l) => (
                <div key={l.libelle} className="rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">{l.libelle}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <code className="font-mono font-semibold text-lg">{l.valeur}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(l.valeur as string);
                        toast.success("Copié.");
                      }}
                    >
                      <Copy aria-hidden />
                      Copier
                    </Button>
                  </div>
                </div>
              ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setIdentifiants(null)}>
              <Check aria-hidden />
              J&apos;ai noté
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
