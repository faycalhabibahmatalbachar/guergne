"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Check, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { inscrireEleve } from "../../actions";

interface ClasseOption {
  id: string;
  libelle: string;
  niveauLibelle: string;
  serieCode: string | null;
  effectif: number;
  capaciteMax: number;
}

const LIENS = [
  { valeur: "PERE", libelle: "Père" },
  { valeur: "MERE", libelle: "Mère" },
  { valeur: "TUTEUR", libelle: "Tuteur légal" },
  { valeur: "ONCLE", libelle: "Oncle" },
  { valeur: "TANTE", libelle: "Tante" },
  { valeur: "GRAND_PARENT", libelle: "Grand-parent" },
  { valeur: "FRERE_SOEUR", libelle: "Frère / Sœur" },
  { valeur: "AUTRE", libelle: "Autre" },
] as const;

interface Tuteur {
  cle: number;
  nom: string;
  prenom: string;
  telephone: string;
  telephoneSecondaire: string;
  email: string;
  profession: string;
  adresse: string;
  lien: string;
  estPrincipal: boolean;
  estResponsableFinancier: boolean;
  estTuteurLegal: boolean;
  estContactUrgence: boolean;
  autoriseRetrait: boolean;
}

function tuteurVide(cle: number, premier: boolean): Tuteur {
  return {
    cle,
    nom: "",
    prenom: "",
    telephone: "",
    telephoneSecondaire: "",
    email: "",
    profession: "",
    adresse: "",
    lien: premier ? "PERE" : "MERE",
    estPrincipal: premier,
    estResponsableFinancier: premier,
    estTuteurLegal: premier,
    estContactUrgence: premier,
    autoriseRetrait: true,
  };
}

const ETAPES = ["Identité", "Coordonnées", "Scolarité", "Tuteurs"] as const;

/**
 * Formulaire d'inscription.
 *
 * Découpé en quatre étapes plutôt qu'une page unique : le dossier compte une
 * trentaine de champs, et une secrétaire qui saisit vingt inscriptions par
 * jour a besoin de repères, pas d'un mur de formulaire.
 *
 * Les données ne sont envoyées qu'à la dernière étape, en une seule
 * transaction : un dossier à moitié créé serait pire que pas de dossier.
 */
export function FormulaireInscription({ classes }: { classes: ClasseOption[] }) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [etape, setEtape] = useState(0);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const [eleve, setEleve] = useState({
    nom: "",
    prenom: "",
    sexe: "",
    dateNaissance: "",
    lieuNaissance: "",
    nationalite: "Tchadienne",
    acteNaissanceNumero: "",
    adresse: "",
    quartier: "",
    telephone: "",
    email: "",
    groupeSanguin: "",
    allergies: "",
    observationsMedicales: "",
    situationParticuliere: "",
    urgenceNom: "",
    urgenceTelephone: "",
    urgenceLien: "",
    ecoleOrigine: "",
    classeId: "",
    type: "INSCRIPTION",
    estRedoublant: false,
    estBoursier: false,
    observations: "",
  });

  const [tuteurs, setTuteurs] = useState<Tuteur[]>([tuteurVide(1, true)]);

  const majEleve = (champ: string, valeur: string | boolean) =>
    setEleve((precedent) => ({ ...precedent, [champ]: valeur }));

  const majTuteur = (cle: number, champ: string, valeur: string | boolean) =>
    setTuteurs((liste) =>
      liste.map((t) => {
        if (t.cle !== cle) {
          // Un seul tuteur principal : cocher l'un décoche les autres.
          return champ === "estPrincipal" && valeur === true ? { ...t, estPrincipal: false } : t;
        }
        return { ...t, [champ]: valeur };
      }),
    );

  function soumettre() {
    setErreurs({});
    demarrer(async () => {
      const resultat = await inscrireEleve({
        ...eleve,
        tuteurs: tuteurs.map(({ cle: _cle, ...reste }) => reste),
      });

      if (resultat.ok && resultat.id) {
        toast.success("Élève inscrit. Le matricule a été attribué.");
        routeur.push(`/dashboard/eleves/${resultat.id}`);
      } else {
        setErreurs(resultat.erreurs ?? {});
        toast.error(resultat.message ?? "Vérifiez les champs signalés.");

        // On ramène l'utilisateur à la première étape contenant une erreur :
        // sinon il reste sur la dernière page sans comprendre ce qui bloque.
        const champs = Object.keys(resultat.erreurs ?? {});
        if (champs.some((c) => ["nom", "prenom", "sexe", "dateNaissance"].includes(c))) setEtape(0);
        else if (champs.some((c) => ["telephone", "email"].includes(c))) setEtape(1);
        else if (champs.some((c) => c === "classeId")) setEtape(2);
        else if (champs.some((c) => c.startsWith("tuteurs"))) setEtape(3);
      }
    });
  }

  const erreur = (champ: string) =>
    erreurs[champ] ? <p className="text-destructive text-sm">{erreurs[champ]}</p> : null;

  return (
    <div className="space-y-6">
      {/* Fil d'étapes */}
      <nav aria-label="Étapes de l'inscription">
        <ol className="flex flex-wrap gap-2">
          {ETAPES.map((titre, index) => (
            <li key={titre}>
              <button
                type="button"
                onClick={() => setEtape(index)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  index === etape
                    ? "border-primary bg-primary text-primary-foreground"
                    : index < etape
                      ? "border-primary/40 text-primary"
                      : "text-muted-foreground",
                )}
              >
                {index < etape ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <span className="tabular-nums">{index + 1}</span>
                )}
                {titre}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* Étape 1 — Identité */}
      {etape === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">État civil</CardTitle>
            <CardDescription>
              Ces informations figureront sur le bulletin et sur les documents officiels : saisissez-les
              telles qu&apos;elles apparaissent sur l&apos;acte de naissance.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nom">Nom *</Label>
              <Input
                id="nom"
                value={eleve.nom}
                onChange={(e) => majEleve("nom", e.target.value)}
                placeholder="MAHAMAT"
                autoFocus
              />
              {erreur("nom")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prenom">Prénom *</Label>
              <Input
                id="prenom"
                value={eleve.prenom}
                onChange={(e) => majEleve("prenom", e.target.value)}
                placeholder="Abakar"
              />
              {erreur("prenom")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sexe">Sexe *</Label>
              <NativeSelect id="sexe" value={eleve.sexe} onChange={(e) => majEleve("sexe", e.target.value)}>
                <option value="">Choisir…</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </NativeSelect>
              {erreur("sexe")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dateNaissance">Date de naissance *</Label>
              <Input
                id="dateNaissance"
                type="date"
                value={eleve.dateNaissance}
                onChange={(e) => majEleve("dateNaissance", e.target.value)}
              />
              {erreur("dateNaissance")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lieuNaissance">Lieu de naissance</Label>
              <Input
                id="lieuNaissance"
                value={eleve.lieuNaissance}
                onChange={(e) => majEleve("lieuNaissance", e.target.value)}
                placeholder="N'Djamena"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nationalite">Nationalité</Label>
              <Input
                id="nationalite"
                value={eleve.nationalite}
                onChange={(e) => majEleve("nationalite", e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="acteNaissanceNumero">Numéro d&apos;acte de naissance</Label>
              <Input
                id="acteNaissanceNumero"
                value={eleve.acteNaissanceNumero}
                onChange={(e) => majEleve("acteNaissanceNumero", e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Exigé par l&apos;administration pour les examens officiels (BEPC, BAC).
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Étape 2 — Coordonnées, santé, urgence */}
      {etape === 1 ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coordonnées</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="adresse">Adresse</Label>
                <Input
                  id="adresse"
                  value={eleve.adresse}
                  onChange={(e) => majEleve("adresse", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quartier">Quartier</Label>
                <Input
                  id="quartier"
                  value={eleve.quartier}
                  onChange={(e) => majEleve("quartier", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telephone">Téléphone de l&apos;élève</Label>
                <Input
                  id="telephone"
                  value={eleve.telephone}
                  onChange={(e) => majEleve("telephone", e.target.value)}
                  placeholder="+235 66 00 00 00"
                />
                {erreur("telephone")}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={eleve.email}
                  onChange={(e) => majEleve("email", e.target.value)}
                />
                {erreur("email")}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Santé et situation</CardTitle>
              <CardDescription>
                Informations sensibles, visibles uniquement de la direction et de la vie scolaire.
                Ne saisissez que ce qui est nécessaire à la sécurité de l&apos;élève.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="groupeSanguin">Groupe sanguin</Label>
                <Input
                  id="groupeSanguin"
                  value={eleve.groupeSanguin}
                  onChange={(e) => majEleve("groupeSanguin", e.target.value)}
                  placeholder="O+"
                  maxLength={5}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="allergies">Allergies</Label>
                <Input
                  id="allergies"
                  value={eleve.allergies}
                  onChange={(e) => majEleve("allergies", e.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="observationsMedicales">Observations médicales</Label>
                <Textarea
                  id="observationsMedicales"
                  rows={2}
                  value={eleve.observationsMedicales}
                  onChange={(e) => majEleve("observationsMedicales", e.target.value)}
                  placeholder="Asthme, traitement en cours, dispense d'EPS…"
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="situationParticuliere">Situation particulière</Label>
                <Textarea
                  id="situationParticuliere"
                  rows={2}
                  value={eleve.situationParticuliere}
                  onChange={(e) => majEleve("situationParticuliere", e.target.value)}
                  placeholder="Handicap, aménagement d'examen, situation sociale…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personne à contacter en urgence</CardTitle>
              <CardDescription>
                Si elle diffère du tuteur principal. En cas d&apos;accident, c&apos;est ce numéro qui
                sera composé en premier.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="urgenceNom">Nom</Label>
                <Input
                  id="urgenceNom"
                  value={eleve.urgenceNom}
                  onChange={(e) => majEleve("urgenceNom", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="urgenceTelephone">Téléphone</Label>
                <Input
                  id="urgenceTelephone"
                  value={eleve.urgenceTelephone}
                  onChange={(e) => majEleve("urgenceTelephone", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="urgenceLien">Lien</Label>
                <Input
                  id="urgenceLien"
                  value={eleve.urgenceLien}
                  onChange={(e) => majEleve("urgenceLien", e.target.value)}
                  placeholder="Oncle, voisin…"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Étape 3 — Scolarité */}
      {etape === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scolarité</CardTitle>
            <CardDescription>
              L&apos;affectation détermine la classe, donc les matières, les coefficients et le bulletin.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="type">Nature de l&apos;inscription</Label>
              <NativeSelect id="type" value={eleve.type} onChange={(e) => majEleve("type", e.target.value)}>
                <option value="INSCRIPTION">Nouvelle inscription</option>
                <option value="REINSCRIPTION">Réinscription</option>
                <option value="TRANSFERT_ENTRANT">Transfert entrant</option>
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ecoleOrigine">Établissement précédent</Label>
              <Input
                id="ecoleOrigine"
                value={eleve.ecoleOrigine}
                onChange={(e) => majEleve("ecoleOrigine", e.target.value)}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="classeId">Classe d&apos;affectation *</Label>
              <NativeSelect
                id="classeId"
                value={eleve.classeId}
                onChange={(e) => majEleve("classeId", e.target.value)}
              >
                <option value="">Choisir une classe…</option>
                {classes.map((c) => {
                  const complete = c.effectif >= c.capaciteMax;
                  return (
                    <option key={c.id} value={c.id} disabled={complete}>
                      {c.libelle} — {c.effectif}/{c.capaciteMax}
                      {complete ? " (complète)" : ""}
                    </option>
                  );
                })}
              </NativeSelect>
              {erreur("classeId")}
              {classes.length === 0 ? (
                <p className="text-amber-600 text-sm dark:text-amber-400">
                  Aucune classe n&apos;existe pour l&apos;année en cours. Créez-les dans Paramètres.
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={eleve.estRedoublant}
                onChange={(e) => majEleve("estRedoublant", e.target.checked)}
                className="size-4 accent-primary"
              />
              Élève redoublant
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={eleve.estBoursier}
                onChange={(e) => majEleve("estBoursier", e.target.checked)}
                className="size-4 accent-primary"
              />
              Boursier ou exonéré
            </label>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="observations">Observations</Label>
              <Textarea
                id="observations"
                rows={2}
                value={eleve.observations}
                onChange={(e) => majEleve("observations", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Étape 4 — Tuteurs */}
      {etape === 3 ? (
        <div className="space-y-4">
          {erreurs.tuteurs ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive text-sm">
              {erreurs.tuteurs}
            </p>
          ) : null}

          {tuteurs.map((t, index) => (
            <Card key={t.cle}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    Tuteur {index + 1}
                    {t.estPrincipal ? <Badge>Principal</Badge> : null}
                  </CardTitle>
                  {tuteurs.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setTuteurs((l) => l.filter((x) => x.cle !== t.cle))}
                    >
                      <Trash2 aria-hidden />
                      Retirer
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`t-nom-${t.cle}`}>Nom *</Label>
                    <Input
                      id={`t-nom-${t.cle}`}
                      value={t.nom}
                      onChange={(e) => majTuteur(t.cle, "nom", e.target.value)}
                    />
                    {erreur(`tuteurs.${index}.nom`)}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`t-prenom-${t.cle}`}>Prénom *</Label>
                    <Input
                      id={`t-prenom-${t.cle}`}
                      value={t.prenom}
                      onChange={(e) => majTuteur(t.cle, "prenom", e.target.value)}
                    />
                    {erreur(`tuteurs.${index}.prenom`)}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`t-lien-${t.cle}`}>Lien de parenté *</Label>
                    <NativeSelect
                      id={`t-lien-${t.cle}`}
                      value={t.lien}
                      onChange={(e) => majTuteur(t.cle, "lien", e.target.value)}
                    >
                      {LIENS.map((l) => (
                        <option key={l.valeur} value={l.valeur}>
                          {l.libelle}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`t-tel-${t.cle}`}>Téléphone *</Label>
                    <Input
                      id={`t-tel-${t.cle}`}
                      value={t.telephone}
                      onChange={(e) => majTuteur(t.cle, "telephone", e.target.value)}
                      placeholder="+235 66 00 00 00"
                    />
                    {erreur(`tuteurs.${index}.telephone`)}
                    <p className="text-muted-foreground text-xs">
                      C&apos;est ce numéro qui donnera accès à l&apos;application mobile.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`t-tel2-${t.cle}`}>Téléphone secondaire</Label>
                    <Input
                      id={`t-tel2-${t.cle}`}
                      value={t.telephoneSecondaire}
                      onChange={(e) => majTuteur(t.cle, "telephoneSecondaire", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`t-email-${t.cle}`}>E-mail</Label>
                    <Input
                      id={`t-email-${t.cle}`}
                      type="email"
                      value={t.email}
                      onChange={(e) => majTuteur(t.cle, "email", e.target.value)}
                    />
                    {erreur(`tuteurs.${index}.email`)}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`t-prof-${t.cle}`}>Profession</Label>
                    <Input
                      id={`t-prof-${t.cle}`}
                      value={t.profession}
                      onChange={(e) => majTuteur(t.cle, "profession", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`t-adr-${t.cle}`}>Adresse</Label>
                    <Input
                      id={`t-adr-${t.cle}`}
                      value={t.adresse}
                      onChange={(e) => majTuteur(t.cle, "adresse", e.target.value)}
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["estPrincipal", "Tuteur principal — reçoit les communications"],
                      ["estTuteurLegal", "Tuteur légal — signe les documents"],
                      ["estResponsableFinancier", "Responsable financier — règle les frais"],
                      ["estContactUrgence", "Contact d'urgence"],
                      ["autoriseRetrait", "Autorisé à récupérer l'élève"],
                    ] as const
                  ).map(([champ, libelle]) => (
                    <label key={champ} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={t[champ]}
                        onChange={(e) => majTuteur(t.cle, champ, e.target.checked)}
                        className="size-4 accent-primary"
                      />
                      {libelle}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() => setTuteurs((l) => [...l, tuteurVide(Date.now(), false)])}
          >
            <Plus aria-hidden />
            Ajouter un tuteur
          </Button>
        </div>
      ) : null}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={etape === 0 || enCours}
          onClick={() => setEtape((e) => e - 1)}
        >
          Précédent
        </Button>

        {etape < ETAPES.length - 1 ? (
          <Button type="button" onClick={() => setEtape((e) => e + 1)}>
            Suivant
          </Button>
        ) : (
          <Button type="button" onClick={soumettre} disabled={enCours}>
            <UserPlus aria-hidden />
            {enCours ? "Inscription…" : "Inscrire l'élève"}
          </Button>
        )}
      </div>
    </div>
  );
}
