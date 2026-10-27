import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  etatFileNotifications, listerAnnonces, listerElevesActifs, listerMessages,
  listerNotifications, listerTuteursAvecCompte,
} from "@/server/domain/communication";
import { listerNiveaux } from "@/server/domain/parametres";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { actionsAutorisees } from "@/server/guard/actions-autorisees";
import { exigerSession } from "@/server/guard";
import { roleAutoriseAdministration } from "@/lib/acces-administration";

import { Prerequis } from "../_components/prerequis";
import { Communication } from "./_components/communication";

import "../default/gentelella-tokens.css";
import "../default/gentelella-layout.css";
import "../default/gentelella-components.css";
import "../default/gentelella-widgets.css";
import "../eleves/[id]/gentelella-forms.css";
import "../eleves/[id]/gentelella-datatable.css";
import "../eleves/[id]/gentelella-apps.css";
import "./gentelella-communication.css";

export const metadata: Metadata = { title: "Communication" };
export const dynamic = "force-dynamic";

export default async function PageCommunication() {
  const acteur = await exigerSession();
  if (!roleAutoriseAdministration(acteur.role)) redirect("/unauthorized");

  const droits = new Set(await actionsAutorisees(acteur.role));
  const peutPublierAnnonce = droits.has("annonce:publier");
  const peutVoirAnnonces = peutPublierAnnonce || droits.has("annonce:lire");
  const peutEnvoyerMessage = droits.has("message:envoyer");
  const peutLireMessages = droits.has("message:lire") || peutEnvoyerMessage;
  const peutVoirMessages = peutEnvoyerMessage || droits.has("message:lire");
  const peutTraiterFile = droits.has("notification:configurer");

  if (!peutVoirAnnonces && !peutVoirMessages && !peutTraiterFile) redirect("/unauthorized");

  const annee = await chargerAnneeCourante();
  if (!annee) {
    return (
      <main className="gentelella-v4 min-w-0 pb-6" data-skin="gentelella-v4">
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight">Communication</h1>
          <Prerequis
            titre="Aucune année scolaire n'est configurée"
            explication="Les annonces et messages ciblés sont rattachés à une année scolaire afin de garder une audience correcte."
            manquants={peutPublierAnnonce ? [{ libelle: "Configurer l'année scolaire", url: "/dashboard/parametres" }] : []}
          />
        </div>
      </main>
    );
  }

  const chargerReferentiels = peutPublierAnnonce;
  const chargerDestinataires = peutEnvoyerMessage || peutPublierAnnonce;
  const utilisateurEnseignant = acteur.role === "ENSEIGNANT" ? acteur.id : undefined;

  const [referentiels, niveaux, annonces, messages, notifications, file, eleves] = await Promise.all([
    chargerReferentiels
      ? listerClassesEtMatieres(annee.id)
      : Promise.resolve({ classes: [], matieres: [] }),
    chargerReferentiels ? listerNiveaux() : Promise.resolve([]),
    peutVoirAnnonces ? listerAnnonces(annee.id) : Promise.resolve([]),
    peutLireMessages ? listerMessages(acteur.id) : Promise.resolve([]),
    peutTraiterFile ? listerNotifications(100) : Promise.resolve([]),
    peutTraiterFile ? etatFileNotifications() : Promise.resolve(null),
    chargerDestinataires
      ? listerElevesActifs(annee.id, utilisateurEnseignant)
      : Promise.resolve({ rows: [] as Array<{ id: string; nom: string; prenom: string; classe: string }> }),
  ]);

  // L'enseignant ne reçoit que les parents rattachés aux élèves de ses propres
  // classes. Le filtrage est effectué côté serveur avant le passage au client.
  const tuteurs = peutEnvoyerMessage
    ? await listerTuteursAvecCompte(
        annee.id,
        acteur.role === "ENSEIGNANT" ? eleves.rows.map((eleve) => eleve.id) : undefined,
      )
    : [];

  return (
    <main className="gentelella-v4 min-w-0 pb-6" data-skin="gentelella-v4">
      <Communication
        anneeId={annee.id}
        anneeLibelle={annee.libelle}
        niveaux={niveaux.map((x) => ({ id: x.id, libelle: x.libelle }))}
        classes={referentiels.classes.map((x) => ({ id: x.id, libelle: x.libelle }))}
        eleves={eleves.rows}
        tuteurs={tuteurs}
        annonces={annonces}
        messages={messages}
        notifications={notifications}
        file={file}
        peutPublierAnnonce={peutPublierAnnonce}
        peutVoirAnnonces={peutVoirAnnonces}
        peutVoirMessages={peutVoirMessages}
        peutEnvoyerMessage={peutEnvoyerMessage}
        peutTraiterFile={peutTraiterFile}
        messageRequiresStudent={acteur.role === "ENSEIGNANT"}
      />
    </main>
  );
}
