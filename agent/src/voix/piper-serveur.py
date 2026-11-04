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

# --- Dépendances : le démon se débrouille seul -------------------------------
#
# POURQUOI CE BLOC EXISTE
# -----------------------
# Déplier le wheel de Piper donne le module `piper`, mais AUCUNE de ses
# dépendances : les métadonnées du wheel exigent `onnxruntime` et
# `pathvalidate`, et `numpy` arrive par transitivité. Le démon est donc tombé
# en production sur « No module named 'numpy' ».
#
# Résoudre cet arbre à la main, wheel par wheel, serait fragile et faux à la
# première mise à jour. `pip` sait le faire, et il est présent en tant que
# MODULE (`python3 -m pip`) même quand `pip3` n'est pas dans le PATH — ce qui
# est précisément le cas ici.
#
# POURQUOI ICI ET NON DANS NODE
# ------------------------------
# Ce fichier est relu à chaque lancement du démon. Le corriger permet donc une
# réparation à chaud, par la route de relance, sans redémarrer l'agent ni
# couper la session WhatsApp — qui a déjà été coupée trois fois pour des fautes
# d'une ligne.
#
# L'installation visera `--target`, donc un dossier à nous : le Python système
# n'est jamais modifié, et aucun droit root n'est requis.
import subprocess

# SEULES LES DEPENDANCES MANQUANTES, PAS PIPER LUI-MEME.
#
# Le module `piper` est deja deplie sur le volume, avec ses donnees
# `espeak-ng-data`. Demander `piper-tts` a pip en installerait une SECONDE
# copie — environ 110 Mo de doublon — sur un conteneur dont le quota a deja
# refuse l'installation deux fois par ENOSPC.
#
# Les metadonnees du wheel, lues et non devinees, nomment exactement ces deux
# dependances obligatoires ; `numpy` arrive par transitivite d'onnxruntime.
DEPENDANCES = ["onnxruntime<2,>=1", "pathvalidate<4,>=3"]
DELAI_INSTALLATION_S = 480


def dossier_dependances():
    """
    Où vivent les paquets. Sur le volume persistant, à côté des modèles : un
    dossier éphémère obligerait à réinstaller à chaque démarrage.
    """
    return os.environ.get("VOICE_DEPS") or os.path.join(
        os.path.dirname(os.environ.get("VOICE_FR_MODEL", "")) or ".", "..", "paquets"
    )


def importer_piper(traces):
    """Tente l'import, en annonçant précisément ce qui manque."""
    try:
        from piper import PiperVoice  # noqa: PLC0415

        return PiperVoice
    except Exception as e:
        traces.append(f"import impossible : {type(e).__name__} {e}")
        return None


def assurer_pip(cible, traces):
    """
    Rend True si `python3 -m pip` est utilisable, en l'amorçant au besoin.

    POURQUOI IL FAUT L'AMORCER
    ---------------------------
    Le Python du conteneur est dépouillé : ni `pip`, ni `ensurepip`. Vérifié,
    pas supposé — le démon l'a rapporté lui-même :
    « /usr/bin/python3: No module named pip » et la même chose pour ensurepip.
    Debian livre couramment un Python sans son installateur.

    POURQUOI C'EST POSSIBLE QUAND MÊME
    -----------------------------------
    pip est une roue de Python PUR : aucune compilation, aucune extension
    binaire. La déplier dans un dossier et la mettre sur `sys.path` suffit à
    l'exécuter. `urllib` et `zipfile` sont dans la bibliothèque standard, donc
    tout ce qu'il faut est déjà là.

    On ne touche jamais au Python système : tout vit dans `cible`, un dossier
    du volume, et aucun droit root n'est requis.
    """
    import urllib.request
    import zipfile

    env = {**os.environ, "PYTHONPATH": cible + os.pathsep + os.environ.get("PYTHONPATH", "")}

    def pip_marche():
        try:
            r = subprocess.run(
                [sys.executable, "-m", "pip", "--version"],
                capture_output=True, text=True, timeout=90, env=env,
            )
            return r.returncode == 0, (r.stdout or r.stderr).strip()[:100]
        except Exception as e:
            return False, f"{type(e).__name__} {e}"

    ok, detail = pip_marche()
    if ok:
        traces.append(f"pip deja utilisable : {detail}")
        return True
    traces.append(f"pip absent : {detail}")

    # L'index de PyPI dit quelle roue prendre : la coder en dur la ferait
    # disparaitre un jour sans que personne ne sache pourquoi.
    try:
        with urllib.request.urlopen("https://pypi.org/pypi/pip/json", timeout=60) as r:
            index = json.loads(r.read().decode("utf-8"))
        version = index["info"]["version"]
        roue = next(
            f for f in index["releases"][version]
            if f["filename"].endswith("-py3-none-any.whl")
        )
    except Exception as e:
        traces.append(f"index PyPI illisible : {type(e).__name__} {e}")
        return False

    archive = os.path.join(cible, roue["filename"])
    try:
        os.makedirs(cible, exist_ok=True)
        with urllib.request.urlopen(roue["url"], timeout=300) as r, open(archive, "wb") as f:
            f.write(r.read())
        with zipfile.ZipFile(archive) as z:
            z.extractall(cible)
        os.remove(archive)
        traces.append(f"pip {version} deplie ({roue['filename']})")
    except Exception as e:
        traces.append(f"depliage de pip impossible : {type(e).__name__} {e}")
        return False

    ok, detail = pip_marche()
    traces.append(f"pip apres amorcage : {detail}")
    return ok


def installation_en_cours(cible):
    """
    Une installation est-elle déjà lancée, et toujours vivante ?

    Sans ce garde, chaque relance lancerait un pip de plus : sur un conteneur
    à un seul cœur, trois pip concurrents écrivant dans le même dossier
    produiraient une installation corrompue.
    """
    temoin = os.path.join(cible, ".installation.pid")
    try:
        with open(temoin, "r", encoding="utf-8") as f:
            pid = int(f.read().strip())
        os.kill(pid, 0)  # ne tue rien : vérifie seulement l'existence
        return pid
    except Exception:
        return None


def lancer_installation_detachee(cible, traces):
    """
    Lance pip SANS attendre, et rend la main tout de suite.

    POURQUOI DÉTACHÉE
    -----------------
    Installer `piper-tts` et son arbre — onnxruntime, numpy, pathvalidate et
    leurs dépendances — prend plusieurs minutes sur un cœur unique. Le
    fournisseur Node, lui, abandonne le démarrage au bout de soixante secondes
    et arrête alors le démon : l'installation serait tuée en plein milieu, et
    le dossier laissé à moitié rempli.
    
    Le processus pip est donc détaché de ce démon. Il survit à son arrêt,
    termine son travail, et la relance suivante trouve tout en place. Le journal
    de pip est conservé sur le disque : c'est la seule trace exploitable si
    l'installation échoue.
    """
    os.makedirs(cible, exist_ok=True)
    vivant = installation_en_cours(cible)
    if vivant:
        traces.append(f"installation deja en cours (pid {vivant})")
        return "en_cours"

    if not assurer_pip(cible, traces):
        return "pip_absent"

    journal = os.path.join(cible, "installation.log")
    try:
        with open(journal, "ab") as sortie:
            proc = subprocess.Popen(
                # `--no-compile` : les fichiers .pyc representent une part
                # notable du poids installe, et Python les regenere au besoin.
                # Sur un quota qui a deja refuse deux fois, cela compte.
                [sys.executable, "-m", "pip", "install", "--no-cache-dir", "--no-input",
                 "--no-compile", "--target", cible, *DEPENDANCES],
                stdout=sortie, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                start_new_session=True,
                # pip vient d'etre deplie dans `cible` : sans ce PYTHONPATH, le
                # sous-processus ne le trouverait pas lui-meme.
                env={**os.environ, "PYTHONPATH": cible + os.pathsep + os.environ.get("PYTHONPATH", "")},
            )
        with open(os.path.join(cible, ".installation.pid"), "w", encoding="utf-8") as f:
            f.write(str(proc.pid))
        traces.append(f"installation lancee en arriere-plan (pid {proc.pid}), journal dans {journal}")
        return "lancee"
    except Exception as e:
        traces.append(f"lancement de pip impossible : {type(e).__name__} {e}")
        return "echec"


def _inutilise_installer_dependances(cible, traces):
    """Conservée pour mémoire : l'installation synchrone se faisait tuer."""
    os.makedirs(cible, exist_ok=True)
    for module in (["pip"], ["ensurepip", "--default-pip"]):
        try:
            sonde = subprocess.run(
                [sys.executable, "-m", *module, "--version"],
                capture_output=True, text=True, timeout=60,
            )
            if sonde.returncode == 0:
                traces.append(f"{' '.join(module)} disponible : {sonde.stdout.strip()[:80]}")
                break
            traces.append(f"{' '.join(module)} indisponible : {(sonde.stderr or sonde.stdout).strip()[:120]}")
        except Exception as e:
            traces.append(f"{' '.join(module)} inutilisable : {type(e).__name__} {e}")
    else:
        return False

    try:
        r = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--no-cache-dir", "--no-input",
             "--target", cible, *DEPENDANCES],
            capture_output=True, text=True, timeout=DELAI_INSTALLATION_S,
        )
        if r.returncode != 0:
            traces.append(f"pip a echoue ({r.returncode}) : {(r.stderr or r.stdout).strip()[-300:]}")
            return False
        traces.append(f"pip a installe : {' '.join(DEPENDANCES)}")
        return True
    except subprocess.TimeoutExpired:
        traces.append(f"pip n'a pas fini en {DELAI_INSTALLATION_S} s")
        return False
    except Exception as e:
        traces.append(f"pip inutilisable : {type(e).__name__} {e}")
        return False


traces = []
cible = os.path.abspath(dossier_dependances())

# Le module `piper` deplie vit a cote des paquets, et PYTHONPATH le porte deja
# depuis Node. On l'ajoute ici aussi : ce fichier doit pouvoir etre lance a la
# main pour un diagnostic, sans dependre de l'environnement de l'appelant.
_deplie = os.path.join(os.path.dirname(cible), "piper")
if os.path.isdir(_deplie) and _deplie not in sys.path:
    sys.path.append(_deplie)
# Le dossier de paquets passe DEVANT : il doit primer sur un reste d'ancien
# dépliage incomplet.
if cible not in sys.path:
    sys.path.insert(0, cible)
traces.append(f"paquets : {cible}")

PiperVoice = importer_piper(traces)
if PiperVoice is None:
    etat = lancer_installation_detachee(cible, traces)
    # Une derniere tentative : si une installation precedente avait abouti, les
    # caches d'import de ce processus ne le savaient pas encore.
    import importlib

    importlib.invalidate_caches()
    PiperVoice = importer_piper(traces)
    if PiperVoice is None:
        conseil = {
            "lancee": "Installation lancee en arriere-plan. Relancez le moteur dans quelques minutes.",
            "en_cours": "Installation deja en cours. Relancez le moteur dans quelques minutes.",
            "pip_absent": "pip est introuvable : l'installation doit etre faite autrement.",
            "echec": "Le lancement de l'installation a echoue.",
        }.get(etat, "Etat d'installation inconnu.")
        print(json.dumps({"pret": False, "erreur": f"{conseil} | " + " | ".join(traces)[:800]}), flush=True)
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
