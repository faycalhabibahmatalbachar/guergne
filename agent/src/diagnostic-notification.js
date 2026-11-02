/**
 * Déclencheur de notification de TEST, strictement borné.
 *
 * POURQUOI CE MÉCANISME EXISTE
 * -----------------------------
 * La session WhatsApp est détenue par un seul processus — c'est le rôle du
 * verrou d'instance, et ouvrir un second client ferait bannir le numéro de
 * l'établissement. Éprouver une notification sortante exige donc de demander à
 * l'agent lui-même de l'envoyer.
 *
 * POURQUOI IL EST AUSSI ÉTROIT
 * -----------------------------
 * Une route qui envoie des messages WhatsApp est, par nature, une arme. Celle-ci
 * est volontairement incapable de servir à autre chose qu'à ce pour quoi elle
 * existe :
 *
 *   - les destinataires viennent du magasin d'identités, et le paramètre ne
 *     fait que CHOISIR un rôle parmi une liste gelée — aucune valeur fournie
 *     de l'extérieur ne devient un numéro ;
 *   - le contenu est **figé**, composé ici, jamais reçu de l'appelant ;
 *   - le jeton de service est exigé, comparé en temps constant ;
 *   - une fréquence maximale empêche d'en faire un canal ;
 *   - la déduplication de la file empêche le doublon ;
 *   - aucune écriture scolaire n'est accessible par ce chemin.
 *
 * Ces contraintes ne sont pas des précautions décoratives : sans elles, cette
 * route serait exactement la porte d'envoi public que l'on refuse d'ouvrir.
 */
import { timingSafeEqual } from "node:crypto";

/**
 * Rôles joignables par ce mécanisme.
 *
 * POURQUOI DES RÔLES, ET NON DES NUMÉROS
 * ---------------------------------------
 * Une première version portait les deux numéros autorisés en dur. C'était une
 * borne solide — mais elle inscrivait des numéros personnels dans Git, de
 * façon durable et pour tous ceux qui clonent le dépôt. La règle du projet est
 * qu'un numéro ne figure jamais dans le dépôt, les journaux ou la
 * documentation.
 *
 * La borne porte donc sur les RÔLES, et les numéros viennent du magasin
 * d'identités, qui vit sur le volume du serveur. La propriété de sécurité est
 * préservée, et même renforcée : ce mécanisme ne peut joindre que des
 * identités **provisionnées, actives, et de rôle dirigeant** — jamais une
 * valeur fournie par l'appelant.
 */
export const ROLES_DIAGNOSTIC = Object.freeze(["SUPER_ADMIN", "DIRECTION"]);

/** Les seules cibles acceptables. Toute autre valeur est refusée. */
const CIBLES_VALIDES = Object.freeze(["SUPER_ADMIN", "DIRECTION", "tous"]);

/** Un envoi par destinataire et par fenêtre. Au-delà, c'est une campagne. */
const FENETRE_MS = 10 * 60 * 1000;

/** Le texte, composé ici. Aucune donnée scolaire, aucun nom, aucun chiffre réel. */
export function messageDeTest({ cible, horodatage }) {
  return [
    "[TEST TECHNIQUE — Lycee Guergne La Renaissance]",
    "",
    "Ceci est un message de verification du service de notification.",
    "Aucune action n'est attendue de votre part.",
    "Il ne contient aucune donnee d'eleve, de parent ou de personnel.",
    "",
    `Destinataire : ${cible}`,
    `Emis le : ${horodatage}`,
  ].join("\n");
}

/** Comparaison à temps constant : une comparaison naïve fuite la longueur du préfixe. */
function jetonValide(fourni, attendu) {
  if (!attendu || !fourni) return false;
  const a = Buffer.from(String(fourni));
  const b = Buffer.from(String(attendu));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class DiagnosticNotification {
  /**
   * @param {object} o
   * @param {string} o.jetonAttendu          `AGENT_SERVICE_TOKEN`
   * @param {{envoyerMaintenant:Function}} o.file
   * @param {(role:string) => Promise<string[]>} o.destinataires  magasin d'identités
   * @param {() => number} [o.horloge]
   * @param {(e:object) => void} [o.journal]
   */
  constructor({ jetonAttendu, file, destinataires, horloge = () => Date.now(), journal = null } = {}) {
    if (typeof destinataires !== "function") throw new Error("DiagnosticNotification : `destinataires` requis");
    this._jeton = jetonAttendu;
    this._file = file;
    this._destinataires = destinataires;
    this._horloge = horloge;
    this._journal = journal;
    /** Dernier envoi par cible, pour la limitation de fréquence. */
    this._derniers = new Map();
  }

  /**
   * Déclenche l'envoi.
   *
   * @param {object} o
   * @param {string} o.jeton   celui présenté par l'appelant
   * @param {string} [o.cible] `SUPER_ADMIN`, `DIRECTION`, ou `tous` par défaut
   * @returns {Promise<{status:number, corps:object}>}
   */
  async declencher({ jeton, cible = "tous" }) {
    if (!this._jeton) {
      // Sans jeton configuré, la route doit être inerte : une comparaison
      // contre `undefined` laisserait tout passer.
      return { status: 503, corps: { ok: false, message: "Diagnostic indisponible : service non configure." } };
    }
    if (!jetonValide(jeton, this._jeton)) {
      this._journal?.({ type: "diagnostic", evenement: "refus", raison: "jeton" });
      return { status: 401, corps: { ok: false, message: "Service non authentifie." } };
    }

    // Appartenance a une liste figee, jamais une recherche de propriete : la
    // seconde est trompee par les cles heritees du prototype (`__proto__`,
    // `constructor`), et la borne ne bornerait plus rien.
    if (!CIBLES_VALIDES.includes(cible)) {
      return { status: 400, corps: { ok: false, message: `Cible inconnue : ${String(cible).slice(0, 20)}.` } };
    }
    const roles = cible === "tous" ? [...ROLES_DIAGNOSTIC] : [cible];

    // Les numeros viennent du magasin d'identites, jamais de l'appelant.
    const parRole = new Map();
    for (const role of roles) {
      for (const jid of (await this._destinataires(role)) ?? []) parRole.set(jid, role);
    }
    if (parRole.size === 0) {
      return {
        status: 409,
        corps: { ok: false, message: "Aucune identite active pour ces roles : rien a joindre." },
      };
    }

    const maintenant = this._horloge();
    const resultats = [];
    for (const [jid, role] of parRole) {
      // La cle de limitation porte le role et les quatre derniers chiffres :
      // elle ne divulgue aucun numero, et distingue deux destinataires du meme
      // role.
      const c = `${role}:${jid.split("@")[0].slice(-4)}`;
      const dernier = this._derniers.get(c) ?? 0;
      if (maintenant - dernier < FENETRE_MS) {
        const resteS = Math.ceil((FENETRE_MS - (maintenant - dernier)) / 1000);
        resultats.push({ cible: c, etat: "limite", detail: `reessayez dans ${resteS} s` });
        continue;
      }

      const horodatage = new Date(maintenant).toISOString().replace("T", " ").slice(0, 19) + " UTC";
      // La cle porte la fenetre de dix minutes : deux appels rapprochés ne
      // produisent jamais deux messages, meme apres un redemarrage.
      const fenetre = Math.floor(maintenant / FENETRE_MS);
      const r = await this._file.envoyerMaintenant({
        jid,
        texte: messageDeTest({ cible: role, horodatage }),
        cle: `diagnostic:${fenetre}:${c}`,
        run: `diag_${fenetre}`,
      });
      this._derniers.set(c, maintenant);
      resultats.push({
        cible: c,
        etat: r.envoyee ? "accepte_par_la_passerelle" : r.raison === "doublon" ? "doublon_ignore" : "en_file",
      });
      // Jamais le numero : il finirait dans les journaux du serveur.
      this._journal?.({ type: "diagnostic", evenement: "envoi", cible: c, etat: resultats.at(-1).etat });
    }

    return {
      status: 200,
      corps: {
        ok: true,
        // « Accepte » n'est pas « livre » : la passerelle accuse la prise en
        // charge, pas la reception sur le telephone.
        avertissement: "« accepte_par_la_passerelle » ne prouve pas la livraison.",
        resultats,
      },
    };
  }
}
