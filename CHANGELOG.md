# Changelog

## Unreleased

- Preserve a validated local composer marker during layout measurement instead of removing and repainting it on each refresh; avoid redundant root and semantic-marker class writes.
- Add regression coverage for zero composer/root class mutations during repeated refreshes and stable fullscreen Work geometry under the real stylesheet, including native composer replacement.
- Update the macOS app to 0.3.28 (renderer 3.5.7).
- Stop renderer updates from triggering their own MutationObserver; update text only when changed and reuse the decoration layer on reinjection.
- Serialize macOS launches and reuse a running injector when the menu-bar app and watcher recover simultaneously.
- Bound the complete one-shot verification process, including stalled discovery and WebSocket teardown; close failed CDP sessions.
- Recover missing skin state per window without restarting a live injector on layout/visibility verification failures.
- Update the macOS app to 0.3.27 and add behavioral regression tests for concurrent starts, stalled CDP, idle rendering, and DOM recovery.
- Prevent the macOS watcher from restarting additional ChatGPT/Codex profiles that do not own AutoSkin's CDP port.
- Add bounded CDP socket, command, health-check, and startup verification timeouts to prevent stuck restart loops.
- Accept standalone conversation windows without a history sidebar during health checks, preventing the watcher from restarting the injector and flashing the window.
- Fix the fullscreen Chiikawa home layout after Codex 1.2026.273 changed the home DOM into separate scroll, hero, and composer branches.
- Bump the renderer style version so installed runtimes reload the compatibility CSS after a Codex update.
- Add a native Windows WinForms tray app with the same Themes / Original Skin / Open Folder / Quit menu as macOS.
- Render the Windows tray menu with Windows 11 spacing, rounded-corner hints, system light/dark colors,
  Segoe UI Variable, modern hover states, separators, arrows, and accent checkmarks.
- Make first-run Windows runtime installation, update, login startup, theme switching, pause, and recovery GUI-driven rather than PowerShell-driven.
- Install the Windows runtime outside the source checkout and preserve `themes-private/` across updates.
- Validate the Store Codex package, Node.js 22+, loopback CDP endpoint, managed paths, and live renderer before reporting success.
- Promote AutoSkin to a standalone macOS menu-bar app with an optional Skill adapter.
- Detect, install, update, and apply the runtime automatically when the app opens.
- Enumerate installed themes in the menu bar and switch themes without a command-line workflow.
- Open the editable theme folder directly from the macOS menu bar.
- Rename the external runtime directory to `CodexAutoSkin` and copy recognized legacy `CodexDreamSkin` state automatically without removing the old directory.
- Add a semantic, confidence-scored DOM adapter so core styling does not depend on Codex build-time classes.
- Surface stale GUI compatibility and recover the renderer automatically after Codex updates.
- Keep Chiikawa Summer Pool as the only bundled editable theme example.
- Remove the upstream Aurora Veil and Ember Bloom demo themes from the public package.
- Allow runtime installation to finish cleanly before a private theme has been installed.
- Detect renderer-level skin loss after a desktop app update and automatically reinject the theme.

## 0.1.0 - 2026-08-11

- Publish the rewritten schema-v2 authoring and preview workflow.
- Add independent fullscreen, Banner, and new-chat preview surfaces.
- Add deterministic validation, build, and theme packaging scripts.
- Add snapshot-first installation and the attributed safe local renderer runtime.
- Add native macOS runtime lifecycle commands and optional menu-bar controller workflow.
- Add the bundled Chiikawa Summer Pool non-commercial Fan Art example.
- Keep runtime bootstrap neutral so it no longer imposes starter pink/purple colors.
- Make Hero/card copy and schema decorations consistent between preview and installed runtime.
- Normalize macOS runtime executable permissions after GitHub archive-based Skill installation.
