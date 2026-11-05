#!/usr/bin/env bash
#
# Installe l'agent WhatsApp sur un VPS déjà préparé par `preparer-serveur.sh`.
#
#   bash installer-agent.sh <commit-ou-tag>
#
# À exécuter EN ROOT. Le service est installé mais **pas démarré** : Altare
# doit être arrêté d'abord, et deux clients WhatsApp sur le même compte peuvent
# faire bannir le numéro de l'établissement.
#
# POURQUOI UN COMMIT EXACT EN ARGUMENT
# -------------------------------------
# Déployer « la branche » signifie déployer ce qu'elle contenait au moment du
# clone, c'est-à-dire quelque chose qu'on ne peut plus nommer après coup. Un
# incident se diagnostique en comparant deux versions ; encore faut-il savoir
# laquelle tourne.
set -euo pipefail

DEPOT="${DEPOT:-https://github.com/faycalhabibahmatalbachar/guergne.git}"
APPLICATION="/opt/guergne"
DONNEES="/var/lib/guergne"
UTILISATEUR="guergne"
REVISION="${1:-}"

bleu()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
vert()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[0;90m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { rouge "ce script doit etre lance en root"; exit 1; }
[ -n "$REVISION" ] || { rouge "usage : installer-agent.sh <commit-ou-tag>"; exit 2; }
id -u "$UTILISATEUR" >/dev/null 2>&1 || { rouge "compte $UTILISATEUR absent : lancez preparer-serveur.sh"; exit 1; }

# --- 1. Code, a une revision nommee ----------------------------------------
bleu "== Code a la revision $REVISION =="
if [ -d "$APPLICATION/.git" ]; then
  git -C "$APPLICATION" fetch --all --tags --quiet
else
  rm -rf "$APPLICATION"
  git clone --quiet "$DEPOT" "$APPLICATION"
fi
# `--detach` : aucune branche qui suivrait un `git pull` involontaire.
git -C "$APPLICATION" checkout --quiet --detach "$REVISION"
REVISION_EXACTE="$(git -C "$APPLICATION" rev-parse HEAD)"
vert "HEAD = $REVISION_EXACTE"

# --- 2. Dependances, depuis le verrou --------------------------------------
bleu "== Dependances npm =="
cd "$APPLICATION/agent"
# `npm ci` et non `npm install` : il installe EXACTEMENT le verrou, et echoue
# si le verrou et le manifeste divergent. Jamais `npm audit fix --force` : il
# changerait la version majeure de whatsapp-web.js, donc le transport de la
# session de l'etablissement.
npm ci --omit=dev
vert "whatsapp-web.js $(node -e 'console.log(require("whatsapp-web.js/package.json").version)')"

# --- 3. Chromium, puis la PREUVE qu'il demarre -----------------------------
bleu "== Chromium =="
# Le telecharger ne suffit pas : il depend de bibliotheques partagees que
# `preparer-serveur.sh` installe, et l'absence de l'une d'elles ne se voit
# qu'au lancement. On lance donc le navigateur pour de vrai.
npx --yes puppeteer browsers install chrome
CHROME="$(find /root/.cache/puppeteer "$APPLICATION/agent/.cache" -name chrome -type f -perm -u+x 2>/dev/null | head -1)"
[ -n "$CHROME" ] || { rouge "Chromium introuvable apres installation"; exit 1; }
if "$CHROME" --headless --no-sandbox --disable-gpu --dump-dom about:blank >/dev/null 2>&1; then
  vert "Chromium demarre : $("$CHROME" --version)"
else
  rouge "Chromium ne demarre pas : une bibliotheque manque."
  gris  "Relancez preparer-serveur.sh, ou : ldd '$CHROME' | grep 'not found'"
  exit 1
fi
# Le cache doit appartenir au compte de service, qui n'est pas root.
mkdir -p "/home/$UTILISATEUR/.cache"
cp -rn /root/.cache/puppeteer "/home/$UTILISATEUR/.cache/" 2>/dev/null || true
chown -R "$UTILISATEUR:$UTILISATEUR" "/home/$UTILISATEUR/.cache"

# --- 4. Moteur vocal -------------------------------------------------------
bleu "== Piper et modeles de voix =="
# TMPDIR sur le volume : c'est la lecon directe de l'ENOSPC. Sur Altare, /tmp
# faisait 100 Mo, personne ne le savait, et pip y depliait 170 Mo.
export TMPDIR="$DONNEES/tmp"
mkdir -p "$TMPDIR" "$DONNEES/voix"
uv venv --python 3.13 "$DONNEES/venv" 2>/dev/null || gris "venv deja present"
uv pip install --python "$DONNEES/venv/bin/python" \
  "piper-tts" "onnxruntime<2,>=1" "pathvalidate<4,>=3"

base="https://huggingface.co/rhasspy/piper-voices/resolve/main"
for m in "fr/fr_FR/siwis/medium/fr_FR-siwis-medium" "ar/ar_JO/kareem/medium/ar_JO-kareem-medium"; do
  nom="${m##*/}"
  for ext in onnx onnx.json; do
    cible="$DONNEES/voix/$nom.$ext"
    [ -s "$cible" ] && { gris "$nom.$ext deja present"; continue; }
    curl -fL --retry 3 --speed-limit 10240 --speed-time 60 "$base/$m.$ext?download=true" -o "$cible"
  done
done
# Un modele tronque charge sans erreur et synthetise du bruit : on controle la
# taille, qui est connue.
for v in fr_FR-siwis-medium ar_JO-kareem-medium; do
  o=$(stat -c %s "$DONNEES/voix/$v.onnx")
  [ "$o" -gt 50000000 ] || { rouge "$v.onnx ne pese que $o octets : telechargement incomplet"; exit 1; }
  vert "$v.onnx : $((o / 1048576)) Mo"
done
chown -R "$UTILISATEUR:$UTILISATEUR" "$DONNEES"

# --- 5. La recette, SUR LE SERVEUR -----------------------------------------
bleu "== Recette =="
# Sur le serveur, et non seulement sur le poste de developpement : c'est ici
# que vivent le vrai FFmpeg, la vraie architecture et le vrai Python.
cd "$APPLICATION/agent"
node --test "test/*.test.js" || { rouge "les tests echouent : on n'installe pas"; exit 1; }
node scripts/recette-audio-reelle.mjs || { rouge "la chaine audio echoue : on n'installe pas"; exit 1; }
vert "recette passee"

# --- 6. Service ------------------------------------------------------------
bleu "== Service =="
install -m 0644 "$APPLICATION/infra/vps/guergne-agent.service" /etc/systemd/system/guergne-agent.service
systemctl daemon-reload
echo "$REVISION_EXACTE" > "$DONNEES/revision-installee"
chown "$UTILISATEUR:$UTILISATEUR" "$DONNEES/revision-installee"

if [ ! -s /etc/guergne/agent.env ]; then
  rouge "/etc/guergne/agent.env est vide ou absent : l'agent ne demarrera pas."
  gris  "Deposez-y les secrets, puis : chown $UTILISATEUR /etc/guergne/agent.env && chmod 600 ..."
fi

echo
bleu "== Installe, non demarre =="
cat <<SUITE
Revision : $REVISION_EXACTE

Avant de demarrer, DANS CET ORDRE :
  1. Verifier que la session est en place : ls -la $DONNEES/wwebjs_auth
  2. ARRETER Altare depuis son panneau, et le verifier :
       curl -s -m 10 http://se-kna02.altare.global:25278/sante   # doit echouer
  3. systemctl enable --now guergne-agent
  4. journalctl -u guergne-agent -f

Attendez « session restauree et acceptee » puis WHATSAPP_READY. Un QR code a
cette etape signifie que la session n'a pas suivi : ne le scannez pas, revenez
en arriere (voir docs/INFRA/MIGRATION_VPS.md, section 6).
SUITE
