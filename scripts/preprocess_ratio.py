#!/usr/bin/env python3
"""
preprocess_ratio.py — ONE compact file per (dataset, taxon, testValue, suffix)
================================================================================
18 files total.  Output is written OUTSIDE the workspace so VS Code's file
watcher is never triggered.

Output path  (default ~/ratio_cache):
  {out_root}/{dataset}/philogenie/{taxon}/ratio_{testValue}{suffix}.json.gz

Payload format (compact binary-in-JSON):
{
  "arms":     <int>,          // e.g. 378
  "ranks":    10,
  "reps":     ["rep_id0", ...],        // n_reps strings
  "ratios":   "<base64 of float32-LE array>",
              // length = n_reps * ranks * arms floats
              // order:  rep  -> rank -> arm  (outermost -> innermost)
  "patterns": "<base64 of uint8 array>",
              // each pattern is exactly 3 ASCII bytes (padded/truncated)
              // same ordering: rep -> rank -> arm
}

Browser decoding:
  const rBuf = Uint8Array.from(atob(d.ratios),   c=>c.charCodeAt(0)).buffer;
  const pBuf = Uint8Array.from(atob(d.patterns), c=>c.charCodeAt(0)).buffer;
  const ratios = new Float32Array(rBuf);
  // rep i, rank r, arm a -> ratios[i*ranks*arms + r*arms + a]
  // pattern at rep i rank r arm a:
  const off = (i*ranks*arms + r*arms + a) * 3;
  const pat = new TextDecoder().decode(pBuf.slice(off, off+3)).trimEnd();

Usage:
  python3 scripts/preprocess_ratio.py [--force] [--out-dir /path]
"""

import base64
import csv
import gzip
import json
import re
import struct
import sys
from pathlib import Path

# ── CLI args ──────────────────────────────────────────────────────────────────
FORCE = '--force' in sys.argv
_out_arg = next(
    (sys.argv[i + 1] for i, a in enumerate(sys.argv)
     if a == '--out-dir' and i + 1 < len(sys.argv)),
    None,
)
OUT_ROOT = Path(_out_arg) if _out_arg else Path.home() / 'ratio_cache'

# ── paths ─────────────────────────────────────────────────────────────────────
WEBV2        = Path('/home/banongav/Documents/GitHub/interfaces/article_webv2/public')
WEBV3_PUBLIC = Path(__file__).parent.parent / 'public'

DATASETS    = ['14k', '60_cla']
TAXONS      = ['Prokaryote']
TEST_VALUES = ['all', 'cod', 'non']
SUFFIXES    = ['', '_chromosome', '_plasmid']
N_RANKS     = 10

# ── fast cell parsers (no ast — pure regex on pre-compiled patterns) ───────────
_NUM_RE = re.compile(r'-?\d+')
_STR_RE = re.compile(r"'([^']*)'")

def parse_int_list(cell: str) -> list:
    return [int(x) for x in _NUM_RE.findall(cell)]

def parse_str_list(cell: str) -> list:
    return _STR_RE.findall(cell)

# ── I/O helpers ───────────────────────────────────────────────────────────────
def open_csv(path: Path):
    if str(path).endswith('.gz'):
        return gzip.open(path, 'rt', newline='', encoding='utf-8')
    return open(path, 'r', newline='', encoding='utf-8')

def load_top10_ints(path: Path) -> dict:
    out = {}
    with open_csv(path) as f:
        for i, row in enumerate(csv.reader(f)):
            if i == 0 or not row or not row[0].strip():
                continue
            out[row[0].strip()] = [parse_int_list(c) for c in row[1:]]
    return out

def load_top10_strs(path: Path) -> dict:
    out = {}
    with open_csv(path) as f:
        for i, row in enumerate(csv.reader(f)):
            if i == 0 or not row or not row[0].strip():
                continue
            out[row[0].strip()] = [parse_str_list(c) for c in row[1:]]
    return out

def iter_total_counts(path: Path):
    with open_csv(path) as f:
        for i, row in enumerate(csv.reader(f)):
            if i == 0 or not row or not row[0].strip():
                continue
            vals = []
            for v in row[1:]:
                try:
                    vals.append(int(float(v)))
                except ValueError:
                    vals.append(0)
            yield row[0].strip(), vals

# ── core ──────────────────────────────────────────────────────────────────────
def process_combo(dataset, taxon, test_value, suffix):
    tag      = f'{dataset}/{taxon}/{test_value}{suffix}'
    taxon_v2 = WEBV2        / 'data' / dataset / 'philogenie' / taxon
    taxon_v3 = WEBV3_PUBLIC / 'data' / dataset / 'philogenie' / taxon
    out_dir  = OUT_ROOT / dataset / 'philogenie' / taxon
    out_path = out_dir / f'ratio_{test_value}{suffix}.json.gz'

    if out_path.exists() and not FORCE:
        print(f'  [skip] {tag}  (already exists)')
        return

    pc_stem = f'hc_{taxon}_{test_value}_pattern_count{suffix}'
    pc_path = taxon_v2 / f'{pc_stem}.csv'
    if not pc_path.exists():
        pc_path = taxon_v2 / f'{pc_stem}.csv.gz'
    if not pc_path.exists():
        print(f'  [MISS] {tag}  — pattern_count file not found')
        return

    def find_v3(stem):
        for ext in ('.csv.gz', '.csv'):
            p = taxon_v3 / (stem + ext)
            if p.exists():
                return p
        return None

    cnt_path = find_v3(f'top10_count_hc_{test_value}_{taxon}{suffix}')
    pat_path = find_v3(f'top10_pattern_hc_{test_value}_{taxon}{suffix}')
    if not cnt_path or not pat_path:
        print(f'  [MISS] {tag}  — top10 files not found')
        return

    print(f'  [{tag}] loading top10 counts …',   flush=True)
    top_cnts = load_top10_ints(cnt_path)
    print(f'  [{tag}] loading top10 patterns …', flush=True)
    top_pats = load_top10_strs(pat_path)

    print(f'  [{tag}] building arrays …', flush=True)
    rep_ids     = []
    ratio_buf   = bytearray()
    pattern_buf = bytearray()
    n_arms      = None

    for rep_id, totals in iter_total_counts(pc_path):
        if rep_id not in top_cnts or rep_id not in top_pats:
            continue
        cnts = top_cnts[rep_id]
        pats = top_pats[rep_id]
        if n_arms is None:
            n_arms = len(totals)
        rep_ids.append(rep_id)
        for rank in range(N_RANKS):
            for arm in range(n_arms):
                total = totals[arm] if arm < len(totals) else 0
                c     = cnts[arm][rank] if arm < len(cnts) and rank < len(cnts[arm]) else 0
                ratio_buf += struct.pack('<f', c / total if total > 0 else 0.0)
                p = pats[arm][rank] if arm < len(pats) and rank < len(pats[arm]) else ''
                pattern_buf += (p + '   ')[:3].encode('ascii', errors='replace')

    if n_arms is None:
        print(f'  [EMPTY] {tag}')
        return

    n_reps = len(rep_ids)
    print(f'  [{tag}] {n_reps} reps x {N_RANKS} ranks x {n_arms} arms -> encoding …', flush=True)

    payload = {
        'arms':     n_arms,
        'ranks':    N_RANKS,
        'reps':     rep_ids,
        'ratios':   base64.b64encode(bytes(ratio_buf)).decode('ascii'),
        'patterns': base64.b64encode(bytes(pattern_buf)).decode('ascii'),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    with gzip.open(out_path, 'wb', compresslevel=6) as f:
        f.write(json.dumps(payload, separators=(',', ':')).encode('utf-8'))

    size_kb = out_path.stat().st_size // 1024
    print(f'  DONE {tag}  -> {out_path.name}  ({size_kb} KB)', flush=True)

# ── entry ─────────────────────────────────────────────────────────────────────
def main():
    print(f'Output root: {OUT_ROOT}')
    print(f'Force:       {FORCE}\n')
    for dataset in DATASETS:
        for taxon in TAXONS:
            print(f'\n[{dataset} / {taxon}]')
            for test_value in TEST_VALUES:
                for suffix in SUFFIXES:
                    process_combo(dataset, taxon, test_value, suffix)
    print('\nAll done.')
    print(f'\nServe during dev:')
    print(f'  npx serve {OUT_ROOT} --cors --listen 5200')
    print(f'  # add VITE_RATIO_BASE_URL=http://localhost:5200 to .env.local')

if __name__ == '__main__':
    main()
