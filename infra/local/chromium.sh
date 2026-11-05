#!/usr/bin/env bash
# Chromium est-il lançable ici, et sinon que manque-t-il EXACTEMENT ?
#
# Puppeteer apporte le binaire, mais pas les bibliothèques partagées dont il
# dépend. L'absence de l'une d'elles ne se voit qu'au lancement, sous la forme
# d'une erreur de chargement dynamique que rien n'annonce avant.
set -u
R="${GUERGNE_LOCAL:-$HOME/.guergne}"
export PATH="$R/outils/node-v24.22.2/bin:$R/outils/ffmpeg:$PATH"
export PUPPETEER_CACHE_DIR="$R/chromium"
depot="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$depot/agent"

bleu() { printf '\033[1;34m%s\033[0m\n' "$*"; }
vert() { printf '\033[1;32m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*"; }

bleu "== Telechargement de Chromium par Puppeteer =="
# Dans le cache du laboratoire, pas dans $HOME par defaut : tout ce que le
# laboratoire installe doit pouvoir disparaitre d'un seul rm -rf.
if ! npx --yes puppeteer browsers install chrome 2>&1 | tail -2; then
  rouge "telechargement impossible"
  exit 1
fi

CHROME="$(find "$PUPPETEER_CACHE_DIR" -name chrome -type f -perm -u+x 2>/dev/null | head -1)"
[ -n "$CHROME" ] || { rouge "binaire introuvable sous $PUPPETEER_CACHE_DIR"; exit 1; }
vert "binaire : $CHROME"

bleu "== Bibliotheques manquantes =="
manquantes="$(ldd "$CHROME" 2>/dev/null | grep 'not found' | awk '{print $1}' | sort -u)"
if [ -z "$manquantes" ]; then
  vert "aucune"
else
  rouge "$(echo "$manquantes" | tr '\n' ' ')"
fi

bleu "== Lancement reel =="
# Le seul controle qui vaille : ouvrir une page et en lire le contenu.
if "$CHROME" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
     --dump-dom about:blank >/dev/null 2>"$R/.tmp/chrome.err"; then
  vert "Chromium demarre : $("$CHROME" --version 2>/dev/null)"
  echo "$CHROME" > "$R/chemin-chromium.txt"
  vert "chemin consigne dans $R/chemin-chromium.txt"
else
  rouge "Chromium NE demarre PAS. Dernieres lignes :"
  tail -5 "$R/.tmp/chrome.err" | sed 's/^/  /'
  echo
  echo "Une seule commande corrige cela, et elle demande l'administrateur :"
  echo "  bash $depot/infra/local/environnement.sh systeme"
  exit 1
fi
