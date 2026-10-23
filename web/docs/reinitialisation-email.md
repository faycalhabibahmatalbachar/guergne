# Réinitialisation du mot de passe par e-mail — Lycée Guergné La Renaissance

## État et prérequis

La demande de réinitialisation est intégrée à `/auth/assistance`. Le site utilise Resend comme passerelle transactionnelle. Aucun envoi effectif n'est possible tant que le lycée n'a pas activé un expéditeur vérifié : cette activation requiert l'accès au compte Resend et au DNS du domaine de l'établissement.

1. Dans [Resend](https://resend.com/domains), enregistrer un domaine possédé par le lycée et ajouter les entrées DNS de vérification demandées (SPF/DKIM).
2. Dans [Resend API Keys](https://resend.com/api-keys), créer une clé ayant les droits d'envoi nécessaires.
3. Dans les variables d'environnement du projet Vercel `lycee-guergne-renaissance`, ajouter **uniquement côté serveur** :
   - `RESEND_API_KEY` : clé Resend (sensible, jamais dans le dépôt, jamais côté navigateur) ;
   - `RESEND_FROM_EMAIL` : expéditeur autorisé, par exemple `Lycée Guergné La Renaissance <acces@domaine-verifie-du-lycee.tld>` ;
   - facultatif : `RESEND_REPLY_TO` : adresse de réponse du secrétariat.
4. Ajouter ces variables aux environnements `production` (et `preview` seulement avec un dispositif de test séparé), puis redéployer le site. `AUTH_SECRET` doit déjà exister et rester stable.

Ne pas utiliser `lycee-guergne-renaissance.vercel.app` comme domaine expéditeur : le lycée ne contrôle pas le DNS de `vercel.app`. Ne pas utiliser `onboarding@resend.dev` comme expéditeur de production.

## Fonctionnement

- Une adresse inconnue ou inactive reçoit le même accusé de demande qu'un compte valide, pour éviter d'exposer les comptes du personnel.
- L'adresse des comptes est recherchée sans tenir compte de la casse.
- Un compte actif a droit à **3 demandes/heure** (journalisation en base).
- Le lien est signé avec `AUTH_SECRET` et l'empreinte actuelle du mot de passe ; il expire après **20 minutes** et devient invalide après un changement de mot de passe.
- L'envoi est effectué par l'API Resend HTTPS, avec une clé d'idempotence. Le fournisseur doit confirmer l'acceptation en renvoyant un identifiant d'e-mail.
- Après le changement de mot de passe, les sessions existantes sont révoquées et l'opération est tracée dans le journal d'audit.

## Validation avant ouverture aux utilisateurs

1. Dans un environnement de test, créer un compte de personnel avec une adresse e-mail contrôlée et un mot de passe initial.
2. Demander une réinitialisation, vérifier la réception effective et l'identité de l'expéditeur (SPF/DKIM).
3. Vérifier le refus d'un lien modifié, expiré, déjà consommé, et après désactivation du compte.
4. Réinitialiser le mot de passe et confirmer que l'ancien mot de passe et les anciennes sessions ne fonctionnent plus.
5. Vérifier qu'une adresse inexistante ne révèle pas si un compte existe et que les limites de demandes s'appliquent.
6. Examiner les journaux d'erreurs du fournisseur, sans y inclure de liens secrets ou de jetons.

Tant que les variables `RESEND_API_KEY` et `RESEND_FROM_EMAIL` ne sont pas configurées, le formulaire fournit un message explicite ; il ne prétend pas avoir envoyé un e-mail.
