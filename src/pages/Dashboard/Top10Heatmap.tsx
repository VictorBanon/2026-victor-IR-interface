import { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  fetchCsvText,
  top10FilePath,
  patternCountFilePath,
  parseTop10Row,
  parsePatternCountRow,
  buildRatioMatrix,
  taxon_path_get,
} from './dataUtils';
import type { RatioMatrix } from './dataUtils';
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

function Top10Heatmap({
  dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue,
  selectedReplicon, label,
}: Props) {
  const wrapperRef = usePlotResize();

  const [result,  setResult]  = useState<RatioMatrix | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedReplicon) {
      setResult(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const top10Url   = top10FilePath(dataset, taxonPath, taxonPath, part, repliconFilter);
    const totalsUrl  = patternCountFilePath(dataset, taxonPath, taxonPath, part, repliconFilter);

    Promise.all([
      fetchCsvText(top10Url),
      fetchCsvText(totalsUrl),
    ])
      .then(([top10Text, totalsText]) => {
        const top10  = parseTop10Row(top10Text, selectedReplicon);
        const totals = parsePatternCountRow(totalsText, selectedReplicon);

        if (!top10)  { setError(`Replicon "${selectedReplicon}" not found in top10 file.`);        setLoading(false); return; }
        if (!totals) { setError(`Replicon "${selectedReplicon}" not found in pattern count file.`); setLoading(false); return; }

        setResult(buildRatioMatrix(top10, totals));
        setLoading(false);
      })
      .catch((e: unknown) => { setError(String(e)); setLoading(false); });
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, selectedReplicon]);

  // ── No selection ─────────────────────────────────────────────────────────
  if (!selectedReplicon) {
    return (
      <div className="plot-card-placeholder">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1"/>
        </svg>
        <span>Click a point in the ACP scatter to load its top-10 pattern heatmap</span>
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

  const contentPlaceholder = (msg: string, isError = false) => (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {headerBar}
      <div className="plot-card-placeholder" style={{ flex: 1 }}>
        <span style={isError ? { color: '#f87171' } : undefined}>{msg}</span>
      </div>
    </div>
  );

  if (loading) return contentPlaceholder('Loading top-10 patterns…');
  if (error)   return contentPlaceholder(error, true);
  if (!result) return contentPlaceholder('Loading…');

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {headerBar}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={[{
            type: 'heatmap',
            z: result.matrix,
            x: result.colLabels,
            y: result.rowLabels,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            text: result.hoverText as any,
            colorscale: 'RdBu',
            reversescale: true,
            zmin: 0,
            zmax: 1,
            showscale: true,
            hovertemplate: '%{text}<extra></extra>',
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
    </div>
  );
}

export default Top10Heatmap;
