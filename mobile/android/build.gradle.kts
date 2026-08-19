allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
/*
 * Aligne la version de compilation de tous les greffons sur celle du projet.
 *
 * Certains greffons déclarent `compileSdk = 37`. Or le SDK installé se nomme
 * désormais `android-37.0` : le plugin Android cherche `android-37`, ne le
 * trouve pas, et la compilation échoue avec un message qui ne dit rien du
 * vrai problème (« Failed to find target with hash string 'android-37' »).
 *
 * Plutôt que de bricoler un lien sur cette machine — ce qui casserait chez le
 * prochain qui compile — on impose ici la version retenue par le projet. Les
 * greffons n'utilisent aucune interface propre à la 37.
 */
subprojects {
    afterEvaluate {
        val extension = project.extensions.findByName("android")
        if (extension is com.android.build.gradle.BaseExtension) {
            extension.compileSdkVersion(36)
        }
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
