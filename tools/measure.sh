#!/bin/sh
# 難しさごとに、ふつうのボット（tools/bot.mjs）で通しで遊ばせて、結果とボス戦を 1 行ずつ出す
#   tools/measure.sh [難しさ…（既定 easy normal hard）] [seed の数（既定 4）]
#   例: tools/measure.sh hard 8
cd "$(dirname "$0")/.."
N=4
DIFFS=""
for a in "$@"; do case "$a" in [0-9]*) N=$a ;; *) DIFFS="$DIFFS $a" ;; esac; done
for d in ${DIFFS:-easy normal hard}; do
  s=1
  while [ $s -le $N ]; do
    out=$(GUNZO_DIFF=$d node tools/bot.mjs 99 80 $s 2>&1)
    echo "$d s$s: $(echo "$out" | grep -E '^(win|over|time)' | cut -c1-70) | $(echo "$out" | grep '^ボス戦')"
    s=$((s + 1))
  done
done
