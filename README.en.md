# AutoSkin Codex

**Deeply customize Codex desktop themes—from multi-surface previews to reversible installation.**

[中文说明](README.md) · [Preview](#preview) · [Install](#install) ·
[Support](SUPPORT.md) · [Issues](https://github.com/Jiaranbb/autoskin-codex/issues)

AutoSkin Codex is a Codex Skill for authoring, previewing, validating, packaging, installing, and
recovering desktop themes. It rebuilds the theme schema, preview workflow, and installer around the
safe local renderer-injection approach established by
[`Finderchangchang/codex-autoskin`](https://github.com/Finderchangchang/codex-autoskin).

It keeps source images as ordinary files, separates official Codex appearance values from runtime
styling, and previews fullscreen home, Banner, and new-chat surfaces independently before touching
the live app. The repository includes a complete **Chiikawa Summer Pool** worked example.

## Preview

![Installed Chiikawa Summer Pool theme](docs/images/chiikawa-summer-preview.jpg)

The sidebar labels in this real installed screenshot have been obscured. They are not bundled data.

## Install

Ask Codex to install the Skill from this repository, or use the built-in installer:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo Jiaranbb/autoskin-codex \
  --path skill \
  --name autoskin-codex
```

Open a new Codex task after installation, then ask:

```text
Use autoskin-codex to clone and preview the bundled Chiikawa Summer example. Do not install it
until I approve the fullscreen, Banner, and new-chat previews.
```

## What can be customized

- Official Codex accent, surface, ink, contrast, fonts, and opacity strategy.
- Independent fullscreen, Banner, and new-chat background crops, focal points, opacity, and wash.
- Theme brand icon, title, edition, signature, and chrome colors.
- Sidebar colors, selected rows, and the new-task button.
- Four card icons, glass opacity, blur, radius, shadow, title color, subtitle color, and copy.
- Composer fill, blur, radius, shadow, outer wrapper, text color, and placeholder.
- Non-interactive text or image decorations with per-surface visibility.

## Safety boundary

AutoSkin Codex does not modify, replace, re-sign, or unpack the official Codex/ChatGPT application.
The runtime connects only to a loopback Chromium debugging endpoint. Authored themes reject remote
images, embedded Base64 payloads, path traversal, JavaScript URLs, and unscoped custom CSS.

macOS is locally tested. Windows scripts are included but still require broader device testing.
Python 3.9+ is required; macOS normally reuses the desktop app's bundled Node.js and does not
require Homebrew or SwiftBar.

## Fan Art notice

The bundled example contains independently created, unofficial, non-commercial fan art based on
the Chiikawa IP. Character names, designs, and related rights belong to Nagano and the respective
official rightsholders. These assets are not covered by the MIT code license and may only be used
for personal, non-commercial theme customization and sharing. See
[`skill/examples/chiikawa-summer/ASSET-NOTICE.md`](skill/examples/chiikawa-summer/ASSET-NOTICE.md).

## License and attribution

Project code is released under the [MIT License](LICENSE). The adapted upstream runtime retains its
original notice in
[`skill/references/upstream-runtime-LICENSE.txt`](skill/references/upstream-runtime-LICENSE.txt).
Fan Art assets follow their separate notice above.
