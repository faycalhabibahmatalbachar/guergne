#!/usr/bin/env bash
# Où en est l'installation locale ? Lisible d'un coup d'œil.
set -u
R="${GUERGNE_LOCAL:-$HOME/.guergne}"
echo "== Outils =="
for b in "$R/outils"/node-*/bin/node "$R/outils/ffmpeg/ffmpeg" "$R/outils/ffmpeg/ffprobe" "$R/outils/uv/uv"; do
  [ -x "$b" ] && printf '  %-14s %s\n' "$(basename "$b")" "$("$b" --version 2>/dev/null | head -1)"
done
echo "== Python =="
if [ -x "$R/venv/bin/python" ]; then
  "$R/venv/bin/python" --version
  "$R/venv/bin/python" - <<'PY'
for nom in ("piper", "onnxruntime", "numpy", "pathvalidate"):
    try:
        m = __import__(nom)
        print(f"  {nom:14s} {getattr(m, '__version__', 'présent')}")
    except Exception as e:
        print(f"  {nom:14s} ABSENT ({type(e).__name__})")
PY
else
  echo "  venv absent"
fi
echo "== Voix =="
if [ -d "$R/voix" ] && [ -n "$(ls -A "$R/voix" 2>/dev/null)" ]; then
  ls -lh "$R/voix" | awk 'NR>1 {printf "  %-34s %s\n", $9, $5}'
else
  echo "  aucune voix"
fi
echo "== Profil =="
[ -f "$R/profil.sh" ] && echo "  present" || echo "  absent (installation inachevee)"
echo "== Telechargement en cours ? =="
ls -l "$R/.tmp"/*.xz "$R/.tmp"/*.onnx 2>/dev/null | awk '{printf "  %s  %s octets\n", $9, $5}' || echo "  aucun"
