#!/usr/bin/env bash
# Recette audio réelle, sans dépendre du profil complet.
#
# Elle n'a besoin que de Node et de FFmpeg : elle peut donc s'exécuter avant
# que Piper et les voix soient installés, et c'est précisément l'intérêt —
# éprouver la conversion OGG/Opus sans attendre 120 Mo de modèles.
set -euo pipefail
R="${GUERGNE_LOCAL:-$HOME/.guergne}"
export PATH="$R/outils/ffmpeg:$PATH"
export FFMPEG_BIN="$R/outils/ffmpeg/ffmpeg"
export FFPROBE_BIN="$R/outils/ffmpeg/ffprobe"
export TMPDIR="$R/.tmp"
mkdir -p "$TMPDIR"
NODE="$(find "$R/outils" -maxdepth 3 -name node -type f -perm -u+x 2>/dev/null | head -1)"
[ -n "$NODE" ] || { echo "Node introuvable sous $R/outils" >&2; exit 1; }
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/agent"
exec "$NODE" scripts/recette-audio-reelle.mjs
