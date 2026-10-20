#!/usr/bin/env python3
"""Constitue une bibliothèque locale de 40 portraits CC0 Open Peeps.

Les URL utilisées contiennent uniquement un identifiant de modèle public
(g-01, f-01, n-01), JAMAIS des noms, matricules ou IDs d'élèves.
L'exécution est ponctuelle : aucune requête à DiceBear depuis le navigateur.
"""

from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / "public" / "avatars" / "eleves"
SOURCE = "https://api.dicebear.com/10.x/open-peeps/svg"

# Il ne s'agit pas de portraits fidèles aux personnes ; les groupes sont
# des presets visuels sobres, non une interprétation de leur identité.
CONFIG = {
    "m": {
        "count": 16,
        "head": "afro,flatTop,flatTopLong,short1,short2,short3,short4,short5,shaved1,shaved2,dreads1,cornrows,twists,mohawk",
        "bg": ["e8f5f0", "eaf2fd", "eef4fa", "edf4ee"],
    },
    "f": {
        "count": 16,
        "head": "afro,bangs,bangs2,bantuKnots,bun,bun2,buns,cornrows,cornrows2,dreads1,dreads2,long,longAfro,longBangs,longCurly,mediumStraight,twists2",
        "bg": ["f5eff8", "eaf3fd", "eff7f0", "f8f3e9"],
    },
    "n": {
        "count": 8,
        "head": "afro,bantuKnots,cornrows,flatTop,medium1,medium2,short1,twists",
        "bg": ["eef5f5", "f0f3fa", "ecf5ef", "f4f0f7"],
    },
}


def telecharger(url: str) -> bytes:
    derniere_erreur = None
    for essai in range(5):
        try:
            request = Request(url, headers={"User-Agent": "Guergne-school-avatar-assets/1.0"})
            with urlopen(request, timeout=25) as reponse:
                data = reponse.read(256_001)
            if not data or len(data) > 256_000:
                raise ValueError("SVG vide ou trop volumineux")
            return data
        except HTTPError as erreur:
            diagnostic = erreur.read(2000).decode("utf-8", errors="replace")
            raise RuntimeError(f"Réponse HTTP {erreur.code}: {diagnostic}; URL: {url}") from erreur
        except Exception as erreur:
            derniere_erreur = erreur
            time.sleep(2 * (essai + 1))
    raise RuntimeError(f"Téléchargement impossible: {derniere_erreur}")


def verifier_svg(data: bytes) -> None:
    racine = ET.fromstring(data)
    if racine.tag.split("}")[-1] != "svg":
        raise ValueError("L'API n'a pas retourné une image SVG.")
    for element in racine.iter():
        nom = element.tag.split("}")[-1].lower()
        if nom in {"script", "foreignobject", "iframe", "image"}:
            raise ValueError(f"Élément SVG non autorisé : {nom}")
        for cle, valeur in element.attrib.items():
            cle_simple = cle.split("}")[-1].lower()
            if cle_simple.startswith("on") or (
                cle_simple == "href" and not valeur.startswith("#")
            ):
                raise ValueError("Attribut SVG externe ou événement non autorisé")


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    total = 0
    for groupe, config in CONFIG.items():
        for numero in range(1, config["count"] + 1):
            chemin = ROOT / f"{groupe}-{numero:02d}.svg"
            couleurs = config["bg"]
            params = {
                "seed": f"guergne-open-peeps-{groupe}-{numero:02d}-v1",
                "headVariant": config["head"].split(",")[(numero - 1) % len(config["head"].split(","))],
                "facialHairProbability": "0",
                "maskProbability": "0",
                "accessoriesProbability": "8",
                "expressionVariant": ["calm", "smile", "serious", "cute", "solemn"][(numero - 1) % 5],
                "backgroundColor": couleurs[(numero - 1) % len(couleurs)],
                "clothingColor": ["20564f", "285d76", "314e71", "3b7469"][(numero - 1) % 4],
            }
            url = SOURCE + "?" + urlencode(params)
            image = telecharger(url)
            verifier_svg(image)
            chemin.write_bytes(image)
            total += 1
            print(f"{chemin.name}: {len(image)} octets")
            time.sleep(0.1)
    fichiers = list(ROOT.glob("*.svg"))
    if total != 40 or len(fichiers) != 40:
        raise RuntimeError(f"Pack incomplet : {total} générés / {len(fichiers)} présents")
    print(f"PACK COMPLET : {total} SVG Open Peeps CC0 sur le serveur Guergne")


if __name__ == "__main__":
    main()
