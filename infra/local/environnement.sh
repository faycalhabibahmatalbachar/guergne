#!/usr/bin/env bash
#
# Environnement Linux local du Lycée Guergné La Renaissance.
#
# POURQUOI CE SCRIPT EXISTE
# --------------------------
# Tout ce qui a coûté cher dans ce projet venait d'un écart entre la machine de
# développement et la production : un `/tmp` de 100 Mo invisible depuis le
# SFTP, un FFmpeg absent en local donc une conversion jamais éprouvée, un
# Chromium qu'on ne pouvait pas lancer, et des correctifs validés par des faux
# qui ne respectaient pas le contrat réel. Cet environnement supprime cet
# écart : même noyau Linux, même Node, même Python, mêmes outils audio.
#
# DEUX PHASES, ET UNE SEULE DEMANDE L'ADMINISTRATEUR
# ---------------------------------------------------
#   ./environnement.sh systeme     <- exige sudo. Les bibliothèques de Chromium.
#   ./environnement.sh utilisateur <- aucun sudo. Node, FFmpeg, Python, Piper.
#   ./environnement.sh verifier    <- aucun sudo. Dit ce qui manque.
#   ./environnement.sh diagnostic  <- aucun sudo. Mesure ce que mesure l'agent.
#   ./environnement.sh tests       <- aucun sudo. La recette complète.
#
# La phase « utilisateur » installe TOUT dans $HOME/.guergne : rien n'est posé
# hors du compte, rien n'écrase un outil du système, et la désinstallation est
# un `rm -rf`. C'est ce qui permet de tout reconstruire d'une seule commande.
set -euo pipefail

RACINE="${GUERGNE_LOCAL:-$HOME/.guergne}"
OUTILS="$RACINE/outils"
VOIX="$RACINE/voix"
# Les versions sont ÉPINGLÉES. Une version flottante reproduit un environnement
# différent à chaque exécution, ce qui est l'inverse du but.
NODE_VERSION="${NODE_VERSION:-24.16.0}"
PYTHON_VERSION="${PYTHON_VERSION:-3.13}"

bleu()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
vert()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*"; }
gris()  { printf '\033[0;90m%s\033[0m\n' "$*"; }

# --- Phase SYSTÈME : la seule qui demande l'administrateur -----------------
#
# Chromium ne se télécharge pas tout seul : Puppeteer apporte le binaire, mais
# pas les bibliothèques partagées dont il dépend. Sans elles, le navigateur
# meurt au lancement avec une erreur de chargement dynamique — et c'est le
# seul endroit où `sudo` est inévitable.
phase_systeme() {
  bleu "== Phase systeme : bibliotheques de Chromium =="
  local paquets=(
    ca-certificates fonts-liberation
    libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64
    libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0t64
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2
    xdg-utils
  )
  sudo apt-get update -qq
  # `--no-install-recommends` : on veut les dépendances de Chromium, pas un
  # bureau complet dans une machine qui n'a pas d'écran.
  sudo apt-get install -y --no-install-recommends "${paquets[@]}"
  vert "Bibliotheques installees."
}

# --- Phase UTILISATEUR : tout le reste, sans administrateur -----------------

installer_node() {
  local cible="$OUTILS/node-v$NODE_VERSION"
  if [ -x "$cible/bin/node" ]; then gris "node $NODE_VERSION deja present"; return; fi
  bleu "== Node $NODE_VERSION =="
  mkdir -p "$OUTILS"
  local archive="$RACINE/.tmp/node.tar.xz"
  mkdir -p "$(dirname "$archive")"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" -o "$archive"
  tar -xJf "$archive" -C "$OUTILS"
  mv "$OUTILS/node-v$NODE_VERSION-linux-x64" "$cible"
  rm -f "$archive"
  vert "node $("$cible/bin/node" -v)"
}

installer_ffmpeg() {
  if [ -x "$OUTILS/ffmpeg/ffmpeg" ] && [ -x "$OUTILS/ffmpeg/ffprobe" ]; then
    gris "ffmpeg deja present"; return
  fi
  bleu "== FFmpeg et FFprobe (binaires statiques) =="
  # Statique et non paquet système : aucun sudo, et la même version partout.
  # C'est l'outil dont l'absence locale a empêché d'éprouver la conversion
  # OGG/Opus pendant toute la mise au point du moteur vocal.
  mkdir -p "$OUTILS/ffmpeg" "$RACINE/.tmp"
  local archive="$RACINE/.tmp/ffmpeg.tar.xz"
  # Deux sources, essayées dans l'ordre. L'archive pèse quelques dizaines de
  # mégaoctets : sur une liaison tchadienne, un miroir lent fait échouer
  # l'installation entière, et une seule source n'est pas une installation
  # reproductible. `--retry` reprend là où la coupure s'est produite.
  # L'ordre est issu d'une mesure, pas d'une préférence : johnvansickle.com
  # répond 200 puis s'arrête à 15 Mo sur cette liaison, sans fermer la
  # connexion. Un miroir qui cale est plus dangereux qu'un miroir absent,
  # parce qu'il n'échoue jamais.
  local sources=(
    "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz"
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
  )
  local obtenu=0
  for url in "${sources[@]}"; do
    gris "source : ${url%%/releases/*}"
    # `--speed-limit`/`--speed-time` : en dessous de 10 ko/s pendant 60 s, on
    # abandonne cette source. Sans cela, un transfert calé attend indéfiniment.
    if curl -fL --retry 3 --retry-delay 3 --connect-timeout 20 \
            --speed-limit 10240 --speed-time 60 --progress-bar "$url" -o "$archive"; then
      obtenu=1
      break
    fi
    rouge "source injoignable, essai de la suivante"
  done
  [ "$obtenu" -eq 1 ] || { rouge "aucune source de FFmpeg n'a repondu"; return 1; }

  tar -xJf "$archive" -C "$RACINE/.tmp"
  local deplie
  # Les deux archives n'ont pas la même forme : l'une déplie
  # `ffmpeg-*-static/`, l'autre `ffmpeg-*-linux64-gpl*/bin/`. On cherche donc
  # le binaire plutôt que le dossier.
  deplie="$(dirname "$(find "$RACINE/.tmp" -type f -name ffmpeg -perm -u+x | head -1)")"
  [ -n "$deplie" ] || { rouge "archive FFmpeg inattendue : binaire introuvable"; return 1; }
  install -m 0755 "$deplie/ffmpeg" "$deplie/ffprobe" "$OUTILS/ffmpeg/"
  rm -rf "$archive"
  find "$RACINE/.tmp" -maxdepth 1 -type d -name 'ffmpeg-*' -exec rm -rf {} +
  vert "$("$OUTILS/ffmpeg/ffmpeg" -version | head -1)"
}

installer_python() {
  if [ -x "$RACINE/venv/bin/python" ]; then gris "python deja present"; return; fi
  bleu "== Python $PYTHON_VERSION =="
  # `uv` télécharge un CPython autonome : pas de sudo, pas de compilation, et
  # la version EXACTE de la production. Ubuntu 26.04 livre 3.14, pour lequel
  # les roues d'onnxruntime n'existent pas encore — s'aligner sur 3.13 n'est
  # donc pas un caprice de parité, c'est la seule version qui fonctionne.
  if ! [ -x "$OUTILS/uv/uv" ]; then
    mkdir -p "$OUTILS/uv" "$RACINE/.tmp"
    curl -fsSL "https://astral.sh/uv/install.sh" | env UV_INSTALL_DIR="$OUTILS/uv" sh >/dev/null
  fi
  "$OUTILS/uv/uv" python install "$PYTHON_VERSION"
  "$OUTILS/uv/uv" venv --python "$PYTHON_VERSION" "$RACINE/venv"
  vert "$("$RACINE/venv/bin/python" --version)"
}

installer_piper() {
  if "$RACINE/venv/bin/python" -c "import piper, onnxruntime" 2>/dev/null; then
    gris "piper deja installe"; return
  fi
  bleu "== Piper TTS et ONNX Runtime =="
  # Mêmes bornes que sur le serveur : `piper-tts` ne se distribue qu'en roues
  # Python, et `onnxruntime` + `pathvalidate` sont ses dépendances obligatoires.
  TMPDIR="$RACINE/.tmp" "$OUTILS/uv/uv" pip install --python "$RACINE/venv/bin/python" \
    "piper-tts" "onnxruntime<2,>=1" "pathvalidate<4,>=3"
  vert "piper installe"
}

installer_voix() {
  bleu "== Modeles de voix =="
  mkdir -p "$VOIX"
  # Les mêmes deux voix que la production, et SEULEMENT elles : 60 Mo chacune.
  # La voix arabe est un modèle jordanien — correct en arabe standard, ce n'est
  # pas une voix tchadienne.
  local base="https://huggingface.co/rhasspy/piper-voices/resolve/main"
  local modeles=(
    "fr/fr_FR/siwis/medium/fr_FR-siwis-medium"
    "ar/ar_JO/kareem/medium/ar_JO-kareem-medium"
  )
  for m in "${modeles[@]}"; do
    local nom="${m##*/}"
    for ext in onnx onnx.json; do
      if [ -s "$VOIX/$nom.$ext" ]; then gris "$nom.$ext deja present"; continue; fi
      gris "telechargement de $nom.$ext"
      curl -fsSL "$base/$m.$ext?download=true" -o "$VOIX/$nom.$ext"
    done
  done
  vert "voix presentes : $(ls "$VOIX" | tr '\n' ' ')"
}

phase_utilisateur() {
  mkdir -p "$RACINE" "$OUTILS" "$RACINE/.tmp"
  installer_node
  installer_ffmpeg
  installer_python
  installer_piper
  installer_voix
  ecrire_profil
  vert "== Environnement utilisateur pret =="
  gris "Chargez-le avec : source $RACINE/profil.sh"
}

ecrire_profil() {
  # Un seul fichier à sourcer : les chemins temporaires y sont fixés sur le
  # volume, et jamais sur un `/tmp` dont on ignore la taille. C'est la leçon
  # de l'ENOSPC qui avait coûté une nuit.
  cat > "$RACINE/profil.sh" <<PROFIL
# Environnement local Guergné — généré par infra/local/environnement.sh
export GUERGNE_LOCAL="$RACINE"
export PATH="$OUTILS/node-v$NODE_VERSION/bin:$OUTILS/ffmpeg:$OUTILS/uv:\$PATH"
export PYTHON_BIN="$RACINE/venv/bin/python"
export VOIX_DOSSIER="$VOIX"
export FFMPEG_BIN="$OUTILS/ffmpeg/ffmpeg"
export FFPROBE_BIN="$OUTILS/ffmpeg/ffprobe"
# Le temporaire vit sur le volume, mesuré, jamais sur un tmpfs inconnu.
export TMPDIR="$RACINE/.tmp"
export TEMP="\$TMPDIR"
export TMP="\$TMPDIR"
PROFIL
  gris "profil ecrit : $RACINE/profil.sh"
}

# --- Vérification : dire ce qui manque, et rien d'autre ---------------------
verifier() {
  bleu "== Verification des dependances =="
  local manquant=0
  controle() {
    local nom="$1" commande="$2" attendu="${3:-}"
    local sortie
    if sortie="$(eval "$commande" 2>/dev/null | head -1)"; then
      if [ -n "$sortie" ]; then
        printf '  %-18s %s\n' "$nom" "$sortie"
        return
      fi
    fi
    rouge "  $(printf '%-18s ABSENT %s' "$nom" "$attendu")"
    manquant=$((manquant + 1))
  }
  controle "node" "'$OUTILS/node-v$NODE_VERSION/bin/node' -v"
  controle "ffmpeg" "'$OUTILS/ffmpeg/ffmpeg' -version"
  controle "ffprobe" "'$OUTILS/ffmpeg/ffprobe' -version"
  controle "python" "'$RACINE/venv/bin/python' --version"
  controle "piper" "'$RACINE/venv/bin/python' -c 'import piper; print(\"piper\", piper.__version__ if hasattr(piper, \"__version__\") else \"ok\")'"
  controle "onnxruntime" "'$RACINE/venv/bin/python' -c 'import onnxruntime; print(onnxruntime.__version__)'"
  controle "voix fr" "ls -lh '$VOIX/fr_FR-siwis-medium.onnx' | awk '{print \$5}'"
  controle "voix ar" "ls -lh '$VOIX/ar_JO-kareem-medium.onnx' | awk '{print \$5}'"
  controle "libnss3" "ldconfig -p | grep -m1 libnss3"
  controle "libgbm" "ldconfig -p | grep -m1 libgbm"

  echo
  if [ "$manquant" -eq 0 ]; then
    vert "Tout est present."
  else
    rouge "$manquant element(s) manquant(s)."
    gris "Bibliotheques systeme manquantes -> ./environnement.sh systeme (sudo)"
    gris "Outils manquants                 -> ./environnement.sh utilisateur"
    return 1
  fi
}

# --- Diagnostic : mesurer ce que l'agent mesure ----------------------------
#
# Les mêmes grandeurs que `src/ressources.js` relève sur le serveur, pour que
# la comparaison local/production ait un sens. Et surtout l'espace RÉEL des
# chemins temporaires : c'est ce qui manquait le jour de l'ENOSPC.
diagnostic() {
  bleu "== Diagnostic de l'environnement =="
  printf '  noyau            %s\n' "$(uname -srm)"
  printf '  distribution     %s\n' "$(. /etc/os-release && echo "$PRETTY_NAME")"
  printf '  coeurs           %s\n' "$(nproc)"
  printf '  parallelisme     %s\n' "$(getconf _NPROCESSORS_ONLN)"
  free -m | awk '/Mem:/ {printf "  memoire          %s Mo total, %s Mo disponibles\n", $2, $7}'
  echo "  --- espace des chemins temporaires et de travail ---"
  for chemin in /tmp "$RACINE" "$RACINE/.tmp" "$VOIX" .; do
    [ -d "$chemin" ] || continue
    df -Pm "$chemin" | awk -v c="$chemin" 'NR==2 {printf "  %-28s %7s Mo libres / %7s Mo\n", c, $4, $2}'
  done
  # Un /tmp exigu est exactement le piège de la production : on le NOMME.
  local tmp_libre
  tmp_libre="$(df -Pm /tmp | awk 'NR==2 {print $4}')"
  if [ "$tmp_libre" -lt 500 ]; then
    rouge "  ATTENTION : /tmp n'a que $tmp_libre Mo libres."
    gris  "  C'est la cause exacte de l'ENOSPC en production. TMPDIR doit pointer ailleurs."
  fi
}

# --- Tests : la recette, avec les VRAIS outils -----------------------------
tests() {
  bleu "== Recette =="
  local depot
  depot="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  export PATH="$OUTILS/node-v$NODE_VERSION/bin:$OUTILS/ffmpeg:$PATH"
  export TMPDIR="$RACINE/.tmp"
  cd "$depot/agent"
  node --test
}

case "${1:-aide}" in
  systeme)     phase_systeme ;;
  utilisateur) phase_utilisateur ;;
  verifier)    verifier ;;
  diagnostic)  diagnostic ;;
  tests)       tests ;;
  tout)        phase_utilisateur && verifier && diagnostic ;;
  *)
    cat <<AIDE
Environnement Linux local — Lycée Guergné La Renaissance

  ./environnement.sh utilisateur   Node, FFmpeg, Python 3.13, Piper, voix (SANS sudo)
  ./environnement.sh systeme       bibliotheques de Chromium (AVEC sudo)
  ./environnement.sh verifier      dit ce qui manque
  ./environnement.sh diagnostic    mesure memoire, coeurs et espace temporaire
  ./environnement.sh tests         lance la recette de l'agent
  ./environnement.sh tout          utilisateur + verifier + diagnostic

Tout est installe dans \$GUERGNE_LOCAL (defaut : \$HOME/.guergne).
AIDE
    ;;
esac
