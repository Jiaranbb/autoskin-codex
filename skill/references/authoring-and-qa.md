# Authoring and QA workflow

## Contents

1. Inspect before generating
2. Asset preparation
3. Preview matrix
4. Component checks
5. Runtime acceptance

## 1. Inspect before generating

Record the source image dimensions, subject locations, meaningful edges, and empty copy area.
Choose whether the source should be cropped, edited, or used unchanged. If the user requests an
exact mouth, logo, icon, or pose, use the supplied pixels when possible; do not repeatedly redraw
an element that should be composited.

Treat source-image edits and theme layout as separate tasks. Approve the source asset first, then
approve the Codex composition.

## 2. Asset preparation

- Keep the original source outside the theme and copy an explicit working asset into `assets/`.
- Store transparent badges/icons as separate PNG or WebP files.
- Inspect alpha edges against both light and dark checkerboards.
- Do not paste image bytes into CSS.
- Use an image editor for visual edits; use the deterministic theme scripts for copying, naming,
  validation, and layout.
- Record focal point and preserved edge zones instead of repeatedly exporting differently cropped
  background files.

## 3. Preview matrix

Review every theme at:

| Surface | Wide | Standard | Narrow |
|---|---:|---:|---:|
| Fullscreen home | 1920×1080 | 1728×1117 | 1280×900 |
| Banner home | 1920×1080 | 1728×1117 | 1280×900 |
| Chat | 1920×1080 | 1728×1117 | 1280×900 |

Turn on guides and verify:

- focal subject is not covered by cards or composer;
- reserved pool wall, frame, or edge remains visible;
- no unintended top, bottom, or left shadow survives;
- source-image text or fake UI does not appear;
- hero copy stays inside the content area;
- background crop is still acceptable with the sidebar open and closed.

The preview is a gate, not proof. Follow it with a live screenshot at the real viewport.

## 4. Component checks

### Title bar and official colors

Apply `nativeTheme` before adding CSS overrides. Verify the official title bar, sidebar, accent,
surface, and ink colors. If a pink/purple title bar remains, inspect the official theme config and
the outer window surface before writing more selectors.

### Cards

Compare source pixels visible through the card. Validate fill opacity separately from blur.
Check title, subtitle, icon alpha edges, hover lift, and responsive 4→3→2 card counts.

### Sidebar

Check new-task height, padding, icon/text separation, hover lift, selected row, profile row, and
decorative icon removal. Keep real native buttons clickable.

### Composer

Inspect three layers independently:

1. outer wrapper background;
2. input surface fill and blur;
3. input surface shadow.

Remove only the offending layer. Do not erase the shadow merely to remove a white wrapper.

### Decorations and brand assets

Use one semantic decoration definition for repeated hearts/sparkles. Check that obsolete
decorations are actually removed rather than merely recolored. Keep background characters and
badges at deliberate, separately configured opacity values.

## 5. Runtime acceptance

Require all of the following:

- schema validation passes with no Base64 in authored JSON/CSS; generated runtime bridges are
  confined to `.build/`;
- preview matrix reviewed;
- live fullscreen, banner, and chat screenshots match the preview intent;
- cards, project selector, composer, new-task button, profile, and menu remain clickable;
- no horizontal/vertical document overflow;
- theme appears in public/private menu enumeration;
- pause keeps Codex open and stays paused;
- resume restores the selected theme;
- ordinary Codex restart restores the skin once;
- runtime update preserves private themes;
- a failed install transaction restores both the prior theme and official base colors.
