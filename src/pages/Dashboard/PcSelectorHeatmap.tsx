import { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  fetchCsvText,
  pcsMergedFilePath,
  parsePcsMergedMatrix,
  extractPcFromMerged,
  taxon_path_get,
} from './dataUtils';
import type { MatrixData } from './dataUtils';
import { usePlotResize } from './usePlotResize';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
}

const PC_LIST = ['PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8','PC9','PC10'] as const;

// ── Plotly style ──────────────────────────────────────────────────────────────
const baseLayout = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font:          { color: '#a8b5ff', size: 11 },
};
const axisStyle = {
  color: '#a8b5ff',
  gridcolor: 'rgba(102,126,234,0.1)',
  tickfont: { color: '#a8b5ff', size: 10 },
};

function PcSelectorHeatmap({
  dataset, part,
  selectedTaxon, selectedTaxonValue,
}: Props) {
  const wrapperRef = usePlotResize();

  const [selectedPc, setSelectedPc] = useState<string>('PC1');

  // Load the full merged matrix once per dataset/taxon/part
  const [merged,  setMerged]  = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setMerged(null);

    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath;
    const url = pcsMergedFilePath(dataset, taxonPath, taxonValue, part);

    fetchCsvText(url)
      .then((text: string) => { setMerged(parsePcsMergedMatrix(text)); setLoading(false); })
      .catch((e: unknown)  => { setError(String(e));                   setLoading(false); });
  }, [dataset, part, selectedTaxon, selectedTaxonValue]);

  // Extract the selected PC row from the cached merged matrix
  const data = useMemo((): MatrixData | null => {
    if (!merged) return null;
    return extractPcFromMerged(merged, selectedPc);
  }, [merged, selectedPc]);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', gap: 0 }}>

      {/* ── Selector panel ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 6px',
        minWidth: 80,
        maxWidth: 96,
        borderRight: '1px solid rgba(102,126,234,0.2)',
        overflowY: 'auto',
      }}>

        {/* PC buttons */}
        <div style={{ fontSize: 10, color: '#a8b5ff', opacity: 0.6, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Component
        </div>
        {PC_LIST.map(pc => (
          <button
            key={pc}
            onClick={() => setSelectedPc(pc)}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid',
              borderColor: selectedPc === pc ? '#667eea' : 'rgba(102,126,234,0.25)',
              background: selectedPc === pc ? 'rgba(102,126,234,0.25)' : 'transparent',
              color: selectedPc === pc ? '#ffffff' : '#a8b5ff',
              cursor: 'pointer',
              fontSize: 11,
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            {pc}
          </button>
        ))}
      </div>

      {/* ── Heatmap panel ── */}
      <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, height: '100%' }}>
        {loading && (
          <div className="plot-card-placeholder"><span>Loading…</span></div>
        )}
        {error && (
          <div className="plot-card-placeholder">
            <span style={{ color: '#f87171' }}>{error}</span>
          </div>
        )}
        {!loading && !error && data && (
          <Plot
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={[{
              type: 'heatmap',
              z: data.matrix,
              x: data.colLabels,
              y: data.rowLabels,
              colorscale: 'RdBu',
              zmid: 0,
              showscale: true,
              hoverongaps: false,
              hovertemplate: 'Arm %{x} | HC %{y}<br>value: %{z:.4f}<extra></extra>',
            } as any]}
            layout={{
              ...baseLayout,
              margin: { t: 8, r: 60, b: 40, l: 44 },
              xaxis: { ...axisStyle, title: { text: 'Arm', font: { color: '#a8b5ff', size: 11 } } },
              yaxis: { ...axisStyle, title: { text: 'Gap', font: { color: '#a8b5ff', size: 11 } } },
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
          />
        )}
      </div>

    </div>
  );
}

export default PcSelectorHeatmap;
