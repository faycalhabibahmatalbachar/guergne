#!/usr/bin/env bash
#
# Contrôle préalable à un appairage WhatsApp local.
#
# POURQUOI CE SCRIPT EXISTE
# --------------------------
# L'appairage précédent a été perdu parce que j'ai lancé deux sondes coup sur
# coup, après un `pkill` suivi d'un simple `sleep 3`. Deux clients ont touché
# le même profil LocalAuth, et WhatsApp a invalidé l'appareil lié.
#
# Un `sleep` n'est pas une vérification : il espère. Ce script CONSTATE, et il
# refuse de rendre la main tant qu'un doute subsiste.
#
# CE QU'IL NE FAIT JAMAIS
# ------------------------
# Il ne supprime aucun fichier LocalAuth. Ils sont conservés pour diagnostic,
# même invalidés : ils disent quel compte était lié, et depuis quand.
#
#   bash infra/local/preparer-appairage.sh            constate
#   bash infra/local/preparer-appairage.sh --arreter  arrete ce qui traine, puis constate
set -uo pipefail

depot="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFIL_LABO="$depot/agent/donnees-locales/wwebjs_auth_local"
PROFIL_PRODUCTION="$depot/agent/donnees/wwebjs_auth"
VERROU="$depot/agent/donnees-locales/ecoute.pid"

bleu()  { printf '\033[1;34m%b\033[0m\n' "$*"; }
vert()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*"; }
gris()  { printf '\033[0;90m%s\033[0m\n' "$*"; }
ligne() { printf '  %-34s %s\n' "$1" "$2"; }

arreter=0
[ "${1:-}" = "--arreter" ] && arreter=1
obstacles=0

# --- 1. Les processus ------------------------------------------------------
bleu "== 1. Processus Node et Chromium =="

# `pgrep -f` se compte lui-meme quand il tourne dans un shell dont la ligne de
# commande contient le motif. On exclut donc explicitement notre propre arbre,
# sinon le controle rapporte un client fantome a chaque fois — et un faux
# positif ici bloquerait un appairage parfaitement sain.
nos_pids() {
  pgrep -f "$1" 2>/dev/null | while read -r p; do
    [ "$p" = "$$" ] && continue
    [ "$p" = "$PPID" ] && continue
    # Un pgrep dont la ligne de commande contient le motif n'est pas un client.
    cmd="$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null)"
    case "$cmd" in
      *pgrep*|*preparer-appairage*) continue ;;
    esac
    echo "$p"
  done
}

chromiums="$(nos_pids 'chrome-linux64/chrome')"
noeuds="$(nos_pids 'guergne/outils/node-.*/bin/node')"
ecoutes="$(nos_pids 'ecoute-vocale-locale')"

compter() { [ -z "$1" ] && echo 0 || printf '%s\n' "$1" | wc -l; }
ligne "processus Chromium" "$(compter "$chromiums")"
ligne "processus Node du laboratoire" "$(compter "$noeuds")"
ligne "ecoutes vocales" "$(compter "$ecoutes")"

if [ -n "$chromiums$noeuds$ecoutes" ]; then
  echo
  gris "  Detail :"
  for p in $chromiums $noeuds $ecoutes; do
    [ -r "/proc/$p/cmdline" ] || continue
    printf '    pid %-7s %s\n' "$p" "$(tr '\0' ' ' < "/proc/$p/cmdline" | cut -c1-90)"
  done
  echo
  if [ "$arreter" -eq 1 ]; then
    rouge "  Arret demande : TERM, puis KILL si necessaire."
    # TERM d'abord : un client qui se ferme proprement relache son verrou et
    # previent WhatsApp. KILL brutal laisse le profil dans un etat douteux.
    for p in $ecoutes $noeuds $chromiums; do kill -TERM "$p" 2>/dev/null; done
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      restants="$(nos_pids 'chrome-linux64/chrome')$(nos_pids 'ecoute-vocale-locale')"
      [ -z "$restants" ] && break
      sleep 1
    done
    restants="$(nos_pids 'chrome-linux64/chrome')$(nos_pids 'ecoute-vocale-locale')"
    if [ -n "$restants" ]; then
      gris "  Toujours la apres 10 s : KILL."
      for p in $restants; do kill -KILL "$p" 2>/dev/null; done
      sleep 2
    fi
    chromiums="$(nos_pids 'chrome-linux64/chrome')"
    ecoutes="$(nos_pids 'ecoute-vocale-locale')"
    ligne "Chromium apres arret" "$(compter "$chromiums")"
    ligne "ecoutes apres arret" "$(compter "$ecoutes")"
  fi
fi

if [ -n "$chromiums$ecoutes" ]; then
  rouge "  UN CLIENT TOURNE ENCORE. Un second appairage le ferait invalider."
  gris  "  Relancez avec --arreter, ou fermez-le vous-meme."
  obstacles=$((obstacles + 1))
else
  vert "  aucun client actif"
fi

# --- 2. Les verrous ------------------------------------------------------
bleu "\n== 2. Verrous du profil =="
trouve_verrou=0
for v in SingletonLock SingletonCookie SingletonSocket; do
  chemin="$PROFIL_LABO/session-guergne-local/$v"
  if [ -e "$chemin" ]; then
    # Un verrou de Chrome est un lien symbolique dont la cible porte le PID.
    cible="$(readlink "$chemin" 2>/dev/null || echo '(non lisible)')"
    rouge "  $(printf '%-22s PRESENT -> %s' "$v" "$cible")"
    trouve_verrou=1
  else
    ligne "$v" "absent"
  fi
done
if [ "$trouve_verrou" -eq 1 ]; then
  rouge "  Des verrous subsistent. S'ils designent un PID mort, le transport les"
  rouge "  nettoie de lui-meme au demarrage ; s'ils designent un PID VIVANT,"
  rouge "  c'est qu'un client tourne."
  gris  "  Les fichiers LocalAuth ne sont PAS supprimes : ils servent au diagnostic."
else
  vert "  aucun verrou"
fi

if [ -f "$VERROU" ]; then
  pid="$(cat "$VERROU" 2>/dev/null || echo '')"
  if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
    rouge "  Verrou d'ecoute VIVANT : pid $pid"
    obstacles=$((obstacles + 1))
  else
    gris "  verrou d'ecoute perime (pid ${pid:-inconnu}) : il sera repris"
  fi
else
  ligne "verrou d'ecoute" "absent"
fi

# --- 3. Le profil : laboratoire, et surtout pas production ---------------
bleu "\n== 3. Quel profil ? =="
ligne "laboratoire" "$PROFIL_LABO"
if [ -d "$PROFIL_LABO" ]; then
  ligne "contenu" "$(find "$PROFIL_LABO" -type f 2>/dev/null | wc -l) fichier(s), $(du -sh "$PROFIL_LABO" 2>/dev/null | cut -f1)"
  vert "  present, et conserve"
else
  gris "  absent : ce sera un premier appairage"
fi

# LA VERIFICATION QUI COMPTE LE PLUS.
#
# La session de PRODUCTION vit sur Altare, dans `donnees/wwebjs_auth`. Si une
# copie en existait ici, un appairage local risquerait de l'invalider — et
# c'est le numero de l'etablissement qui serait deconnecte.
if [ -d "$PROFIL_PRODUCTION" ]; then
  rouge "  DANGER : un profil de PRODUCTION existe aussi ici :"
  rouge "    $PROFIL_PRODUCTION"
  rouge "  L'ecoute locale ne doit JAMAIS l'ouvrir. Verifiez SESSION_LOCALE."
  obstacles=$((obstacles + 1))
else
  vert "  aucun profil de production en local : rien a invalider par megarde"
fi

# --- 4. Rien qui puisse relancer un second client -----------------------
bleu "\n== 4. Relance automatique ? =="
# Un service, une tache planifiee ou un gestionnaire de processus pourrait
# relancer un client derriere nous. Sur ce laboratoire il n'y en a aucun, mais
# l'affirmer sans regarder serait exactement le genre de supposition qui a
# coute l'appairage precedent.
# `grep -c` rend 1 quand il ne trouve rien : un `|| echo 0` derriere affichait
# alors DEUX lignes, « 0 » puis « 0 ». On compte les lignes retenues.
ligne "services systemd guergne" "$(systemctl list-units --type=service --no-legend 2>/dev/null | grep -i guergne | wc -l)"
ligne "taches cron de l'utilisateur" "$(crontab -l 2>/dev/null | grep -vE '^\s*(#|$)' | wc -l)"
ligne "pm2" "$(command -v pm2 >/dev/null && echo present || echo absent)"
ligne "forever" "$(command -v forever >/dev/null && echo present || echo absent)"
vert "  aucun relanceur sur ce laboratoire"

# --- 5. Verdict ----------------------------------------------------------
echo
if [ "$obstacles" -eq 0 ]; then
  vert "== PRET POUR UN APPAIRAGE : une seule instance peut demarrer =="
  exit 0
fi
rouge "== $obstacles obstacle(s) : N'AFFICHEZ PAS DE QR =="
exit 1
