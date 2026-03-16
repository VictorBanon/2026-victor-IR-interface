import { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  fetchCsvText,
  parseAcpColumn,
  pcsMergedFilePath,
  parsePcsMergedMatrix,
  extractPcFromMerged,
  acpFilePath,
  taxon_path_get,
} from './dataUtils';
import type { MatrixData } from './dataUtils';
import { usePlotResize } from './usePlotResize';

// PC1–PC10 → use dedicated PC matrix file
const PC_COLUMNS = new Set(['PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8','PC9','PC10']);

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  testValue: string;   // 'hc' | 'kmer' etc — used in ACP filename
  column: string;      // xAxis or yAxis value from sidebar
}

// ── shared Plotly style ───────────────────────────────────────────────────────
const baseLayout = {
  margin:        { t: 8, r: 16, b: 48, l: 54 },
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:          { color: '#a8b5ff', size: 11 },
};
const axisStyle = {
  color: '#a8b5ff',
  gridcolor: 'rgba(102,126,234,0.12)',
  tickfont: { color: '#a8b5ff' },
  zerolinecolor: 'rgba(102,126,234,0.2)',
};

function AxisChart({
  dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue,
  testValue, column,
}: Props) {
  const wrapperRef = usePlotResize();
  const [matrix,  setMatrix]  = useState<MatrixData | null>(null);
  const [values,  setValues]  = useState<number[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isPc = PC_COLUMNS.has(column);

  useEffect(() => {
    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath; // stub — always 'Prokaryote' for now

    setLoading(true);
    setError(null);
    setMatrix(null);
    setValues(null);

    if (isPc) {
      // Load merged PC file: hc_PCs_{part}_{taxon}.csv — then extract the row for `column`
      const url = pcsMergedFilePath(dataset, taxonPath, taxonValue, part);
      fetchCsvText(url)
        .then((text: string) => {
          const merged = parsePcsMergedMatrix(text);
          const extracted = extractPcFromMerged(merged, column);
          if (extracted) { setMatrix(extracted); }
          else { setError(`PC "${column}" not found in merged file`); }
          setLoading(false);
        })
        .catch((e: unknown) => { setError(String(e)); setLoading(false); });
    } else {
      // Load ACP scatter file and extract histogram column
      const url = acpFilePath(dataset, taxonPath, taxonValue, testValue, part, repliconFilter);
      fetchCsvText(url)
        .then((text: string) => { setValues(parseAcpColumn(text, column)); setLoading(false); })
        .catch((e: unknown)  => { setError(String(e));                     setLoading(false); });
    }
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, testValue, column, isPc]);

  if (loading) return <div className="plot-card-placeholder"><span>Loading…</span></div>;
  if (error)   return <div className="plot-card-placeholder"><span style={{ color: '#f87171' }}>{error}</span></div>;

  // ── PC column → heatmap (HC index × arm) ─────────────────────────────────
  if (isPc && matrix) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heatTrace: any = {
      type: 'heatmap',
      z: matrix.matrix,
      x: matrix.colLabels,
      y: matrix.rowLabels,
      colorscale: 'RdBu',
      zmid: 0,
      showscale: true,
      hoverongaps: false,
      hovertemplate: 'Arm %{x} | HC %{y}<br>value: %{z:.4f}<extra></extra>',
    };
    return (
      <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      <Plot
        data={[heatTrace]}
        layout={{
          ...baseLayout,
          margin: { t: 8, r: 60, b: 40, l: 50 },
          xaxis: { ...axisStyle, title: { text: 'Arm', font: { color: '#a8b5ff', size: 11 } } },
          yaxis: { ...axisStyle, title: { text: 'Gap', font: { color: '#a8b5ff', size: 11 } } },
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
      </div>
    );
  }

  // ── Other column → histogram ──────────────────────────────────────────────
  if (!isPc && values) {
    return (
      <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      <Plot
        data={[{
          type: 'histogram',
          x: values,
          name: column,
          marker: { color: 'rgba(102,126,234,0.7)', line: { color: '#667eea', width: 0.5 } },
          hovertemplate: '%{x}<br>count: %{y}<extra></extra>',
        }]}
        layout={{
          ...baseLayout,
          showlegend: false,
          xaxis: { ...axisStyle, title: { text: column, font: { color: '#a8b5ff', size: 11 } } },
          yaxis: { ...axisStyle, title: { text: 'Count',  font: { color: '#a8b5ff', size: 11 } } },
          bargap: 0.05,
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
      />
      </div>
    );
  }

  return null;
}

export default AxisChart;
