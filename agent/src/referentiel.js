/**
 * Référentiel de l'établissement — ce que l'utilisateur nomme, et que l'API exige en UUID.
 *
 * POURQUOI CE MODULE EXISTE
 * --------------------------
 * Tout le catalogue d'outils parle en identifiants : `classeId`, `periodeId`.
 * Personne ne dicte un UUID sur WhatsApp. Un surveillant écrit « les absences
 * de la 6ème B » ou « au deuxième trimestre ». Sans correspondance, l'agent
 * n'avait que deux issues, toutes deux mauvaises : inventer un identifiant, ou
 * demander à l'utilisateur de saisir celui qu'il ne connaît pas. Il faisait la
 * seconde, et la conversation s'arrêtait là.
 *
 * Le référentiel fournit au modèle la liste RÉELLE des classes et des périodes.
 * Le modèle n'invente alors plus rien : il recopie une valeur parmi celles qu'on
 * lui a montrées, comme un humain choisit dans une liste déroulante.
 *
 * LE PÉRIMÈTRE EST CELUI DE L'ACTEUR, PAS CELUI DU SERVICE
 * ---------------------------------------------------------
 * Les listes passent par l'API agent avec l'en-tête `x-acteur-id` : le garde de
 * guergné les filtre comme pour une session web. Un professeur principal ne doit
 * pas découvrir, par le simple fait de parler à l'agent, les classes qui ne sont
 * pas les siennes. Le cache est donc indexé PAR ACTEUR — mutualiser les listes
 * entre acteurs contournerait le RBAC sans qu'aucune requête ne paraisse fautive.
 *
 * DURÉE DE VIE
 * ------------
 * Classes et périodes bougent quelques fois par an, pas à chaque message.
 * Les relire à chaque fois ajouterait deux allers-retours réseau à toute
 * demande ; ne jamais les relire ferait vivre un processus de plusieurs
 * semaines sur une liste périmée. D'où une péremption courte en regard de
 * l'année scolaire, longue en regard d'une conversation.
 */

const QUINZE_MINUTES = 15 * 60 * 1000;

/** Nombre de libellés présentés au modèle. Au-delà, l'invite devient illisible. */
const MAX_LIBELLES = 60;

export class Referentiel {
  /**
   * @param {object} o
   * @param {object} o.guergne      client exposant `listerClasses` / `listerPeriodes`
   * @param {number} [o.ttlMs]      péremption du cache
   * @param {() => number} [o.maintenant] horloge injectable (tests)
   */
  constructor({ guergne, ttlMs = QUINZE_MINUTES, maintenant = () => Date.now() }) {
    if (!guergne) throw new Error("Referentiel: client guergne requis");
    this._guergne = guergne;
    this._ttlMs = ttlMs;
    this._maintenant = maintenant;
    /** @type {Map<string, {echeance:number, classes:object[], periodes:object[]}>} */
    this._cache = new Map();
  }

  /** Vide le cache — utile après un changement d'année scolaire. */
  oublier() {
    this._cache.clear();
  }

  /**
   * Listes du référentiel pour un acteur donné.
   *
   * Un échec de lecture n'est jamais fatal : l'agent doit rester capable de
   * répondre, quitte à ne pas pouvoir nommer les classes. On renvoie donc des
   * listes vides plutôt que de propager l'erreur — et on ne met PAS en cache un
   * échec, pour que le message suivant réessaie.
   */
  async pour(acteurId) {
    const cle = String(acteurId ?? "");
    const connu = this._cache.get(cle);
    if (connu && connu.echeance > this._maintenant()) {
      return { classes: connu.classes, periodes: connu.periodes };
    }

    const ctx = { actorId: acteurId };
    const [rc, rp] = await Promise.all([
      this._guergne.listerClasses({}, ctx).catch(() => null),
      this._guergne.listerPeriodes({}, ctx).catch(() => null),
    ]);

    const classes = rc?.ok && Array.isArray(rc.data) ? rc.data : null;
    const periodes = rp?.ok && Array.isArray(rp.data) ? rp.data : null;

    // Lecture partiellement ou totalement ratée : on sert ce qu'on a, sans
    // graver l'échec dans le cache.
    if (classes === null || periodes === null) {
      return { classes: classes ?? [], periodes: periodes ?? [] };
    }

    this._cache.set(cle, {
      echeance: this._maintenant() + this._ttlMs,
      classes,
      periodes,
    });
    return { classes, periodes };
  }

  /**
   * Bloc à insérer dans l'invite du modèle.
   *
   * Les identifiants y figurent EN ENTIER : c'est précisément ce que le modèle
   * doit recopier. Les tronquer le forcerait à compléter de lui-même, c'est-à-dire
   * à inventer — l'inverse du but recherché.
   */
  /**
   * Le même référentiel, SANS identifiant : ce que le modèle doit connaître
   * pour comprendre « la 6e A » ou « le 2e trimestre », rien de plus. Les
   * identifiants ne lui servent à rien depuis que le résolveur central les
   * retrouve — et ce qu'il ne voit pas, il ne peut ni le recopier de travers
   * ni le réclamer à l'utilisateur.
   */
  static enLibelles({ classes = [], periodes = [] }) {
    if (!classes.length && !periodes.length) {
      return "Referentiel indisponible pour l'instant : transmets la classe ou la periode telle que l'utilisateur l'a dite, elle sera verifiee ensuite.";
    }
    const lignes = [];
    if (classes.length) {
      lignes.push("Classes de l'annee en cours : " + classes.slice(0, MAX_LIBELLES).map((c) => c.libelle ?? c.code ?? "?").join(", ") + (classes.length > MAX_LIBELLES ? ", …" : "") + ".");
    }
    if (periodes.length) {
      lignes.push("Periodes de l'annee en cours : " + periodes.map((p) => `${p.libelle ?? "?"}${p.dateDebut ? ` (du ${String(p.dateDebut).slice(0, 10)} au ${String(p.dateFin).slice(0, 10)})` : ""}`).join(" ; ") + ".");
    }
    lignes.push(
      "Transmets la classe et la periode TELLES QUE L'UTILISATEUR LES A DITES (« 6e A », « sixieme a », « T2 ») : elles sont rapprochees de ces listes apres toi.",
      "Une classe ou une periode absente de ces listes n'est pas une raison de poser une question : transmets-la, l'utilisateur sera prevenu si elle n'existe pas.",
    );
    return lignes.join("\n");
  }

  static enTexte({ classes = [], periodes = [] }) {
    const lignes = [];

    if (classes.length) {
      lignes.push("Classes de l'etablissement (classeId) :");
      for (const c of classes.slice(0, MAX_LIBELLES)) {
        lignes.push(`  ${c.libelle ?? c.code ?? "?"} = ${c.id}`);
      }
      if (classes.length > MAX_LIBELLES) {
        lignes.push(`  (${classes.length - MAX_LIBELLES} autres classes non listees)`);
      }
    }

    if (periodes.length) {
      lignes.push("Periodes de l'annee courante (periodeId) :");
      for (const p of periodes.slice(0, MAX_LIBELLES)) {
        lignes.push(`  ${p.libelle ?? "?"}${p.numero != null ? ` (n°${p.numero})` : ""} = ${p.id}`);
      }
    }

    if (!lignes.length) {
      // Le dire explicitement vaut mieux qu'un silence : sans cette phrase, le
      // modèle croit la liste vide et affirme que l'établissement n'a aucune
      // classe.
      return "Referentiel indisponible : ne cite aucune classe ni periode, et demande une precision si la demande en exige une.";
    }

    lignes.push(
      "Utilise EXACTEMENT un identifiant de ces listes quand la demande designe une classe ou une periode.",
      "Si la demande en designe une qui n'y figure pas, demande une precision au lieu d'en inventer une.",
    );
    return lignes.join("\n");
  }
}
