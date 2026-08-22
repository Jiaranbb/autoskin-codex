#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_APP="${1:-$REPO_ROOT/.build/AutoSkin.app}"
INSTALL_ROOT="$HOME/Applications"
TARGET_APP="$INSTALL_ROOT/AutoSkin.app"

[ -d "$SOURCE_APP/Contents/MacOS" ] || {
  echo "AutoSkin.app has not been built: $SOURCE_APP" >&2
  exit 1
}
[ "$TARGET_APP" = "$HOME/Applications/AutoSkin.app" ] || {
  echo "Refusing unexpected install target: $TARGET_APP" >&2
  exit 1
}

mkdir -p "$INSTALL_ROOT"
rm -rf "$TARGET_APP"
/usr/bin/ditto "$SOURCE_APP" "$TARGET_APP"
/usr/bin/codesign --verify --deep --strict "$TARGET_APP"

echo "$TARGET_APP"
