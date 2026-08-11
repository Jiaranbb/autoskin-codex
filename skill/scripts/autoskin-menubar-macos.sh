#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

COMMAND="${1:-status}"
[ "$#" -eq 0 ] || shift

dream_require_macos

STATE_ROOT="$(dream_state_root)"
STATE_PATH="$STATE_ROOT/state.json"
PAUSED_PATH="$STATE_ROOT/paused"
PORT="$(dream_installed_port)"
INJECTOR="$SCRIPT_DIR/injector.mjs"
SET_THEME="$SCRIPT_DIR/set-theme.mjs"
mkdir -p "$STATE_ROOT"

resolve_runtime() {
  dream_resolve_app ""
  dream_resolve_node ""
}

injector_healthy() {
  local pid
  [ -f "$STATE_PATH" ] || return 1
  pid="$(dream_read_json_number "$STATE_PATH" injectorPid 2>/dev/null || true)"
  [ -n "$pid" ] && dream_pid_matches "$pid" "$INJECTOR"
}

skin_ready() {
  [ ! -f "$PAUSED_PATH" ] && dream_cdp_ready "$PORT" && injector_healthy
}

stop_injector() {
  local pid
  if [ -f "$STATE_PATH" ]; then
    pid="$(dream_read_json_number "$STATE_PATH" injectorPid 2>/dev/null || true)"
    [ -z "$pid" ] || dream_stop_pid_if_matches "$pid" "$INJECTOR"
    rm -f "$STATE_PATH"
  fi
}

write_paused_marker() {
  local temporary="$PAUSED_PATH.$$.tmp"
  printf 'pausedAt=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >"$temporary"
  chmod 600 "$temporary"
  mv -f "$temporary" "$PAUSED_PATH"
}

resume_skin() {
  resolve_runtime
  rm -f "$PAUSED_PATH"
  local args=(--port "$PORT" --node "$NODE_BIN" --app "$APP_BUNDLE")
  if ! dream_cdp_ready "$PORT" && [ -n "$(dream_main_pids)" ]; then
    args+=(--restart-existing)
  fi
  "$SCRIPT_DIR/start-dream-skin.sh" "${args[@]}"
}

switch_skin() {
  local theme="${1:-}"
  local layout="${2:-}"
  local found=0 root
  case "$theme" in
    ''|*[!a-z0-9-]*|[!a-z]*) dream_die "invalid theme id: $theme" ;;
  esac
  case "$layout" in
    ''|banner|fullscreen) ;;
    *) dream_die "invalid layout: $layout" ;;
  esac
  for root in "$SCRIPT_DIR/../themes" "$SCRIPT_DIR/../themes-private"; do
    if [ -f "$root/$theme/theme.json" ]; then found=1; break; fi
  done
  [ "$found" -eq 1 ] || dream_die "unknown theme: $theme"

  resolve_runtime
  if ! skin_ready; then
    resume_skin
  fi
  if [ -n "$layout" ]; then
    "$NODE_BIN" "$SET_THEME" --port "$PORT" "$theme" "$layout"
  else
    "$NODE_BIN" "$SET_THEME" --port "$PORT" "$theme"
  fi
}

status_skin() {
  resolve_runtime
  local session="off"
  local codex="false"
  local theme=""
  local layout=""
  local payload=""

  [ -z "$(dream_main_pids)" ] || codex="true"
  if [ -f "$PAUSED_PATH" ]; then
    session="paused"
  elif skin_ready; then
    session="active"
    payload="$("$NODE_BIN" "$SET_THEME" --port "$PORT" --list 2>/dev/null || true)"
    if [ -n "$payload" ]; then
      theme="$(printf '%s' "$payload" | plutil -extract theme raw -o - - 2>/dev/null || true)"
      layout="$(printf '%s' "$payload" | plutil -extract layout raw -o - - 2>/dev/null || true)"
    fi
  elif dream_cdp_ready "$PORT"; then
    session="stale"
  fi

  printf 'session=%s\n' "$session"
  printf 'codex=%s\n' "$codex"
  printf 'theme=%s\n' "$theme"
  printf 'layout=%s\n' "$layout"
  printf 'port=%s\n' "$PORT"
}

case "$COMMAND" in
  status)
    status_skin
    ;;
  pause)
    resolve_runtime
    write_paused_marker
    stop_injector
    "$NODE_BIN" "$INJECTOR" --remove --port "$PORT" --timeout-ms 3000 >/dev/null 2>&1 || true
    echo "AutoSkin is paused. Codex remains open."
    ;;
  resume|apply)
    resume_skin
    ;;
  theme)
    switch_skin "${1:-}" "${2:-}"
    ;;
  layout)
    resolve_runtime
    if ! skin_ready; then resume_skin; fi
    case "${1:-}" in
      banner|fullscreen) "$NODE_BIN" "$SET_THEME" --port "$PORT" "${1:-}" ;;
      *) dream_die "layout must be banner or fullscreen" ;;
    esac
    ;;
  *)
    dream_die "unknown menu command: $COMMAND"
    ;;
esac
