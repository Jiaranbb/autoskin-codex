# App-first architecture

AutoSkin is a standalone local application. The Codex Skill is an optional automation adapter.

```text
AutoSkin.app
├── native macOS menu-bar controller
├── bundled safe runtime and verifier
├── bundled Chiikawa Summer starter theme
└── automatic detection plus lifecycle actions: apply, pause, resume, switch, verify

skill/
├── optional natural-language authoring adapter
├── schema-v2 theme tools and previewer
└── Windows compatibility scripts
```

The app installs mutable runtime state outside both application bundles:

```text
~/Library/Application Support/CodexAutoSkin/
├── runtime/
└── themes-private/
```

The app never edits, replaces, unpacks, re-signs, or takes ownership of the official Codex or
ChatGPT app. It starts the official app with a loopback Chromium debugging port and injects only the
main renderer. On launch it compares its bundled runtime generation with the installed generation,
creates `CodexAutoSkin` when needed, installs the starter theme, and automatically applies or repairs
the active skin. Recognized state from the legacy `CodexDreamSkin` location is copied once without
removing or modifying that legacy directory.

The renderer adapter discovers GUI regions from roles, accessibility attributes, visibility,
geometry, and scored fallback signals. It annotates the live DOM with stable `dream-*` markers;
theme CSS and verification use those markers instead of Codex build-time classes. The Mutation
Observer re-runs discovery after navigation or a GUI update, while the recovery watcher treats an
adapter confidence below the verification threshold as stale state.

## Build and install

```bash
bash scripts/build-macos-app.sh
bash scripts/install-macos-app.sh
open "$HOME/Applications/AutoSkin.app"
```

`scripts/build-macos-app.sh` creates an ad-hoc signed `.build/AutoSkin.app`, validates its embedded
theme resources, and verifies the bundle signature. A release pipeline can replace ad-hoc signing
with Developer ID signing and notarization without changing the runtime boundary.
