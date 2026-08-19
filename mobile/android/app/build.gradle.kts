import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
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
