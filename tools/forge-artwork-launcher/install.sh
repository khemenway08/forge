#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
BUILD_ROOT="$REPO_ROOT/.deploy/forge-artwork-launcher-build"
APP_NAME="Forge Artwork Launcher.app"
BUILD_APP="$BUILD_ROOT/$APP_NAME"
INSTALL_APP="$HOME/Applications/$APP_NAME"
SUPPORT_DIR="$HOME/Library/Application Support/Forge Artwork Launcher"
CONFIG_PATH="$SUPPORT_DIR/config.json"
MODE="${1:-}"

if [[ "$MODE" != "--build-only" && "$MODE" != "--install" ]]; then
  echo "Usage: $0 --build-only | --install" >&2
  exit 64
fi

if [[ "$BUILD_ROOT" != "$REPO_ROOT/.deploy/forge-artwork-launcher-build" ]]; then
  echo "Unsafe build path." >&2
  exit 1
fi

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_APP/Contents/MacOS"
mkdir -p "$BUILD_ROOT/module-cache"
cp "$SCRIPT_DIR/Info.plist" "$BUILD_APP/Contents/Info.plist"
export CLANG_MODULE_CACHE_PATH="$BUILD_ROOT/module-cache"
xcrun clang \
  -fobjc-arc \
  -Werror \
  -Wno-deprecated-declarations \
  -framework AppKit \
  -framework Carbon \
  -framework Security \
  -o "$BUILD_APP/Contents/MacOS/ForgeArtworkLauncher" \
  "$SCRIPT_DIR/ForgeArtworkLauncher.m"
rm -rf "$BUILD_ROOT/module-cache"
codesign --force --sign - --identifier com.thehilltopshop.forge-artwork-launcher "$BUILD_APP" >/dev/null
plutil -lint "$BUILD_APP/Contents/Info.plist"
"$BUILD_APP/Contents/MacOS/ForgeArtworkLauncher" --validate-url 'forge-artwork://setup?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

echo "Build succeeded: $BUILD_APP"

if [[ "$MODE" == "--build-only" ]]; then
  echo "Build-only mode: nothing was installed or registered."
  exit 0
fi

mkdir -p "$HOME/Applications" "$SUPPORT_DIR"
chmod 700 "$SUPPORT_DIR"
if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Local launcher configuration is missing: $CONFIG_PATH" >&2
  echo "Create it from $SCRIPT_DIR/config.example.json before installing." >&2
  exit 1
fi
python3 -m json.tool "$CONFIG_PATH" >/dev/null
if [[ -d "$INSTALL_APP" ]]; then
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$INSTALL_APP" 2>/dev/null || true
  rm -rf "$INSTALL_APP"
fi
ditto "$BUILD_APP" "$INSTALL_APP"
chmod 600 "$CONFIG_PATH"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$INSTALL_APP"

echo "Installed: $INSTALL_APP"
echo "Configuration: $CONFIG_PATH"
echo "Existing local template registry preserved: $SUPPORT_DIR/registry.json"
echo "No artwork file was copied, created, opened, or modified."
