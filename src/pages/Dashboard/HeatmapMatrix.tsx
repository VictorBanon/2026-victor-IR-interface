import { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { fetchCsvText, parseMatrixCsv, hcFilePath, taxon_path_get, HEATMAP_COLORSCALE } from './dataUtils';
import type { MatrixData } from './dataUtils';
import { usePlotResize } from './usePlotResize';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  stat: 'mean' | 'median';
  title: string;
}

function HeatmapMatrix({ dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, stat, title }: Props) {
  const wrapperRef = usePlotResize();
  const [data, setData]       = useState<MatrixData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath;
    const path       = hcFilePath(dataset, taxonPath, taxonValue, part, stat, repliconFilter);

    fetchCsvText(path)
      .then((text: string) => { setData(parseMatrixCsv(text)); setLoading(false); })
      .catch((e: unknown)  => { setError(String(e));           setLoading(false); });
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, stat]);

  if (loading) return <div className="plot-card-placeholder"><span>Loading…</span></div>;
  if (error)   return <div className="plot-card-placeholder"><span style={{ color: '#f87171' }}>Error loading {title}</span></div>;
  if (!data)   return null;

  // Apply log10 transform; values ≤ 0 become null (displayed as gaps)
  const logMatrix = data.matrix.map(row =>
    row.map(v => (v > 0 ? Math.log10(v) : null))
  );

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
    <Plot
      data={[{
        type: 'heatmap',
        z: logMatrix,
        x: data.colLabels,
        y: data.rowLabels,
        colorscale: HEATMAP_COLORSCALE,
        zmin: -1,
        zmax: 2,
        showscale: true,
        hoverongaps: false,
        hovertemplate: 'Arm %{x} | HC %{y}<br>log₁₀: %{z:.4f}<extra></extra>',
      }]}
      layout={{
        margin:        { t: 8, r: 60, b: 40, l: 50 },
        paper_bgcolor: 'transparent',
        plot_bgcolor:  'transparent',
        font:          { color: '#a8b5ff', size: 11 },
        xaxis: {
          title: { text: 'Arm', font: { color: '#a8b5ff', size: 11 } },
          color: '#a8b5ff',
          gridcolor: 'rgba(102,126,234,0.1)',
          tickfont: { color: '#a8b5ff' },
        },
        yaxis: {
          title: { text: 'Gap', font: { color: '#a8b5ff', size: 11 } },
          color: '#a8b5ff',
          gridcolor: 'rgba(102,126,234,0.1)',
          tickfont: { color: '#a8b5ff' },
        },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
    />
    </div>
  );
}

export default HeatmapMatrix;
