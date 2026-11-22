#!/usr/bin/env bash
# usage: bench/compare.sh [base-ref] [out-dir]
# Builds base-ref in a worktree, profiles it and the current dist/index.html (head) in headless
# Chrome, checks ratings on head, and runs ci-assert.mjs. Exits 1 if any check fails.
set -euo pipefail
cd "$(dirname "$0")/.."
base_ref="${1:-main}"
out="$(realpath -m "${2:-.bench}")"

group() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$*"; else echo "== $*"; fi; }
endgroup() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi; }

[ -f dist/index.html ] || { echo "dist/index.html missing; run the build first" >&2; exit 1; }
rm -rf "$out/results" "$out/work"
mkdir -p "$out/builds/head" "$out/builds/base" "$out/results" "$out/work"
cp dist/index.html "$out/builds/head/"

base=$(git rev-parse --verify -q "$base_ref^{commit}" || git rev-parse --verify "origin/$base_ref^{commit}")
group "Build base: $base_ref ($base)"
# inside the repository, so the base build uses the same .mise.toml Node pin
git worktree remove --force .ci-base 2>/dev/null || rm -rf .ci-base
git worktree add --detach .ci-base "$base"
trap 'git worktree remove --force .ci-base' EXIT
(
  cd .ci-base
  node --version
  # older refs depend on node-sass 7, which does not compile on current Node;
  # sass-loader uses Dart Sass instead when it is installed
  if grep -q '"node-sass"' package.json; then
    npm ci --ignore-scripts
    npm install --no-save --ignore-scripts sass@1.108.2
  else
    npm ci
  fi
  npm run build
)
cp .ci-base/dist/index.html "$out/builds/base/"
endgroup

for spec in base:200 head:200 base:500 head:500 head:2000 head:4000; do
  build=${spec%%:*} n=${spec##*:}
  group "Profile $build, $n subjects"
  node bench/profile.mjs "$out/builds/$build/index.html" "$n" "$out/work" > "$out/results/$build-$n.json"
  endgroup
done

group "Ratings, head, 4000 subjects"
node bench/check-ratings.mjs "$out/builds/head/index.html" 4000 "$out/work" | tee "$out/results/ratings.json"
endgroup

node bench/ci-assert.mjs "$out/results"
