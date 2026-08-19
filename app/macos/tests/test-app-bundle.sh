#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

bash "$REPO_ROOT/scripts/build-macos-app.sh" "$TEST_ROOT" >/dev/null
APP="$TEST_ROOT/AutoSkin.app"
RESOURCES="$APP/Contents/Resources"

[ -x "$APP/Contents/MacOS/AutoSkin" ]
[ -x "$RESOURCES/autoskin-app-command.sh" ]
[ -f "$RESOURCES/AutoSkinRuntime/examples/chiikawa-summer/theme.json" ]
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" = "app.autoskin.codex" ]

mkdir -p "$TEST_ROOT/home"
STATUS="$(HOME="$TEST_ROOT/home" AUTOSKIN_RESOURCE_ROOT="$RESOURCES" \
  bash "$RESOURCES/autoskin-app-command.sh" status)"
printf '%s\n' "$STATUS" | grep -q '^session=not-installed$'

/usr/bin/codesign --verify --deep --strict "$APP"
echo "AutoSkin.app bundle tests passed."
