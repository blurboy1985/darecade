#!/bin/sh
# Throwaway: contact strip of a clip -> explore/t-<name>.png
cd "$(dirname "$0")"
for c in "$@"; do ffmpeg -hide_banner -loglevel error -y -i assets/$c.mp4 -vf "fps=${FPS:-1.4},scale=220:-1,tile=8x1" -frames:v 1 explore/t-$c.png; done
