#!/usr/bin/env bash
# Copy the PWA (../docs in the repo, or $WEB_SRC) into www/ and add the native shim. The PWA itself is not modified.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${WEB_SRC:-}"
if [ -z "$SRC" ]; then for c in ../docs ../car-gps /workspace/car-gps; do [ -f "$c/index.html" ] && SRC="$c" && break; done; fi
[ -n "$SRC" ] || { echo "web source not found (set WEB_SRC)"; exit 1; }
rm -rf www && mkdir -p www
for f in index.html style.css app.js photo-pick.js public-pins.js presence.js vision.js social.js sw.js manifest.webmanifest; do [ -f "$SRC/$f" ] && cp "$SRC/$f" www/; done
cp -r "$SRC/icons" www/
cp web-native/native-shim.js www/
# load the shim before app.js
python3 - <<'PY'
p='www/index.html'; s=open(p).read()
if 'native-shim.js' not in s: s=s.replace('<script src="app.js"></script>','<script src="native-shim.js"></script>\n<script src="app.js"></script>')
open(p,'w').write(s)
PY
echo "copied web from $SRC"
