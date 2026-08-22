import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// Clé de signature, lue hors du dépôt.
//
// Le fichier `android/key.properties` porte les mots de passe et le chemin du
// magasin de clés ; il est exclu de Git. S'il est absent — sur un poste qui
// n'a pas la clé — la compilation retombe sur la signature de débogage plutôt
// que d'échouer : on peut ainsi travailler sur le code sans détenir le droit
// de publier.
val proprietesSignature = Properties()
val fichierSignature = rootProject.file("key.properties")
val signatureDisponible = fichierSignature.exists()
if (signatureDisponible) {
    proprietesSignature.load(FileInputStream(fichierSignature))
}

android {
    namespace = "td.lyceerenaissance.lgr_parents"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "td.lyceerenaissance.lgr_parents"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // ---------------------------------------------------------------
        // ARCHITECTURES : NE PAS AJOUTER DE BLOC `ndk { abiFilters }` ICI
        //
        // Par défaut, Flutter produit un APK « gras » contenant les
        // bibliothèques natives des trois architectures : armeabi-v7a,
        // arm64-v8a et x86_64. Le téléphone n'en utilise qu'une ; les deux
        // autres sont téléchargées, stockées, puis ignorées. x86_64 n'existe
        // que sur les émulateurs et pèse à elle seule une vingtaine de
        // mégaoctets — 34 % du fichier que l'école fait circuler par WhatsApp.
        //
        // Le réflexe est d'écrire `ndk { abiFilters += ... }`. Essayé ici, dans
        // `defaultConfig` puis dans `buildTypes.release` : **sans aucun effet**
        // dans les deux cas. Le greffon Gradle de Flutter empaquette ses
        // bibliothèques après coup, à partir de la liste qu'il calcule lui-même
        // depuis `--target-platform`. Le bloc Gradle est silencieusement
        // ignoré — 54,7 Mo produits dans les deux cas, mesuré.
        //
        // Le seul levier qui fonctionne est donc l'option de compilation, et
        // c'est celle que documente `docs/07-INSTALLER-APP-PARENTS.md` :
        //
        //     flutter build apk --release --target-platform android-arm,android-arm64
        //
        // 36,1 Mo au lieu de 54,7. On garde les DEUX architectures ARM plutôt
        // que la seule arm64 : les téléphones d'entrée de gamme encore en
        // circulation sont en 32 bits, et un parent qui ne peut pas installer
        // l'application n'appellera pas le secrétariat pour le dire — il
        // abandonnera.
        // ---------------------------------------------------------------
    }

    signingConfigs {
        if (signatureDisponible) {
            create("production") {
                keyAlias = proprietesSignature["keyAlias"] as String
                keyPassword = proprietesSignature["keyPassword"] as String
                storeFile = file(proprietesSignature["storeFile"] as String)
                storePassword = proprietesSignature["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (signatureDisponible) {
                signingConfigs.getByName("production")
            } else {
                signingConfigs.getByName("debug")
            }

            // Minification active : l'APK passe de ~50 Mo à ~25 Mo, ce qui
            // compte quand l'installation se fait par partage de fichier sur
            // une connexion mesurée.
            isMinifyEnabled = true
            isShrinkResources = true

            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
