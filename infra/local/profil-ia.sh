#!/usr/bin/env bash
#
# Charge les clés des fournisseurs IA pour le laboratoire local.
# À SOURCER, jamais à exécuter : `. infra/local/profil-ia.sh`
#
# POURQUOI LE NOM DE LA VARIABLE N'EST PAS CRU SUR PAROLE
# --------------------------------------------------------
# Le fichier local nomme sa clé `grok_api`. Or cette clé commence par `gsk_` :
# c'est une clé **Groq**, pas une clé **xAI (Grok)**. Ce sont deux services
# distincts, et le projet porte déjà un test sur cette confusion précise.
#
# La conséquence d'une erreur ici ne serait pas un simple échec. `src/ia.js`
# enverrait la clé à `api.x.ai`, c'est-à-dire **à un tiers qui n'a aucune
# raison de la recevoir**. Une clé transmise au mauvais fournisseur est une
# clé divulguée. On identifie donc la famille par son PRÉFIXE, qui vient du
# fournisseur lui-même, et jamais par le nom que quelqu'un a tapé.
#
#   gsk_    -> Groq         GROQ_API_KEY
#   xai-    -> xAI (Grok)   XAI_API_KEY
#   sk-or-  -> OpenRouter   OPENROUTER_API_KEY
#   sinon, et nom évoquant Mistral -> MISTRAL_API_KEY
#
# CE QUE CE SCRIPT NE FAIT JAMAIS
# --------------------------------
# Il n'affiche aucune valeur, n'en écrit aucune dans un fichier, et ne garde
# aucune trace. Il annonce seulement quelles variables ont été posées, et la
# longueur de chacune — de quoi vérifier qu'une clé n'est pas tronquée sans
# rien révéler d'elle.

__GUERGNE_FICHIER_CLES="${GUERGNE_CLES:-/mnt/c/Users/hp/Desktop/Projects/lycee-renaissance/ai_apikey.env}"

if [ ! -r "$__GUERGNE_FICHIER_CLES" ]; then
  printf '\033[1;31mFichier de cles illisible : %s\033[0m\n' "$__GUERGNE_FICHIER_CLES" >&2
  return 1 2>/dev/null || exit 1
fi

__guergne_poses=""

while IFS= read -r __ligne || [ -n "$__ligne" ]; do
  case "$__ligne" in
    ''|'#'*) continue ;;
  esac
  __nom="${__ligne%%=*}"
  __valeur="${__ligne#*=}"
  [ "$__nom" = "$__ligne" ] && continue
  # Retire les guillemets et les blancs, sans jamais afficher le contenu.
  __valeur="$(printf '%s' "$__valeur" | tr -d '"'"'"'\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -n "$__valeur" ] || continue

  __cible=""
  case "$__valeur" in
    gsk_*)   __cible="GROQ_API_KEY" ;;
    xai-*)   __cible="XAI_API_KEY" ;;
    sk-or-*) __cible="OPENROUTER_API_KEY" ;;
    *)
      # Pas de préfixe reconnaissable : on se rabat sur le nom, mais seulement
      # pour Mistral, dont les clés n'ont pas de préfixe public.
      case "$(printf '%s' "$__nom" | tr '[:upper:]' '[:lower:]')" in
        *mistral*) __cible="MISTRAL_API_KEY" ;;
        *openrouter*) __cible="OPENROUTER_API_KEY" ;;
        *) __cible="" ;;
      esac
      ;;
  esac

  if [ -z "$__cible" ]; then
    printf '\033[0;90m  %-20s ignoree : famille indeterminee\033[0m\n' "$__nom" >&2
    continue
  fi

  export "$__cible=$__valeur"
  __guergne_poses="$__guergne_poses $__cible"
  if [ "$__nom" != "$__cible" ]; then
    printf '  %-20s -> \033[1;32m%s\033[0m  (%s caracteres, famille lue dans le prefixe)\n' \
      "$__nom" "$__cible" "${#__valeur}"
  else
    printf '  %-20s -> \033[1;32m%s\033[0m  (%s caracteres)\n' "$__nom" "$__cible" "${#__valeur}"
  fi
done < "$__GUERGNE_FICHIER_CLES"

printf '\033[1;34mVariables posees :\033[0m%s\n' "$__guergne_poses"

# La clé ne doit jamais atteindre Altare : ce laboratoire est local, et le
# serveur a la sienne.
unset __ligne __nom __valeur __cible __guergne_poses __GUERGNE_FICHIER_CLES
