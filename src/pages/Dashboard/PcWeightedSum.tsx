import { useEffect, useState, useRef, useMemo } from 'react';
import Plot from 'react-plotly.js';
import {
  fetchCsvText,
  pcsMergedFilePath,
  parsePcsMergedMatrix,
  extractPcFromMerged,
  taxon_path_get,
} from './dataUtils';
import type { MatrixData, AcpSearchEntry, AcpRow } from './dataUtils';
import { usePlotResize } from './usePlotResize';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  /** ACP rows already loaded by ScatterAcp — used to populate the replicon search */
  acpRows?: AcpRow[];
}

const PC_COUNT = 10;
const PC_LABELS = Array.from({ length: PC_COUNT }, (_, i) => `PC${i + 1}`);
const WEIGHT_MIN = -3;
const WEIGHT_MAX = 3;

// ── Plotly style ──────────────────────────────────────────────────────────────
const baseLayout = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#a8b5ff', size: 11 },
};
const axisStyle = {
  color: '#a8b5ff',
  gridcolor: 'rgba(102,126,234,0.1)',
  tickfont: { color: '#a8b5ff', size: 10 },
};

function PcWeightedSum({
  dataset, part: _part, repliconFilter: _rf,
  selectedTaxon, selectedTaxonValue,
  acpRows = [],
}: Props) {
  const wrapperRef = usePlotResize();

  // ── PC weights ────────────────────────────────────────────────────────────
  const [weights, setWeights] = useState<number[]>(Array(PC_COUNT).fill(0));

  // ── All 10 PC loading matrices ────────────────────────────────────────────
  const [pcMatrices, setPcMatrices] = useState<(MatrixData | null)[]>(Array(PC_COUNT).fill(null));
  const [loadingPc,  setLoadingPc]  = useState(true);
  const [errorPc,    setErrorPc]    = useState<string | null>(null);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchText,    setSearchText]    = useState('');
  const [searchResults, setSearchResults] = useState<AcpSearchEntry[]>([]);
  const [importedLabel, setImportedLabel] = useState<string | null>(null);
  const searchRef    = useRef<HTMLDivElement>(null);
  const acpRowsRef   = useRef(acpRows);
  useEffect(() => { acpRowsRef.current = acpRows; }, [acpRows]);

  // ── Load all 10 PC matrices from the single merged file ──────────────────
  useEffect(() => {
    setLoadingPc(true);
    setErrorPc(null);
    setPcMatrices(Array(PC_COUNT).fill(null));

    const taxonPath = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath;

    // part='all' for the weighted-sum tool (uses the full all-replicon matrix)
    const url = pcsMergedFilePath(dataset, taxonPath, taxonValue, 'all');
    fetchCsvText(url)
      .then(text => {
        const merged = parsePcsMergedMatrix(text);
        const matrices = PC_LABELS.map(pc => extractPcFromMerged(merged, pc));
        setPcMatrices(matrices);
        setLoadingPc(false);
      })
      .catch((e: unknown) => { setErrorPc(String(e)); setLoadingPc(false); });
  }, [dataset, selectedTaxon, selectedTaxonValue]);

  // ── Filter search results from acpRows ───────────────────────────────────
  useEffect(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) { setSearchResults([]); return; }
    const seen = new Set<string>();
    const hits: AcpSearchEntry[] = [];
    for (const r of acpRowsRef.current) {
      const id = r['ID-replicon'] ?? '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = (r['fullname'] ?? r['full_name'] ?? id).toLowerCase();
      if (!id.toLowerCase().includes(q) && !name.includes(q)) continue;
      const pcScores = ['PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8','PC9','PC10']
        .map(k => { const v = parseFloat(r[k] ?? ''); return isNaN(v) ? 0 : v; });
      hits.push({ idReplicon: id, fullName: r['fullname'] ?? r['full_name'] ?? id, pcScores });
      if (hits.length >= 20) break;
    }
    setSearchResults(hits);
  // acpRowsRef.current mutations are transparent — intentionally excluded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Import PC scores from a search result ─────────────────────────────────
  const importScores = (entry: AcpSearchEntry) => {
    setWeights(entry.pcScores.slice(0, PC_COUNT));
    setImportedLabel(entry.fullName || entry.idReplicon);
    setSearchText('');
    setSearchResults([]);
  };

  // ── Compute weighted sum matrix ───────────────────────────────────────────
  const combinedMatrix = useMemo<number[][] | null>(() => {
    if (pcMatrices.some(m => m === null)) return null;
    const first = pcMatrices[0]!;
    const rows = first.matrix.length;
    const cols = first.matrix[0]?.length ?? 0;

    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) =>
        pcMatrices.reduce((sum, m, k) => sum + weights[k] * (m?.matrix[r][c] ?? 0), 0)
      )
    );
  }, [pcMatrices, weights]);

  const meta = pcMatrices[0]; // use row/col labels from first matrix

  const resetWeights = () => { setWeights(Array(PC_COUNT).fill(0)); setImportedLabel(null); };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', gap: 0 }}>

      {/* ── Left panel: search + sliders ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 8px',
        minWidth: 200,
        maxWidth: 220,
        borderRight: '1px solid rgba(102,126,234,0.2)',
        overflowY: 'auto',
      }}>

        {/* Search box */}
        <div style={{ fontSize: 10, color: '#a8b5ff', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Import from replicon
        </div>
        <div ref={searchRef} style={{ position: 'relative' }}>
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder={acpRowsRef.current.length === 0 ? 'Waiting for ACP data…' : 'Search name or ID…'}
            disabled={acpRowsRef.current.length === 0}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '4px 7px',
              borderRadius: 4,
              border: '1px solid rgba(102,126,234,0.35)',
              background: 'rgba(102,126,234,0.08)',
              color: '#e2e8f0',
              fontSize: 11,
              outline: 'none',
            }}
          />
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 50,
              background: '#1a1f35',
              border: '1px solid rgba(102,126,234,0.4)',
              borderRadius: 4,
              maxHeight: 180,
              overflowY: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}>
              {searchResults.map(e => (
                <div
                  key={e.idReplicon}
                  onClick={() => importScores(e)}
                  style={{
                    padding: '5px 8px',
                    cursor: 'pointer',
                    fontSize: 10,
                    borderBottom: '1px solid rgba(102,126,234,0.15)',
                    color: '#c7d2fe',
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(102,126,234,0.18)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.fullName}
                  </div>
                  <div style={{ opacity: 0.65 }}>{e.idReplicon}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Imported label */}
        {importedLabel && (
          <div style={{ fontSize: 10, color: '#86efac', padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ✓ {importedLabel}
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(102,126,234,0.15)', margin: '2px 0' }} />

        {/* Weights header + reset */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 10, color: '#a8b5ff', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Weights
          </div>
          <button
            onClick={resetWeights}
            style={{
              padding: '2px 7px',
              borderRadius: 3,
              border: '1px solid rgba(102,126,234,0.3)',
              background: 'transparent',
              color: '#a8b5ff',
              cursor: 'pointer',
              fontSize: 10,
            }}
          >
            Reset
          </button>
        </div>

        {/* PC sliders */}
        {PC_LABELS.map((pc, i) => (
          <div key={pc} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10, color: '#a8b5ff', minWidth: 26 }}>{pc}</span>
            <input
              type="range"
              min={WEIGHT_MIN}
              max={WEIGHT_MAX}
              step={0.01}
              value={weights[i]}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setWeights(prev => prev.map((w, j) => j === i ? v : w));
                setImportedLabel(null);
              }}
              style={{ flex: 1, accentColor: '#667eea', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, color: '#e2e8f0', minWidth: 38, textAlign: 'right' }}>
              {weights[i].toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* ── Right panel: heatmap ── */}
      <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, height: '100%' }}>
        {loadingPc && (
          <div className="plot-card-placeholder"><span>Loading PC matrices…</span></div>
        )}
        {errorPc && (
          <div className="plot-card-placeholder">
            <span style={{ color: '#f87171' }}>{errorPc}</span>
          </div>
        )}
        {!loadingPc && !errorPc && combinedMatrix && meta && (
          <Plot
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={[{
              type: 'heatmap',
              z: combinedMatrix,
              x: meta.colLabels,
              y: meta.rowLabels,
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

export default PcWeightedSum;
