package td.lyceerenaissance.lgr_parents

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        creerCanaux()
    }

    /**
     * Déclare les canaux de notification.
     *
     * POURQUOI CE CODE EXISTE
     *
     * Depuis Android 8, une notification adressée à un canal qui n'existe pas
     * est **abandonnée sans erreur**. Rien dans les journaux, rien côté
     * serveur : Firebase répond « message accepté », l'école croit avoir
     * prévenu le parent, et le téléphone ne sonne jamais.
     *
     * Le serveur envoie `channel_id: "lgr_defaut"` (voir
     * `web/src/server/notifications/fcm.ts`). Cette chaîne doit exister ici,
     * à l'identique. Les deux valeurs se citent mutuellement : modifier l'une
     * sans l'autre casse les notifications en silence.
     *
     * On le fait en Kotlin plutôt que d'ajouter `flutter_local_notifications` :
     * le greffon pèse plusieurs mégaoctets et apporte un ordonnanceur, des
     * notifications programmées et un fuseau horaire dont l'application n'a
     * aucun usage. Quinze lignes suffisent.
     *
     * `createNotificationChannel` est idempotent : rappelé à chaque
     * démarrage, il ne duplique rien. En revanche il ne modifie PAS un canal
     * existant — l'importance et le son d'un canal déjà créé appartiennent au
     * parent, qui peut les changer dans les réglages du téléphone. Pour
     * imposer une nouvelle configuration, il faudrait changer l'identifiant du
     * canal, ce qui remettrait à zéro les préférences de tout le monde.
     */
    private fun creerCanaux() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val gestionnaire = getSystemService(NotificationManager::class.java) ?: return

        val defaut = NotificationChannel(
            CANAL_DEFAUT,
            "Vie scolaire",
            // IMPORTANCE_HIGH : la notification s'affiche en surimpression et
            // émet un son. Une absence non justifiée ou un bulletin publié
            // justifie d'interrompre le parent — c'est précisément ce qu'il
            // attend de l'application. En IMPORTANCE_DEFAULT, elle serait
            // muette sur beaucoup de téléphones.
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Absences, notes, paiements et annonces de l'établissement."
            enableVibration(true)
        }

        gestionnaire.createNotificationChannel(defaut)
    }

    private companion object {
        /** Doit rester identique à `channel_id` dans `fcm.ts`. */
        const val CANAL_DEFAUT = "lgr_defaut"
    }
}
