#!/bin/bash
set -euo pipefail

APP_PATH="$HOME/Applications/Forge Artwork Launcher.app"
SUPPORT_DIR="$HOME/Library/Application Support/Forge Artwork Launcher"
EXPECTED_ARGUMENT="REMOVE-FORGE-ARTWORK-LAUNCHER"

if [[ "${1:-}" != "$EXPECTED_ARGUMENT" ]]; then
  echo "Usage: $0 $EXPECTED_ARGUMENT" >&2
  echo "This removes only the installed launcher and its local configuration." >&2
  exit 64
fi

if [[ -d "$APP_PATH" ]]; then
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$APP_PATH" 2>/dev/null || true
  rm -rf "$APP_PATH"
fi

if [[ -d "$SUPPORT_DIR" ]]; then
  rm -rf "$SUPPORT_DIR"
fi

echo "Forge Artwork Launcher removed."
echo "Artwork masters and production folders were intentionally not changed."
