// ── Shared categorical colour palette ────────────────────────────────────────
// Used by ScatterAcp and PcVsAll to guarantee identical group→colour mapping.
export const PALETTE = [
  '#667eea','#f87171','#34d399','#fbbf24','#a78bfa',
  '#38bdf8','#fb923c','#f472b6','#4ade80','#e879f9',
  '#facc15','#2dd4bf','#f43f5e','#60a5fa','#c084fc',
];

// ── Kmer length per flat arm index (0-based, 378 arms) ───────────────────────
// Flat arm index a = c * 21 + h  (c = column 0-17, h = gap 0-20)
// kmer = arm_size = c + 3  (uniform across all gaps for the same arm column)
// Arms beyond col 17 (arm > 20) are empty → sentinel 1
export const ARM_KMER_LEN: number[] = Array.from({ length: 378 }, (_, i) => {
  const col = Math.floor(i / 21);   // 0-17
  return col <= 17 ? col + 3 : 1;
});

// ── Taxon path resolver ───────────────────────────────────────────────────────
// Returns the sub-folder name under philogenie/ for a given taxon + value.
// Currently always returns "Prokaryote"; extend this when more groups are added.
export function taxon_path_get(taxon: string, taxonValue: string): string {
  // TODO: implement proper mapping once multiple taxon groups are available
  void taxon;
  void taxonValue;
  return 'Prokaryote';
}

// ── Shared heatmap colorscale ─────────────────────────────────────────────────
// Anchors: -1 → blue, 0 → white, 1 → red, 2 → black
// Plotly normalises stop positions to [0, 1]:
//   -1 → 0/3 = 0.000
//    0 → 1/3 ≈ 0.333
//    1 → 2/3 ≈ 0.667
//    2 → 3/3 = 1.000
export const HEATMAP_COLORSCALE: [number, string][] = [
  [0,         '#1a56db'],  // -1  → blue
  [1 / 3,     '#ffffff'],  //  0  → white
  [2 / 3,     '#c0392b'],  //  1  → red
  [1,         '#000000'],  //  2  → black
];

// ── Replicon suffix ───────────────────────────────────────────────────────────
// Maps the sidebar repliconFilter value to the filename suffix.
//   ''           → ''             (no suffix = all replicons)
//   'chromosome' → '_chromosome'
//   'plasmid'    → '_plasmid'
export function repliconSuffix(repliconFilter: string): string {
  if (repliconFilter === 'chromosome') return '_chromosome';
  if (repliconFilter === 'plasmid') return '_plasmid';
  return '';
}

// ── Base URL (set by Vite from vite.config base, e.g. /projects/sirig/) ─────
// Always ends with '/'. Use this as prefix for all public/ asset fetches so
// the app works both at root and at a sub-path.
const BASE = import.meta.env.BASE_URL; // e.g. '/' in dev, '/projects/sirig/' in prod

// ── ACP path builder ─────────────────────────────────────────────────────────
// Pattern: hc_acp_{part}_{taxonValue}{repliconSuffix}.csv
// e.g.     hc_acp_all_Prokaryote.csv
export function acpFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  testValue: string,
  part: string,
  repliconFilter: string,
): string {
  const suffix = repliconSuffix(repliconFilter);
  void testValue; // testValue is baked into the folder; acp files use the hc_acp_ prefix
  return `${BASE}data/${dataset}/philogenie/${taxonPath}/hc_acp_${part}_${taxonValue}${suffix}.csv`;
}

// ── Merged PC loadings file path builder ─────────────────────────────────────
// All 10 PC loading vectors are stored in a single file:
// Pattern: hc_PCs_{part}_{taxonValue}.csv   (no replicon suffix — always full)
// Shape: 10 rows (PC1–PC10) × N arm columns (e.g. 378)
// First column = row label (PC1…PC10); first row = header (arm names)
export function pcsMergedFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  part: string,
): string {
  return `${BASE}data/${dataset}/philogenie/${taxonPath}/hc_PCs_${part}_${taxonValue}.csv`;
}

// ── Parse the merged PC file into a MatrixData (rows=PCs, cols=arms) ─────────
// Returns a MatrixData where rowLabels = ['PC1'…'PC10'] and colLabels = arm names.
export function parsePcsMergedMatrix(text: string): MatrixData {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '');
  const headerCells = lines[0].split(',');
  // First cell is empty (row-label column), rest are arm names
  const colLabels = headerCells.slice(1).map(h => h.trim());
  const rowLabels: string[] = [];
  const matrix: number[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    rowLabels.push(cells[0].trim());
    matrix.push(cells.slice(1).map(v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; }));
  }
  return { rowLabels, colLabels, matrix };
}

// ── Extract a single PC row from a parsed merged matrix ───────────────────────
// pc = 'PC1'…'PC10'; returns MatrixData with a single row reshaped to (gaps × arms).
export function extractPcFromMerged(
  merged: MatrixData,
  pc: string,          // 'PC1' … 'PC10'
  armCols = 18,
): MatrixData | null {
  const rowIdx = merged.rowLabels.indexOf(pc);
  if (rowIdx === -1) return null;
  const flat = merged.matrix[rowIdx];
  const n_arms = flat.length;          // e.g. 378
  const n_rows = Math.ceil(n_arms / armCols);

  // Reshape: matrix[gapIdx][armIdx] = flat[armIdx * n_rows + gapIdx]
  const matrix: number[][] = Array.from({ length: n_rows }, (_, r) =>
    Array.from({ length: armCols }, (_, c) => flat[c * n_rows + r] ?? 0)
  );
  return {
    rowLabels: Array.from({ length: n_rows },  (_, i) => String(i)),
    colLabels: Array.from({ length: armCols }, (_, i) => String(i + 3)),
    matrix,
  };
}

// Legacy shims — kept so nothing outside this file breaks at call sites
// that still pass `pc` and `repliconFilter` to pcFilePath.
// They now redirect to the merged file (replicon suffix is dropped —
// merged PC files have no per-replicon variant).
export function pcFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  _pc: string,
  part: string,
  _repliconFilter = '',
): string {
  return pcsMergedFilePath(dataset, taxonPath, taxonValue, part);
}

export type PcFileType = 'hc_all' | 'hc_cod' | 'hc_non' | 'ratio_cod_vs_non';
export function pcSelectorFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  _pc: string,
  fileType: PcFileType,
): string {
  // Map hc_all/hc_cod/hc_non → part name
  const part = fileType === 'hc_cod' ? 'cod' : fileType === 'hc_non' ? 'non' : 'all';
  return pcsMergedFilePath(dataset, taxonPath, taxonValue, part);
}

// ── Path builder ──────────────────────────────────────────────────────────────
// Builds the public path for an hc file.
// stat examples: 'mean' | 'median' | 'min_max'
export function hcFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  part: string,
  stat: string,
  repliconFilter: string,
): string {
  const suffix = repliconSuffix(repliconFilter);
  // Pattern: hc_{taxon_value}_{part}_{stat}{repliconSuffix}.csv
  return `${BASE}data/${dataset}/philogenie/${taxonPath}/hc_${taxonValue}_${part}_${stat}${suffix}.csv`;
}

// ── CSV / gzip loader ─────────────────────────────────────────────────────────
// Fetches a file (csv or csv.gz) and returns its text content.
// When a dev server (e.g. Vite) serves a .gz file with Content-Encoding: gzip,
// the browser auto-decompresses it — response.text() returns plain CSV.
// When the server sends it as raw binary (no Content-Encoding header), we
// decompress manually via the native DecompressionStream API.
export async function fetchCsvText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);

  // If the browser already decompressed it (Content-Encoding: gzip was present
  // and consumed by the browser), response.text() gives us plain text directly.
  const contentEncoding = response.headers.get('Content-Encoding');
  const alreadyDecoded  = contentEncoding === 'gzip' || contentEncoding === 'br';

  if (url.endsWith('.gz') && !alreadyDecoded) {
    // Manual decompression path (raw binary .gz served without Content-Encoding)
    const compressed = await response.arrayBuffer();
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(new Uint8Array(compressed));
    writer.close();

    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      if (value) chunks.push(value);
      done = d;
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }
    return new TextDecoder().decode(merged);
  }

  return response.text();
}

// ── Matrix CSV parser ─────────────────────────────────────────────────────────
// Parses a CSV where the first row is a header (column labels) and the first
// column of every data row is a row label.
// Returns { rowLabels, colLabels, matrix } where matrix[r][c] is a number.
export interface MatrixData {
  rowLabels: string[];
  colLabels: string[];
  matrix: number[][];
}

export function parseMatrixCsv(text: string): MatrixData {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '');
  const header = lines[0].split(',');
  const colLabels = header.slice(1);          // skip the first (empty) cell

  const rowLabels: string[] = [];
  const matrix: number[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    rowLabels.push(cells[0].trim());
    matrix.push(cells.slice(1).map(v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; }));
  }

  return { rowLabels, colLabels, matrix };
}

// ── Min-max CSV parser ────────────────────────────────────────────────────────
// Columns: arm, gap, count, min_max, frequency
// Returns two arrays (for 'min' rows and 'max' rows), each indexed by arm,
// containing arrays of { gap, frequency } for bar/violin plots.
export interface MinMaxRow {
  arm: number;
  gap: number;
  count: number;
  frequency: number;
}

export interface MinMaxData {
  min: MinMaxRow[];
  max: MinMaxRow[];
}

export function parseMinMaxCsv(text: string): MinMaxData {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  // skip header
  const minRows: MinMaxRow[] = [];
  const maxRows: MinMaxRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    if (cells.length < 5) continue;
    const row: MinMaxRow = {
      arm:       parseInt(cells[0]),
      gap:       parseInt(cells[1]),
      count:     parseInt(cells[2]),
      frequency: parseFloat(cells[4]),
    };
    if (cells[3].trim() === 'min') minRows.push(row);
    else maxRows.push(row);
  }
  return { min: minRows, max: maxRows };
}

// ── ACP column parser ─────────────────────────────────────────────────────────
// Parses an ACP CSV (first row = header) and returns all numeric values for a
// given column name.  Non-numeric rows are silently skipped.
export function parseAcpColumn(text: string, column: string): number[] {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const header = lines[0].split(',').map(h => h.trim());
  const colIdx = header.indexOf(column);
  if (colIdx === -1) throw new Error(`Column "${column}" not found in ACP file`);

  const values: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const v = parseFloat(cells[colIdx]);
    if (!isNaN(v)) values.push(v);
  }
  return values;
}

// ── ACP table parser ──────────────────────────────────────────────────────────
// Parses a full ACP CSV and returns typed rows.
// Each row is a Record<string, string> keyed by header name.
export type AcpRow = Record<string, string>;

export function parseAcpTable(text: string): { header: string[]; rows: AcpRow[] } {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const header = lines[0].split(',').map(h => h.trim());
  const rows: AcpRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(',');
    const row: AcpRow = {};
    header.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { header, rows };
}

// ── Pre-processed ACP JSON loader ─────────────────────────────────────────────
// Fetches the pre-built  acp_*.json.gz  (array-of-arrays) produced by
// scripts/preprocess-acp.mjs, which is ~40 % smaller than the CSV and
// requires zero CSV parsing — only JSON.parse.
//
// Falls back to the .csv.gz path if the .json.gz is not found (404).
export async function fetchAcpRows(csvGzUrl: string): Promise<{ header: string[]; rows: AcpRow[] }> {
  const jsonGzUrl = csvGzUrl.replace(/\.csv(\.gz)?$/, '.json.gz');

  // Try the pre-processed JSON first
  try {
    const res = await fetch(jsonGzUrl);
    if (res.ok) {
      const contentEncoding = res.headers.get('Content-Encoding');
      const alreadyDecoded  = contentEncoding === 'gzip' || contentEncoding === 'br';

      let jsonText: string;
      if (jsonGzUrl.endsWith('.gz') && !alreadyDecoded) {
        const compressed = await res.arrayBuffer();
        const ds     = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(new Uint8Array(compressed));
        writer.close();
        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          if (value) chunks.push(value);
          done = d;
        }
        const total  = chunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.length; }
        jsonText = new TextDecoder().decode(merged);
      } else {
        jsonText = await res.text();
      }

      const parsed = JSON.parse(jsonText) as { header: string[]; rows: string[][] };
      // Reconstruct AcpRow objects from array-of-arrays
      const rows: AcpRow[] = parsed.rows.map(cells => {
        const row: AcpRow = {};
        parsed.header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
        return row;
      });
      return { header: parsed.header, rows };
    }
  } catch {
    // fall through to CSV fallback
  }

  // Fallback: parse the original CSV
  const text = await fetchCsvText(csvGzUrl);
  return parseAcpTable(text);
}

// ── Explained variance path builder ──────────────────────────────────────────
// Pattern: hc_explained_variance_ratio_{part}_{taxonValue}{repliconSuffix}.csv
// part = 'all' | 'cod' | 'non'
export function explainedVarianceFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  type: 'hc_all' | 'hc_cod' | 'hc_non',
  repliconFilter: string,
): string {
  const suffix = repliconSuffix(repliconFilter);
  const part = type === 'hc_cod' ? 'cod' : type === 'hc_non' ? 'non' : 'all';
  return `${BASE}data/${dataset}/philogenie/${taxonPath}/hc_explained_variance_ratio_${part}_${taxonValue}${suffix}.csv`;
}

// ── Explained variance CSV parser ─────────────────────────────────────────────
// Columns: PC, explained_variance_ratio, cumulative_explained_variance
export interface ExplainedVarianceRow {
  pc: string;
  ratio: number;
  cumulative: number;
}

export function parseExplainedVarianceCsv(text: string): ExplainedVarianceRow[] {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const rows: ExplainedVarianceRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(',');
    rows.push({
      pc:         cells[0].trim(),
      ratio:      parseFloat(cells[1]) || 0,
      cumulative: parseFloat(cells[2]) || 0,
    });
  }
  return rows;
}

// ── ACP search entry (for PC weight import) ───────────────────────────────────
// Parses acp_hc_all_{taxonValue}.csv.gz (no replicon suffix),
// which contains PC1–PC10 scores plus ID-replicon and full_name.
// NOTE: the file uses PC1-PC10 labelling; we remap to PC0-PC9 internally.
export interface AcpSearchEntry {
  idReplicon: string;
  fullName: string;
  pcScores: number[]; // indices 0-9 → PC0-PC9 (file cols PC1-PC10)
}

export function parseAcpSearchEntries(text: string): AcpSearchEntry[] {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const header = lines[0].split(',').map(h => h.trim());
  const pcIdx  = ['PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8','PC9','PC10'].map(c => header.indexOf(c));
  const idIdx  = header.indexOf('ID-replicon');
  const nmIdx  = header.indexOf('full_name');
  if (idIdx === -1 || nmIdx === -1) return [];

  const entries: AcpSearchEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(',');
    entries.push({
      idReplicon: (cells[idIdx] ?? '').trim(),
      fullName:   (cells[nmIdx] ?? '').trim(),
      pcScores:   pcIdx.map(ci => { const v = parseFloat(cells[ci]); return isNaN(v) ? 0 : v; }),
    });
  }
  return entries;
}

// ── All-data file path builder ────────────────────────────────────────────────
// Pattern: hc_{taxonValue}_{part}_all_data{repliconSuffix}.csv.gz
export function allDataFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  part: string,
  repliconFilter: string,
): string {
  const suffix = repliconSuffix(repliconFilter);
  return `${BASE}data/${dataset}/philogenie/${taxonPath}/hc_${taxonValue}_${part}_all_data${suffix}.csv`;
}

// ── Pattern-count file path builder ──────────────────────────────────────────
// Pattern: hc_{taxonValue}_{part}_pattern_count{repliconSuffix}.csv.gz
// Contains raw integer counts per arm — used as denominator in ratio mode.
export function patternCountFilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  part: string,
  repliconFilter: string,
): string {
  const suffix = repliconSuffix(repliconFilter);
  return `${BASE}data/${dataset}/philogenie/${taxonPath}/hc_${taxonValue}_${part}_pattern_count${suffix}.csv`;
}

// ── Pattern-count row parser ──────────────────────────────────────────────────
// Returns the flat integer vector for the matching replicon (one int per arm).
export function parsePatternCountRow(
  text: string,
  idReplicon: string,
): number[] | null {
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const fc = lines[i].indexOf(',');
    if (fc === -1) continue;
    if (lines[i].slice(0, fc).trim() !== idReplicon) continue;
    return lines[i].slice(fc + 1).split(',').map(v => {
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    });
  }
  return null;
}

// ── Top-10 combined file path builder ────────────────────────────────────────
// Pattern: hc_{taxonValue}_{part}_pattern_top10{repliconSuffix}.csv[.gz]
// Each cell: "'pattern':count; 'pattern': count; ..." or '0' for empty
export function top10FilePath(
  dataset: string,
  taxonPath: string,
  taxonValue: string,
  part: string,
  repliconFilter: string,
): string {
  const suffix = repliconSuffix(repliconFilter);
  // All files are plain .csv
  return `${BASE}data/${dataset}/philogenie/${taxonPath}/hc_${taxonValue}_${part}_pattern_top10${suffix}.csv`;
}

// ── Top-10 row parser ─────────────────────────────────────────────────────────
// Each cell: "'pat':count; 'pat': count; ..."   or  '0' (sentinel = no data)
// Returns { counts: number[][], patterns: string[][] }
// counts[armIdx][rank] and patterns[armIdx][rank]
export interface Top10Row {
  counts:   number[][];   // [n_arms][up to 10]
  patterns: string[][];   // [n_arms][up to 10]
}

function parseCombinedCell(cell: string): { patterns: string[]; counts: number[] } {
  const trimmed = cell.trim();
  if (!trimmed || trimmed === '0') return { patterns: [], counts: [] };
  const patterns: string[] = [];
  const counts: number[]   = [];
  // Split on ';' — each token is  'pattern':count
  for (const token of trimmed.split(';')) {
    const t = token.trim();
    if (!t) continue;
    const m = t.match(/^'([^']+)'\s*:\s*(\d+)$/);
    if (m) { patterns.push(m[1]); counts.push(Number(m[2])); }
  }
  return { patterns, counts };
}

export function parseTop10Row(
  text: string,
  idReplicon: string,
): Top10Row | null {
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const fc = line.indexOf(',');
    if (fc === -1) continue;
    if (line.slice(0, fc).trim() !== idReplicon) continue;

    // Quote-aware cell split (fields may contain commas inside patterns)
    const cells: string[] = [];
    let inQuote = false;
    let cur = '';
    for (let ci = fc + 1; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur) cells.push(cur);

    const counts:   number[][] = [];
    const patterns: string[][] = [];
    for (const cell of cells) {
      const parsed = parseCombinedCell(cell);
      patterns.push(parsed.patterns);
      counts.push(parsed.counts);
    }
    return { counts, patterns };
  }
  return null;
}

// ── Ratio matrix builder ──────────────────────────────────────────────────────
// Produces a matrix with the SAME shape as the Raw heatmap (n_hcRows × n_cols),
// where each cell value  = top1_count[arm] / total[arm]  (rank-0 ratio only).
// The hover string lists all available ranks (1–10) with pattern + ratio.
export interface RatioMatrix {
  matrix:       (number | null)[][];   // [n_hcRows][n_cols]   rank-0 ratio; null = no data
  hoverText:    string[][];            // [n_hcRows][n_cols]   full hover (all ranks)
  rowLabels:    string[];
  colLabels:    string[];
}

export function buildRatioMatrix(
  top10: Top10Row,
  totals: number[],     // flat integer vector from pattern_count, length = n_arms (one per arm)
  displayCols = 18,
): RatioMatrix {
  const n_arms = top10.counts.length;           // 378
  const n_cols = displayCols;                   // 18
  const n_rows = Math.ceil(n_arms / n_cols);    // 21

  const matrix:    (number | null)[][] = Array.from({ length: n_rows }, () => new Array(n_cols).fill(null));
  const hoverText: string[][]          = Array.from({ length: n_rows }, () => new Array(n_cols).fill(''));

  for (let h = 0; h < n_rows; h++) {
    for (let c = 0; c < n_cols; c++) {
      // arm index mirrors parseRepliconRow reshape: values[c * rows + r]
      const a = c * n_rows + h;
      if (a >= n_arms) continue;

      // total for this arm — direct integer from pattern_count
      const total = totals[a] ?? 0;
      const nRanks = top10.counts[a]?.length ?? 0;

      // null = no data for this arm (sentinel cell)
      if (total === 0 && nRanks === 0) continue;

      // rank-0 ratio → cell colour
      const cnt0 = top10.counts[a]?.[0] ?? 0;
      matrix[h][c] = total > 0 ? cnt0 / total : 0;

      // hover: list all available ranks
      // kmer length: read from first actual pattern string (ground truth), fall back to lookup
      const firstPat = top10.patterns[a]?.[0] ?? '';
      const kmerLen = firstPat.length > 0 ? firstPat.length : (ARM_KMER_LEN[a] ?? 0);
      const lines: string[] = [
        `Arm ${c + 3} | Gap ${h} | kmer ${kmerLen}`,
        `Total count: ${total}`,
      ];
      for (let r = 0; r < nRanks; r++) {
        const cnt   = top10.counts[a][r] ?? 0;
        const pat   = top10.patterns[a]?.[r] ?? '';
        const pct   = total > 0 ? (cnt / total * 100).toFixed(2) : '0.00';
        lines.push(`  #${r + 1} ${pat}  count: ${cnt}  ratio: ${pct}%`);
      }
      hoverText[h][c] = lines.join('<br>');
    }
  }

  const colLabels = Array.from({ length: n_cols }, (_, i) => String(i + 3));
  const rowLabels = Array.from({ length: n_rows }, (_, i) => String(i));
  return { matrix, hoverText, rowLabels, colLabels };
}

// ── all_data row parser ───────────────────────────────────────────────────────
// The file has: first row = header (empty cell, then 0,1,2,…,N)
//               subsequent rows: id_replicon, v0, v1, …, vN
// Returns the numeric vector for the matching id_replicon,
// reshaped into a 2D matrix with `cols` columns (default 18 arms).
export function parseRepliconRow(
  text: string,
  idReplicon: string,
  cols = 18,
): { matrix: number[][]; rowLabels: string[]; colLabels: string[] } | null {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  // Header: first cell empty, rest are HC indices
  const headerCells = lines[0].split(',');
  const numValues = headerCells.length - 1; // e.g. 378

  for (let i = 1; i < lines.length; i++) {
    const firstComma = lines[i].indexOf(',');
    if (firstComma === -1) continue;
    const rowId = lines[i].slice(0, firstComma).trim();
    if (rowId !== idReplicon) continue;

    const values = lines[i].slice(firstComma + 1).split(',').map(v => {
      const n = parseFloat(v);
      return isNaN(n) ? 0 : n;
    });

    // Reshape flat vector into rows × cols
    // vector layout: [arm0_hc0, arm0_hc1, …, arm0_hcR-1, arm1_hc0, …]
    // We want matrix[hcIdx][armIdx] so heatmap rows = HC class, cols = arm
    const rows = Math.ceil(numValues / cols); // e.g. 378/18 = 21
    const matrix: number[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => values[c * rows + r] ?? 0)
    );

    const colLabels = Array.from({ length: cols }, (_, i) => String(i + 3));
    const rowLabels = Array.from({ length: rows }, (_, i) => String(i));

    return { matrix, rowLabels, colLabels };
  }
  return null; // replicon not found
}
