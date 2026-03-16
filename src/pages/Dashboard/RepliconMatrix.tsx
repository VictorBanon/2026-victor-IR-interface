import { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  fetchCsvText,
  allDataFilePath,
  parseRepliconRow,
  taxon_path_get,
  ARM_KMER_LEN,
  HEATMAP_COLORSCALE,
} from './dataUtils';
import { usePlotResize } from './usePlotResize';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  selectedReplicon: string | null;
  label?: string;
}

function RepliconMatrix({
  dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue,
  selectedReplicon, label,
}: Props) {
  const wrapperRef = usePlotResize();

  const [matrix,    setMatrix]    = useState<number[][] | null>(null);
  const [rowLabels, setRowLabels] = useState<string[]>([]);
  const [colLabels, setColLabels] = useState<string[]>([]);
  const [error,     setError]     = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!selectedReplicon) {
      setMatrix(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setMatrix(null);

    const taxonPath = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const url = allDataFilePath(dataset, taxonPath, taxonPath, part, repliconFilter);

    fetchCsvText(url)
      .then(text => {
        const result = parseRepliconRow(text, selectedReplicon);
        if (!result) {
          setError(`Replicon "${selectedReplicon}" not found in all_data file.`);
        } else {
          setMatrix(result.matrix);
          setRowLabels(result.rowLabels);
          setColLabels(result.colLabels);
        }
        setLoading(false);
      })
      .catch((e: unknown) => { setError(String(e)); setLoading(false); });
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, selectedReplicon]);

  // ── No selection ───────────────────────────────────────────────────────────
  if (!selectedReplicon) {
    return (
      <div className="plot-card-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1"/>
        </svg>
        <span>Click a point in the ACP scatter to load its replicon matrix</span>
      </div>
    );
  }

  const headerBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px 0' }}>
      <div style={{ flex: 1, fontSize: 10, color: '#a8b5ff', opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label ? `${label} — ${selectedReplicon}` : selectedReplicon}
      </div>
    </div>
  );

  // Loading / error shown inside the card (header stays visible)
  const contentPlaceholder = (msg: string, isError = false) => (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {headerBar}
      <div className="plot-card-placeholder" style={{ flex: 1 }}>
        <span style={isError ? { color: '#f87171' } : undefined}>{msg}</span>
      </div>
    </div>
  );

  if (loading) return contentPlaceholder('Loading replicon matrix…');
  if (error)   return contentPlaceholder(error, true);
  if (!matrix) return contentPlaceholder('Loading…');

  // Build per-cell hover text including kmer length
  const n_rows = matrix.length;
  const n_cols = matrix[0]?.length ?? 0;
  const hoverText: string[][] = Array.from({ length: n_rows }, (_, h) =>
    Array.from({ length: n_cols }, (_, c) => {
      const a = c * n_rows + h;
      const kmer = ARM_KMER_LEN[a] ?? 0;
      return `Arm ${c + 3} | Gap ${h} | kmer ${kmer}<br>value: ${(matrix[h][c] ?? 0).toFixed(4)}`;
    })
  );

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {headerBar}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={[{
            type: 'heatmap',
            z: matrix,
            x: colLabels,
            y: rowLabels,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            text: hoverText as any,
            colorscale: HEATMAP_COLORSCALE,
            zmin: -1, zmax: 2,
            showscale: true,
            hoverongaps: false,
            hovertemplate: '%{text}<extra></extra>',
          }]}
          layout={{
            margin: { t: 4, r: 60, b: 40, l: 44 },
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            font: { color: '#a8b5ff', size: 11 },
            xaxis: { title: { text: 'Arm', font: { color: '#a8b5ff', size: 11 } }, color: '#a8b5ff', gridcolor: 'rgba(102,126,234,0.1)', tickfont: { color: '#a8b5ff' } },
            yaxis: { title: { text: 'Gap', font: { color: '#a8b5ff', size: 11 } }, color: '#a8b5ff', gridcolor: 'rgba(102,126,234,0.1)', tickfont: { color: '#a8b5ff' } },
          }}
          config={{ responsive: true, displayModeBar: false }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
    </div>
  );
}

export default RepliconMatrix;