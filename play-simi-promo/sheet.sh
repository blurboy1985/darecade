#!/bin/sh
# Throwaway: tile review/<name>/*.jpg into explore/r-<name>.png
cd "$(dirname "$0")"
n=$1; w=${2:-300}; cols=${3:-6}
rm -rf explore/seq; mkdir -p explore/seq; i=0
for f in review/$n/*.jpg; do cp "$f" "explore/seq/$(printf %03d $i).jpg"; i=$((i+1)); done
rows=$(( (i + cols - 1) / cols ))
ffmpeg -hide_banner -loglevel error -y -framerate 1 -i explore/seq/%03d.jpg -vf "scale=$w:-1,tile=${cols}x${rows}" -frames:v 1 explore/r-$n.png
