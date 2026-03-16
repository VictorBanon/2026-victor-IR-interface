import { useEffect, useMemo, useRef, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  acpFilePath,
  taxon_path_get,
  PALETTE,
} from './dataUtils';
import type { AcpRow } from './dataUtils';
import { usePlotResize } from './usePlotResize';
import AcpWorker from './acpWorker.ts?worker';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  testValue?: string;
  colorColumn?: string;
  /** Top N-1 groups shown individually; rest collapsed to "Others" — mirrors ScatterAcp */
  topN?: number;
  /** "Column:value" tags — rows not matching ALL are hidden */
  rowFilters?: string[];
}

// PC columns present in the ACP file (labelled PC1–PC10)
const PC_COLS = ['PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8','PC9','PC10'];

// Palette imported from dataUtils — same reference as ScatterAcp

// ── Plotly style ──────────────────────────────────────────────────────────────
const axisStyle = {
  color:         '#a8b5ff',
  gridcolor:     'rgba(102,126,234,0.1)',
  tickfont:      { color: '#a8b5ff', size: 8 },
  zerolinecolor: 'rgba(102,126,234,0.2)',
  linecolor:     'rgba(102,126,234,0.2)',
  showline:      true,
};

function PcVsAll({
  dataset, part, repliconFilter,
  selectedTaxon, selectedTaxonValue,
  testValue = 'hc',
  colorColumn = 'Domain',
  topN = 10,
  rowFilters = [],
}: Props) {
  const wrapperRef = usePlotResize();
  const [rows,    setRows]    = useState<AcpRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setRows(null);

    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath;
    const url = acpFilePath(dataset, taxonPath, taxonValue, testValue, part, repliconFilter);

    workerRef.current?.terminate();
    const worker = new AcpWorker();
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<
      | { ok: true;  header: string[]; rows: string[][] }
      | { ok: false; error: string }
    >) => {
      if (!e.data.ok) { setError(e.data.error); setLoading(false); return; }
      const { header, rows: rawRows } = e.data;
      const parsed: AcpRow[] = rawRows.map(cells => {
        const row: AcpRow = {};
        header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
        return row;
      });
      setRows(parsed);
      setLoading(false);
      worker.terminate();
    };

    worker.onerror = (e) => { setError(e.message); setLoading(false); };
    worker.postMessage({ url });

    return () => { worker.terminate(); };
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, testValue]);

  // ── 1. Apply row filters (OR logic) ───────────────────────────────────────
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

  // ── 2. Pre-compute splom dimensions — depends on visibleRows only ─────────
  const dimensions = useMemo(() =>
    PC_COLS.map(pc => ({
      label: pc,
      values: visibleRows.map(r => { const v = parseFloat(r[pc]); return isNaN(v) ? null : v; }),
    })),
  [visibleRows]);

  // ── 3. Build splom traces — depends on visibleRows + colorColumn + topN ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const splomTraces = useMemo((): any[] => {
    if (!visibleRows.length) return [];
    const firstVal  = visibleRows[0]?.[colorColumn] ?? '';
    const isNumeric = firstVal !== '' && !isNaN(Number(firstVal));

    if (isNumeric) {
      const cVals = visibleRows.map(r => parseFloat(r[colorColumn]));
      return [{
        type: 'splom',
        dimensions,
        showupperhalf: false,
        diagonal: { visible: false },
        marker: {
          color: cVals,
          colorscale: 'Viridis',
          size: 2,
          opacity: 0.6,
          showscale: true,
          colorbar: {
            title: colorColumn,
            titlefont: { color: '#a8b5ff', size: 9 },
            tickfont:  { color: '#a8b5ff', size: 8 },
            len: 0.5,
            thickness: 10,
          },
        },
        hovertemplate: '<b>%{xaxis.title.text}</b>: %{x:.3f}<br><b>%{yaxis.title.text}</b>: %{y:.3f}<extra></extra>',
        showlegend: false,
      }];
    }

    // Count each group then sort descending — mirrors ScatterAcp groupData
    const counts = new Map<string, number>();
    for (const r of visibleRows) {
      const g = r[colorColumn] ?? 'N/A';
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const sorted      = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const topN1       = Math.max(1, topN - 1);
    const topGroupList = sorted.slice(0, topN1).map(([g]) => g);
    const topGroupSet  = new Set(topGroupList);
    const OTHERS_COLOR = 'rgba(140,140,140,0.35)';

    // Assign stable palette colors by rank (same logic as ScatterAcp)
    const groupColor = new Map<string, string>();
    topGroupList.forEach((g, i) => groupColor.set(g, PALETTE[i % PALETTE.length]));

    // Build one splom trace per named group + one "Others" if needed
    const hasOthers = sorted.length > topN1;
    const orderedGroups = [...topGroupList, ...(hasOthers ? ['Others'] : [])];

    return orderedGroups.map((group) => {
      const isOthers = group === 'Others';
      const color    = isOthers ? OTHERS_COLOR : groupColor.get(group)!;

      // For each PC, filter values belonging to this group
      const dims = PC_COLS.map(pc => {
        const pcIdx = dimensions.findIndex(d => d.label === pc);
        const allVals = dimensions[pcIdx]?.values ?? [];
        const filtered: (number | null)[] = [];
        for (let ri = 0; ri < visibleRows.length; ri++) {
          const g    = visibleRows[ri][colorColumn] ?? 'N/A';
          const name = topGroupSet.has(g) ? g : 'Others';
          if (name === group) filtered.push(allVals[ri] ?? null);
        }
        return { label: pc, values: filtered };
      });

      return {
        type:          'splom',
        name:          group,
        dimensions:    dims,
        showupperhalf: false,
        diagonal:      { visible: false },
        marker: {
          color,
          size:    2,
          opacity: isOthers ? 0.25 : 0.55,
        },
        hovertemplate: `<b>%{xaxis.title.text}</b>: %{x:.3f}<br><b>%{yaxis.title.text}</b>: %{y:.3f}<br>${group}<extra></extra>`,
      };
    });
  }, [visibleRows, colorColumn, topN, dimensions]);

  // ── 4. isNumeric flag (needed for showlegend) ────────────────────────────
  const isNumeric = useMemo(() => {
    const firstVal = visibleRows[0]?.[colorColumn] ?? '';
    return firstVal !== '' && !isNaN(Number(firstVal));
  }, [visibleRows, colorColumn]);

  // ── 5. Axis style overrides — static, no deps ────────────────────────────
  const axisOverrides = useMemo(() => {
    const overrides: Record<string, object> = {};
    PC_COLS.forEach((_, i) => {
      const n = i + 1;
      overrides[`xaxis${n === 1 ? '' : n}`] = { ...axisStyle, title: '' };
      overrides[`yaxis${n === 1 ? '' : n}`] = { ...axisStyle, title: '' };
    });
    return overrides;
  }, []); // PC_COLS and axisStyle are module-level constants

  if (loading) return <div className="plot-card-placeholder"><span>Loading…</span></div>;
  if (error)   return <div className="plot-card-placeholder"><span style={{ color: '#f87171' }}>{error}</span></div>;
  if (!rows)   return null;

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      <Plot
        data={splomTraces}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor:  'transparent',
          font:          { color: '#a8b5ff', size: 9 },
          margin:        { t: 10, r: 140, b: 10, l: 12 },
          showlegend:    !isNumeric,
          legend: {
            font:        { color: '#a8b5ff', size: 9 },
            bgcolor:     'rgba(22,33,62,0.85)',
            bordercolor: 'rgba(102,126,234,0.2)',
            borderwidth: 1,
            orientation: 'v',
            x:           1.02,
            y:           0.5,
            xanchor:     'left',
            yanchor:     'middle',
          },
          dragmode: false,
          hovermode: false,
          ...axisOverrides,
        } as any}
        config={{
          responsive: true,
          displayModeBar: false,
          staticPlot: true,
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </div>
  );
}

export default PcVsAll;
