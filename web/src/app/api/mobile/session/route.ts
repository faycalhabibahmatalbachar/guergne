import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { adresseAppelant, erreur, json, limiter, preVol, purgerCompteurs } from "@/app/api/mobile/_commun";
import {
  emettreJetonAcces,
  emettreJetonRafraichissement,
  empreinte,
  parentDeLaRequete,
  revoquerJetons,
  TENTATIVES_MAX,
} from "@/server/auth/mobile";
import { db } from "@/server/db";
import { normaliserNumero } from "@/server/notifications/sms";

/**
 * Ouverture de session mobile.
 *
 * POST { telephone, code, appareil? }
 *
 * Le code est comparé par empreinte, jamais en clair : une fuite de la table
 * `codes_activation` ne permet pas de se connecter.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CorpsSession {
  telephone?: string;
  code?: string;
  appareil?: {
    identifiant?: string;
    plateforme?: string;
    modele?: string;
    versionApp?: string;
    jetonFcm?: string;
  };
}

export async function POST(requete: NextRequest) {
  purgerCompteurs();

  const ip = adresseAppelant(requete);
  if (!limiter(`session:${ip}`, 10, 900)) {
    return erreur("trop_de_tentatives", "Trop de tentatives. Réessayez dans quelques minutes.", 429);
  }

  let corps: CorpsSession;
  try {
    corps = await requete.json();
  } catch {
    return erreur("requete_invalide", "Requête illisible.");
  }

  const numero = normaliserNumero((corps.telephone ?? "").trim());
  const code = (corps.code ?? "").replace(/\D/g, "");

  if (code.length !== 6) {
    return erreur("code_invalide", "Le code comporte 6 chiffres.");
  }

  const resultat = await db.transaction(async (tx) => {
    const lignes = await tx.execute<{
      id: string;
      tentatives: number;
      expire_le: string;
      correspond: boolean;
    }>(sql`
      SELECT id, tentatives, expire_le, code_hash = ${empreinte(code)} AS correspond
        FROM codes_activation
       WHERE telephone = ${numero} AND NOT consomme
       ORDER BY cree_le DESC
       LIMIT 1
       FOR UPDATE
    `);

    const ligne = lignes.rows[0];
    if (!ligne) return { statut: "aucun" as const };

    if (new Date(ligne.expire_le) < new Date()) {
      return { statut: "expire" as const };
    }

    if (!ligne.correspond) {
      const tentatives = ligne.tentatives + 1;
      // Au-delà du seuil, le code est brûlé plutôt que simplement compté :
      // sinon 10⁶ essais suffiraient à ouvrir n'importe quel compte.
      await tx.execute(sql`
        UPDATE codes_activation
           SET tentatives = ${tentatives},
               consomme = ${tentatives >= TENTATIVES_MAX}
         WHERE id = ${ligne.id}
      `);
      return {
        statut: "faux" as const,
        restantes: Math.max(0, TENTATIVES_MAX - tentatives),
      };
    }

    await tx.execute(sql`UPDATE codes_activation SET consomme = TRUE WHERE id = ${ligne.id}`);

    const comptes = await tx.execute<{
      id: string;
      tuteur_id: string;
      nom: string;
      prenom: string;
    }>(sql`
      SELECT u.id, t.id AS tuteur_id, t.nom, t.prenom
        FROM utilisateurs u
        JOIN tuteurs t ON t.utilisateur_id = u.id
       WHERE u.telephone = ${numero} AND u.actif AND u.role = 'PARENT'
       LIMIT 1
    `);

    const compte = comptes.rows[0];
    // Le compte a pu être désactivé entre l'envoi du code et sa saisie.
    if (!compte) return { statut: "aucun" as const };

    await tx.execute(sql`
      UPDATE utilisateurs SET derniere_connexion = now() WHERE id = ${compte.id}
    `);

    // Bascule l'état affiché dans la console : « invité » devient « actif ».
    await tx.execute(sql`
      UPDATE tuteurs
         SET app_activee = TRUE,
             app_activee_le = COALESCE(app_activee_le, now())
       WHERE id = ${compte.tuteur_id}
    `);

    return { statut: "ok" as const, compte };
  });

  if (resultat.statut === "aucun") {
    return erreur("code_invalide", "Code incorrect ou expiré.", 401);
  }
  if (resultat.statut === "expire") {
    return erreur("code_expire", "Ce code a expiré. Demandez-en un nouveau.", 401);
  }
  if (resultat.statut === "faux") {
    return erreur(
      "code_invalide",
      resultat.restantes > 0
        ? `Code incorrect. ${resultat.restantes} essai${resultat.restantes > 1 ? "s" : ""} restant${resultat.restantes > 1 ? "s" : ""}.`
        : "Trop d'essais. Demandez un nouveau code.",
      401,
    );
  }

  const { compte } = resultat;
  const appareilId = corps.appareil?.identifiant ?? null;

  // Une nouvelle connexion révoque les sessions précédentes de cet appareil :
  // un téléphone revendu ou perdu ne reste pas connecté.
  if (appareilId) {
    await db.execute(sql`
      UPDATE jetons_rafraichissement SET revoque = TRUE
       WHERE utilisateur_id = ${compte.id}::uuid AND appareil_id = ${appareilId} AND NOT revoque
    `);
  }

  const rafraichissement = await emettreJetonRafraichissement(compte.id, appareilId);
  const acces = emettreJetonAcces(compte.id, "PARENT");

  if (corps.appareil?.jetonFcm) {
    await enregistrerAppareil(compte.id, corps.appareil);
  }

  return json({
    acces: acces.jeton,
    expireDans: acces.expireDans,
    rafraichissement,
    profil: {
      utilisateurId: compte.id,
      tuteurId: compte.tuteur_id,
      nom: compte.nom,
      prenom: compte.prenom,
      telephone: numero,
    },
  });
}

/** Enregistre le jeton push de l'appareil. */
async function enregistrerAppareil(
  utilisateurId: string,
  appareil: NonNullable<CorpsSession["appareil"]>,
): Promise<void> {
  // Le jeton FCM est unique en base : s'il change de propriétaire — téléphone
  // réinstallé, compte différent — la ligne est réattribuée, sinon les
  // notifications du nouveau parent partiraient vers l'ancien compte.
  await db.execute(sql`
    INSERT INTO appareils (utilisateur_id, jeton_fcm, plateforme, modele, version_app)
    VALUES (${utilisateurId}::uuid, ${appareil.jetonFcm!}, ${appareil.plateforme ?? "android"},
            ${appareil.modele ?? null}, ${appareil.versionApp ?? null})
    ON CONFLICT (jeton_fcm) DO UPDATE
      SET utilisateur_id = EXCLUDED.utilisateur_id,
          actif = TRUE,
          modele = EXCLUDED.modele,
          version_app = EXCLUDED.version_app,
          derniere_utilisation = now()
  `);
}

/** Déconnexion : révoque tous les jetons du parent. */
export async function DELETE(requete: NextRequest) {
  const parent = await parentDeLaRequete(requete.headers.get("authorization"));
  if (!parent) return erreur("jeton_invalide", "Session expirée.", 401);

  await revoquerJetons(parent.utilisateurId);

  // Le jeton push est désactivé aussi : sans cela, un téléphone déconnecté
  // continuerait de recevoir les absences de l'enfant.
  const jetonFcm = requete.nextUrl.searchParams.get("fcm");
  if (jetonFcm) {
    await db.execute(sql`
      UPDATE appareils SET actif = FALSE
       WHERE jeton_fcm = ${jetonFcm} AND utilisateur_id = ${parent.utilisateurId}::uuid
    `);
  }

  return json({ deconnecte: true });
}

/** Pré-vol CORS. */
export { preVol as OPTIONS };
