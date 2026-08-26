import "server-only";

import { after } from "next/server";

import { traiterFile } from "./expediteur";

/**
 * Vide la file de notifications DÈS l'action qui l'a remplie.
 *
 * POURQUOI LE CRON NE SUFFIT PAS
 * -------------------------------
 * La file était drainée uniquement par une tâche planifiée. Elle fonctionne —
 * les envois partent bien — mais avec un délai mesuré entre 169 et 422
 * secondes : de trois à sept minutes entre le moment où le surveillant saisit
 * une absence et celui où le parent la reçoit.
 *
 * Pour un parent, sept minutes ne se distinguent pas d'un envoi manuel. Il
 * consulte l'application, ne voit rien, referme — et l'alerte arrive quand il
 * a le téléphone dans la poche. Le canal perd exactement ce qui le rendait
 * utile : l'immédiateté.
 *
 * POURQUOI `after` ET NON UN SIMPLE APPEL
 * ----------------------------------------
 * Attendre l'expédition avant de répondre ferait patienter le surveillant
 * pendant l'aller-retour vers Firebase et la passerelle SMS — plusieurs
 * secondes sur un réseau tchadien, à chaque absence saisie. `after` exécute le
 * travail APRÈS l'envoi de la réponse, dans la même invocation : l'écran rend
 * la main immédiatement et la notification part dans la seconde.
 *
 * Sans `after`, un `void traiterFile()` non attendu serait tué par le gel de
 * la fonction serverless dès la réponse rendue — le travail ne se ferait pas,
 * et rien ne le signalerait.
 *
 * LE CRON RESTE, ET C'EST VOULU
 * ------------------------------
 * Il devient un filet : il rattrape ce qu'un réveil manqué aurait laissé —
 * une notification produite par un déclencheur de base sans action applicative
 * derrière, une expédition interrompue, un envoi à réessayer plus tard.
 *
 * ON N'EXPÉDIE QU'UN PETIT LOT
 * -----------------------------
 * Vingt suffisent à faire partir ce que l'action vient de créer. Vider la file
 * entière ici ferait porter à l'utilisateur qui saisit une absence le coût de
 * l'arriéré de toute l'école.
 */
export function reveillerFile(): void {
  after(async () => {
    try {
      await traiterFile(20);
    } catch (erreur) {
      // Un réveil qui échoue ne doit jamais faire échouer l'action métier :
      // l'absence est enregistrée, la notification attendra le cron.
      console.error("[reveil-file]", erreur);
    }
  });
}
