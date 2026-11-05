/**
 * Porte-voix : faire parler les réponses de l'agent, sans toucher au moteur.
 *
 * LE PROBLÈME QUE CE MODULE RÉSOUT
 * ---------------------------------
 * La synthèse vocale fonctionnait, mais n'était reliée à rien : seule une
 * route de diagnostic savait produire une note vocale. Le moteur de l'agent,
 * lui, appelle `provider.sendText` depuis une quinzaine d'endroits. Plutôt que
 * de modifier ces quinze endroits — et d'en oublier un — on enveloppe le
 * transport : tout ce qui part en texte peut désormais partir aussi en voix.
 *
 * CE QUE L'ENVELOPPE GARANTIT
 * ----------------------------
 * 1. Le texte part TOUJOURS d'abord, et son succès ne dépend jamais de la voix.
 *    Un moteur vocal en panne ne doit pas transformer une réponse en silence.
 * 2. Une note vocale qui échoue est consignée, jamais masquée, jamais fatale.
 * 3. Rien n'est synthétisé pour les destinataires hors périmètre. Par défaut
 *    seuls les rôles dirigeants reçoivent de la voix : envoyer des notes
 *    vocales aux parents de l'établissement est une décision de direction, pas
 *    un effet de bord d'un correctif technique.
 * 4. Les textes trop longs restent écrits. Découper une réponse en cinq notes
 *    vocales serait une nuisance, et le temps de synthèse mesuré sur Altare
 *    (environ 1,3 s de calcul par seconde d'audio, sur un cœur) l'interdit.
 * 5. Un seul vocal à la fois par destinataire : deux réponses simultanées
 *    arriveraient dans un ordre arbitraire.
 */
import { join } from "node:path";
import { readFile, unlink } from "node:fs/promises";

import { detecterLangue, normaliserPourOral } from "./texte-oral.js";
import { resumerErreur } from "../erreurs.js";

/** Les trois modes de réponse. Le texte seul reste le comportement de repli. */
export const MODES = Object.freeze(["texte", "voix", "texte_et_voix"]);

/**
 * Au-delà de cette longueur, la réponse reste écrite.
 *
 * Mesuré sur Altare : 303 caractères donnent 17 s d'audio pour 12 à 22 s de
 * synthèse. 700 caractères sont donc déjà une note vocale de 40 s — la limite
 * de ce qu'on écoute volontiers.
 */
export const CARACTERES_MAX_VOCAL = Number(process.env.VOIX_CARACTERES_MAX ?? 700);

/** En deçà, la voix n'apporte rien : « Opération annulée. » se lit. */
export const CARACTERES_MIN_VOCAL = Number(process.env.VOIX_CARACTERES_MIN ?? 25);

/**
 * Enveloppe un transport WhatsApp pour qu'il parle.
 *
 * @param {object} provider  le transport réel, inchangé
 * @param {object} o
 * @param {() => object|null} o.moteur  accès paresseux au fournisseur de synthèse
 * @param {object} o.audio  { preparerNoteVocale }
 * @param {string} o.dossierTemporaire
 * @param {string} [o.mode]  « texte » | « voix » | « texte_et_voix »
 * @param {(jid:string)=>string|null} [o.roleDe]  rôle du destinataire, pour le périmètre
 * @param {string[]} [o.roles]  rôles autorisés à recevoir de la voix
 * @returns {object} un transport équivalent, qui parle
 */
export function avecVoix(provider, {
  moteur,
  audio,
  dossierTemporaire,
  mode = process.env.AGENT_REPONSE_VOCALE ?? "texte_et_voix",
  roleDe = null,
  roles = (process.env.AGENT_VOIX_ROLES ?? "SUPER_ADMIN").split(",").map((r) => r.trim()).filter(Boolean),
  langueParDefaut = process.env.AGENT_VOIX_LANGUE ?? "fr",
  journal = null,
  horloge = () => Date.now(),
} = {}) {
  const modeRetenu = MODES.includes(mode) ? mode : "texte";
  /** Langue entendue par destinataire, posée par la transcription. */
  const langues = new Map();
  /**
   * Rôle du destinataire, posé par le moteur après résolution d'identité.
   *
   * Indispensable : depuis la migration LID, le JID qui écrit n'est pas un
   * numéro, et le magasin d'identités est indexé par numéro. Chercher le rôle
   * depuis le seul JID conclurait « inconnu » pour tout le monde.
   */
  const rolesConnus = new Map();
  /** Un vocal à la fois par destinataire. */
  const enCours = new Map();
  const metriques = { tentes: 0, envoyes: 0, echecs: 0, ignores: 0, msCumules: 0 };

  const tracer = (ligne) => {
    try {
      journal?.({ type: "voix_reponse", ...ligne });
    } catch {
      /* un journal qui échoue ne doit pas emporter la réponse */
    }
  };

  function autorise(jid, texte) {
    if (modeRetenu === "texte") return "mode_texte";
    if (!moteur?.()) return "moteur_indisponible";
    const t = String(texte ?? "").trim();
    if (t.length < CARACTERES_MIN_VOCAL) return "texte_trop_court";
    if (t.length > CARACTERES_MAX_VOCAL) return "texte_trop_long";
    if (roleDe || rolesConnus.size > 0) {
      const role = rolesConnus.get(jid) ?? roleDe?.(jid) ?? null;
      // Un destinataire dont le rôle est inconnu ne reçoit pas de voix : dans
      // le doute, c'est un parent ou un numéro non lié.
      if (!role || !roles.includes(role)) return "hors_perimetre";
    }
    return null;
  }

  /** Fabrique et envoie la note vocale. Ne lève jamais. */
  async function parler(jid, texte, { run = null } = {}) {
    const fournisseur = moteur?.();
    if (!fournisseur) return { ok: false, raison: "moteur_indisponible" };

    const langue = langues.get(jid) ?? detecterLangue(texte) ?? langueParDefaut;
    const aDire = normaliserPourOral(texte, { langue });
    const t0 = horloge();
    let wav = null;
    let ogg = null;
    metriques.tentes += 1;
    tracer({ evenement: "tts_started", run, langue, caracteres: aDire.length });

    try {
      const synth = await fournisseur.synthesize({ text: aDire, language: langue, outputFormat: "wav" });
      wav = synth.chemin;
      const msSynthese = horloge() - t0;

      ogg = join(dossierTemporaire, `reponse-${horloge()}-${Math.random().toString(36).slice(2, 8)}.ogg`);
      const rapport = await audio.preparerNoteVocale(wav, ogg);
      wav = null; // supprimé par `preparerNoteVocale`

      const octets = await readFile(ogg);
      const envoi = await provider.sendAudio(jid, { data: octets, mimetype: "audio/ogg" });

      metriques.envoyes += 1;
      metriques.msCumules += horloge() - t0;
      tracer({
        evenement: "tts_envoye",
        run,
        langue,
        msSynthese,
        msTotal: horloge() - t0,
        dureeS: rapport.dureeS,
        octets: rapport.taille,
        voie: envoi?.voie ?? null,
        idPartie: envoi?.idPartie ?? null,
        ack: envoi?.ack ?? null,
      });
      return { ok: true, langue, dureeS: rapport.dureeS, ...envoi };
    } catch (e) {
      metriques.echecs += 1;
      // La réponse écrite est déjà partie : cet échec dégrade le service, il
      // ne le supprime pas. Il doit néanmoins être visible.
      tracer({ evenement: "tts_echec", run, langue, msTotal: horloge() - t0, raison: resumerErreur(e) });
      return { ok: false, raison: resumerErreur(e) };
    } finally {
      for (const f of [wav, ogg]) if (f) await unlink(f).catch(() => {});
    }
  }

  return new Proxy(provider, {
    get(cible, propriete, recepteur) {
      if (propriete === "sendText") {
        return async (jid, texte) => {
          // Le texte d'abord, toujours : c'est la réponse dont dépend le
          // compte rendu du moteur.
          const ecrit = modeRetenu === "voix" ? { ok: true, ignore: "mode_voix" } : await cible.sendText(jid, texte);

          const refus = autorise(jid, texte);
          if (refus) {
            metriques.ignores += 1;
            tracer({ evenement: "tts_ignore", raison: refus, caracteres: String(texte ?? "").length });
            // En mode « voix » pur, un refus ne doit pas laisser l'utilisateur
            // sans rien : on retombe sur l'écrit.
            if (modeRetenu === "voix") return cible.sendText(jid, texte);
            return ecrit;
          }

          // Sérialisation par destinataire : la file du moteur Piper ne prend
          // déjà qu'un travail, mais l'ordre des réponses compte pour qui lit.
          const precedent = enCours.get(jid) ?? Promise.resolve();
          const courant = precedent.then(() => parler(jid, texte));
          enCours.set(jid, courant.then(() => {}, () => {}));
          const vocal = await courant;

          if (modeRetenu === "voix" && !vocal.ok) return cible.sendText(jid, texte);
          return { ...ecrit, vocal };
        };
      }

      // La transcription dépose ici la langue entendue, pour que la réponse
      // parte dans la même langue que la question.
      if (propriete === "langueSouhaitee") {
        return (jid, langue) => {
          if (langue === "fr" || langue === "ar") langues.set(jid, langue);
        };
      }
      // Le moteur dépose ici ce que lui seul sait : le rôle derrière le JID.
      if (propriete === "contexteReponse") {
        return (jid, { role = null, langue = null } = {}) => {
          if (role) rolesConnus.set(jid, role);
          if (langue === "fr" || langue === "ar") langues.set(jid, langue);
        };
      }
      if (propriete === "metriquesVoix") return () => ({ ...metriques, mode: modeRetenu, roles: [...roles] });

      const v = Reflect.get(cible, propriete, recepteur);
      return typeof v === "function" ? v.bind(cible) : v;
    },
  });
}
