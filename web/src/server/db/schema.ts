/**
 * Point d'entrée unique du schéma TypeScript.
 *
 * Le contenu de `generated/` est produit par introspection de la base réelle
 * (`npm run db:pull`) et NE DOIT PAS être édité à la main : toute modification
 * du modèle passe par une nouvelle migration SQL dans `db/migrations/`, puis
 * par une régénération.
 *
 * Ce fichier existe pour que le reste du code importe toujours
 * `@/server/db/schema` — indépendamment du nom des fichiers générés.
 */

export * from "./generated/schema";
export * from "./generated/relations";
