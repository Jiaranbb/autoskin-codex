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
grep -q 'needs_apply=true' "$RESOURCES/autoskin-app-command.sh"
[ -f "$RESOURCES/AutoSkinRuntime/examples/chiikawa-summer/theme.json" ]
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" = "app.autoskin.codex" ]
grep -q 'Original Codex Skin' "$REPO_ROOT/app/macos/AutoSkinApp.swift"
grep -q 'runAction("original"' "$REPO_ROOT/app/macos/AutoSkinApp.swift"
grep -q '^  original)' "$RESOURCES/autoskin-app-command.sh"
grep -q 'menu.addItem(item("Open Theme Folder", #selector(openThemeFolder)))' "$REPO_ROOT/app/macos/AutoSkinApp.swift"
grep -q 'runAction("open-themes", title: "Open Theme Folder")' "$REPO_ROOT/app/macos/AutoSkinApp.swift"
grep -q '^  open-themes)' "$RESOURCES/autoskin-app-command.sh"
grep -q 'Application Support/CodexAutoSkin' "$RESOURCES/autoskin-app-command.sh"
if grep -q 'Application Support/CodexDreamSkin' "$RESOURCES/autoskin-app-command.sh"; then
  echo "AutoSkin.app still points its live runtime at the legacy CodexDreamSkin directory" >&2
  exit 1
fi
if grep -Eq 'menu\.addItem\(item\("(Verify|Pause Skin|Resume Skin|Layout|Refresh Status|Re-scan and Apply)' \
  "$REPO_ROOT/app/macos/AutoSkinApp.swift"; then
  echo "AutoSkin status menu contains controls outside Themes, Open Theme Folder, and Quit" >&2
  exit 1
fi

mkdir -p "$TEST_ROOT/home"
STATUS="$(HOME="$TEST_ROOT/home" AUTOSKIN_RESOURCE_ROOT="$RESOURCES" \
  bash "$RESOURCES/autoskin-app-command.sh" status)"
printf '%s\n' "$STATUS" | grep -q '^session=not-installed$'

/usr/bin/codesign --verify --deep --strict "$APP"
echo "AutoSkin.app bundle tests passed."
