#!/usr/bin/env bash
# Quelle source de FFmpeg répond depuis ce réseau ?
set -u
for url in \
  "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" \
  "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz" \
  ; do
  printf '%s\n' "$url"
  curl -sIL -m 20 -o /dev/null -w '  code=%{http_code} taille=%{size_download} temps=%{time_total}s redirection=%{url_effective}\n' "$url" 2>&1 || echo "  injoignable"
done
