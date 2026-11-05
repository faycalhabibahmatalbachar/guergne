/**
 * Envoi d'UNE note vocale de test, de bout en bout.
 *
 * POURQUOI CE DÉCLENCHEUR EXISTE
 * -------------------------------
 * La session WhatsApp est détenue par un seul processus — c'est le rôle du
 * verrou, et ouvrir un second client ferait bannir le numéro de
 * l'établissement. Éprouver une note vocale réelle exige donc de la demander à
 * l'agent lui-même, depuis sa session déjà authentifiée.
 *
 * POURQUOI LA BORNE PORTE SUR LES RÔLES
 * --------------------------------------
 * Comme pour les notifications de test : le destinataire n'est jamais une
 * valeur fournie par l'appelant, mais une identité provisionnée, active, et de
 * rôle dirigeant, lue dans le magasin d'identités qui vit sur le volume du
 * serveur. Aucun numéro de téléphone ne figure donc dans le dépôt.
 *
 * CE QUE CETTE ROUTE NE DOIT PAS DEVENIR
 * ---------------------------------------
 * Une porte d'envoi de vocaux arbitraires. Le texte est figé ici, le
 * destinataire est choisi parmi des rôles, et une fenêtre minimale empêche
 * d'en faire un canal.
 */
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";

import { decrireErreur, resumerErreur } from "../erreurs.js";

/** Les rôles joignables. Les mêmes que pour les notifications de test. */
export const ROLES_VOIX = Object.freeze(["SUPER_ADMIN", "DIRECTION"]);

const CIBLES_VALIDES = Object.freeze(["SUPER_ADMIN", "DIRECTION"]);

/**
 * Langues acceptées par la route.
 *
 * « bilingue » existe pour une raison précise : éprouver les DEUX voix de
 * l'établissement sans envoyer deux notes vocales. Une seule note, deux
 * modèles, un seul envoi à justifier.
 */
const LANGUES_VALIDES = Object.freeze(["fr", "ar", "bilingue"]);

/** Un envoi par destinataire et par fenêtre. Au-delà, c'est une campagne. */
const FENETRE_MS = 5 * 60 * 1000;

/**
 * Pause avant de relire l'acquittement.
 *
 * WhatsApp rend `ack: 0` a l'instant de l'acceptation : relire tout de suite
 * ne prouverait rien. Quelques secondes suffisent pour voir passer « parti du
 * serveur », parfois « livre ».
 */
const DELAI_AVANT_RELECTURE_MS = Number(process.env.DELAI_ACK_MS ?? 4000);

/**
 * Le texte, composé ici.
 *
 * Il annonce ce qu'il est dès la première phrase, et ne contient aucune donnée
 * d'élève, de parent ou de personnel.
 */
export const TEXTE_TEST = [
  "Bonjour. Ceci est un message vocal de test envoyé par l'assistant intelligent",
  "du Lycée Guergné La Renaissance. Notre moteur de synthèse vocale est maintenant",
  "opérationnel. Je vous transmets ce message pour confirmer le fonctionnement de",
  "notre assistant vocal. Merci.",
].join(" ");

/**
 * Les deux parties de l'essai bilingue.
 *
 * Chacune est synthétisée par son propre modèle — `fr_FR-siwis-medium` et
 * `ar_JO-kareem-medium` — puis les deux audios sont assemblés en un seul
 * fichier. La voix arabe est un modèle jordanien : elle est correcte en arabe
 * standard, et ce n'est pas une voix tchadienne.
 */
export const PARTIES_BILINGUES = Object.freeze([
  Object.freeze({
    langue: "fr",
    texte:
      "Bonjour. Ceci est un test du système vocal du Lycée Guergné La Renaissance. " +
      "La synthèse française fonctionne et la transmission WhatsApp est en cours de validation.",
  }),
  Object.freeze({
    langue: "ar",
    texte:
      "مرحباً، هذا اختبار للنظام الصوتي لثانوية قرقني النهضة. " +
      "يتم التحقق من عمل الصوت والإرسال عبر واتساب.",
  }),
]);

/** Comparaison à temps constant : une comparaison naïve fuite la longueur du préfixe. */
function jetonValide(fourni, attendu) {
  if (!attendu || !fourni) return false;
  const a = Buffer.from(String(fourni));
  const b = Buffer.from(String(attendu));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class DiagnosticVoix {
  /**
   * @param {object} o
   * @param {string} o.jetonAttendu
   * @param {(role:string)=>Promise<string[]>} o.destinataires
   * @param {object} o.voix          fournisseur de synthèse
   * @param {object} o.audio         { preparerNoteVocale }
   * @param {object} o.provider      transport WhatsApp, pour `sendAudio`
   * @param {string} o.dossierTemporaire
   */
  constructor({ jetonAttendu, destinataires, voix, audio, provider, dossierTemporaire, horloge = () => Date.now(), journal = null, delaiAcquittementMs = DELAI_AVANT_RELECTURE_MS } = {}) {
    if (typeof destinataires !== "function") throw new Error("DiagnosticVoix : `destinataires` requis");
    this._jeton = jetonAttendu;
    this._destinataires = destinataires;
    this._voix = voix;
    this._audio = audio;
    this._provider = provider;
    this._dossier = dossierTemporaire;
    this._horloge = horloge;
    this._journal = journal;
    this._delaiAck = delaiAcquittementMs;
    this._derniers = new Map();
  }

  /**
   * Fabrique et envoie la note vocale.
   *
   * Chaque étape est chronométrée séparément : sans cela, « c'est lent » ne dit
   * pas s'il faut optimiser la synthèse, la conversion ou le transport.
   */
  async declencher({ jeton, cible = "SUPER_ADMIN", langue = "fr", texte = null } = {}) {
    if (!this._jeton) {
      return { status: 503, corps: { ok: false, message: "Diagnostic indisponible : service non configure." } };
    }
    if (!jetonValide(jeton, this._jeton)) {
      this._journal?.({ type: "voix_diagnostic", evenement: "refus", raison: "jeton" });
      return { status: 401, corps: { ok: false, message: "Service non authentifie." } };
    }
    // Appartenance a une liste figee, jamais une recherche de propriete : la
    // seconde est trompee par les cles heritees du prototype.
    if (!CIBLES_VALIDES.includes(cible)) {
      return { status: 400, corps: { ok: false, message: `Cible inconnue : ${String(cible).slice(0, 20)}.` } };
    }
    if (!LANGUES_VALIDES.includes(langue)) {
      return { status: 400, corps: { ok: false, message: `Langue inconnue : ${String(langue).slice(0, 10)}.` } };
    }

    const jids = (await this._destinataires(cible)) ?? [];
    if (jids.length === 0) {
      return { status: 409, corps: { ok: false, message: "Aucune identite active pour ce role : rien a joindre." } };
    }
    const jid = jids[0];
    const empreinte = `${cible}:${jid.split("@")[0].slice(-4)}`;

    const maintenant = this._horloge();
    const dernier = this._derniers.get(empreinte) ?? 0;
    if (maintenant - dernier < FENETRE_MS) {
      const resteS = Math.ceil((FENETRE_MS - (maintenant - dernier)) / 1000);
      return { status: 429, corps: { ok: false, message: `Deja envoye recemment ; reessayez dans ${resteS} s.` } };
    }

    // Le texte peut etre impose pour un essai en arabe, mais il reste borne :
    // une route qui accepte un texte illimite devient une porte d'envoi.
    // Les parties à synthétiser. En bilingue, le texte est figé ici : il n'y a
    // aucun sens à laisser l'appelant composer deux langues.
    const parties =
      langue === "bilingue"
        ? PARTIES_BILINGUES.map((p) => ({ ...p }))
        : [{ langue, texte: String(texte ?? TEXTE_TEST).trim().slice(0, 600) }];

    const etapes = {};
    /** Les WAV de chaque partie, à effacer quoi qu'il arrive. */
    const morceaux = [];
    let wav = null;
    let ogg = null;

    try {
      const t0 = this._horloge();
      // Une partie après l'autre : le moteur Piper ne prend qu'un travail à la
      // fois, et deux appels concurrents se seraient mis en file de toute façon.
      etapes.parties = [];
      for (const p of parties) {
        const debutPartie = this._horloge();
        const s = await this._voix.synthesize({ text: p.texte, language: p.langue, outputFormat: "wav" });
        morceaux.push(s.chemin);
        etapes.parties.push({
          langue: p.langue,
          caracteres: p.texte.length,
          synthese_ms: this._horloge() - debutPartie,
          modele: s.modele ?? null,
        });
      }
      etapes.synthese_ms = this._horloge() - t0;

      if (morceaux.length > 1) {
        const tAssemblage = this._horloge();
        const assemble = join(this._dossier, `voix-test-${maintenant}-assemble.wav`);
        // Consigne tout de suite : si l'envoi echoue ensuite, ce fichier doit
        // disparaitre comme les autres.
        morceaux.push(assemble);
        const r = await this._audio.assemblerWavs(morceaux.slice(0, -1), assemble);
        etapes.assemblage_ms = this._horloge() - tAssemblage;
        wav = r.chemin;
      } else {
        wav = morceaux[0];
      }

      const t1 = this._horloge();
      ogg = join(this._dossier, `voix-test-${maintenant}.ogg`);
      const rapport = await this._audio.preparerNoteVocale(wav, ogg);
      etapes.conversion_ms = this._horloge() - t1;
      wav = null; // supprime par `preparerNoteVocale`

      const t2 = this._horloge();
      const { readFile } = await import("node:fs/promises");
      const octets = await readFile(ogg);
      // Le transport existant, jamais un second : `sendAudio` porte deja
      // `sendAudioAsVoice: true`. Le type est annonce COMPLET, parametre
      // compris : c'est ainsi que WhatsApp etiquette ses propres notes
      // vocales, et le depouiller n'avait rien corrige (voir `sendAudio`).
      const envoi = await this._provider.sendAudio(jid, { data: octets, mimetype: "audio/ogg; codecs=opus" });
      etapes.envoi_ms = this._horloge() - t2;
      etapes.total_ms = this._horloge() - t0;

      // « Accepte » et « livre » sont deux faits distincts. On relit donc
      // l'acquittement apres une courte pause : c'est la seule facon de
      // distinguer un media parti d'un media recu.
      let acquittement = null;
      if (envoi?.id && typeof this._provider.acquittement === "function") {
        await new Promise((r) => setTimeout(r, this._delaiAck));
        acquittement = await this._provider.acquittement(envoi.id);
      }

      this._derniers.set(empreinte, maintenant);
      this._journal?.({
        type: "voix_diagnostic",
        evenement: "envoye",
        cible: empreinte,
        langue,
        dureeS: rapport.dureeS,
        ...etapes,
      });

      return {
        status: 200,
        corps: {
          ok: true,
          destinataire: empreinte,
          langue,
          moteur: this._voix.getCapabilities?.().moteur ?? "inconnu",
          audio: {
            format: `${rapport.conteneur} / ${rapport.codec}`,
            echantillonnage: rapport.echantillonnage,
            canaux: rapport.canaux,
            dureeS: rapport.dureeS,
            octets: rapport.taille,
          },
          etapes,
          // L'identifiant rendu par la passerelle, quand elle en rend un.
          // La fraction opaque de l'identifiant WhatsApp : elle suffit a
          // retrouver le message, et ne porte aucun numero de telephone.
          messageId: envoi?.idPartie ?? null,
          voieEnvoi: envoi?.voie ?? null,
          ack: envoi?.ack ?? null,
          acquittement,
          doublonEvite: Boolean(envoi?.doublonEvite),
          envoiAccepte: true,
          // « Accepte » n'est pas « ecoute ». La passerelle accuse la prise en
          // charge ; la lecture ne se constate que sur le telephone.
          avertissement:
            "« envoiAccepte » signifie que WhatsApp a pris le media en charge. " +
            "Ni la livraison ni l'ecoute ne sont prouvees par cette reponse.",
        },
      };
    } catch (e) {
      const raison = resumerErreur(e, { max: 300 });
      this._journal?.({
        type: "voix_diagnostic",
        evenement: "echec",
        cible: empreinte,
        langue,
        raison,
        detail: decrireErreur(e),
        ...etapes,
      });
      return { status: 502, corps: { ok: false, message: raison, detail: decrireErreur(e), etapes } };
    } finally {
      // Aucun temporaire ne survit a l'essai, succes ou echec.
      const { unlink } = await import("node:fs/promises");
      // Les parties assemblees comptent aussi : un essai bilingue qui echoue
      // laisserait deux WAV de plusieurs megaoctets sur le volume.
      for (const f of [wav, ogg, ...morceaux]) if (f) await unlink(f).catch(() => {});
    }
  }
}
