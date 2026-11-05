#!/usr/bin/env bash
# La recette complète du laboratoire local, dans l'ordre où elle doit passer.
#
#   bash infra/local/tests.sh            tout
#   bash infra/local/tests.sh unitaires  les 644 tests seulement
#   bash infra/local/tests.sh audio      FFmpeg et FFprobe reels
#   bash infra/local/tests.sh voix       Piper francais et arabe reels
set -euo pipefail

R="${GUERGNE_LOCAL:-$HOME/.guergne}"
PROFIL="$R/profil.sh"
[ -f "$PROFIL" ] || { echo "Profil absent : lancez environnement.sh utilisateur" >&2; exit 1; }
# shellcheck source=/dev/null
. "$PROFIL"

depot="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$depot/agent"

bleu() { printf '\033[1;34m%s\033[0m\n' "$*"; }
echec=0

unitaires() {
  bleu "== Tests unitaires — node $(node -v) =="
  # LE MOTIF EST NOMME, ET CE N'EST PAS UN DETAIL.
  #
  # `node --test` nu ramasse aussi `scripts/compte-test.mjs`, dont le nom
  # finit par `-test.mjs`. Ce n'est pas une epreuve : ce script ECRIT dans la
  # base de test. Decouvert en alignant Node sur la version exacte de la
  # production, 24.22.2, ou il echoue — sous 24.16 il « passait », c'est-a-dire
  # qu'il creait un compte sans que personne ne le voie.
  node --test "test/*.test.js" || echec=1
}
audio() {
  bleu "== Chaine audio reelle (FFmpeg + FFprobe) =="
  node scripts/recette-audio-reelle.mjs || echec=1
}
voix() {
  bleu "== Synthese reelle (Piper fr + ar) =="
  node scripts/recette-voix-reelle.mjs || echec=1
}

case "${1:-tout}" in
  unitaires) unitaires ;;
  audio)     audio ;;
  voix)      voix ;;
  tout)      unitaires; audio; voix ;;
  *)         echo "usage : tests.sh [tout|unitaires|audio|voix]" >&2; exit 2 ;;
esac

echo
if [ "$echec" -eq 0 ]; then
  printf '\033[1;32m== Recette complete passee ==\033[0m\n'
else
  printf '\033[1;31m== Des epreuves ont echoue ==\033[0m\n'
fi
exit "$echec"
