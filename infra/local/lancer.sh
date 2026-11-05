#!/usr/bin/env bash
#
# Charge le profil local, puis exécute la commande demandée.
#
# POURQUOI CE PASSE-PLAT
# -----------------------
# Les outils du laboratoire vivent dans $HOME/.guergne et non dans le PATH du
# système : c'est ce qui permet de les installer sans administrateur. Chaque
# commande doit donc charger le profil d'abord. L'oublier donne des erreurs
# trompeuses — « ffmpeg introuvable » alors qu'il est installé — et c'est le
# genre d'écart qui a déjà coûté des heures sur ce projet.
#
#   bash infra/local/lancer.sh node agent/scripts/recette-audio-reelle.mjs
#   bash infra/local/lancer.sh node --test            # depuis agent/
#   bash infra/local/lancer.sh env                    # voir le profil charge
set -euo pipefail

PROFIL="${GUERGNE_LOCAL:-$HOME/.guergne}/profil.sh"
if [ ! -f "$PROFIL" ]; then
  printf '\033[1;31mProfil absent : %s\033[0m\n' "$PROFIL" >&2
  echo "Lancez d'abord : bash infra/local/environnement.sh utilisateur" >&2
  exit 1
fi
# shellcheck source=/dev/null
. "$PROFIL"

depot="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${GUERGNE_CWD:-$depot/agent}"
exec "$@"
