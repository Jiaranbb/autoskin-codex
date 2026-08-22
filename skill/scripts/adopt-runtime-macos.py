#!/usr/bin/env python3
"""Point an existing macOS AutoSkin runtime at this skill without changing the active theme."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_STATE_ROOT = Path.home() / "Library" / "Application Support" / "CodexAutoSkin"
LEGACY_STATE_ROOT = Path.home() / "Library" / "Application Support" / "CodexDreamSkin"
MIGRATED_ENTRIES = (
    "runtime",
    "themes-private",
    "install-state.json",
    "config.before-dream-skin.toml",
    "state.json",
    "paused",
)


def load_object(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"expected a JSON object: {path}")
    return value


def resolve_node(state: dict[str, object], explicit: str | None) -> Path:
    candidates = [explicit, state.get("nodePath"), shutil.which("node")]
    for value in candidates:
        if isinstance(value, str) and Path(value).expanduser().is_file():
            return Path(value).expanduser().resolve()
    raise RuntimeError("Node.js was not found; pass --node or repair the runtime first")


def atomic_write(path: Path, value: dict[str, object]) -> None:
    next_path = path.with_name(path.name + f".next-{os.getpid()}")
    next_path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(next_path, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=str(SKILL_ROOT))
    parser.add_argument("--state-root", default=str(DEFAULT_STATE_ROOT))
    parser.add_argument("--node")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    state_root = Path(args.state_root).expanduser().resolve()
    if state_root == DEFAULT_STATE_ROOT and not state_root.exists() and LEGACY_STATE_ROOT.is_dir():
        state_root.mkdir(parents=True)
        for name in MIGRATED_ENTRIES:
            source_entry = LEGACY_STATE_ROOT / name
            destination_entry = state_root / name
            if source_entry.is_dir():
                shutil.copytree(source_entry, destination_entry)
            elif source_entry.is_file():
                shutil.copy2(source_entry, destination_entry)
    state_path = state_root / "install-state.json"
    runtime_root = state_root / "runtime"
    if not state_path.is_file():
        raise RuntimeError(f"existing runtime state was not found: {state_path}")
    state = load_object(state_path)
    node = resolve_node(state, args.node)
    sync = source / "scripts" / "sync-macos-runtime.mjs"
    if not sync.is_file():
        raise RuntimeError(f"runtime source is incomplete: {sync}")

    subprocess.run(
        [
            str(node),
            str(sync),
            "--source",
            str(source),
            "--destination",
            str(runtime_root),
        ],
        check=True,
    )
    runtime_meta = load_object(runtime_root / ".runtime.json")
    if runtime_meta.get("sourceRoot") != str(source):
        raise RuntimeError("runtime synchronization did not record the new source")

    state["sourceRoot"] = str(source)
    state["runtimeRoot"] = str(runtime_root)
    state["sourceMigratedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    atomic_write(state_path, state)
    print(
        json.dumps(
            {
                "ok": True,
                "sourceRoot": str(source),
                "runtimeRoot": str(runtime_root),
                "activeThemePreserved": True,
                "nativeThemePreserved": True,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
