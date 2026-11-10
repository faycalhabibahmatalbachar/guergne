import { AsyncLocalStorage } from "node:async_hooks";

import type { Principal } from "@/server/auth/session";

/**
 * L'acteur au nom duquel l'API agent exécute une action métier.
 *
 * LE PROBLÈME
 * ------------
 * Les écritures de l'établissement — inscrire un élève, changer sa classe,
 * créer une classe — existent déjà, éprouvées, dans les actions serveur de
 * l'interface web. Chacune obtient son auteur par `requirePermission()`, qui lit
 * la session du NAVIGATEUR (cookie). L'API agent n'a pas de cookie : elle connaît
 * son acteur par l'en-tête `x-acteur-id`, après vérification du jeton de service.
 *
 * Recopier ces actions dans un module pour l'agent aurait donné deux
 * implémentations des mêmes règles — homonymes, matricule, transaction, audit —
 * et la première divergence aurait été une faille. On fait donc l'inverse : on
 * laisse l'agent emprunter EXACTEMENT le chemin du navigateur, en lui présentant
 * son acteur là où l'action le cherche.
 *
 * COMMENT
 * -------
 * `executerEnTantQue(acteur, fn)` exécute `fn` dans un contexte asynchrone qui
 * porte l'acteur ; `sessionCourante()` le consulte avant le cookie. Le contexte
 * vit le temps de `fn`, et seulement dans sa chaîne asynchrone : deux requêtes
 * simultanées ne se voient pas.
 *
 * POURQUOI C'EST SÛR — ET À QUELLES CONDITIONS
 * ---------------------------------------------
 * 1. Ce module n'est PAS un fichier `"use server"`. Un export de ce type serait
 *    un point d'entrée public : n'importe quel client pourrait l'appeler en se
 *    choisissant une identité. Ici, seul le code serveur peut l'importer.
 * 2. Le seul appelant légitime est la route `/api/agent/[action]`, et elle
 *    n'appelle `executerEnTantQue` qu'APRÈS avoir vérifié le jeton de service ET
 *    rechargé l'acteur depuis la base (`principalParId` : compte actif, rôle
 *    habilité à l'administration). Ce module ne décide d'aucun droit.
 * 3. L'action exécutée refait sa propre vérification (`requirePermission`) avec
 *    l'acteur délégué : la matrice des droits et le périmètre s'appliquent deux
 *    fois, à l'identique de la session web.
 * 4. Une action serveur appelée depuis un navigateur n'a pas de contexte
 *    délégué : elle retombe sur le cookie. Un client ne peut pas en créer un.
 */
const contexte = new AsyncLocalStorage<Principal>();

/** Exécute `fn` au nom de `acteur`. Réservé à la route de l'API agent. */
export function executerEnTantQue<T>(acteur: Principal, fn: () => Promise<T>): Promise<T> {
  if (!acteur?.id) {
    // Un acteur vide serait pire qu'une erreur : `sessionCourante` rendrait un
    // principal sans identité, et l'audit perdrait l'auteur de l'action.
    throw new Error("executerEnTantQue : acteur requis");
  }
  return contexte.run(Object.freeze({ ...acteur }), fn);
}

/** L'acteur délégué de la chaîne asynchrone courante, s'il y en a un. */
export function acteurDelegue(): Principal | undefined {
  return contexte.getStore();
}
