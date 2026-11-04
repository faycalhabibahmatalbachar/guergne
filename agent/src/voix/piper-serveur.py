"""
Démon de synthèse Piper : charge les voix une fois, les réutilise à vie.

POURQUOI UN DÉMON ET NON UN APPEL PAR MESSAGE
----------------------------------------------
Mesuré : charger le modèle français prend 3,7 s, l'arabe 7,7 s. Lancer Piper à
chaque réponse dépasserait donc à lui seul l'objectif de cinq secondes, avant
d'avoir synthétisé la première syllabe. Le modèle est chargé une fois et
réutilisé — c'est la seule façon d'atteindre la cible.

POURQUOI UN PROTOCOLE DE LIGNES ET NON LE CLI
----------------------------------------------
Le CLI de Piper sait lire stdin et écrire un fichier par ligne, mais il les
nomme par horodatage : associer une réponse à sa requête devient une devinette,
et deux générations rapprochées peuvent se confondre. Ici, chaque requête porte
son identifiant et son chemin de sortie, et l'accusé les renvoie. Aucune
corrélation n'est laissée au hasard.

PROTOCOLE
---------
Entrée  : une ligne JSON {"id", "texte", "langue", "chemin", "vitesse"?}
Sortie  : une ligne JSON {"id", "ok", "chemin"?, "duree_s"?, "ms"?, "erreur"?}
Prêt    : une ligne JSON {"pret": true, "langues": [...]} au démarrage

Une ligne illisible ne tue pas le démon : elle est refusée et la suivante est
lue. Un démon qui meurt sur une entrée malformée emporterait la voix de tout
le service.
"""

import io
import json
import os
import sys
import time
import wave

try:
    from piper import PiperVoice
except Exception as e:  # pragma: no cover - dépend de l'environnement
    print(json.dumps({"pret": False, "erreur": f"piper indisponible : {e}"}), flush=True)
    sys.exit(1)


# L'ARABE EXIGE QUE L'ENCODAGE SOIT DIT.
#
# Sans ces deux lignes, le texte arabe arrive mutilé depuis stdin dès que
# l'interpréteur retient un encodage régional : espeak ne reconnaît alors aucun
# phonème, la synthèse ne produit aucune trame, et l'erreur remontée est un
# obscur « # channels not specified » venant du module wave. Le défaut a été
# observé exactement ainsi. Le dire explicitement vaut mieux que d'espérer un
# bon défaut de plate-forme.
for flux in (sys.stdin, sys.stdout, sys.stderr):
    try:
        flux.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def charger_voix():
    """
    Les voix, lues dans l'environnement.

    Rien n'est codé en dur : le choix du modèle est une décision
    d'exploitation, pas de code, et il doit pouvoir changer sans redéploiement
    du programme.
    """
    voix = {}
    erreurs = {}
    for langue, variable in (("fr", "VOICE_FR_MODEL"), ("ar", "VOICE_AR_MODEL")):
        chemin = os.environ.get(variable)
        if not chemin:
            continue
        if not os.path.exists(chemin):
            erreurs[langue] = f"modèle introuvable : {chemin}"
            continue
        try:
            voix[langue] = PiperVoice.load(chemin)
        except Exception as e:
            erreurs[langue] = str(e)[:200]
    return voix, erreurs


def duree_wav(chemin):
    try:
        with wave.open(chemin, "rb") as w:
            return round(w.getnframes() / float(w.getframerate()), 2)
    except Exception:
        return None


def main():
    voix, erreurs = charger_voix()
    print(
        json.dumps({"pret": len(voix) > 0, "langues": sorted(voix), "erreurs": erreurs}),
        flush=True,
    )
    if not voix:
        return 1

    for ligne in sys.stdin:
        ligne = ligne.strip()
        if not ligne:
            continue
        ident = None
        try:
            req = json.loads(ligne)
            ident = req.get("id")
            langue = req.get("langue") or "fr"
            texte = (req.get("texte") or "").strip()
            chemin = req.get("chemin")
            if not texte:
                raise ValueError("texte vide")
            if not chemin:
                raise ValueError("chemin de sortie manquant")
            v = voix.get(langue)
            if v is None:
                raise ValueError(f"langue non chargée : {langue}")

            # `length_scale` < 1 accélère la parole. On ne l'applique que si
            # l'appelant le demande : un débit modifié par défaut changerait la
            # voix sans que personne l'ait voulu.
            extra = {}
            vitesse = req.get("vitesse")
            if isinstance(vitesse, (int, float)) and 0.5 <= float(vitesse) <= 2.0:
                extra["length_scale"] = 1.0 / float(vitesse)

            t0 = time.perf_counter()
            # En memoire d'abord. Ecrire directement dans le fichier faisait
            # lever `wave.close()` pendant la remontee d'une autre erreur, et
            # ce second echec masquait le premier — on cherchait un probleme de
            # canaux audio alors que le texte etait mutile. Au passage, aucun
            # WAV tronque ne reste sur le disque quand la synthese echoue.
            tampon = io.BytesIO()
            with wave.open(tampon, "wb") as w:
                if extra:
                    from piper import SynthesisConfig

                    v.synthesize_wav(texte, w, syn_config=SynthesisConfig(**extra))
                else:
                    v.synthesize_wav(texte, w)
            octets = tampon.getvalue()
            # 44 octets, c'est un en-tete WAV sans aucune trame : la synthese a
            # produit du silence, ce qui est un echec et non un succes vide.
            if len(octets) <= 64:
                raise ValueError("synthese vide : aucun phoneme reconnu (encodage ou langue ?)")
            os.makedirs(os.path.dirname(chemin) or ".", exist_ok=True)
            with open(chemin, "wb") as f:
                f.write(octets)
            ms = int((time.perf_counter() - t0) * 1000)
            print(
                json.dumps({"id": ident, "ok": True, "chemin": chemin, "duree_s": duree_wav(chemin), "ms": ms}),
                flush=True,
            )
        except Exception as e:
            # Un echec est rendu, jamais tu : l'appelant doit pouvoir envoyer
            # le texte seul plutot que d'attendre une voix qui ne viendra pas.
            print(json.dumps({"id": ident, "ok": False, "erreur": str(e)[:200]}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
