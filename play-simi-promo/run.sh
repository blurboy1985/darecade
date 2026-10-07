#!/bin/sh
# Throwaway: send a snippet (stdin) to repl.mjs and print its output.
cd "$(dirname "$0")"
n="explore/cmd/$(date +%s%N)"
cat > "$n.tmp"
mv "$n.tmp" "$n.js"
i=0
while [ ! -f "$n.js.out" ] && [ $i -lt 2400 ]; do sleep 0.2; i=$((i+1)); done
cat "$n.js.out" 2>/dev/null || echo "TIMEOUT"
