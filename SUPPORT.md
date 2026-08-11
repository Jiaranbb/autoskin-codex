# Support

## Supported scope

- Theme schema validation, preview generation, deterministic packaging, and installation issues.
- macOS runtime install, start, pause/resume, theme switching, verification, restore, and uninstall.
- Compatibility fixes after a Codex/ChatGPT desktop update.
- Bugs in the bundled Chiikawa Summer example or generic starter template.

## Current platform status

- macOS: locally tested with install, switch, restore, uninstall, deterministic package, and
  isolated fresh-install regression checks.
- Windows: PowerShell scripts are included, but wider real-device testing is still needed.

## Before opening an issue

Please include:

1. Operating system and Codex/ChatGPT desktop version.
2. The exact command or request used.
3. Output from `scripts/autoskin-macos.sh doctor`, `status`, and `verify` when applicable.
4. Whether the problem affects fullscreen home, Banner, new chat, or an existing conversation.
5. A screenshot with private task names and account details removed.

Do not attach private themes, conversations, tokens, account configuration, or unredacted logs.

## Not supported

- Modified, re-signed, or repackaged official application bundles.
- Remote CSS/assets or executable code embedded in a theme.
- Commercial redistribution of the bundled Fan Art assets.
- Guaranteed compatibility with future desktop versions before verification.

Report reproducible problems through
[GitHub Issues](https://github.com/Jiaranbb/autoskin-codex/issues).
