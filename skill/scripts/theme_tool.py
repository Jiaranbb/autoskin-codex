#!/usr/bin/env python3
"""Initialize, validate, build, preview, and package AutoSkin Codex themes."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
import zipfile
from pathlib import Path

from theme_core import (
    EXAMPLE_ROOT,
    PREVIEWER_ROOT,
    TEMPLATE_PATH,
    ThemeError,
    build_theme,
    load_json,
    normalize_theme_dir,
    validate_theme,
    write_json,
)

VIEWPORTS = {
    "desktop": (1728, 1117),
    "wide": (1920, 1080),
    "narrow": (1280, 900),
}
SURFACES = ("fullscreen", "banner", "chat")


def command_init(args: argparse.Namespace) -> int:
    theme_id = args.theme_id
    if not __import__("re").fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", theme_id):
        raise ThemeError("theme id must be kebab-case")
    image = Path(args.image).expanduser().resolve()
    if not image.is_file() or image.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise ThemeError("--image must be an existing png/jpg/jpeg/webp file")
    theme_dir = Path(args.output).expanduser().resolve() / theme_id
    if theme_dir.exists() and any(theme_dir.iterdir()):
        raise ThemeError(f"output theme directory is not empty: {theme_dir}")
    assets_dir = theme_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    asset_name = "background" + image.suffix.lower()
    shutil.copy2(image, assets_dir / asset_name)
    theme = load_json(TEMPLATE_PATH)
    theme["id"] = theme_id
    theme["meta"]["name"] = args.name or theme_id.replace("-", " ").title()
    theme["meta"]["shortName"] = args.short_name or theme["meta"]["name"][:16]
    theme["assets"]["background"] = f"assets/{asset_name}"
    theme["assets"]["chatBackground"] = f"assets/{asset_name}"
    write_json(theme_dir / "theme.json", theme)
    print(theme_dir)
    return 0


def command_validate(args: argparse.Namespace) -> int:
    theme_dir = normalize_theme_dir(args.theme)
    _, result = validate_theme(theme_dir)
    payload = {"ok": result.ok, "errors": result.errors, "warnings": result.warnings}
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if result.ok else 2


def command_clone_example(args: argparse.Namespace) -> int:
    output = Path(args.output).expanduser().resolve()
    theme_dir = output / "chiikawa-summer"
    if theme_dir.exists() and any(theme_dir.iterdir()):
        raise ThemeError(f"output theme directory is not empty: {theme_dir}")
    theme_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        EXAMPLE_ROOT,
        theme_dir,
        ignore=shutil.ignore_patterns(".build", "__pycache__", "*.pyc"),
    )
    print(theme_dir)
    return 0


def command_build(args: argparse.Namespace) -> int:
    theme_dir = normalize_theme_dir(args.theme)
    output, report = build_theme(theme_dir)
    print(json.dumps({"ok": True, "output": str(output), "report": report}, ensure_ascii=False, indent=2))
    return 0


def command_package(args: argparse.Namespace) -> int:
    theme_dir = normalize_theme_dir(args.theme)
    build_dir, report = build_theme(theme_dir)
    theme_id = report["theme"]
    package_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else theme_dir / ".build" / f"{theme_id}-autoskin.zip"
    )
    if package_path.suffix.lower() != ".zip":
        raise ThemeError("--output must end in .zip")
    package_path.parent.mkdir(parents=True, exist_ok=True)
    next_path = package_path.with_name(package_path.name + ".next")
    next_path.unlink(missing_ok=True)
    with zipfile.ZipFile(next_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in sorted(path for path in build_dir.rglob("*") if path.is_file()):
            relative = source.relative_to(build_dir)
            info = zipfile.ZipInfo(f"{theme_id}/{relative.as_posix()}", date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    os.replace(next_path, package_path)
    print(
        json.dumps(
            {
                "ok": True,
                "package": str(package_path),
                "theme": theme_id,
                "files": len(report["files"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def find_chromium() -> str | None:
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
    ]
    if os.name == "nt":
        local = os.environ.get("LOCALAPPDATA", "")
        program_files = os.environ.get("PROGRAMFILES", "")
        candidates.extend([
            str(Path(program_files) / "Google/Chrome/Application/chrome.exe"),
            str(Path(local) / "Google/Chrome/Application/chrome.exe"),
        ])
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def make_preview(theme_dir: Path) -> Path:
    theme, result = validate_theme(theme_dir)
    result.require_ok()
    preview_dir = theme_dir / ".build" / "preview"
    next_dir = theme_dir / ".build" / ".preview.next"
    if next_dir.exists():
        shutil.rmtree(next_dir)
    next_dir.mkdir(parents=True)
    for name in ("index.html", "preview.css", "preview.js"):
        shutil.copy2(PREVIEWER_ROOT / name, next_dir / name)
    shutil.copytree(theme_dir / "assets", next_dir / "assets")
    data = "window.AUTOSKIN_THEME = " + json.dumps(theme, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (next_dir / "theme-data.js").write_text(data, encoding="utf-8")
    if preview_dir.exists():
        shutil.rmtree(preview_dir)
    next_dir.rename(preview_dir)
    return preview_dir / "index.html"


def capture_preview(
    browser: str,
    index: Path,
    screenshot: Path,
    surface: str,
    viewport: str,
    guides: bool,
) -> None:
    width, height = VIEWPORTS[viewport]
    query = urllib.parse.urlencode(
        {
            "surface": surface,
            "viewport": viewport,
            "guides": "1" if guides else "0",
            "capture": "1",
        }
    )
    subprocess.run(
        [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--run-all-compositor-stages-before-draw",
            f"--window-size={width},{height}",
            f"--screenshot={screenshot}",
            index.as_uri() + "?" + query,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def command_preview(args: argparse.Namespace) -> int:
    theme_dir = normalize_theme_dir(args.theme)
    index = make_preview(theme_dir)
    screenshot = None
    if args.screenshot:
        browser = find_chromium()
        if not browser:
            raise ThemeError("Chrome/Chromium is required for --screenshot; preview HTML was generated")
        screenshot = Path(args.screenshot).expanduser().resolve()
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        capture_preview(
            browser,
            index,
            screenshot,
            args.surface,
            args.viewport,
            args.guides,
        )
    if args.open:
        if sys.platform == "darwin":
            subprocess.run(["open", index], check=True)
        elif os.name == "nt":
            os.startfile(index)  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", index], check=True)
    print(json.dumps({"ok": True, "preview": str(index), "screenshot": str(screenshot) if screenshot else None}, ensure_ascii=False))
    return 0


def command_preview_matrix(args: argparse.Namespace) -> int:
    theme_dir = normalize_theme_dir(args.theme)
    index = make_preview(theme_dir)
    browser = find_chromium()
    if not browser:
        raise ThemeError("Chrome/Chromium is required for preview-matrix")
    output = (
        Path(args.output).expanduser().resolve()
        if args.output
        else theme_dir / ".build" / "preview-matrix"
    )
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    items = []
    for surface in SURFACES:
        for viewport in VIEWPORTS:
            filename = f"{surface}-{viewport}.png"
            capture_preview(
                browser,
                index,
                output / filename,
                surface,
                viewport,
                True,
            )
            items.append({"surface": surface, "viewport": viewport, "image": filename})
    cards = "\n".join(
        f"<figure><img src='{item['image']}' alt='{item['surface']} {item['viewport']}'>"
        f"<figcaption>{item['surface']} · {item['viewport']}</figcaption></figure>"
        for item in items
    )
    contact = (
        "<!doctype html><meta charset='utf-8'><title>AutoSkin preview matrix</title>"
        "<style>body{font:14px -apple-system;margin:24px;background:#edf4f6;color:#173f4b}"
        "main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}"
        "figure{margin:0;padding:10px;background:white;border-radius:14px;box-shadow:0 8px 24px #173f4b22}"
        "img{display:block;width:100%;border-radius:8px}figcaption{padding:9px 2px 2px}</style>"
        f"<h1>AutoSkin preview matrix</h1><main>{cards}</main>"
    )
    (output / "index.html").write_text(contact, encoding="utf-8")
    write_json(output / "matrix.json", {"theme": str(theme_dir), "items": items})
    if args.open:
        if sys.platform == "darwin":
            subprocess.run(["open", output / "index.html"], check=True)
        elif os.name == "nt":
            os.startfile(output / "index.html")  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", output / "index.html"], check=True)
    print(json.dumps({"ok": True, "matrix": str(output / "index.html"), "count": len(items)}, ensure_ascii=False))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="create a schema-v2 theme from an image")
    init.add_argument("theme_id")
    init.add_argument("--image", required=True)
    init.add_argument("--output", required=True, help="parent directory for the new theme")
    init.add_argument("--name")
    init.add_argument("--short-name")
    init.set_defaults(func=command_init)

    example = sub.add_parser("clone-example", help="copy the bundled Chiikawa Summer example")
    example.add_argument("--output", required=True, help="parent directory for the example")
    example.set_defaults(func=command_clone_example)

    validate = sub.add_parser("validate", help="validate schema, assets, and safety rules")
    validate.add_argument("theme")
    validate.set_defaults(func=command_validate)

    build = sub.add_parser("build", help="build deterministic runtime files")
    build.add_argument("theme")
    build.set_defaults(func=command_build)

    package = sub.add_parser("package", help="build a deterministic installable ZIP")
    package.add_argument("theme")
    package.add_argument("--output")
    package.set_defaults(func=command_package)

    preview = sub.add_parser("preview", help="generate an interactive local preview")
    preview.add_argument("theme")
    preview.add_argument("--open", action="store_true")
    preview.add_argument("--screenshot")
    preview.add_argument("--surface", choices=("fullscreen", "banner", "chat"), default="fullscreen")
    preview.add_argument("--viewport", choices=("desktop", "wide", "narrow"), default="desktop")
    preview.add_argument("--guides", action="store_true")
    preview.set_defaults(func=command_preview)

    matrix = sub.add_parser("preview-matrix", help="render all 3 surfaces at all 3 viewport sizes")
    matrix.add_argument("theme")
    matrix.add_argument("--output")
    matrix.add_argument("--open", action="store_true")
    matrix.set_defaults(func=command_preview_matrix)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        return args.func(args)
    except ThemeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() if isinstance(exc.stderr, str) else str(exc)
        print(f"error: command failed: {detail}", file=sys.stderr)
        return exc.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())
