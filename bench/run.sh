#!/usr/bin/env bash
# usage: bench/run.sh <index.html> <workdir> [nSubjects...]
# Runs profile.mjs once per size, writes result-<build>-<n>.json to workdir and prints a summary.
echo -e "imgs\tpaint\tlongest\tnodes\t>explore\tnext\trate\tscroll95\t>charts\t>zoom\t>tab(max)"
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
html="$(realpath "$1")"
workdir="$(realpath -m "$2")"
shift 2
sizes=("${@:-100 500 1000 2000}")
mkdir -p "$workdir"
build="$(basename "$(dirname "$html")")"
for n in ${sizes[@]}; do
  out="$workdir/result-$build-$n.json"
  node "$here/profile.mjs" "$html" "$n" "$workdir" > "$out"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const f = (x) => (x == null ? "-" : Math.round(x));
    console.log([r.nImgs, f(r.load.paintedMs), f(r.load.longestTaskMs), r.load.domNodes,
      f(r.switchToExploreMs), f(r.nextImageMs.median), f(r.rateMs.median),
      r.scroll ? f(r.scroll.p95) : "-", f(r.switchToChartsMs), f(r.switchToZoomMs),
      f(Math.max(...r.boxPlotTabs.map((t) => t.ms)))].join("\t"));
  ' "$out"
done
