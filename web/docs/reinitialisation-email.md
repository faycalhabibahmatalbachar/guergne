# Réinitialisation par e-mail — Lycée Guergné La Renaissance

## Activation Gmail SMTP (production)

La plateforme utilise directement Gmail SMTP avec SSL/TLS (port 465). L'adresse expéditrice est
\`guergnerenaissance@gmail.com\`. Le fournisseur Resend n'est plus utilisé pour les liens de réinitialisation.

Variables privées à configurer pour **production** dans Vercel :
- \`SMTP_HOST=smtp.gmail.com\`
- \`SMTP_PORT=465\`
- \`SMTP_SECURE=true\`
- \`SMTP_USER=guergnerenaissance@gmail.com\`
- \`SMTP_APP_PASSWORD\` : mot de passe **d'application Google** (16 caractères), jamais le mot de passe du compte Google
- \`SMTP_FROM=guergnerenaissance@gmail.com\`
- \`AUTH_SECRET\` : déjà défini, ne pas le modifier ni le partager.

Les secrets sont conservés sur Vercel et n'entrent jamais dans GitHub. Après une modification de variables,
déclencher un déploiement de production.

## Sécurité et fonctionnement

- Le serveur refuse les hôtes non Gmail, les ports autres que 465 et les configurations sans chiffrement TLS.
- Certificat TLS vérifié et protocole TLS 1.2 minimum. L'authentification SMTP utilise le mot de passe d'application côté serveur.
- Message UTF-8 MIME, en-têtes protégés contre les injections.
- Demandes limitées à 3 par heure **par compte** (audit en base), réponse uniforme pour les comptes inexistants.
- Jetons de réinitialisation HMAC valides 20 minutes, invalidés lors du changement du mot de passe.
- Une fois le mot de passe modifié, toutes les sessions sont révoquées.
- Envoi attendu de manière synchrone dans la fonction Vercel : l'acceptation de Gmail (code SMTP 250) indique que le message est placé dans sa file d'expédition, pas nécessairement reçu dans la boîte de réception.

## Validation

1. Exécuter les tests unitaires et le build Vercel.
2. Vérifier que les six variables de production existent sans exposer leurs valeurs.
3. Dans un compte de personnel de test dont la boîte e-mail est contrôlée, demander la réinitialisation.
4. Vérifier dans la boîte la présence d'un nouvel e-mail et l'ouverture du lien HTTPS.
5. Changer le mot de passe, vérifier l'impossibilité de réutiliser le lien et la révocation des anciennes sessions.
6. Consulter les journaux Vercel et, si nécessaire, la boîte « Messages envoyés » de l'expéditeur Gmail.

En cas d'échec d'envoi : vérifier la validité du mot de passe d'application Google, le compte Gmail, les limites Google et l'accès au port 465.
Ne pas créer de route de test publique qui puisse envoyer des messages à des destinataires arbitraires.
