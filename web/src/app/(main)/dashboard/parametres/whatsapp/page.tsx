import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";

import { exigerPage } from "@/server/guard";
import { configurationAppairage, lireEtatWhatsApp } from "@/server/whatsapp/appairage-agent";

import { WhatsAppConnexion } from "../_components/whatsapp-connexion";

/**
 * Connexion WhatsApp — état et code QR.
 *
 * LIEN PERMANENT. Cette page existe en tout temps, qu'un code soit disponible
 * ou non : c'est ce qui la rend utilisable le jour où la session tombe. Avant
 * elle, lire le QR demandait d'ouvrir une session SFTP sur le conteneur pour y
 * chercher un jeton — une manœuvre qu'on ne mène pas depuis un téléphone, un
 * dimanche, quand l'agent ne répond plus.
 *
 * ACCÈS. `systeme:administrer`, vérifié ici et de nouveau dans chacune des deux
 * routes qui servent l'état et l'image. Associer un appareil à un compte
 * WhatsApp n'est pas un geste de gestion scolaire : la DIRECTION, qui détient
 * par ailleurs tous les droits métier, n'a pas celui-ci.
 *
 * Le premier état est rendu côté serveur pour que la page soit juste dès le
 * premier affichage, sans attendre un aller-retour.
 */
export const metadata: Metadata = { title: "Connexion WhatsApp — Paramètres" };
export const dynamic = "force-dynamic";

export default async function PageConnexionWhatsApp() {
  await exigerPage("systeme:administrer");

  const conf = configurationAppairage();
  const initial = conf.ok
    ? await lireEtatWhatsApp()
    : {
        appairage: { etat: "attente" as const, qrDisponible: false, resteMs: 0 },
        transport: null,
        agentJoignable: false,
        indisponibilite: `Liaison non configurée : ${conf.manque.join(", ")} absente(s) de ce déploiement.`,
      };

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-8">
      <div>
        <h1 className="flex items-center gap-2 font-semibold tracking-tight">
          <MessageSquare className="size-6 text-primary" aria-hidden />
          Connexion WhatsApp — État et code QR
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          État réel de la session de l'assistant WhatsApp, lu auprès de l'agent lui-même. Le code affiché ici est celui
          que l'agent propose à cet instant : il n'est pas reconstitué, pas simulé, et il n'existe nulle part ailleurs.
        </p>
      </div>

      <WhatsAppConnexion initial={initial} />
    </main>
  );
}
