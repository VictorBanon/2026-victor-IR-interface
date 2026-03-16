import { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  fetchCsvText,
  parseExplainedVarianceCsv,
  explainedVarianceFilePath,
  taxon_path_get,
} from './dataUtils';
import type { ExplainedVarianceRow } from './dataUtils';
import { usePlotResize } from './usePlotResize';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
}

// ── Plotly style ──────────────────────────────────────────────────────────────
const baseLayout = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:          { color: '#a8b5ff', size: 11 },
};
const axisStyle = {
  color:     '#a8b5ff',
  gridcolor: 'rgba(102,126,234,0.1)',
  tickfont:  { color: '#a8b5ff', size: 10 },
  zerolinecolor: 'rgba(102,126,234,0.15)',
};

// Map part value to the correct file type
function partToType(part: string): 'hc_all' | 'hc_cod' | 'hc_non' {
  if (part === 'cod') return 'hc_cod';
  if (part === 'non') return 'hc_non';
  return 'hc_all';
}

function ExplainedVariance({
  dataset, part, repliconFilter,
  selectedTaxon, selectedTaxonValue,
}: Props) {
  const wrapperRef = usePlotResize();
  const [rows,    setRows]    = useState<ExplainedVarianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setRows([]);

    const taxonPath = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath;
    const type = partToType(part);
    const url = explainedVarianceFilePath(dataset, taxonPath, taxonValue, type, repliconFilter);

    fetchCsvText(url)
      .then(text => { setRows(parseExplainedVarianceCsv(text)); setLoading(false); })
      .catch((e: unknown) => { setError(String(e)); setLoading(false); });
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue]);

  if (loading) return <div className="plot-card-placeholder"><span>Loading…</span></div>;
  if (error)   return <div className="plot-card-placeholder"><span style={{ color: '#f87171' }}>{error}</span></div>;
  if (!rows.length) return null;

  const pcLabels   = rows.map(r => r.pc);
  const ratios     = rows.map(r => +(r.ratio * 100).toFixed(4));
  const cumulative = rows.map(r => +(r.cumulative * 100).toFixed(4));

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      <Plot
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={[
          // ── Bars: per-component variance ────────────────────────────────
          {
            type: 'bar',
            name: 'Per component',
            x: pcLabels,
            y: ratios,
            yaxis: 'y',
            marker: {
              color: ratios.map((_, i) =>
                `rgba(102,126,234,${0.85 - i * 0.06 > 0.25 ? 0.85 - i * 0.06 : 0.25})`
              ),
              line: { color: '#667eea', width: 0.8 },
            },
            hovertemplate: '%{x}<br>Variance: %{y:.3f}%<extra></extra>',
          },
          // ── Line: cumulative variance ────────────────────────────────────
          {
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Cumulative',
            x: pcLabels,
            y: cumulative,
            yaxis: 'y2',
            line:   { color: '#f59e0b', width: 2 },
            marker: { color: '#f59e0b', size: 6, symbol: 'circle' },
            hovertemplate: '%{x}<br>Cumulative: %{y:.3f}%<extra></extra>',
          },
        ] as any}
        layout={{
          ...baseLayout,
          margin: { t: 12, r: 56, b: 44, l: 52 },
          showlegend: true,
          legend: {
            font: { color: '#a8b5ff', size: 10 },
            bgcolor: 'transparent',
            x: 0.01,
            y: 0.99,
            xanchor: 'left',
            yanchor: 'top',
          },
          bargap: 0.25,
          xaxis: {
            ...axisStyle,
            title: { text: 'Component', font: { color: '#a8b5ff', size: 11 } },
          },
          yaxis: {
            ...axisStyle,
            title: { text: 'Explained variance (%)', font: { color: '#a8b5ff', size: 11 } },
            rangemode: 'tozero',
          },
          yaxis2: {
            ...axisStyle,
            title: { text: 'Cumulative (%)', font: { color: '#f59e0b', size: 11 } },
            overlaying: 'y',
            side: 'right',
            range: [0, 105],
            showgrid: false,
            tickfont: { color: '#f59e0b', size: 10 },
          },
        } as any}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
    </div>
  );
}

export default ExplainedVariance;
