#!/bin/bash
# Run from anywhere: works in the repo root. FFMPEG names the ffmpeg to use (default: ffmpeg on the PATH).
cd "$(dirname "$0")/.." || exit 1
FF="${FFMPEG:-ffmpeg}"
for L in en vi; do
  suf=""; [ $L = vi ] && suf="-vi"
  rm -rf promo/rec; LANG_CODE=$L node promo/video.mjs
  "$FF" -y -loglevel error -i promo/rec/*.webm -ss 1.5 -vf "fps=30,format=yuv420p" -c:v libx264 -crf 25 -preset medium promo/v$suf.mp4
  d=$("$FF" -i promo/v$suf.mp4 2>&1 | grep -o "Duration: [0-9:.]*" | cut -d' ' -f2)
  st=$(python -c "h,m,s='$d'.split(':');print(max(0,int(h)*3600+int(m)*60+float(s)-2.5))")
  "$FF" -y -loglevel error -i promo/v$suf.mp4 -i promo/music.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest -af "afade=t=out:st=$st:d=2.5" -movflags +faststart promo/zoo-garden-intro$suf.mp4
  rm -f promo/v$suf.mp4
done
rm -rf promo/rec
echo DONE
