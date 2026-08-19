import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { adresseAppelant, erreur, json, limiter, preVol, purgerCompteurs } from "@/app/api/mobile/_commun";
import { DUREE_CODE_JOURS, empreinte } from "@/server/auth/mobile";
import { db } from "@/server/db";
import { normaliserNumero } from "@/server/notifications/sms";

/**
 * Demande d'un code d'activation.
 *
 * POST { telephone }
 *
 * La réponse est **volontairement identique** que le numéro soit connu ou non.
 * Sans cette précaution, l'application deviendrait un annuaire : en essayant
 * des numéros, n'importe qui saurait lesquels correspondent à des parents
 * d'élèves de l'établissement.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function genererCode(): string {
  // 6 chiffres : compromis usuel entre ce qu'on retient le temps de le taper
  // et ce qu'on ne devine pas. Le tirage passe par crypto, pas par Math.random.
  const octets = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(octets % 1_000_000).padStart(6, "0");
}

export async function POST(requete: NextRequest) {
  purgerCompteurs();

  const ip = adresseAppelant(requete);
  // 5 demandes par quart d'heure et par adresse : un parent en fait une, un
  // script en ferait mille — et chaque SMS coûte de l'argent réel.
  if (!limiter(`activation:${ip}`, 5, 900)) {
    return erreur("trop_de_demandes", "Trop de demandes. Réessayez dans quelques minutes.", 429);
  }

  let corps: { telephone?: string };
  try {
    corps = await requete.json();
  } catch {
    return erreur("requete_invalide", "Requête illisible.");
  }

  const brut = (corps.telephone ?? "").trim();
  if (brut.length < 8) {
    return erreur("telephone_invalide", "Numéro de téléphone incomplet.");
  }

  const numero = normaliserNumero(brut);
  const reponseNeutre = json({
    envoye: true,
    message: `Si ce numéro est enregistré à l'école, un code vient d'y être envoyé. Il est valable ${DUREE_CODE_JOURS} jours.`,
  });

  const comptes = await db.execute<{ id: string; accepte_sms: boolean }>(sql`
    SELECT u.id, COALESCE(t.accepte_sms, TRUE) AS accepte_sms
      FROM utilisateurs u
      JOIN tuteurs t ON t.utilisateur_id = u.id
     WHERE u.telephone = ${numero} AND u.actif AND u.role = 'PARENT'
     LIMIT 1
  `);

  const compte = comptes.rows[0];
  if (!compte) return reponseNeutre;

  const code = genererCode();
  const expiration = new Date(Date.now() + DUREE_CODE_JOURS * 86_400_000);

  await db.transaction(async (tx) => {
    // Un seul code vivant à la fois : un ancien code communiqué par erreur ne
    // doit pas rester utilisable.
    await tx.execute(sql`
      UPDATE codes_activation SET consomme = TRUE
       WHERE telephone = ${numero} AND NOT consomme
    `);

    await tx.execute(sql`
      INSERT INTO codes_activation (telephone, code_hash, expire_le)
      VALUES (${numero}, ${empreinte(code)}, ${expiration.toISOString()})
    `);

    if (compte.accepte_sms) {
      await tx.execute(sql`
        INSERT INTO notifications (destinataire_id, telephone, type, canal, titre, corps)
        VALUES (
          ${compte.id}::uuid,
          ${numero},
          'AUTRE'::type_notification,
          'SMS'::canal_notification,
          ${"Code de connexion"},
          ${`Votre code de connexion est ${code}. Ne le communiquez a personne.`}
        )
      `);
    }
  });

  return reponseNeutre;
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
