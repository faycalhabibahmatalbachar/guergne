# Règles de minification.
#
# R8 supprime le code inatteignable. Les plugins Flutter appellent leurs
# classes par réflexion depuis le moteur : sans ces exemptions, elles
# disparaissent et l'application plante au premier appel — un plantage qui
# n'existe qu'en production, jamais en développement.

-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# flutter_secure_storage : accède au Keystore Android via des classes
# instanciées par nom.
-keep class com.it_nomads.fluttersecurestorage.** { *; }

# Les avertissements sur les classes absentes des dépendances facultatives
# ne doivent pas faire échouer la compilation.
-dontwarn io.flutter.embedding.**
