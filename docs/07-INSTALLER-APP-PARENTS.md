# Installer l'application des parents

## Où la prendre

L'APK signé se trouve dans `mobile/build/app/outputs/flutter-apk/app-release.apk`
après un `flutter build apk --release`.

Pour le distribuer aux familles : le déposer sur un espace de téléchargement de
l'école, ou l'envoyer par WhatsApp. Aucune boutique n'est nécessaire, et le
téléphone n'a pas besoin d'être sur le même réseau que le serveur —
l'application vise l'adresse publique de l'établissement.

## Installer sur un téléphone Android

1. Copier `app-release.apk` sur le téléphone.
2. L'ouvrir depuis le gestionnaire de fichiers.
3. Android affiche « Pour votre sécurité, votre téléphone n'est pas autorisé à
   installer des applications inconnues provenant de cette source » →
   **Paramètres** → autoriser cette source → revenir en arrière → **Installer**.

Cet avertissement est normal pour une application hors Play Store. Il
disparaîtra si l'école publie un jour sur la boutique.

## Se connecter

L'application demande un numéro de téléphone, puis un code reçu par SMS.

> **Tant que la passerelle SMS n'est pas branchée** (voir
> [07 — Passerelle SMS](07-PASSERELLE-SMS.md)), aucun SMS ne part réellement : le code est
> seulement écrit dans la file de notifications. Pour un essai, le récupérer
> côté administration, ou depuis la base :
>
> ```sql
> SELECT substring(corps from '[0-9]{6}')
>   FROM notifications
>  WHERE telephone = '+235XXXXXXXX'
>  ORDER BY cree_le DESC LIMIT 1;
> ```

Seuls les numéros **enregistrés au secrétariat** et rattachés à un compte
parent actif reçoivent un code. Un numéro inconnu obtient exactement la même
réponse — l'application ne doit pas permettre de deviner qui est parent d'élève
dans l'établissement.

## Ce que l'application affiche

| Écran      | Contenu                                                          |
| ---------- | ---------------------------------------------------------------- |
| Accueil    | Enfant, moyenne, absences, retards, reste à payer, annonces       |
| Résultats  | Bulletin par trimestre : matières, notes, rang, appréciations     |
| Assiduité  | Journal des absences, retards, sanctions, incidents               |
| Scolarité  | Échéances et reçus — **consultation seule**                       |
| Annonces   | Informations de l'école, avec accusé de lecture                   |
| Mon compte | Enfants rattachés, emploi du temps, aide, déconnexion             |

Rien n'apparaît avant publication par l'école : une note saisie mais non
publiée, un bulletin non validé par le conseil de classe, une annonce
programmée pour plus tard restent invisibles.

## Adresse du serveur

Par défaut, l'application vise :

```
https://lycee-guergne-renaissance.vercel.app
```

Pour compiler une version pointant ailleurs — recette, serveur local :

```bash
flutter build apk --release --dart-define=API_BASE=https://autre-adresse
```

## Signature

L'APK est signé par la clé de l'établissement
(`C:\Users\hp\keystores\lgr-parents-upload.jks`).

**Cette clé est irremplaçable.** Android refuse d'installer une mise à jour
signée par une clé différente : la perdre obligerait chaque famille à
désinstaller puis réinstaller l'application. À sauvegarder hors du poste, avec
son mot de passe.

Empreintes du certificat :

```
SHA-1   41:49:8B:8E:19:32:B3:E8:4A:57:7B:A3:1E:B9:D1:4F:F8:C0:12:6A
SHA-256 EC:25:6F:B1:89:59:C1:DD:2C:5D:E8:34:8B:CA:BA:04:EE:C7:EC:73:D6:74:52:B3:FA:BA:70:68:ED:65:AF:5F
```

## Recompiler

**C'est cette commande-ci qu'il faut utiliser, pas `flutter build apk --release` seul :**

```bash
cd mobile && flutter build apk --release --target-platform android-arm,android-arm64
```

L'option divise le poids par un tiers — **36,1 Mo au lieu de 54,7**. Sans elle,
l'APK embarque les bibliothèques natives x86_64, qui n'existent que pour les
émulateurs : une vingtaine de mégaoctets que chaque famille télécharge en
données mobiles pour rien.

> Le réflexe serait de figer cela dans `build.gradle.kts` avec
> `ndk { abiFilters }`, pour qu'on ne puisse plus l'oublier. Cela ne marche
> pas : le greffon Gradle de Flutter empaquette ses bibliothèques à partir de
> la liste qu'il calcule lui-même, et ignore le réglage Gradle. Essayé dans
> `defaultConfig` et dans `buildTypes.release`, 54,7 Mo dans les deux cas.
> L'option de compilation est le seul levier.

Les deux architectures ARM sont conservées : les téléphones d'entrée de gamme
encore en circulation sont en 32 bits, et un parent qui n'arrive pas à
installer l'application n'appelle pas le secrétariat — il abandonne.

Points sur lesquels la compilation a déjà achoppé, et qui sont maintenant
réglés dans le dépôt :

- **Permission INTERNET** — Flutter ne la déclare que pour le débogage.
  Sans elle, l'APK se lance mais ne joint aucun serveur.
- **Version de SDK des greffons** — certains visent `android-37`, alors que le
  SDK installé se nomme `android-37.0`. Alignée dans `android/build.gradle.kts`.
- **Chemin du magasin de clés** — en barres obliques : le format Properties de
  Java traite l'antislash comme un échappement.
