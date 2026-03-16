import { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { fetchCsvText, parseMinMaxCsv, hcFilePath, taxon_path_get } from './dataUtils';
import type { MinMaxData, MinMaxRow } from './dataUtils';
import { usePlotResize } from './usePlotResize';

type ViewMode = 'gap' | 'arm' | 'heatmap';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  which: 'min' | 'max';
  title: string;
}

// ── shared Plotly layout base ─────────────────────────────────────────────────
const baseLayout = {
  margin:        { t: 4, r: 16, b: 40, l: 54 },
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:          { color: '#a8b5ff', size: 11 },
  legend:        { font: { color: '#a8b5ff', size: 10 }, bgcolor: 'transparent' },
};
const axisStyle = {
  color: '#a8b5ff',
  gridcolor: 'rgba(102,126,234,0.12)',
  tickfont: { color: '#a8b5ff' },
  zerolinecolor: 'rgba(102,126,234,0.2)',
};

// ── Gap histogram: frequency vs gap, one trace per arm ───────────────────────
function GapHistogram({ rows, color }: { rows: MinMaxRow[]; color: string }) {
  const arms = [...new Set(rows.map(r => r.arm))].sort((a, b) => a - b);
  const traces = arms.map(arm => {
    const armRows = rows.filter(r => r.arm === arm).sort((a, b) => a.gap - b.gap);
    return {
      type: 'bar' as const,
      name: `Arm ${arm}`,
      x: armRows.map(r => r.gap),
      y: armRows.map(r => r.frequency),
      hovertemplate: `Arm %{fullData.name} | gap %{x}<br>freq: %{y:.5f}<extra></extra>`,
    };
  });
  return (
    <Plot
      data={traces}
      layout={{
        ...baseLayout,
        barmode: 'overlay',
        showlegend: true,
        xaxis: { ...axisStyle, title: { text: 'Gap', font: { color: '#a8b5ff', size: 11 } } },
        yaxis: { ...axisStyle, title: { text: 'Frequency', font: { color: '#a8b5ff', size: 11 } } },
        colorway: [color],
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  );
}

// ── Arm histogram: total frequency per arm ────────────────────────────────────
function ArmHistogram({ rows, color }: { rows: MinMaxRow[]; color: string }) {
  const arms = [...new Set(rows.map(r => r.arm))].sort((a, b) => a - b);
  const totals = arms.map(arm =>
    rows.filter(r => r.arm === arm).reduce((s, r) => s + r.frequency, 0)
  );
  return (
    <Plot
      data={[{
        type: 'bar',
        x: arms,
        y: totals,
        marker: { color },
        hovertemplate: 'Arm %{x}<br>total freq: %{y:.5f}<extra></extra>',
      }]}
      layout={{
        ...baseLayout,
        showlegend: false,
        xaxis: { ...axisStyle, title: { text: 'Arm', font: { color: '#a8b5ff', size: 11 } }, type: 'category' },
        yaxis: { ...axisStyle, title: { text: 'Total Frequency', font: { color: '#a8b5ff', size: 11 } } },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  );
}

// ── Heatmap: gap (y) × arm (x) = frequency ───────────────────────────────────
function FreqHeatmap({ rows, which }: { rows: MinMaxRow[]; which: 'min' | 'max' }) {
  const arms = [...new Set(rows.map(r => r.arm))].sort((a, b) => a - b);
  const gaps = [...new Set(rows.map(r => r.gap))].sort((a, b) => a - b);

  // z[gapIdx][armIdx] — gap on Y, arm on X
  const z = gaps.map(gap =>
    arms.map(arm => {
      const row = rows.find(r => r.arm === arm && r.gap === gap);
      return row ? row.frequency : 0;
    })
  );

  // min: white → blue  |  max: white → red
  const colorscale: [number, string][] = which === 'min'
    ? [[0, '#ffffff'], [1, '#1a56db']]
    : [[0, '#ffffff'], [1, '#c0392b']];

  return (
    <Plot
      data={[{
        type: 'heatmap',
        x: arms,
        y: gaps,
        z,
        colorscale,
        showscale: true,
        hoverongaps: false,
        hovertemplate: 'Arm %{x} | Gap %{y}<br>freq: %{z:.5f}<extra></extra>',
      }]}
      layout={{
        ...baseLayout,
        xaxis: { ...axisStyle, title: { text: 'Arm', font: { color: '#a8b5ff', size: 11 } } },
        yaxis: { ...axisStyle, title: { text: 'Gap', font: { color: '#a8b5ff', size: 11 } } },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function HeatmapMinMax({ dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, which, title }: Props) {
  const wrapperRef = usePlotResize();
  const [data, setData]       = useState<MinMaxData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState<ViewMode>('heatmap');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const path       = hcFilePath(dataset, taxonPath, taxonPath, part, 'min_max', repliconFilter);
    fetchCsvText(path)
      .then((text: string) => { setData(parseMinMaxCsv(text)); setLoading(false); })
      .catch((e: unknown)  => { setError(String(e));           setLoading(false); });
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue]);

  if (loading) return <div className="plot-card-placeholder"><span>Loading…</span></div>;
  if (error)   return <div className="plot-card-placeholder"><span style={{ color: '#f87171' }}>Error loading {title}</span></div>;
  if (!data)   return null;

  const rows  = data[which];
  const color = which === 'min' ? '#667eea' : '#f87171';

  const VIEWS: { key: ViewMode; label: string }[] = [
    { key: 'gap',     label: 'Gap' },
    { key: 'arm',     label: 'Arm' },
    { key: 'heatmap', label: 'Heatmap' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 1, minHeight: 0 }}>
      {/* View toggle bar */}
      <div className="minmax-view-toggle">
        {VIEWS.map(v => (
          <button
            key={v.key}
            className={`minmax-view-btn${view === v.key ? ' active' : ''}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {/* Plot area */}
      <div ref={wrapperRef} style={{ flex: 1, minHeight: 0 }}>
        {view === 'gap'     && <GapHistogram rows={rows} color={color} />}
        {view === 'arm'     && <ArmHistogram rows={rows} color={color} />}
        {view === 'heatmap' && <FreqHeatmap  rows={rows} which={which} />}
      </div>
    </div>
  );
}

export default HeatmapMinMax;
