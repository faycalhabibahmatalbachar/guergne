import "server-only";

import { connect, type TLSSocket } from "node:tls";

import { preparerMessageSMTP } from "@/lib/smtp-message";

const SERVEUR = "smtp.gmail.com";
const PORT = 465;
const DELAI_CONNEXION = 12_000;
const DELAI_REPONSE = 12_000;

type ConfigSMTP = {
  utilisateur: string;
  motDePasseApplication: string;
};

function obtenirConfiguration(): ConfigSMTP | null {
  const hote = process.env.SMTP_HOST?.trim().toLowerCase();
  const port = process.env.SMTP_PORT?.trim();
  const tls = process.env.SMTP_SECURE?.trim().toLowerCase();
  const utilisateur = process.env.SMTP_USER?.trim().toLowerCase() ?? "";
  const expediteur = process.env.SMTP_FROM?.trim() ?? "";
  const motDePasseApplication = process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "") ?? "";

  // La première version ne se connecte qu'aux serveurs Google, en TLS strict.
  if (hote !== SERVEUR || port !== String(PORT) || tls !== "true") return null;
  if (!/^[^\s@<>]+@gmail\.com$/.test(utilisateur)) return null;
  if (motDePasseApplication.length !== 16) return null;
  if (expediteur.toLowerCase() !== utilisateur) return null;
  return { utilisateur, motDePasseApplication };
}

export function smtpDisponible(): boolean {
  return obtenirConfiguration() !== null && (process.env.AUTH_SECRET?.length ?? 0) >= 24;
}

type ReponseSMTP = { code: number; lignes: string[] };

/** Lecteur des réponses SMTP : regroupe les réponses à une ou plusieurs lignes. */
class LecteurSMTP {
  private morceaux = "";
  private lignes: string[] = [];
  private codeEnCours: number | null = null;
  private file: ReponseSMTP[] = [];
  private attente: ((resultat: ReponseSMTP) => void) | null = null;
  private erreur: Error | null = null;
  private rejeter: ((erreur: Error) => void) | null = null;

  constructor(private readonly socket: TLSSocket) {
    socket.on("data", (donnees: Buffer) => {
      this.morceaux += donnees.toString("utf8");
      if (this.morceaux.length > 64_000) {
        socket.destroy(new Error("Réponse SMTP excessive"));
        return;
      }
      let position = this.morceaux.indexOf("\r\n");
      while (position !== -1) {
        const ligne = this.morceaux.slice(0, position);
        this.morceaux = this.morceaux.slice(position + 2);
        const correspondance = /^(\d{3})([- ])(.*)$/.exec(ligne);
        if (!correspondance) {
          socket.destroy(new Error("Réponse SMTP non conforme"));
          return;
        }
        const code = Number(correspondance[1]);
        if (this.codeEnCours !== null && code !== this.codeEnCours) {
          socket.destroy(new Error("Codes SMTP incohérents"));
          return;
        }
        this.codeEnCours = code;
        this.lignes.push(correspondance[3]);
        if (correspondance[2] === " ") {
          const resultat = { code, lignes: this.lignes };
          this.lignes = [];
          this.codeEnCours = null;
          if (this.attente) {
            const resolve = this.attente;
            this.attente = null;
            this.rejeter = null;
            resolve(resultat);
          } else this.file.push(resultat);
        }
        position = this.morceaux.indexOf("\r\n");
      }
    });

    socket.on("error", () => this.echouer(new Error("Connexion SMTP interrompue")));
    socket.on("close", () => this.echouer(new Error("Connexion SMTP fermée")));
  }

  private echouer(erreur: Error) {
    this.erreur = erreur;
    this.rejeter?.(erreur);
    this.attente = null;
    this.rejeter = null;
  }

  async lire(codes: number[]): Promise<ReponseSMTP> {
    if (this.erreur) throw this.erreur;
    let valeur = this.file.shift();
    if (!valeur) {
      valeur = await new Promise<ReponseSMTP>((resolve, reject) => {
        const chrono = setTimeout(() => {
          this.socket.destroy(new Error("Délai SMTP dépassé"));
        }, DELAI_REPONSE);
        this.attente = (reponse) => {
          clearTimeout(chrono);
          resolve(reponse);
        };
        this.rejeter = (erreur) => {
          clearTimeout(chrono);
          reject(erreur);
        };
      });
    }
    if (!codes.includes(valeur.code)) {
      // Ne jamais afficher la réponse brute : certains fournisseurs répercutent des données sensibles.
      throw new Error("SMTP réponse " + valeur.code);
    }
    return valeur;
  }
}

async function connexionSecurisee(): Promise<TLSSocket> {
  return new Promise<TLSSocket>((resolve, reject) => {
    const socket = connect({
      host: SERVEUR,
      port: PORT,
      servername: SERVEUR,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });
    const chrono = setTimeout(() => {
      socket.destroy();
      reject(new Error("Connexion SMTP indisponible"));
    }, DELAI_CONNEXION);
    socket.once("secureConnect", () => {
      clearTimeout(chrono);
      socket.removeListener("error", erreurConnexion);
      socket.setTimeout(20_000, () => socket.destroy());
      resolve(socket);
    });
    function erreurConnexion() {
      clearTimeout(chrono);
      reject(new Error("Échec TLS SMTP"));
    }
    socket.once("error", erreurConnexion);
  });
}

export async function envoyerParGmail(destinataire: string, lien: string, diagnostic = false): Promise<boolean> {
  const config = obtenirConfiguration();
  if (!config) return false;

  let socket: TLSSocket | undefined;
  try {
    const message = preparerMessageSMTP({
      expediteur: config.utilisateur,
      destinataire,
      lien,
      diagnostic,
    });
    socket = await connexionSecurisee();
    const lecteur = new LecteurSMTP(socket);
    await lecteur.lire([220]);
    const echanger = async (commande: string, codes: number[]) => {
      socket!.write(commande + "\r\n");
      return lecteur.lire(codes);
    };
    const bonjour = await echanger("EHLO lycee-guergne-renaissance.vercel.app", [250]);
    if (!bonjour.lignes.some((ligne) => /^AUTH\s.*\bPLAIN\b/i.test(ligne))) {
      throw new Error("SMTP AUTH PLAIN indisponible");
    }
    const secret = Buffer.from("\0" + config.utilisateur + "\0" + config.motDePasseApplication).toString("base64");
    await echanger("AUTH PLAIN " + secret, [235]);
    await echanger("MAIL FROM:<" + config.utilisateur + ">", [250]);
    await echanger("RCPT TO:<" + destinataire + ">", [250, 251]);
    await echanger("DATA", [354]);
    socket.write(message + ".\r\n");
    await lecteur.lire([250]); // Gmail a accepté le message dans sa file d'envoi.
    socket.write("QUIT\r\n");
    return true;
  } catch (erreur) {
    // N'expose jamais les identifiants, les liens ou les réponses complètes du serveur.
    console.error("[auth/reset/smtp] Échec de l'envoi", erreur instanceof Error ? erreur.name : "Erreur");
    return false;
  } finally {
    socket?.end();
    socket?.destroy();
  }
}
