/**
 * Rustine précise sur whatsapp-web.js 1.34.7, pour l'envoi de médias.
 *
 * POURQUOI UNE RUSTINE, ET PAS UNE MISE À JOUR
 * ---------------------------------------------
 * L'envoi d'une note vocale échoue sur « Data passed to getter must include an
 * id property (it's how we memoize) but got undefined ». La cause est établie,
 * et c'est le dépôt amont qui la nomme — commit `064a3d5a`, 28 septembre 2026 :
 *
 *   « MediaData is a model whose private __x_id field collides with Msg's
 *     internal id field when its enumerable properties are spread above,
 *     breaking getValidatedSender() during Msg initialization. »
 *
 * Dans `WWebJS.sendMessage`, le modèle `mediaData` est étalé dans l'objet
 * message. Son champ privé `__x_id` écrase alors l'`id` du message, et
 * `getValidatedSender()` interroge un getter mémoïsé avec `undefined`. Notre
 * relevé dans la page listait bien `__x_id` parmi les clés de `mediaData` :
 * la chaîne est complète, du symptôme à la ligne fautive.
 *
 * Ce correctif n'est dans AUCUNE version publiée. La dernière sur npm est
 * `1.34.7`, du 24 avril ; le correctif date du 28 septembre. Prendre la
 * branche principale amènerait cinq mois d'autres changements non publiés
 * sous une session WhatsApp de production — et la consigne est d'épingler une
 * version ou un commit exact, pas de suivre une branche.
 *
 * Ces six lignes sont donc appliquées sur place, à l'identique de l'amont.
 *
 * CE QUI REND CETTE RUSTINE SÛRE
 * -------------------------------
 * Elle refuse d'agir si quoi que ce soit a changé : la version doit être
 * exactement celle attendue, et le texte autour du point d'insertion doit
 * correspondre au caractère près. Une rustine qui s'applique « à peu près »
 * sur une version qu'elle ne connaît pas est plus dangereuse que l'absence de
 * rustine. Elle est aussi idempotente : relancée, elle ne fait rien.
 *
 *   node agent/scripts/rustine-wwebjs.mjs            applique
 *   node agent/scripts/rustine-wwebjs.mjs --verifier  dit seulement l'etat
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(join(racine, "package.json"));

/** La seule version sur laquelle cette rustine a été établie. */
const VERSION_ATTENDUE = "1.34.7";

const vert = (s) => console.log(`\x1b[1;32m${s}\x1b[0m`);
const rouge = (s) => console.error(`\x1b[1;31m${s}\x1b[0m`);
const gris = (s) => console.log(`\x1b[0;90m${s}\x1b[0m`);

/**
 * Les rustines, chacune avec son ancrage exact.
 *
 * `temoin` est ce qui prouve qu'elle est déjà posée. `avant` doit figurer une
 * seule fois : une correspondance multiple signifie que le fichier a changé de
 * forme, et la rustine s'abstient.
 */
const RUSTINES = [
  {
    nom: "media-__x_id",
    amont: "064a3d5a",
    fichier: "src/util/Injected/Utils.js",
    temoin: "delete message.__x_id;",
    avant: `        // Bot's won't reply if canonicalUrl is set (linking)
        if (botOptions) {`,
    apres: `        // MediaData is a model whose private __x_id field collides with Msg's
        // internal id field when its enumerable properties are spread above,
        // breaking getValidatedSender() during Msg initialization.
        if (message.__x_id) {
            delete message.__x_id;
        }
        // Bot's won't reply if canonicalUrl is set (linking)
        if (botOptions) {`,
  },
];

function principal() {
  const verifierSeulement = process.argv.includes("--verifier");

  let paquet;
  try {
    paquet = require_("whatsapp-web.js/package.json");
  } catch {
    rouge("whatsapp-web.js n'est pas installe.");
    process.exit(2);
  }
  if (paquet.version !== VERSION_ATTENDUE) {
    rouge(`Version ${paquet.version} au lieu de ${VERSION_ATTENDUE}.`);
    gris("Cette rustine n'a ete etablie que sur la version attendue.");
    gris("Verifiez si le correctif amont est enfin publie : il la rendrait inutile.");
    process.exit(3);
  }

  const base = dirname(require_.resolve("whatsapp-web.js/package.json"));
  let posees = 0;
  let deja = 0;

  for (const r of RUSTINES) {
    const chemin = join(base, r.fichier);
    const source = readFileSync(chemin, "utf8");

    if (source.includes(r.temoin)) {
      gris(`  ${r.nom} : deja posee`);
      deja += 1;
      continue;
    }
    // Une seule correspondance, exactement. Sinon on s'abstient.
    const occurrences = source.split(r.avant).length - 1;
    if (occurrences !== 1) {
      rouge(`  ${r.nom} : ${occurrences} point(s) d'ancrage au lieu d'un seul.`);
      gris("  Le fichier n'a pas la forme attendue : rien n'est modifie.");
      process.exit(4);
    }
    if (verifierSeulement) {
      rouge(`  ${r.nom} : ABSENTE`);
      posees += 1;
      continue;
    }
    writeFileSync(chemin, source.replace(r.avant, r.apres));
    vert(`  ${r.nom} : posee (amont ${r.amont})`);
    posees += 1;
  }

  if (verifierSeulement) {
    if (posees > 0) {
      rouge(`${posees} rustine(s) manquante(s). Lancez : node scripts/rustine-wwebjs.mjs`);
      process.exit(1);
    }
    vert("Toutes les rustines sont en place.");
    return;
  }
  console.log(`\n--- ${posees} posee(s), ${deja} deja en place ---`);
  if (posees > 0) {
    gris("`node_modules` n'est pas versionne : relancez cette rustine apres");
    gris("chaque `npm ci` ou `npm install`, y compris sur le serveur.");
  }
}

principal();
