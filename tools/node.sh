#!/bin/sh
# Run Node (or npm, npx, tsc...) for TypeLab whether or not this machine has Node installed.
#
#   tools/node.sh -v                      node itself
#   tools/node.sh npm test                any command, with the right node first on PATH
#   export PATH="$(tools/node.sh --bin):$PATH"   then plain node/npm for the rest of the shell
#
# Uses the node on PATH when it is new enough (package.json "engines": >= 22.13); otherwise Node 24 LTS
# kept in .tools/node (git-ignored), downloaded from nodejs.org once and checked against its SHASUMS256.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
KEEP="$ROOT/.tools/node"

new_enough() {
  v=$("$1" -p 'process.versions.node' 2>/dev/null) || return 1
  major=${v%%.*}; rest=${v#*.}; minor=${rest%%.*}
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 13 ]; }
}

BIN=""
if command -v node >/dev/null 2>&1 && new_enough "$(command -v node)"; then
  BIN=$(dirname "$(command -v node)")
elif [ -x "$KEEP/bin/node" ]; then
  BIN="$KEEP/bin"
else
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) plat=darwin-arm64 ;; Darwin-x86_64) plat=darwin-x64 ;;
    Linux-x86_64) plat=linux-x64 ;; Linux-aarch64) plat=linux-arm64 ;;
    *) echo "tools/node.sh: no Node build for $(uname -s)-$(uname -m); install Node 22.13+ yourself" >&2; exit 1 ;;
  esac
  base=https://nodejs.org/dist/latest-v24.x
  echo "tools/node.sh: no Node 22.13+ here; fetching Node 24 LTS ($plat) into .tools/node (about 50 MB)..." >&2
  tmp=$(mktemp -d)
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(grep -o "node-v[0-9.]*-$plat.tar.gz" "$tmp/SHASUMS256.txt" | head -1)
  curl -fL --retry 3 -C - "$base/$file" -o "$tmp/$file"
  want=$(grep " $file\$" "$tmp/SHASUMS256.txt" | cut -d' ' -f1)
  got=$(shasum -a 256 "$tmp/$file" 2>/dev/null | cut -d' ' -f1 || sha256sum "$tmp/$file" | cut -d' ' -f1)
  [ "$want" = "$got" ] || { echo "tools/node.sh: checksum mismatch for $file" >&2; rm -rf "$tmp"; exit 1; }
  mkdir -p "$KEEP"
  tar -xzf "$tmp/$file" -C "$KEEP" --strip-components 1
  rm -rf "$tmp"
  BIN="$KEEP/bin"
fi

if [ "$1" = --bin ]; then echo "$BIN"; exit 0; fi
PATH="$BIN:$PATH"; export PATH
case "$1" in
  ""|-*|*.js|*.mjs|*.ts) exec node "$@" ;;
  *) exec "$@" ;;
esac
