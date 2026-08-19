import type { Metadata } from "next";

import {
  etatFileNotifications,
  listerAnnonces,
  listerElevesActifs,
  listerMessages,
  listerNotifications,
  listerTuteursAvecCompte,
} from "@/server/domain/communication";
import { listerNiveaux } from "@/server/domain/parametres";
import { listerClassesEtMatieres } from "@/server/domain/personnel";
import { chargerAnneeCourante } from "@/server/domain/tableau-de-bord";
import { exigerPage } from "@/server/guard";

import { Prerequis } from "../_components/prerequis";
import { Communication } from "./_components/communication";

export const metadata: Metadata = { title: "Communication" };
export const dynamic = "force-dynamic";

export default async function PageCommunication() {
  const acteur = await exigerPage("annonce:lire");
  const annee = await chargerAnneeCourante();

  if (!annee) {
    return (
      <div className="space-y-6">
        <h1 className="font-semibold text-2xl tracking-tight">Communication</h1>
        <Prerequis
          titre="Aucune année scolaire n'est configurée"
          explication="Les annonces sont rattachées à une année scolaire, ce qui permet de les archiver à sa clôture."
          manquants={[{ libelle: "Configurer l'année scolaire", url: "/dashboard/parametres" }]}
        />
      </div>
    );
  }

  const [{ classes }, niveaux, annonces, messages, notifications, file, eleves, tuteurs] =
    await Promise.all([
      listerClassesEtMatieres(annee.id),
      listerNiveaux(),
      listerAnnonces(annee.id),
      listerMessages(acteur.id),
      listerNotifications(50),
      etatFileNotifications(),
      listerElevesActifs(annee.id),
      listerTuteursAvecCompte(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Communication</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Année {annee.libelle}. Push pour les familles équipées, SMS pour les autres — aucune
          famille n&apos;est laissée sans information.
        </p>
      </div>

      <Communication
        anneeId={annee.id}
        anneeLibelle={annee.libelle}
        niveaux={niveaux.map((n) => ({ id: n.id, libelle: n.libelle }))}
        classes={classes.map((c) => ({ id: c.id, libelle: c.libelle }))}
        eleves={eleves.rows}
        tuteurs={tuteurs}
        annonces={annonces}
        messages={messages}
        notifications={notifications}
        file={file}
      />
    </div>
  );
}
