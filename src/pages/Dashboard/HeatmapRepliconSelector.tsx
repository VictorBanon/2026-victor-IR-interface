import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Plot from 'react-plotly.js';
import {
  allDataFilePath,
  parseRepliconRow,
  taxon_path_get,
  HEATMAP_COLORSCALE,
  fetchCsvText,
} from './dataUtils';
import type { AcpRow } from './dataUtils';
import { usePlotResize } from './usePlotResize';

interface Props {
  dataset: string;
  part: string;
  repliconFilter: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  /** All ACP rows already loaded by ScatterAcp — used to populate the searcher */
  acpRows?: AcpRow[];
  /** Called when a replicon is selected — mirrors the scatter highlight callback */
  onRepliconSelect?: (idReplicon: string) => void;
}

// ── Plotly style ──────────────────────────────────────────────────────────────
const axisStyle = {
  color: '#a8b5ff',
  gridcolor: 'rgba(102,126,234,0.1)',
  tickfont: { color: '#a8b5ff', size: 10 },
};

function HeatmapRepliconSelector({
  dataset, part, repliconFilter,
  selectedTaxon, selectedTaxonValue,
  acpRows = [],
  onRepliconSelect,
}: Props) {
  const wrapperRef = usePlotResize();

  // Keep acpRows in a ref so search entries update without remounting the component
  const acpRowsRef = useRef<AcpRow[]>(acpRows);
  useEffect(() => { acpRowsRef.current = acpRows; }, [acpRows]);

  // ── Searcher state ────────────────────────────────────────────────────────
  const [query,          setQuery]          = useState('');
  const [dropdownOpen,   setDropdownOpen]   = useState(false);
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [selectedLabel,  setSelectedLabel]  = useState<string | null>(null);
  const searchRef    = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);

  // Portal dropdown position (updated whenever dropdown opens or window resizes)
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);

  const updateDropdownRect = () => {
    if (inputWrapRef.current) {
      setDropdownRect(inputWrapRef.current.getBoundingClientRect());
    }
  };

  // ── Heatmap state ─────────────────────────────────────────────────────────
  const [matrix,    setMatrix]    = useState<number[][] | null>(null);
  const [rowLabels, setRowLabels] = useState<string[]>([]);
  const [colLabels, setColLabels] = useState<string[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // ── Build search entries from acpRowsRef (recomputed on every query change) ─
  // We do NOT use acpRows as a useMemo dep to avoid remounting; instead we read
  // directly from the ref inside the filter so we always see the latest data.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: { id: string; label: string; species: string }[] = [];
    for (const r of acpRowsRef.current) {
      const id = r['ID-replicon'];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, label: r['fullname'] ?? r['full_name'] ?? id, species: r['Species'] ?? '' });
    }
    return out.filter(e =>
      e.id.toLowerCase().includes(q) ||
      e.label.toLowerCase().includes(q) ||
      e.species.toLowerCase().includes(q)
    ).slice(0, 25);
  // acpRowsRef.current is intentionally not in deps — mutations are transparent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── Close dropdown on outside click; update rect on scroll/resize ────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const reposition = () => {
      if (dropdownOpen) updateDropdownRect();
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, { capture: true });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropdownOpen]);

  // ── Load heatmap when selectedId changes ─────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setMatrix(null); setError(null); return; }

    setLoading(true);
    setError(null);
    setMatrix(null);

    const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
    const taxonValue = taxonPath;
    const url = allDataFilePath(dataset, taxonPath, taxonValue, part, repliconFilter);

    fetchCsvText(url)
      .then(text => {
        const result = parseRepliconRow(text, selectedId);
        if (!result) {
          setError(`Replicon "${selectedId}" not found.`);
        } else {
          setMatrix(result.matrix);
          setRowLabels(result.rowLabels);
          setColLabels(result.colLabels);
        }
        setLoading(false);
      })
      .catch((e: unknown) => { setError(String(e)); setLoading(false); });
  }, [dataset, part, repliconFilter, selectedTaxon, selectedTaxonValue, selectedId]);

  // ── Select a replicon ─────────────────────────────────────────────────────
  const select = (id: string, label: string) => {
    setSelectedId(id);
    setSelectedLabel(label);
    setQuery('');
    setDropdownOpen(false);
    onRepliconSelect?.(id);
  };

  // ── Taxonomy info for the selected replicon ───────────────────────────────
  const TAXON_LEVELS    = ['Superdomain', 'Domain', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species'] as const;
  const METADATA_LEVELS = ['ID', 'full_name', 'Replicons_name', 'Replicons_type'] as const;

  const selectedTaxonomy = useMemo(() => {
    if (!selectedId) return null;
    const row = acpRowsRef.current.find(r => r['ID-replicon'] === selectedId);
    if (!row) return null;
    const taxon = TAXON_LEVELS
      .map(level => ({ level: level as string, value: (row[level] ?? '').trim() }))
      .filter(t => t.value !== '');
    const meta = METADATA_LEVELS
      .map(level => ({ level: level as string, value: (row[level] ?? '').trim() }))
      .filter(t => t.value !== '');
    return { taxon, meta };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', gap: 0 }}>

      {/* ── Left panel: searcher ── */}
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
        <div style={{ fontSize: 10, color: '#a8b5ff', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Select replicon
        </div>

        {/* Search input + portal dropdown */}
        <div ref={searchRef}>
          <div ref={inputWrapRef} style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setDropdownOpen(true);
                updateDropdownRect();
              }}
              onFocus={() => {
                setDropdownOpen(true);
                updateDropdownRect();
              }}
              placeholder={acpRowsRef.current.length === 0 ? 'Loading ACP data…' : 'Search name or ID…'}
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
          </div>
          {dropdownOpen && results.length > 0 && dropdownRect && createPortal(
            <div
              style={{
                position: 'fixed',
                top: dropdownRect.bottom + 2,
                left: dropdownRect.left,
                width: dropdownRect.width,
                zIndex: 9999,
                background: '#1a1f35',
                border: '1px solid rgba(102,126,234,0.4)',
                borderRadius: 4,
                maxHeight: 220,
                overflowY: 'auto',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
              {results.map(e => (
                <div
                  key={e.id}
                  onMouseDown={() => select(e.id, e.label)}
                  style={{
                    padding: '5px 8px',
                    cursor: 'pointer',
                    fontSize: 10,
                    borderBottom: '1px solid rgba(102,126,234,0.12)',
                    color: '#c7d2fe',
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(102,126,234,0.18)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.label}
                  </div>
                  <div style={{ opacity: 0.6 }}>{e.id}</div>
                </div>
              ))}
            </div>,
            document.body,
          )}
        </div>

        {/* Current selection */}
        {selectedLabel && (
          <>
            <div style={{ height: 1, background: 'rgba(102,126,234,0.15)', margin: '2px 0' }} />
            <div style={{ fontSize: 10, color: '#86efac', lineHeight: 1.4 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ✓ {selectedLabel}
              </div>
              <div style={{ opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedId}
              </div>
            </div>

            {/* Taxonomy info */}
            {selectedTaxonomy && (selectedTaxonomy.taxon.length > 0 || selectedTaxonomy.meta.length > 0) && (
              <div style={{
                fontSize: 10,
                lineHeight: 1.5,
                padding: '4px 6px',
                borderRadius: 4,
                background: 'rgba(102,126,234,0.07)',
                border: '1px solid rgba(102,126,234,0.15)',
                marginTop: 2,
              }}>
                {selectedTaxonomy.taxon.map(({ level, value }) => (
                  <div key={level} style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
                    <span style={{ color: '#a8b5ff', opacity: 0.6, flexShrink: 0, minWidth: 72 }}>{level}</span>
                    <span style={{ color: '#c7d2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                  </div>
                ))}
                {selectedTaxonomy.taxon.length > 0 && selectedTaxonomy.meta.length > 0 && (
                  <div style={{ height: 1, background: 'rgba(102,126,234,0.18)', margin: '3px 0' }} />
                )}
                {selectedTaxonomy.meta.map(({ level, value }) => (
                  <div key={level} style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>
                    <span style={{ color: '#a8b5ff', opacity: 0.6, flexShrink: 0, minWidth: 72 }}>{level}</span>
                    <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { if (selectedId) onRepliconSelect?.(selectedId); setSelectedId(null); setSelectedLabel(null); setMatrix(null); }}
              style={{
                padding: '2px 7px',
                borderRadius: 3,
                border: '1px solid rgba(102,126,234,0.3)',
                background: 'transparent',
                color: '#a8b5ff',
                cursor: 'pointer',
                fontSize: 10,
                alignSelf: 'flex-start',
              }}
            >
              Clear
            </button>
          </>
        )}

        {/* Hint when nothing selected */}
        {!selectedLabel && (
          <div style={{ fontSize: 10, color: '#a8b5ff', opacity: 0.45, lineHeight: 1.5, marginTop: 4 }}>
            {acpRowsRef.current.length === 0
              ? 'Waiting for ACP data to load…'
              : 'Type to search among all replicons in the current ACP dataset.'}
          </div>
        )}
      </div>

      {/* ── Right panel: heatmap ── */}
      <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, height: '100%' }}>
        {!selectedId && (
          <div
            className="plot-card-placeholder"
            style={{ cursor: 'text' }}
            onClick={() => inputRef.current?.focus()}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span>Search and select a replicon to display its heatmap</span>
          </div>
        )}
        {selectedId && loading && (
          <div className="plot-card-placeholder"><span>Loading heatmap…</span></div>
        )}
        {selectedId && error && (
          <div className="plot-card-placeholder">
            <span style={{ color: '#f87171' }}>{error}</span>
          </div>
        )}
        {selectedId && !loading && !error && matrix && (
          <Plot
            data={[{
              type: 'heatmap',
              z: matrix,
              x: colLabels,
              y: rowLabels,
              colorscale: HEATMAP_COLORSCALE,
              zmin: -1,
              zmax: 2,
              showscale: true,
              hoverongaps: false,
              hovertemplate: 'Arm %{x} | HC %{y}<br>value: %{z:.4f}<extra></extra>',
            }]}
            layout={{
              margin: { t: 8, r: 60, b: 40, l: 44 },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { color: '#a8b5ff', size: 11 },
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

export default HeatmapRepliconSelector;
