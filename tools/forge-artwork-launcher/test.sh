#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
BIN="$REPO_ROOT/.deploy/forge-artwork-launcher-build/Forge Artwork Launcher.app/Contents/MacOS/ForgeArtworkLauncher"
CONFIG_PATH="${FORGE_ARTWORK_LAUNCHER_CONFIG:-$HOME/Library/Application Support/Forge Artwork Launcher/config.json}"
[[ -f "$CONFIG_PATH" ]] || { echo "Local launcher configuration is missing: $CONFIG_PATH" >&2; exit 1; }
ORIGIN="$(python3 - "$CONFIG_PATH" <<'PY'
import json, sys
with open(sys.argv[1]) as stream:
    config = json.load(stream)
print(config.get('forge_origin', ''))
PY
)"
ROOT="$(python3 - "$CONFIG_PATH" <<'PY'
import json, sys
with open(sys.argv[1]) as stream:
    config = json.load(stream)
print(config.get('approved_master_root', ''))
PY
)"
[[ "$ORIGIN" == "https://forge.localhost:8443" ]] || { echo 'Launcher tests refuse non-local Forge origins.' >&2; exit 1; }
[[ -n "$ROOT" ]] || { echo 'The approved master root is missing from local configuration.' >&2; exit 1; }
TREE="$ROOT/CRISTMAS TREE"
mkdir -p "$REPO_ROOT/.deploy"
TEMP_ROOT="$(mktemp -d "$REPO_ROOT/.deploy/forge-artwork-launcher-test.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT

"$SCRIPT_DIR/install.sh" --build-only >/dev/null
"$BIN" --validate-url "forge-artwork://setup?token=$(printf 'a%.0s' {1..64})" | grep -q 'url_valid=yes'
"$BIN" --validate-url "forge-artwork://prepare?token=$(printf 'b%.0s' {1..64})" | grep -q 'action=prepare'
"$BIN" --probe-connection "$CONFIG_PATH" | grep -q 'http_status=422'
python3 - "$CONFIG_PATH" "$TEMP_ROOT/bad-pin.json" <<'PY'
import json, sys
with open(sys.argv[1]) as stream:
    config = json.load(stream)
pin = config.get('development_certificate_sha256', '')
if len(pin) != 64:
    raise SystemExit('Local development certificate pin is missing or invalid.')
config['development_certificate_sha256'] = '0' * 64
with open(sys.argv[2], 'w') as stream:
    json.dump(config, stream)
PY
if "$BIN" --probe-connection "$TEMP_ROOT/bad-pin.json" >/dev/null 2>&1; then
  echo 'incorrect development certificate pin was accepted' >&2; exit 1
fi
if "$BIN" --validate-url 'forge-artwork://setup?token=short&path=/tmp/master.ai' >/dev/null 2>&1; then
  echo 'unsafe URL was accepted' >&2; exit 1
fi
mkdir "$TEMP_ROOT/masters" "$TEMP_ROOT/customers"
printf 'safe synthetic illustrator data' > "$TEMP_ROOT/masters/MASTER.ai"
SOURCE_HASH="$(shasum -a 256 "$TEMP_ROOT/masters/MASTER.ai" | awk '{print $1}')"
SOURCE_STAT="$(stat -f '%i:%z:%m' "$TEMP_ROOT/masters/MASTER.ai")"
"$BIN" --copy-live "$TEMP_ROOT/masters" "$TEMP_ROOT/masters/MASTER.ai" "$TEMP_ROOT/customers" '2026/SMITH_JOHN_1042/SMITH_JOHN_TEST_LIVE.ai' | grep -q 'copy_valid=yes'
test "$(shasum -a 256 "$TEMP_ROOT/customers/2026/SMITH_JOHN_1042/SMITH_JOHN_TEST_LIVE.ai" | awk '{print $1}')" = "$SOURCE_HASH"
test "$(stat -f '%i:%z:%m' "$TEMP_ROOT/masters/MASTER.ai")" = "$SOURCE_STAT"
if "$BIN" --copy-live "$TEMP_ROOT/masters" "$TEMP_ROOT/masters/MASTER.ai" "$TEMP_ROOT/customers" '2026/SMITH_JOHN_1042/SMITH_JOHN_TEST_LIVE.ai' >/dev/null 2>&1; then
  echo 'existing LIVE destination was overwritten' >&2; exit 1
fi
test "$(find "$TEMP_ROOT/customers" -type f | wc -l | tr -d ' ')" = 1
"$BIN" --copy-live-background "$TEMP_ROOT/masters" "$TEMP_ROOT/masters/MASTER.ai" "$TEMP_ROOT/customers" '2026/SMITH_JOHN_1042/SMITH_JOHN_BACKGROUND_LIVE.ai' | grep -q 'copy_valid=yes'
test "$(shasum -a 256 "$TEMP_ROOT/customers/2026/SMITH_JOHN_1042/SMITH_JOHN_BACKGROUND_LIVE.ai" | awk '{print $1}')" = "$SOURCE_HASH"
test "$(stat -f '%i:%z:%m' "$TEMP_ROOT/masters/MASTER.ai")" = "$SOURCE_STAT"
test "$(find "$TEMP_ROOT/customers" -type f | wc -l | tr -d ' ')" = 2
if "$BIN" --copy-live "$TEMP_ROOT/masters" "$TEMP_ROOT/masters/MISSING.ai" "$TEMP_ROOT/customers" '2026/SMITH_JOHN_1042/SMITH_JOHN_MISSING_LIVE.ai' >/dev/null 2>&1; then
  echo 'missing master was copied' >&2; exit 1
fi
if "$BIN" --copy-live "$TEMP_ROOT/masters" "$TEMP_ROOT/masters/MASTER.ai" "$TEMP_ROOT/customers" '../UNSAFE_LIVE.ai' >/dev/null 2>&1; then
  echo 'unsafe relative destination was accepted' >&2; exit 1
fi
if "$BIN" --test-open-live "$TEMP_ROOT/customers/2026/SMITH_JOHN_1042/SMITH_JOHN_TEST_LIVE.ai" "$TEMP_ROOT/Missing Illustrator.app" >/dev/null 2>&1; then
  echo 'missing Illustrator application was accepted' >&2; exit 1
fi
"$BIN" --validate-master "$ROOT" "$TREE" 'SMALL_CHRISTMAS TREE_MASTER.ai' small | grep -q 'status=valid'
"$BIN" --validate-master "$ROOT" "$TREE" 'LARGE_CHRISTMAS TREE_MASTER.ai' large | grep -q 'status=valid'
"$BIN" --validate-master-background "$ROOT" "$TREE" 'SMALL_CHRISTMAS TREE_MASTER.ai' small | grep -q 'status=valid'
"$BIN" --validate-master-background "$ROOT" "$TREE" 'LARGE_CHRISTMAS TREE_MASTER.ai' large | grep -q 'status=valid'
if "$BIN" --validate-master "$ROOT" /tmp 'MASTER.ai' outside >/dev/null 2>&1; then
  echo 'outside-root path was accepted' >&2; exit 1
fi
if "$BIN" --validate-master "$ROOT" "$TREE" 'MISSING_MASTER.ai' missing >"$TEMP_ROOT/missing-result.txt" 2>&1; then
  echo 'missing master was accepted' >&2; exit 1
fi
grep -q 'error_code=master_missing' "$TEMP_ROOT/missing-result.txt"
mkdir "$TEMP_ROOT/real"
: > "$TEMP_ROOT/real/MASTER.ai"
ln -s "$TEMP_ROOT/real" "$TEMP_ROOT/link"
if "$BIN" --validate-master "$TEMP_ROOT" "$TEMP_ROOT/link" 'MASTER.ai' symlink >/dev/null 2>&1; then
  echo 'symbolic master path was accepted' >&2; exit 1
fi
echo 'launcher focused tests passed'
