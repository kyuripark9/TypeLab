#!/bin/sh
# Start (or stop) a headless Chrome for tools/browser/cdp.mjs, on its own profile so it never touches yours.
#   tools/browser/chrome.sh          start on CDP_PORT (9333), print its pid
#   tools/browser/chrome.sh stop     stop the one this started
# Screenshots with Chrome's own --screenshot flag can hang after writing the file; drive it over CDP instead.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PORT=${CDP_PORT:-9333}
PROFILE="$ROOT/.tools/chrome-$PORT"
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
if [ "$1" = stop ]; then
  [ -f "$PROFILE.pid" ] && kill "$(cat "$PROFILE.pid")" 2>/dev/null; rm -f "$PROFILE.pid"; exit 0
fi
mkdir -p "$PROFILE"
"$CHROME" --headless=new --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check about:blank >/dev/null 2>&1 &
echo $! > "$PROFILE.pid"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && { cat "$PROFILE.pid"; exit 0; }
  sleep 0.5
done
echo "chrome didn't come up on port $PORT" >&2; exit 1
