#!/usr/bin/env bash
#
# Prépare un VPS Ubuntu/Debian neuf à recevoir l'agent WhatsApp.
#
# À exécuter EN ROOT, une seule fois, sur un serveur fraîchement créé.
# Idempotent : une seconde exécution ne casse rien et ne duplique rien.
#
#   bash preparer-serveur.sh [--cle-publique "ssh-ed25519 AAAA... commentaire"]
#
# CE QU'IL NE FAIT PAS
# ---------------------
# Il n'installe pas l'application et ne démarre aucun service. Préparer le
# système et y déposer les données sont deux gestes distincts : le premier se
# refait sans risque, le second touche à la session WhatsApp.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.16.0}"
PYTHON_VERSION="${PYTHON_VERSION:-3.13}"
UTILISATEUR="guergne"
DONNEES="/var/lib/guergne"
APPLICATION="/opt/guergne"
SWAP_MO="${SWAP_MO:-2048}"
CLE_PUBLIQUE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --cle-publique) CLE_PUBLIQUE="${2:-}"; shift 2 ;;
    *) echo "argument inconnu : $1" >&2; exit 2 ;;
  esac
done

bleu()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
vert()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[0;90m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { rouge "ce script doit etre lance en root"; exit 1; }

# --- 1. Paquets -------------------------------------------------------------
bleu "== Paquets du systeme =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# `--no-install-recommends` : un serveur sans écran n'a pas besoin d'un bureau.
apt-get install -y --no-install-recommends \
  ca-certificates curl xz-utils tar git jq ufw unattended-upgrades \
  ffmpeg \
  fonts-liberation libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
  libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libgbm1 \
  libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 \
  libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  xdg-utils
vert "$(ffmpeg -version | head -1)"

# --- 2. Node, a une version EXACTE -----------------------------------------
bleu "== Node $NODE_VERSION =="
# Depuis l'archive officielle et non depuis un dépôt de distribution : la
# version doit être celle de la production, pas celle qu'Ubuntu a choisie.
if [ "$(node -v 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
  tmp="$(mktemp -d)"
  curl -fL --retry 3 "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
    -o "$tmp/node.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C "$tmp"
  cp -r "$tmp/node-v$NODE_VERSION-linux-x64/"* /usr/local/
  rm -rf "$tmp"
fi
vert "node $(node -v), npm $(npm -v)"

# --- 3. Python, pour Piper -------------------------------------------------
bleu "== Python $PYTHON_VERSION =="
# `uv` apporte un CPython autonome : Ubuntu 26.04 livre 3.14, pour lequel les
# roues d'onnxruntime n'existent pas encore. S'aligner sur 3.13 n'est pas une
# coquetterie de parité, c'est la seule version qui fonctionne.
if ! [ -x /usr/local/bin/uv ]; then
  curl -fsSL https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh >/dev/null
fi
uv python install "$PYTHON_VERSION"
vert "uv $(uv --version), python $PYTHON_VERSION installe"

# --- 4. Compte de service ---------------------------------------------------
bleu "== Compte de service « $UTILISATEUR » =="
# Sans shell de connexion et sans mot de passe : l'agent écrit dans deux
# répertoires et parle à WhatsApp. Il n'a aucune raison d'être root, et aucune
# raison de pouvoir ouvrir une session.
if ! id -u "$UTILISATEUR" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/$UTILISATEUR" \
          --shell /usr/sbin/nologin "$UTILISATEUR"
fi
mkdir -p "$DONNEES/tmp" "$APPLICATION" "/etc/guergne"
chown -R "$UTILISATEUR:$UTILISATEUR" "$DONNEES" "$APPLICATION"
# 0700 : un repertoire de session WhatsApp lisible par d'autres comptes est un
# vol de session en attente.
chmod 700 "$DONNEES"
chmod 750 /etc/guergne
vert "compte et repertoires en place"

# --- 5. Swap ----------------------------------------------------------------
bleu "== Swap de $SWAP_MO Mo =="
# Pas pour faire tourner l'agent — il tient dans 70 Mo — mais pour absorber les
# pics de Chromium, dont le vidage memoire mesure en production atteignait
# 1,19 Go. Sans swap, un pic devient un processus tue.
if ! swapon --show --noheadings | grep -q '/swapfile'; then
  fallocate -l "${SWAP_MO}M" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_MO"
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# 10 : on ne veut du swap qu'en dernier recours. Swapper un ONNX en cours
# d'inference multiplierait par dix un temps de synthese deja trop long.
sysctl -qw vm.swappiness=10
grep -q 'vm.swappiness' /etc/sysctl.d/99-guergne.conf 2>/dev/null \
  || echo 'vm.swappiness=10' > /etc/sysctl.d/99-guergne.conf
vert "$(free -m | awk '/Swap:/ {print $2" Mo de swap"}')"

# --- 6. SSH -----------------------------------------------------------------
bleu "== SSH =="
if [ -n "$CLE_PUBLIQUE" ]; then
  mkdir -p /root/.ssh
  touch /root/.ssh/authorized_keys
  grep -qF "$CLE_PUBLIQUE" /root/.ssh/authorized_keys || echo "$CLE_PUBLIQUE" >> /root/.ssh/authorized_keys
  chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys
  gris "cle publique enregistree"
fi

# Le mot de passe n'est refuse QUE si une cle est deja en place : couper les
# deux acces a la fois sur un serveur distant, c'est s'enfermer dehors.
if [ -s /root/.ssh/authorized_keys ]; then
  cat > /etc/ssh/sshd_config.d/99-guergne.conf <<'SSHD'
# Une IPv4 publique recoit des tentatives de connexion dans l'heure qui suit
# la creation du serveur. Ce n'est pas une precaution theorique.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  vert "authentification par cle seulement"
else
  rouge "AUCUNE cle publique : le mot de passe reste actif."
  gris  "Relancez avec --cle-publique des que vous en avez une."
fi

# --- 7. Pare-feu ------------------------------------------------------------
bleu "== Pare-feu =="
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
# Le port de sante de l'agent n'est PAS ouvert. Sur Altare il etait exposee
# faute de choix ; ici il s'interroge depuis le serveur, ou par un tunnel SSH :
#   ssh -L 8080:localhost:8080 <utilisateur>@<ip>
ufw --force enable >/dev/null
vert "$(ufw status | head -1) — SSH seulement"

# --- 8. Journaux bornes -----------------------------------------------------
bleu "== Journaux =="
# Des journaux sans limite remplissent le disque a la place des vidages
# memoire qu'on vient d'interdire. Le probleme serait simplement deplace.
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/99-guergne.conf <<'JOURNAL'
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
JOURNAL
systemctl restart systemd-journald
vert "journald borne a 500 Mo et 30 jours"

# --- 9. Service -------------------------------------------------------------
bleu "== Service systemd =="
ici="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 0644 "$ici/guergne-agent.service" /etc/systemd/system/guergne-agent.service
systemctl daemon-reload
# Installe, volontairement PAS demarre : la session WhatsApp n'est pas encore
# la, et un demarrage ici afficherait un QR code qu'il ne faut surtout pas
# scanner.
vert "service installe, non demarre"

echo
bleu "== Serveur pret =="
cat <<SUITE
Il reste, dans cet ordre :

  1. Deposer les secrets dans /etc/guergne/agent.env  (chown guergne, chmod 600)
  2. Deposer la session et les donnees :   infra/vps/transferer.sh
  3. Installer l'application :             infra/vps/installer-agent.sh <commit>
  4. ARRETER Altare, puis seulement apres : systemctl enable --now guergne-agent

Ne demarrez pas le service avant d'avoir arrete Altare : deux clients WhatsApp
sur le meme compte peuvent faire bannir le numero de l'etablissement.
SUITE
