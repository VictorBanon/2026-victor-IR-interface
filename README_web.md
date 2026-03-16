# article_webv3 — Interactive Dashboard (Web)

A React + TypeScript single-page application for exploring inverted repeat (IR) patterns in prokaryotic genomes. Fully static — no backend required.

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Project Structure](#project-structure)
3. [Development](#development)
4. [Data Layout](#data-layout)
5. [Component Architecture](#component-architecture)
6. [Key Files Reference](#key-files-reference)
7. [Sidebar & Controls](#sidebar--controls)
8. [Plot Types](#plot-types)
9. [Adding a New Plot](#adding-a-new-plot)

---

## Technology Stack

| Package | Role |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite 7 | Dev server & bundler |
| react-plotly.js + plotly.js 3 | All charts (scatter, heatmap, bar) |
| react-router-dom 7 | Client-side routing |
| `DecompressionStream` (native browser API) | Client-side `.csv.gz` decompression |
| Tailwind CSS | Utility styling |

There is **no backend** and **no pako** dependency — `.gz` files are decompressed with the browser's built-in `DecompressionStream` API (or served pre-decoded when the server sets `Content-Encoding: gzip`).

---

## Project Structure

```
article_webv3/
├── public/
│   └── data/                              # All datasets, served as static files
│       ├── 14k/                           # Dataset: ~14 000 prokaryotic replicons
│       │   ├── parameters.json
│       │   ├── taxonomy.csv
│       │   └── philogenie/
│       │       └── Prokaryote/            # One sub-folder per taxon group
│       │           ├── acp_hc_<part>_Prokaryote[_chr|_pla].csv.gz
│       │           ├── hc_Prokaryote_<part>_all_data[_chr|_pla].csv.gz
│       │           ├── hc_Prokaryote_<part>_pattern_count[_chr|_pla].csv.gz
│       │           ├── hc_Prokaryote_<part>_pattern_top10[_chr|_pla].csv.gz
│       │           ├── hc_Prokaryote_<part>_mean|median|min_max[_chr|_pla].csv.gz
│       │           ├── explained_variance_ratio_<type>_Prokaryote[_chr|_pla].csv.gz
│       │           ├── PC0..PC9_hc_<part>_Prokaryote[_chr|_pla].csv.gz
│       │           └── top10_*/  acp_kmer_*/  ...  (legacy / derived files)
│       └── 60_cla/                        # Dataset: 60-class sampled dataset
│           └── ...  (same layout)
├── src/
│   ├── main.tsx                           # React entry point, router setup
│   ├── App.tsx                            # Root: <BrowserRouter> + routes
│   ├── App.css / index.css               # Global styles
│   └── pages/
│       ├── Home/                          # Landing page (dataset picker)
│       └── Dashboard/                     # All dashboard code
│           ├── index.tsx                  # Orchestrator — state, routing, card grid
│           ├── DashboardSidebar.tsx       # Sidebar controls, all state types
│           ├── dataUtils.ts               # File path builders + all CSV parsers
│           ├── PlotCard.tsx               # Wrapper card with title / close button
│           ├── usePlotResize.ts           # Hook: observe container size → Plotly dims
│           ├── Dashboard.css              # Dashboard-specific CSS
│           ├── acpWorker.ts               # (legacy) Web Worker for ACP CSV parsing
│           ├── ScatterAcp.tsx             # ACP/PCA scatter plot
│           ├── ExplainedVariance.tsx      # Explained variance bar chart
│           ├── PcWeightedSum.tsx          # PC weighted-sum heatmap
│           ├── PcSelectorHeatmap.tsx      # Single-PC heatmap selector
│           ├── PcVsAll.tsx                # 10×10 PC-pair scatter grid
│           ├── HeatmapMatrix.tsx          # Population mean / median heatmap
│           ├── HeatmapMinMax.tsx          # Population min / max heatmap
│           ├── HeatmapRepliconSelector.tsx# HC heatmap for a chosen replicon
│           ├── AxisChart.tsx              # PC-axis heatmap
│           ├── RepliconMatrix.tsx         # Per-replicon all_data heatmap (on click)
│           ├── PatternCountHeatmap.tsx    # Per-replicon IR count heatmap (on click)
│           ├── Top10Heatmap.tsx           # Per-replicon top-10 pattern ratio heatmap (on click)
│           └── StudyParameters.tsx        # Study parameters table card
├── index.html
├── vite.config.ts
├── tsconfig*.json
├── package.json
└── README_web.md                          # ← this file
```

---

## Development

```bash
# Install dependencies
npm install

# Start dev server  →  http://localhost:5173
npm run dev

# Type-check only
npx tsc --noEmit

# Production build  →  dist/
npm run build

# Preview production build locally
npm run preview
```

### `npm run dev` / `npm run build` also run:
```
node scripts/preprocess-acp.mjs       # pre-process ACP JSON from CSV
python3 scripts/preprocess_scatter.py # pre-process scatter data
```
These scripts produce the `.json.gz` variants of the ACP files that the app prefers (smaller, faster to parse than CSV).

### Base URL (sub-path deployment)
The app reads `import.meta.env.BASE_URL` as a prefix for all data fetches. Set it in `vite.config.ts`:
```ts
base: '/projects/sirig/',   // e.g. when deployed at https://host/projects/sirig/
```
All `*FilePath()` helpers in `dataUtils.ts` prepend this automatically.

---

## Data Layout

### File naming conventions

| Pattern | Content |
|---|---|
| `acp_{test}_{part}_{taxon}[{suf}].csv.gz` | PCA scatter: PC1–PC10 scores + metadata per replicon |
| `hc_{taxon}_{part}_all_data[{suf}].csv.gz` | Full HC value matrix (replicon × 378 arm×gap bins) |
| `hc_{taxon}_{part}_pattern_count[{suf}].csv.gz` | Total IR count per bin per replicon (integer) |
| `hc_{taxon}_{part}_pattern_top10[{suf}].csv.gz` | Top-10 most frequent patterns per bin per replicon |
| `hc_{taxon}_{part}_mean\|median\|min_max[{suf}].csv.gz` | Population-level statistics per bin |
| `explained_variance_ratio_{type}_{taxon}[{suf}].csv.gz` | PCA explained variance per PC |
| `PC0..PC9_{type}_{taxon}[{suf}].csv.gz` | Per-PC heatmap values |
| `parameters.json` | Study parameters (arm range, gap range, sample size, etc.) |

**`{part}`**: `all` · `cod` · `non`  
**`{suf}`**: *(none)* = all replicons · `_chromosome` · `_plasmid`  
**`{test}`**: `hc` (structural) · `kmer` · `karling` · `6mer` · `local` · `replicon` · `gene`

### Arm × gap matrix layout

All 378-cell matrices use a single flat index:

```
flat_index  =  col * 21  +  gap
col         =  arm_size − 3       (arms 3..20  →  cols 0..17)
gap         =  gap value          (gaps 0..20  →  rows 0..20)
kmer_length =  arm_size           (always equal to arm_size in pattern_top10 files)
```

When reshaped for display: `matrix[gap_row][arm_col]` — X-axis = arm size, Y-axis = gap.  
Cells with no IR data are stored as sentinel `'0'` in the source CSV and parsed as `null` (rendered as blank in Plotly with `hoverongaps: false`).

### `pattern_top10` cell format

```
'tata':240; 'atat':180; 'ttat':146; ...
```
Up to 10 entries per cell, sorted by descending count. Sentinel cell = `'0'`.  
Counts are **absolute occurrences** of each pattern across all IR sequences in that replicon for that (arm, gap) bin.

---

## Component Architecture

```
App.tsx
└── Dashboard/index.tsx          ← orchestrator: all state + card grid
    ├── DashboardSidebar.tsx     ← all sidebar controls + VisiblePlots state
    ├── PlotCard.tsx             ← shared wrapper (title bar, close, file-path badge)
    │
    ├── ScatterAcp.tsx           ← ACP scatter (click → selects a replicon)
    ├── ExplainedVariance.tsx    ← explained variance bar chart
    ├── PcWeightedSum.tsx        ← PC weighted-sum heatmap (uses acpRows)
    ├── PcSelectorHeatmap.tsx    ← single-PC heatmap
    ├── PcVsAll.tsx              ← 10×10 PC-pair scatter grid
    │
    ├── HeatmapMatrix.tsx        ← population mean or median heatmap
    ├── HeatmapMinMax.tsx        ← population min or max heatmap
    ├── HeatmapRepliconSelector.tsx ← HC heatmap for a user-chosen replicon
    ├── AxisChart.tsx            ← PC-axis heatmap
    │
    ├── RepliconMatrix.tsx       ← per-click: all_data HC heatmap
    ├── PatternCountHeatmap.tsx  ← per-click: IR count heatmap with kmer tooltip
    ├── Top10Heatmap.tsx         ← per-click: top-1 pattern ratio heatmap
    │
    └── StudyParameters.tsx      ← parameters.json display table
```

### Data flow

1. User picks **dataset / part / replicon filter** in the sidebar → `index.tsx` state updates
2. Every chart independently calls `fetchCsvText()` when its props change, decompresses and parses
3. Clicking a point in `ScatterAcp` adds the replicon's `ID-replicon` to `selectedReplicons[]`
4. **Per-replicon plots** (`RepliconMatrix`, `PatternCountHeatmap`, `Top10Heatmap`) map over `selectedReplicons` and render one `PlotCard` per entry — cards can be closed with ✕

### Memoisation strategy (`index.tsx`)

| Memo | Invalidated by |
|---|---|
| `staticPlotContent` | `plotProps`, `testValue`, axes, `topN`, filters |
| `pcCombinedContent` | `plotProps`, `loadedAcpRows` |
| `heatmapRepliconContent` | `plotProps`, `loadedAcpRows` |
| `scatterContent` | all scatter-specific props + `selectedReplicons` |

This prevents the static population heatmaps from remounting when a new replicon is clicked.

---

## Key Files Reference

### `src/pages/Dashboard/index.tsx`
Main orchestrator. Owns:
- `sidebarState` (via `useReducer` with `sidebarReducer`) — all sidebar + filter state
- `selectedReplicons: string[]` — replicons selected by clicking the scatter
- `repliconLabels: Record<string, string>` — `ID-replicon → full_name` populated by `ScatterAcp`
- `PLOT_DEFS` — master list of all plots with `key`, `title`, `size`
- `hcPaths` — pre-computed source file path for each `PlotKey` (shown in the `PlotCard` badge)
- URL persistence: `?dataset=14k&replicons=chr_GCA_xxx,chr_GCA_yyy`

### `src/pages/Dashboard/DashboardSidebar.tsx`
Defines and exports all TypeScript types for the sidebar:

```typescript
export interface VisiblePlots {
  main: boolean;           // ACP Scatter
  matrix: boolean;         // Replicon Matrix (on click)
  patternCount: boolean;   // Pattern Count Heatmap (on click)
  top10: boolean;          // Top-10 Pattern Ratio (on click)
  studyParameters: boolean;
  xAxis: boolean;          // X-axis chart
  yAxis: boolean;          // Y-axis chart
  mean: boolean;           // Population mean heatmap
  median: boolean;         // Population median heatmap
  min: boolean;            // Population min heatmap
  max: boolean;            // Population max heatmap
  pcSelector: boolean;     // Single-PC heatmap
  pcCombined: boolean;     // PC weighted-sum heatmap
  explainedVariance: boolean;
  pcvsAll: boolean;        // 10×10 PC-pair grid
  heatmapReplicon: boolean;// HC heatmap (replicon selector)
}
```

Sidebar sections (collapsible):
- **Data Source** — dataset picker (`14k` / `60_cla`), part (`all` / `cod` / `non`)
- **Analysis Options** — X/Y axes, color column, size column, replicon filter, point size
- **Filters** — autocomplete tag filter (`Column:value`, OR logic)
- **Visualization** — top-N grouping, custom traces (column + value + color + symbol)
- **Manage Plots** — checkboxes grouped by *Main Plots / Point Analysis / COD Heatmaps / PC Analysis*
- **Other** — analysis type (`hc` / `kmer` / ...), taxon & taxon value selectors

### `src/pages/Dashboard/dataUtils.ts`
All data logic. Key exports:

| Export | Purpose |
|---|---|
| `repliconSuffix(filter)` | `'' \| '_chromosome' \| '_plasmid'` from filter string |
| `acpFilePath(...)` | URL for `acp_*` scatter CSV |
| `pcFilePath(...)` | URL for `PC*_hc_*` heatmap CSV |
| `pcSelectorFilePath(...)` | URL for PC-type selector CSV (hc_all / hc_cod / hc_non / ratio) |
| `hcFilePath(...)` | URL for `hc_*_mean/median/min_max` CSV |
| `allDataFilePath(...)` | URL for `hc_*_all_data` matrix CSV |
| `patternCountFilePath(...)` | URL for `hc_*_pattern_count` CSV |
| `top10FilePath(...)` | URL for `hc_*_pattern_top10` CSV |
| `explainedVarianceFilePath(...)` | URL for `explained_variance_ratio_*` CSV |
| `fetchCsvText(url)` | Fetch + decompress `.csv` or `.csv.gz` → plain text |
| `fetchAcpRows(url)` | Fetch ACP data, prefers `.json.gz` over `.csv.gz` for speed |
| `parseMatrixCsv(text)` | Generic CSV → `{ rowLabels, colLabels, matrix }` |
| `parseAcpTable(text)` | ACP CSV → `{ header, rows: AcpRow[] }` |
| `parseAcpSearchEntries(text)` | ACP CSV → `AcpSearchEntry[]` with PC scores |
| `parseMinMaxCsv(text)` | min_max CSV → `{ min: MinMaxRow[], max: MinMaxRow[] }` |
| `parseExplainedVarianceCsv(text)` | Explained variance CSV → `ExplainedVarianceRow[]` |
| `parseRepliconRow(text, id)` | Find a replicon row and reshape → `matrix[gap][arm]` |
| `parsePatternCountRow(text, id)` | Find replicon row → flat `number[]` of IR counts |
| `parseTop10Row(text, id)` | Find replicon row → `Top10Row` (`counts[][]` + `patterns[][]`) |
| `buildRatioMatrix(top10, totals)` | Top10Row + totals → `RatioMatrix` (rank-0 ratio + hover text) |
| `ARM_KMER_LEN[378]` | Flat index → kmer length (`col + 3`); sentinel cells → `1` |
| `HEATMAP_COLORSCALE` | Shared Plotly colorscale: blue(−1) → white(0) → red(1) → black(2) |
| `PALETTE` | 15-colour categorical palette used by scatter and PC-vs-all |

### `src/pages/Dashboard/PlotCard.tsx`
Thin wrapper around every chart:
- Renders a title bar with the plot name, an optional file-path badge, and a ✕ close button
- `size` prop controls CSS grid span: `'square'` · `'rectangle'` · `'full'`
- `onRemove(id)` dispatches `TOGGLE_PLOT` for static plots, or removes a replicon for per-click cards

### `src/pages/Dashboard/usePlotResize.ts`
`ResizeObserver` hook — returns `{ width, height }` from a container ref, used by all Plotly charts to set `layout.width` / `layout.height` reactively.

---

## Sidebar & Controls

### Part selector
| Value | Meaning |
|---|---|
| `all` | Complete genome (all IRs) |
| `cod` | Gene / coding regions only |
| `non` | Intergenic / non-coding regions only |

### Replicon filter
Appends a suffix to all file names:
| Selection | Suffix |
|---|---|
| All (default) | *(none)* |
| Chromosome only | `_chromosome` |
| Plasmid only | `_plasmid` |

### Analysis type (`testValue`)
Selects which scores populate the scatter and heatmaps:

| Category | Values |
|---|---|
| Structural | `hc`, `ha`, `hb` |
| Compositional | `kmer`, `karling`, `6mer` |
| Spatial | `local`, `replicon`, `gene` |

### Filters (tag-based, OR logic)
Type `Column:value` in the autocomplete box (e.g. `Domain:Bacteria`). Multiple tags are ORed — any replicon matching at least one tag is included. Available columns: `Superdomain`, `Domain`, `Phylum`, `Class`, `Order`, `Family`, `Genus`, `Species`, `full_name`, `ID-replicon`.

### Top-N grouping
The scatter colours points by group (e.g. `Domain`). The slider controls how many groups get individual colours; the rest are collapsed into "Others".

### Custom traces
Add arbitrary overlay traces to the scatter plot by specifying: column, substring match value, display label, colour, and Plotly marker symbol.

---

## Plot Types

| Key | Component | Source file(s) | Description |
|---|---|---|---|
| `main` | `ScatterAcp` | `acp_*` | PCA scatter — click a point to open per-replicon analysis |
| `studyParameters` | `StudyParameters` | `parameters.json` | Study parameter table |
| `mean` | `HeatmapMatrix` | `hc_*_mean_*` | Population mean HC per (arm, gap) bin |
| `median` | `HeatmapMatrix` | `hc_*_median_*` | Population median HC per (arm, gap) bin |
| `min` | `HeatmapMinMax` | `hc_*_min_max_*` | Population minimum HC per (arm, gap) bin |
| `max` | `HeatmapMinMax` | `hc_*_min_max_*` | Population maximum HC per (arm, gap) bin |
| `matrix` | `RepliconMatrix` | `hc_*_all_data_*` | HC heatmap for each clicked replicon (one card per click) |
| `patternCount` | `PatternCountHeatmap` | `hc_*_pattern_count_*` | IR count heatmap for each clicked replicon; hover shows kmer length |
| `top10` | `Top10Heatmap` | `hc_*_pattern_top10_*` + `pattern_count` | Rank-1 pattern ratio (count / total) heatmap; hover lists all top-10 patterns with counts and ratios |
| `heatmapReplicon` | `HeatmapRepliconSelector` | `hc_*_all_data_*` | HC heatmap with a dropdown to pick any replicon from the loaded ACP rows |
| `xAxis` | `AxisChart` | `PC*_hc_*` | Heatmap of the currently selected X-axis PC scores |
| `yAxis` | `AxisChart` | `PC*_hc_*` | Heatmap of the currently selected Y-axis PC scores |
| `explainedVariance` | `ExplainedVariance` | `explained_variance_ratio_*` | Bar chart of % variance explained per PC |
| `pcCombined` | `PcWeightedSum` | `acp_*` | Weighted sum of all PCs projected onto the arm×gap heatmap |
| `pcSelector` | `PcSelectorHeatmap` | `PC0..PC9_*` | Dropdown to inspect a single PC's heatmap; supports hc_all / hc_cod / hc_non / ratio modes |
| `pcvsAll` | `PcVsAll` | `acp_*` | 10×10 grid of scatter plots — every PC pair |

### Heatmap axis convention

All heatmaps (population and per-replicon) share the same orientation:
- **X-axis** — Arm size (3 → 20)
- **Y-axis** — Gap (0 → 20)
- **Blank cells** — bins where no IR data exists (`null` in Plotly → no colour, no hover)
- **Colorscale** — blue (−1) → white (0) → red (1) → black (2) (`HEATMAP_COLORSCALE`)

---

## Adding a New Plot

1. **Create** `src/pages/Dashboard/MyPlot.tsx` accepting at minimum `{ dataset, part, repliconFilter, ... }` from `SidebarState`

2. **Add a key** to `VisiblePlots` in `DashboardSidebar.tsx`:
   ```typescript
   export interface VisiblePlots {
     ...
     myPlot: boolean;
   }
   ```

3. **Add initial state** in `index.tsx` → `initialSidebarState.visiblePlots`:
   ```typescript
   myPlot: false,
   ```

4. **Add to `PLOT_DEFS`** in `index.tsx`:
   ```typescript
   { key: 'myPlot', title: 'My Plot Title', size: 'square' },
   ```
   Valid sizes: `'square'` · `'rectangle'` · `'full'`

5. **Add the source file path** to `hcPaths` in `index.tsx` (shown as a badge on the card):
   ```typescript
   myPlot: myFilePath(selectedFolder, taxonPath, ...),
   ```

6. **Add to `staticPlotContent`** (or `plotContent` if it needs `selectedReplicons`):
   ```typescript
   myPlot: <MyPlot dataset={selectedFolder} part={partValue} ... />,
   ```

7. **Add a checkbox** in the appropriate `plot-category` section of `DashboardSidebar.tsx`:
   ```tsx
   <div className="plot-item"><label className="plot-checkbox">
     <input type="checkbox" checked={visiblePlots.myPlot}
       onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'myPlot' })} />
     <span>My Plot Title</span>
   </label></div>
   ```
