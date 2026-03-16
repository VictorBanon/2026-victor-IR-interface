import { useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import type Plotly from 'plotly.js';
import {
  acpFilePath,
  taxon_path_get,
  PALETTE,
} from './dataUtils';
import type { AcpRow } from './dataUtils';
import type { CustomRule } from './DashboardSidebar';
import { usePlotResize } from './usePlotResize';

// Vite turns this into a dedicated worker bundle (no main-thread blocking)
import AcpWorker from './acpWorker.ts?worker';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  testValue: string;
  xAxis: string;
  yAxis: string;
  colorColumn: string;
  sizeColumn?: string;
  pointSizeScale?: number;
  /** Top N-1 groups by count shown individually; rest → "Others" */
  topN?: number;
  /** Custom traces overlaid on top */
  customRules?: CustomRule[];
  /** Called when the user clicks a point; receives the ID-replicon value */
  onRepliconSelect?: (idReplicon: string) => void;
  /** Currently selected replicon IDs — highlighted with a ring */
  selectedReplicons?: string[];
  /** Called once when ACP data loads; map of ID-replicon → fullname + raw rows */
  onRowsLoaded?: (labels: Record<string, string>, rows: AcpRow[]) => void;
  /** "Column:value" tags; row shown if ANY tag matches (OR logic) */
  rowFilters?: string[];
}

// ── Plotly style ──────────────────────────────────────────────────────────────
const baseLayout = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:          { color: '#a8b5ff', size: 11 },
  legend: {
    font: { color: '#a8b5ff', size: 10 },
    bgcolor: 'rgba(22,33,62,0.85)',
    bordercolor: 'rgba(102,126,234,0.2)',
    borderwidth: 1,
  },
};
const axisStyle = {
  color: '#a8b5ff',
  gridcolor: 'rgba(102,126,234,0.12)',
  tickfont: { color: '#a8b5ff' },
  zerolinecolor: 'rgba(102,126,234,0.2)',
};

// Distinct palette for categorical groups — imported from dataUtils for consistency with PcVsAll

function ScatterAcp({
  dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue,
  testValue, xAxis, yAxis, colorColumn, sizeColumn = '', pointSizeScale = 1,
  topN = 10, customRules = [],
  onRepliconSelect, selectedReplicons = [],
  onRowsLoaded, rowFilters = [],
}: Props) {
  const wrapperRef = usePlotResize();
  const [rows,    setRows]    = useState<AcpRow[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Groups the user has toggled off via legend click
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  // Monotonically-increasing counter so Plotly always re-draws when allTraces changes
  const dataRevisionRef = useRef(0);

  // Keep a ref to the active worker so we can terminate it on dataset change
  const workerRef = useRef<Worker | null>(null);

  // ── Scatter sidecar (pre-computed group indices per categorical column) ────
  // Shape: { groups: { [col]: { name, count, indices: number[] }[] },
  //          pcFloats: { [col]: (number|null)[] } }
  type ScatterGroup = { name: string; count: number; indices: number[] };
  type ScatterSidecar = {
    groups:   Record<string, ScatterGroup[]>;
    pcFloats: Record<string, (number | null)[]>;
  };
  const [sidecar, setSidecar] = useState<ScatterSidecar | null>(null);

  // ── Single effect: fetch rows (worker) + sidecar in parallel ─────────────
  // Both are kicked off together; `setLoading(false)` is called only when
  // BOTH have settled.  This prevents a "slow path → fast path" double-render.
  useEffect(() => {
    setSidecar(null);
    setLoading(true);
    setError(null);
    setRows(null);

    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath;
    const csvUrl     = acpFilePath(dataset, taxonPath, taxonValue, testValue, part, repliconFilter);
    const scatterUrl = csvUrl.replace(/\.csv(\.gz)?$/, '.scatter.json.gz');

    let cancelled = false;

    // ── Worker: fetch + decompress the main acp_*.json.gz ──────────────────
    workerRef.current?.terminate();
    const worker = new AcpWorker();
    workerRef.current = worker;

    // ── Sidecar: lightweight fetch; resolved once, never throws ────────────
    async function fetchSidecar(): Promise<ScatterSidecar | null> {
      try {
        const res = await fetch(scatterUrl);
        if (!res.ok) return null;
        const buf  = await res.arrayBuffer();
        const ds     = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(new Uint8Array(buf));
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
        return JSON.parse(new TextDecoder().decode(merged)) as ScatterSidecar;
      } catch {
        return null; // sidecar optional
      }
    }

    // Wrap worker in a Promise so we can race / await both
    const rowsPromise = new Promise<AcpRow[]>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<
        | { ok: true;  header: string[]; rows: string[][] }
        | { ok: false; error: string }
      >) => {
        if (!e.data.ok) { reject(new Error(e.data.error)); return; }
        const { header, rows: rawRows } = e.data;
        const parsed: AcpRow[] = rawRows.map(cells => {
          const row: AcpRow = {};
          header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
          return row;
        });
        resolve(parsed);
        worker.terminate();
      };
      worker.onerror = (e) => { reject(new Error(e.message)); };
    });

    worker.postMessage({ url: csvUrl });

    // Await both, then commit in a single React batch
    Promise.all([rowsPromise, fetchSidecar()]).then(([parsed, sc]) => {
      if (cancelled) return;
      setRows(parsed);
      setSidecar(sc);
      setLoading(false);
      if (onRowsLoaded) {
        const labels: Record<string, string> = {};
        for (const r of parsed) {
          const id = r['ID-replicon'];
          if (id) labels[id] = r['fullname'] ?? id;
        }
        onRowsLoaded(labels, parsed);
      }
    }).catch(err => {
      if (cancelled) return;
      setError(String(err));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      worker.terminate();
    };
  // onRowsLoaded intentionally excluded — it's a new function ref each render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, testValue]);

  // ── Reset hidden groups when colorColumn or data changes ─────────────────
  useEffect(() => { setHiddenGroups(new Set()); }, [colorColumn, rows]);

  // ── 1. Filter rows — only depends on rows + rowFilters ───────────────────
  const visibleRows = useMemo(() => {
    if (!rows) return [];
    if (rowFilters.length === 0) return rows;
    return rows.filter(r => rowFilters.some(tag => {
      const colon = tag.indexOf(':');
      const col   = tag.slice(0, colon);
      const val   = tag.slice(colon + 1).toLowerCase();
      return (r[col] ?? '').toLowerCase().includes(val);
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowFilters]);

  // ── 2. Pre-compute per-row X/Y floats — only depends on visibleRows + axes
  // Fast path: use pre-parsed float array from sidecar (no parseFloat at all)
  // Slow path: parse from string rows (fallback when sidecar absent or col not a PC)
  const xValsAll = useMemo(() => {
    if (sidecar?.pcFloats?.[xAxis] && rowFilters.length === 0) {
      return sidecar.pcFloats[xAxis] as number[];
    }
    return visibleRows.map(r => parseFloat(r[xAxis]));
  }, [visibleRows, xAxis, sidecar, rowFilters.length]);

  const yValsAll = useMemo(() => {
    if (sidecar?.pcFloats?.[yAxis] && rowFilters.length === 0) {
      return sidecar.pcFloats[yAxis] as number[];
    }
    return visibleRows.map(r => parseFloat(r[yAxis]));
  }, [visibleRows, yAxis, sidecar, rowFilters.length]);

  // ── 3. Marker sizes — depends on visibleRows + sizeColumn + scale ─────────
  const markerSizes = useMemo((): number[] | number => {
    const BASE = 4;
    if (!sizeColumn) return BASE * pointSizeScale;
    const raw   = visibleRows.map(r => parseFloat(r[sizeColumn]));
    const valid = raw.filter(v => isFinite(v));
    const mn    = Math.min(...valid);
    const mx    = Math.max(...valid);
    const range = mx - mn || 1;
    return raw.map(v => isFinite(v) ? (3 + ((v - mn) / range) * 15) * pointSizeScale : BASE * pointSizeScale);
  }, [visibleRows, sizeColumn, pointSizeScale]);

  // ── 4. Group counts + sorted groups — depends on visibleRows + colorColumn
  const groupData = useMemo(() => {
    const firstVal = visibleRows[0]?.[colorColumn] ?? '';
    const isNumeric = firstVal !== '' && !isNaN(Number(firstVal));
    if (isNumeric) return null; // signal numeric path

    // Fast path: use pre-computed sidecar when no row filters are active
    // (sidecar indices are into the full rows array; filters would invalidate them)
    if (sidecar && rowFilters.length === 0 && sidecar.groups[colorColumn]) {
      const preGroups = sidecar.groups[colorColumn]; // already sorted desc by count
      const counts = new Map<string, number>(preGroups.map(g => [g.name, g.count]));
      const sorted: [string, number][] = preGroups.map(g => [g.name, g.count]);
      return { isNumeric: false as const, counts, sorted, preGroups };
    }

    // Slow path: runtime grouping (used when filters active or sidecar not loaded)
    const counts = new Map<string, number>();
    for (const r of visibleRows) {
      const g = r[colorColumn] ?? 'N/A';
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    // sorted descending by count — stable for topN slicing
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { isNumeric: false as const, counts, sorted, preGroups: undefined };
  }, [visibleRows, colorColumn, sidecar, rowFilters.length]);

  // ── 5. Main traces — ONE scattergl + legend dummies ──────────────────────
  // Instead of one trace per group (N WebGL draw calls), we use:
  //   • One real scattergl trace with a flat marker.color array  (1 draw call)
  //   • N zero-point scattergl traces for legend labels only     (0 draw calls)
  // This is dramatically faster in Firefox which is slow at multi-trace WebGL.
  const { traces, traceRows } = useMemo(() => {
    if (!visibleRows.length) return { traces: [] as object[], traceRows: [] as AcpRow[][] };

    // ── Numeric color path (unchanged — already single trace) ────────────
    if (!groupData) {
      const cVals     = visibleRows.map(r => parseFloat(r[colorColumn]));
      const customdata = visibleRows.map(r => [r['fullname'] ?? '', r['ID-replicon'] ?? '']);
      return {
        traces: [{
          type: 'scattergl' as const,
          mode: 'markers' as const,
          x: xValsAll,
          y: yValsAll,
          customdata,
          marker: {
            color: cVals,
            colorscale: 'Viridis',
            showscale: true,
            size: markerSizes,
            opacity: 0.75,
            colorbar: {
              title: colorColumn,
              titlefont: { color: '#a8b5ff', size: 10 },
              tickfont:  { color: '#a8b5ff' },
              len: 0.8,
            },
          },
          hovertemplate: `${xAxis}: %{x:.3f}<br>${yAxis}: %{y:.3f}<br>${colorColumn}: %{marker.color:.3f}<br><b>%{customdata[0]}</b><br>%{customdata[1]}<extra></extra>`,
        }],
        traceRows: [visibleRows],
      };
    }

    // ── Categorical path: build flat color array → single draw call ───────
    const topN1        = Math.max(1, topN - 1);
    const topGroupList = groupData.sorted.slice(0, topN1).map(([g]) => g);
    const topGroupNames = new Set(topGroupList);

    // Map group name → palette color (stable: based on sorted rank, not row order)
    const groupColor = new Map<string, string>();
    topGroupList.forEach((g, i) => groupColor.set(g, PALETTE[i % PALETTE.length]));
    const OTHERS_COLOR = 'rgba(140,140,140,0.35)';

    // Build ordered index arrays per group (for traceRows click handling)
    // and the flat color + customdata arrays in a single O(N) pass
    const n            = visibleRows.length;
    const flatColors   = new Array<string>(n);
    const flatCustom   = new Array<[string, string]>(n);
    const groupIdxs    = new Map<string, number[]>();

    if (groupData.preGroups) {
      // Ultra-fast path: iterate sidecar index lists (no row access at all)
      for (const pg of groupData.preGroups) {
        const name  = topGroupNames.has(pg.name) ? pg.name : 'Others';
        const color = hiddenGroups.has(name) ? 'rgba(0,0,0,0)' : (groupColor.get(name) ?? OTHERS_COLOR);
        if (!groupIdxs.has(name)) groupIdxs.set(name, []);
        const bucket = groupIdxs.get(name)!;
        for (const idx of pg.indices) {
          flatColors[idx] = color;
          bucket.push(idx);
        }
      }
      // Fill customdata in one pass
      for (let i = 0; i < n; i++) {
        const r = visibleRows[i];
        flatCustom[i] = [r['fullname'] ?? '', r['ID-replicon'] ?? ''];
      }
    } else {
      // Fallback: single O(N) pass over visibleRows
      for (let i = 0; i < n; i++) {
        const r    = visibleRows[i];
        const g    = r[colorColumn] ?? 'N/A';
        const name = topGroupNames.has(g) ? g : 'Others';
        flatColors[i] = hiddenGroups.has(name) ? 'rgba(0,0,0,0)' : (groupColor.get(name) ?? OTHERS_COLOR);
        flatCustom[i] = [r['fullname'] ?? '', r['ID-replicon'] ?? ''];
        if (!groupIdxs.has(name)) groupIdxs.set(name, []);
        groupIdxs.get(name)!.push(i);
      }
    }

    // Ordered groups for legend (top groups first, Others last)
    const orderedGroups = [
      ...topGroupList.filter(g => groupIdxs.has(g)),
      ...(groupIdxs.has('Others') ? ['Others'] : []),
    ];

    // traceRows[0] = all visible rows (for click-index lookup on the real trace)
    const traceRows: AcpRow[][] = [visibleRows];

    // ── Real trace: ALL points, flat color array, single WebGL draw call ──
    const realTrace = {
      type:       'scattergl' as const,
      mode:       'markers'   as const,
      name:       '',           // no legend entry for the real trace
      showlegend: false,
      x:          xValsAll,
      y:          yValsAll,
      customdata: flatCustom,
      marker: {
        color:   flatColors,
        size:    markerSizes,
        opacity: 0.75,
      },
      hovertemplate: `${xAxis}: %{x:.3f}<br>${yAxis}: %{y:.3f}<br><b>%{customdata[0]}</b><br>%{customdata[1]}<extra></extra>`,
    };

    // ── Legend traces ─────────────────────────────────────────────────────────
    // Each group gets one SVG scatter trace with a single NaN point.
    // Plotly skips NaN in rendering (nothing drawn) but still shows the legend
    // entry — this is the only fully reliable cross-version pattern.
    // When hidden, the marker is rendered hollow to signal the group is off.
    const legendTraces = orderedGroups.map((group, i) => {
      const baseColor = group === 'Others' ? OTHERS_COLOR : PALETTE[i % PALETTE.length];
      const isHidden  = hiddenGroups.has(group);
      return {
        type:       'scatter' as const,
        mode:       'markers' as const,
        name:       group,
        x:          [NaN],
        y:          [NaN],
        showlegend: true,
        marker: {
          color:   isHidden ? 'rgba(0,0,0,0)' : baseColor,
          size:    8,
          opacity: isHidden ? 0.5 : (group === 'Others' ? 0.45 : 0.85),
          line: isHidden
            ? { color: baseColor, width: 1.5 }
            : { color: 'rgba(0,0,0,0)', width: 0 },
        },
      };
    });

    return { traces: [realTrace, ...legendTraces], traceRows };
  }, [visibleRows, groupData, xValsAll, yValsAll, markerSizes, colorColumn, xAxis, yAxis, topN, hiddenGroups]);

  // ── 6. Custom rule traces — depends on rules + visibleRows + axes + scale ─
  const { customTraces, customTraceRows, customTraceOffset } = useMemo(() => {
    const customTraceOffset = traces.length;
    const customTraceRows: AcpRow[][] = [];
    const customTraces: object[] = [];
    for (const rule of customRules) {
      const subset    = visibleRows.filter(r =>
        (r[rule.column] ?? '').toLowerCase().includes(rule.value.toLowerCase())
      );
      customTraceRows.push(subset);
      const subCustom = subset.map(r => [r['fullname'] ?? '', r['ID-replicon'] ?? '']);
      customTraces.push({
        type: 'scattergl' as const,
        mode: 'markers'   as const,
        name: rule.label,
        x:    subset.map(r => parseFloat(r[xAxis])),
        y:    subset.map(r => parseFloat(r[yAxis])),
        customdata: subCustom,
        marker: {
          color:  rule.color,
          symbol: rule.symbol,
          size:   6 * pointSizeScale,
          opacity: 0.9,
          line: { color: 'rgba(255,255,255,0.3)', width: 0.5 },
        },
        hovertemplate: `${xAxis}: %{x:.3f}<br>${yAxis}: %{y:.3f}<br>${rule.column}: ${rule.value}<br><b>%{customdata[0]}</b><br>%{customdata[1]}<extra>${rule.label}</extra>`,
      });
    }
    return { customTraces, customTraceRows, customTraceOffset };
  }, [visibleRows, customRules, traces.length, xAxis, yAxis, pointSizeScale]);

  // ── 7. Highlight overlay — depends only on selectedReplicons ─────────────
  // Uses scattergl (same WebGL layer as main trace) so it renders ON TOP,
  // not behind the WebGL canvas.  Two sub-traces per selection:
  //   • a filled circle (white, semi-transparent) as a "halo"
  //   • a circle-open ring (solid white) drawn over the halo
  const { highlighted, overlayTrace, overlayTraceIndex } = useMemo(() => {
    const selectedSet  = new Set(selectedReplicons.map(s => s.trim()));
    const highlighted  = visibleRows.filter(r => selectedSet.has((r['ID-replicon'] ?? '').trim()));
    const overlayTraceIndex = traces.length + customTraces.length;
    const xs = highlighted.map(r => parseFloat(r[xAxis]));
    const ys = highlighted.map(r => parseFloat(r[yAxis]));
    const htmpl = highlighted.map(r =>
      `<b>${r['fullname'] ?? ''}</b><br>${r['ID-replicon'] ?? ''}<extra>selected</extra>`
    );
    const overlayTrace = highlighted.length > 0 ? {
      type: 'scattergl' as const,
      mode: 'markers'   as const,
      name: 'Selected',
      x: xs,
      y: ys,
      marker: {
        color:   'rgba(255,255,255,0)',
        size:    16,
        opacity: 1,
        line:    { color: '#ffffff', width: 3 },
      },
      hovertemplate: htmpl,
      showlegend: false,
    } : null;
    return { highlighted, overlayTrace, overlayTraceIndex };
  }, [visibleRows, selectedReplicons, xAxis, yAxis, traces.length, customTraces.length]);

  // ── Assemble final trace array (no allocation on re-render if deps stable) ─
  const allTraces = useMemo(() => [
    ...traces,
    ...customTraces,
    ...(overlayTrace ? [overlayTrace] : []),
  ], [traces, customTraces, overlayTrace]);

  if (loading) return <div className="plot-card-placeholder"><span>Loading…</span></div>;
  if (error)   return <div className="plot-card-placeholder"><span style={{ color: '#f87171' }}>{error}</span></div>;
  if (!rows)   return null;

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
    <Plot
      data={allTraces as Plotly.Data[]}
      layout={{
        ...baseLayout,
        margin: { t: 8, r: 16, b: 48, l: 54 },
        showlegend: true,
        xaxis: { ...axisStyle, title: { text: xAxis, font: { color: '#a8b5ff', size: 11 } } },
        yaxis: { ...axisStyle, title: { text: yAxis, font: { color: '#a8b5ff', size: 11 } } },
        datarevision: ++dataRevisionRef.current,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
      onLegendClick={e => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const curve = (e as any).data?.[(e as any).curveNumber];
        const groupName: string | undefined = curve?.name;
        if (groupName) {
          setHiddenGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
          });
        }
        return false; // prevent Plotly from hiding the NaN-trace itself
      }}
      onClick={e => {
        if (!onRepliconSelect) return;
        const pt = e.points?.[0];
        if (!pt) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ptAny        = pt as any;
        const curveNumber: number = ptAny.curveNumber ?? 0;
        const pointIndex:  number = ptAny.pointIndex  ?? ptAny.pointNumber ?? 0;

        let row: AcpRow | undefined;
        if (curveNumber === overlayTraceIndex) {
          row = highlighted[pointIndex];
        } else if (curveNumber >= customTraceOffset && curveNumber < overlayTraceIndex) {
          row = customTraceRows[curveNumber - customTraceOffset]?.[pointIndex];
        } else {
          row = traceRows[curveNumber]?.[pointIndex];
        }
        const idReplicon = row?.['ID-replicon'];
        if (idReplicon) onRepliconSelect(idReplicon);
      }}
    />
    </div>
  );
}

export default ScatterAcp;
