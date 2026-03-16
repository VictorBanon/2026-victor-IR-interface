"""
scripts/preprocess_scatter.py

Pre-computes per-group row indices for every categorical column in every
acp_*.json.gz file.  The output is a compact sidecar  acp_*.scatter.json.gz
stored next to the source.

The sidecar format:
{
  "groups": {
    "<colName>": [
      { "name": "<groupValue>", "count": N, "indices": [i0, i1, …] },
      …                                     // sorted descending by count
    ],
    …
  }
}

Indices point into the "rows" array of the corresponding acp_*.json.gz so the
browser can jump directly to each row without re-scanning anything.

Usage:
    python scripts/preprocess_scatter.py           # skip up-to-date files
    python scripts/preprocess_scatter.py --force   # always regenerate

Integration with the Vite build:
    The package.json "preprocess" script calls this as part of the build step
    (see README or package.json "preprocess" script).
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent / "public" / "data"

# Columns for which we pre-compute group indices.
# These are the high-cardinality categorical columns that are expensive to
# group at runtime (Order=295, Family=667, Genus=2348, Species=13335 unique).
# Numeric columns (PC1-PC10, GC, size, …) are intentionally excluded.
CATEGORICAL_COLS = {
    "Superdomain",
    "Domain",
    "Phylum",
    "Class",
    "Order",
    "Family",
    "Genus",
    "Species",
    "full_name",
    "Replicons_name",
    "Replicons_type",
    "ID-replicon",
}

# PC axes for which we pre-parse float arrays (eliminates parseFloat in browser)
PC_COLS = [f"PC{i}" for i in range(1, 11)]


# ── Helpers ───────────────────────────────────────────────────────────────────


def read_json_gz(path: Path) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def write_json_gz(path: Path, data: dict) -> None:
    payload = json.dumps(data, separators=(",", ":"))
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write(payload)


def is_outdated(src: Path, dest: Path) -> bool:
    if not dest.exists():
        return True
    return src.stat().st_mtime > dest.stat().st_mtime


def find_json_gz_files(root: Path) -> list[Path]:
    """Recursively find all hc_acp_*.json.gz files (skip .scatter.json.gz)."""
    results = []
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if (
                name.startswith("hc_acp_")
                and name.endswith(".json.gz")
                and ".scatter." not in name
            ):
                results.append(Path(dirpath) / name)
    return sorted(results)


# ── Core computation ──────────────────────────────────────────────────────────


def compute_sidecar(header: list[str], rows: list[list[str]]) -> dict:
    """
    Returns:
      groups  – per categorical column: [{name, count, indices}] sorted desc by count
      pcFloats – per PC column: flat float array (NaN → null) for all rows
    """
    col_index = {h: i for i, h in enumerate(header)}

    # ── categorical groups ────────────────────────────────────────────────────
    target_cols = [c for c in CATEGORICAL_COLS if c in col_index]
    groups: dict[str, list[dict]] = {}

    for col in target_cols:
        ci = col_index[col]
        bucket: dict[str, list[int]] = defaultdict(list)
        for row_idx, row in enumerate(rows):
            val = row[ci] if ci < len(row) else ""
            bucket[val or "N/A"].append(row_idx)

        # Sort descending by count (stable sort preserves original order for ties)
        sorted_groups = sorted(bucket.items(), key=lambda kv: -len(kv[1]))
        groups[col] = [
            {"name": name, "count": len(idxs), "indices": idxs}
            for name, idxs in sorted_groups
        ]

    # ── PC float arrays ───────────────────────────────────────────────────────
    pc_floats: dict[str, list] = {}
    for col in PC_COLS:
        if col not in col_index:
            continue
        ci = col_index[col]
        arr = []
        for row in rows:
            raw = row[ci] if ci < len(row) else ""
            try:
                arr.append(float(raw))
            except (ValueError, TypeError):
                arr.append(None)  # JSON null → NaN in JS
        pc_floats[col] = arr

    return {"groups": groups, "pcFloats": pc_floats}


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-compute scatter group indices.")
    parser.add_argument("--force", action="store_true", help="Regenerate all files.")
    args = parser.parse_args()

    files = find_json_gz_files(ROOT)
    if not files:
        print(f"No hc_acp_*.json.gz files found under {ROOT}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(files)} hc_acp_*.json.gz file(s) under {ROOT}\n")

    converted = 0
    skipped = 0

    for src in files:
        dest = src.parent / src.name.replace(".json.gz", ".scatter.json.gz")
        rel = src.relative_to(ROOT)

        if not args.force and not is_outdated(src, dest):
            print(f"  skip  {rel}")
            skipped += 1
            continue

        print(f"  proc  {rel} … ", end="", flush=True)
        t0 = time.monotonic()

        data = read_json_gz(src)
        header: list[str] = data["header"]
        rows: list[list[str]] = data["rows"]

        sidecar = compute_sidecar(header, rows)
        write_json_gz(dest, sidecar)

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        dest_kb = dest.stat().st_size // 1024
        n_cols = len(sidecar["groups"])
        print(f"done  ({len(rows)} rows, {n_cols} cols → {dest_kb} KB, {elapsed_ms} ms)")
        converted += 1

    print(f"\nDone: {converted} generated, {skipped} skipped.")


if __name__ == "__main__":
    main()
