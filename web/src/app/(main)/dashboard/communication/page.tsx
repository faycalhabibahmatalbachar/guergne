import type { Metadata } from "next";

import {
  etatFileNotifications, listerAnnonces, listerElevesActifs, listerMessages,
  listerNotifications, listerTuteursAvecCompte,
} from "@/server/domain/communication";
import { listerNiveaux } from "@/server/domain/parametres";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { actionsAutorisees } from "@/server/guard/actions-autorisees";
import { exigerPage } from "@/server/guard";

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
  const acteur = await exigerPage("annonce:publier");
  const annee = await chargerAnneeCourante();
  if (!annee) {
    return <main className="gentelella-v4 min-w-0 pb-6" data-skin="gentelella-v4">
      <div className="space-y-6"><h1 className="text-2xl font-semibold tracking-tight">Communication</h1>
        <Prerequis titre="Aucune année scolaire n'est configurée" explication="Les annonces sont rattachées à une année scolaire, ce qui permet de les archiver à sa clôture."
          manquants={[{libelle:"Configurer l'année scolaire",url:"/dashboard/parametres"}]}/>
      </div>
    </main>;
  }

  const droits = new Set(await actionsAutorisees(acteur.role));
  const peutTraiterFile = droits.has("notification:configurer");
  const peutEnvoyerMessage = droits.has("message:envoyer");
  const peutLireMessages = peutEnvoyerMessage || droits.has("message:lire");
  const [{classes}, niveaux, annonces, messages, notifications, file, eleves, tuteurs] = await Promise.all([
    listerClassesEtMatieres(annee.id),
    listerNiveaux(),
    listerAnnonces(annee.id),
    peutLireMessages ? listerMessages(acteur.id) : Promise.resolve([]),
    peutTraiterFile ? listerNotifications(100) : Promise.resolve([]),
    peutTraiterFile ? etatFileNotifications() : Promise.resolve(null),
    listerElevesActifs(annee.id),
    peutEnvoyerMessage ? listerTuteursAvecCompte(annee.id) : Promise.resolve([]),
  ]);

  return <main className="gentelella-v4 min-w-0 pb-6" data-skin="gentelella-v4"><Communication
    anneeId={annee.id} anneeLibelle={annee.libelle}
    niveaux={niveaux.map((x)=>({id:x.id,libelle:x.libelle}))}
    classes={classes.map((x)=>({id:x.id,libelle:x.libelle}))}
    eleves={eleves.rows} tuteurs={tuteurs} annonces={annonces} messages={messages}
    notifications={notifications} file={file} peutTraiterFile={peutTraiterFile} peutEnvoyerMessage={peutEnvoyerMessage}
  /></main>;
}
