# Theme schema v2

For editor completion and machine-readable shape checks, use
[`theme.schema.json`](theme.schema.json). The Python validator remains authoritative for file
existence, image safety, CSS scope, and other checks JSON Schema cannot perform.

## Contents

1. Package layout
2. Top-level fields
3. Asset and view fields
4. Component fields
5. Generated output
6. Prohibited values

## 1. Package layout

```text
my-theme/
├── theme.json
├── assets/
│   ├── background.png
│   ├── chat-background.png
│   ├── brand-icon.png
│   └── card-1.png
└── .build/                 # generated; never hand-edit
```

Theme ids use `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`. Asset paths are relative to the package root,
must stay under `assets/`, and may use PNG, JPEG, or WebP.

## 2. Top-level fields

```json
{
  "schemaVersion": 2,
  "id": "pool-summer",
  "meta": {
    "name": "Pool Summer",
    "shortName": "Summer",
    "edition": "Community Edition",
    "signature": "Made with AutoSkin ❤",
    "author": "Your Name"
  },
  "nativeTheme": {},
  "assets": {},
  "views": {},
  "components": {},
  "content": {},
  "decorations": [],
  "advanced": { "customCss": null }
}
```

- `schemaVersion`: must be `2`.
- `id`: immutable package id and folder id.
- `meta.name`: menu and banner title.
- `meta.shortName`: compact menu label.
- `meta.edition`, `meta.signature`: banner secondary copy.
- `nativeTheme`: values expressible by official Codex appearance settings.
- `assets`: image file roles.
- `views`: independent background geometry per renderer surface.
- `components`: colors and glass treatments for real UI components.
- `content`: hero, cards, and composer text.
- `decorations`: non-interactive text/image ornaments.
- `advanced.customCss`: optional relative CSS file; use only after schema fields are insufficient.

## 3. Native theme, assets, and views

```json
{
  "nativeTheme": {
    "appearance": "light",
    "accent": "#10A9C1",
    "surface": "#F6FDFF",
    "ink": "#153D4A",
    "contrast": 64,
    "opaqueWindows": true
  },
  "assets": {
    "background": "assets/background.png",
    "chatBackground": "assets/background.png",
    "brandIcon": "assets/brand-icon.png",
    "cardIcons": [
      "assets/card-1.png",
      "assets/card-2.png",
      null,
      null
    ]
  },
  "views": {
    "fullscreen": {
      "fit": "cover",
      "scale": 1,
      "focalPoint": [0.82, 0.50],
      "opacity": 1,
      "overlay": {
        "kind": "radial",
        "color": "#F1FCFF",
        "strength": 0.72,
        "anchor": [0.20, 0.28]
      },
      "preserveEdges": { "top": 0, "right": 0.10, "bottom": 0, "left": 0 }
    },
    "banner": {
      "fit": "cover",
      "scale": 1.2,
      "focalPoint": [0.75, 0.30],
      "opacity": 1,
      "overlay": {
        "kind": "linear",
        "color": "#F1FCFF",
        "strength": 0.88,
        "anchor": [0, 0.5]
      }
    },
    "chat": {
      "fit": "cover",
      "scale": 1,
      "focalPoint": [0.70, 0.50],
      "opacity": 0.12,
      "overlay": {
        "kind": "solid",
        "color": "#F8FEFF",
        "strength": 0.78,
        "anchor": [0.5, 0.5]
      }
    }
  }
}
```

`focalPoint` and `anchor` use normalized coordinates from `0` to `1`. `scale` is `0.5` to `4`.
`preserveEdges` reserves meaningful source-image edges during review; values are normalized widths.
It is a preview/QA contract, not a promise that CSS `cover` can always preserve every edge.

`opaqueWindows` is the official Codex chrome-theme switch that controls the opaque/translucent
window strategy. The current official theme API does not expose a separate sidebar-only
translucency key, so the schema deliberately does not promise one.

## 4. Components, content, and decorations

```json
{
  "components": {
    "chrome": {
      "background": "#F8FDFF",
      "title": "#096B80",
      "border": "#56C9DE"
    },
    "sidebar": {
      "background": "#F2FCFE",
      "text": "#225766",
      "active": "#BEEEF5",
      "newTask": "#13B4C9"
    },
    "cards": {
      "fill": "#E8FAFD",
      "opacity": 0.38,
      "blur": 16,
      "radius": 18,
      "border": "none",
      "shadow": "0 10px 28px rgba(19, 104, 122, 0.14)",
      "title": "#194F5D",
      "subtitle": "#447884"
    },
    "composer": {
      "fill": "#F5FDFF",
      "opacity": 0.82,
      "blur": 18,
      "radius": 22,
      "shadow": "0 14px 34px rgba(19, 104, 122, 0.18)",
      "outerBackground": "transparent",
      "text": "#173F4B"
    }
  },
  "content": {
    "heroTitle": "我们应该在 {{project}} 中做些什么？",
    "heroSubtitle": "把灵感慢慢漂起来",
    "composerPlaceholder": "写下你的想法…",
    "cards": [
      { "title": "探索并理解代码", "subtitle": "快速读懂逻辑与结构" }
    ]
  },
  "decorations": [
    {
      "kind": "text",
      "value": "❤",
      "surface": "home",
      "position": [0.20, 0.12],
      "color": "#F39AB4",
      "opacity": 0.72,
      "size": 12
    }
  ]
}
```

`components.composer.outerBackground` is separate from composer fill and shadow. This prevents
removing the input shadow when the actual problem is the wrapper background.

Decorations must be `pointer-events:none` in generated output. Image decorations reference an
asset path; text decorations store plain text. Arbitrary HTML is forbidden.

`heroTitle` must contain `{{project}}`. The runtime changes only the surrounding copy and preserves
Codex's native project button. Card titles replace visible labels only; their native buttons and
actions are retained. Both fields are consumed by the previewer and the installed runtime.

## 5. Generated output

`scripts/theme_tool.py build` writes:

```text
.build/<id>/
├── theme.json          # runtime compatibility manifest
├── native-theme.json   # official appearance values
├── generated.css       # generated, scoped delta CSS
├── extra.css           # runtime CSS assembled from generated and validated custom CSS
├── asset-map.json      # CSS variable to asset-file mapping
├── assets/             # copied files
├── source-theme.json   # normalized source manifest
└── build-report.json   # hashes and warnings
```

The authored package and `generated.css` never contain Base64. The current v1 safe runtime injects
`extra.css` as a `<style>` element and cannot resolve theme-relative asset files. For compatibility,
the deterministic builder creates a disposable asset bridge inside `.build/<id>/extra.css`.
That bridge may contain generated data URLs. The source manifest, source CSS, `asset-map.json`, and
the real images under `assets/` remain reviewable and path-based; never hand-edit or copy the bridge
back into source CSS.

## 6. Prohibited values

- `data:` and Base64 in JSON, CSS, or HTML;
- `http://` or `https://` image assets;
- absolute paths or `..` path traversal;
- JavaScript, `<script>`, `expression()`, or `url(javascript:...)` in custom CSS;
- unscoped selectors in custom CSS;
- decoration layers that receive pointer events;
- a source screenshot used as a fake replacement for real Codex controls.

Every selector in `advanced.customCss` must begin from
`html.dream-theme-<id>` or `:root.dream-theme-<id>`. This matches the safe runtime's
theme class and prevents one package from styling every Codex view.
