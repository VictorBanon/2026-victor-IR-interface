import { useRef, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { AcpRow } from './dataUtils';
import type { DatasetType } from '../Home/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const PART_VALUES = ['all', 'non', 'cod'] as const;
const PART_LABELS: Record<string, string> = {
  all: 'Complete genome',
  non: 'Intergenic Part',
  cod: 'Gene part',
};
const DATASET_LABELS: Record<string, string> = {
  '14k': '14k Prokaryote',
  '60_cla': '60 Prokaryote sampled 100 individuals',
};
const AXIS_COLUMNS = [
  'PC1', 'PC2', 'PC3', 'PC4', 'PC5',
  'PC6', 'PC7', 'PC8', 'PC9', 'PC10',
  'GC', 'size', 'Coding size', 'Non-coding size',
  'coding_percentage', 'non_coding_percentage', 'overlap_percentage',
];
const SIZE_COLUMNS = [
  'size', 'Coding size', 'Non-coding size', 'GC',
  'coding_percentage', 'non_coding_percentage', 'overlap', 'overlap_percentage',
];
const COLOR_COLUMNS = [
  'GC', 'size', 'Coding size', 'Non-coding size',
  'coding_percentage', 'non_coding_percentage', 'overlap', 'overlap_percentage',
  'Superdomain', 'Domain', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species',
];
const TEST_VALUE_CATEGORIES: Record<string, string[]> = {
  Structural: ['ha', 'hb', 'hc'],
  Compositional: ['kmer', 'karling', '6mer'],
  Spatial: ['local', 'replicon', 'gene'],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisiblePlots {
  main: boolean;
  matrix: boolean;
  patternCount: boolean;
  top10: boolean;
  studyParameters: boolean;
  xAxis: boolean;
  yAxis: boolean;
  mean: boolean;
  median: boolean;
  min: boolean;
  max: boolean;
  pcSelector: boolean;
  pcCombined: boolean;
  explainedVariance: boolean;
  pcvsAll: boolean;
  heatmapReplicon: boolean;
}

// ── Custom visualization rule ─────────────────────────────────────────────
export interface CustomRule {
  id: string;
  label: string;       // display name for the trace
  column: string;      // which column to match
  value: string;       // value to match (substring)
  color: string;       // hex color
  symbol: string;      // plotly marker symbol name
}

export interface SidebarState {
  dataSourceOpen: boolean;
  analysisOptionsOpen: boolean;
  filtersOpen: boolean;
  visualizationOpen: boolean;
  plotsManagementOpen: boolean;
  configurationOpen: boolean;
  selectedFolder: DatasetType;
  partValue: string;
  xAxis: string;
  yAxis: string;
  sizeColumn: string;
  colorColumn: string;
  repliconFilter: string;
  pointSizeScale: number;
  taxonFilters: string[];   // active "Column:value" tags — OR logic
  loadedAcpRows: AcpRow[];  // populated by ScatterAcp for autocomplete
  topN: number;             // show top N-1 groups + "Others"
  customRules: CustomRule[];
  testValue: string;
  selectedTaxon: string;
  selectedTaxonValue: string;
  availableTaxonValues: string[];
  visiblePlots: VisiblePlots;
}

export type SidebarAction =
  | { type: 'TOGGLE_SECTION'; section: keyof Pick<SidebarState, 'dataSourceOpen' | 'analysisOptionsOpen' | 'filtersOpen' | 'visualizationOpen' | 'plotsManagementOpen' | 'configurationOpen'> }
  | { type: 'SET_FOLDER'; value: DatasetType }
  | { type: 'SET_PART'; value: string }
  | { type: 'SET_X_AXIS'; value: string }
  | { type: 'SET_Y_AXIS'; value: string }
  | { type: 'SET_SIZE_COLUMN'; value: string }
  | { type: 'SET_COLOR_COLUMN'; value: string }
  | { type: 'SET_REPLICON_FILTER'; value: string }
  | { type: 'SET_POINT_SIZE_SCALE'; value: number }
  | { type: 'ADD_TAXON_FILTER'; tag: string }
  | { type: 'REMOVE_TAXON_FILTER'; tag: string }
  | { type: 'CLEAR_TAXON_FILTERS' }
  | { type: 'SET_LOADED_ACP_ROWS'; value: AcpRow[] }
  | { type: 'SET_TAX_SEARCH'; value: string }  // kept for compat, no-op
  | { type: 'SET_ROW_FILTER'; column: string; value: string }  // kept for compat, no-op
  | { type: 'CLEAR_ROW_FILTERS' }  // kept for compat, no-op
  | { type: 'SET_TOP_N'; value: number }
  | { type: 'ADD_CUSTOM_RULE'; rule: CustomRule }
  | { type: 'REMOVE_CUSTOM_RULE'; id: string }
  | { type: 'UPDATE_CUSTOM_RULE'; rule: CustomRule }
  | { type: 'SET_TEST_VALUE'; value: string }
  | { type: 'SET_TAXON'; value: string }
  | { type: 'SET_TAXON_VALUE'; value: string }
  | { type: 'SET_AVAILABLE_TAXON_VALUES'; value: string[] }
  | { type: 'TOGGLE_PLOT'; plot: keyof VisiblePlots };

interface DashboardSidebarProps {
  state: SidebarState;
  dispatch: React.Dispatch<SidebarAction>;
}

// ── Filterable taxonomy columns (used for autocomplete suggestions) ────────
const FILTER_COLUMNS = [
  'Superdomain','Domain','Phylum','Class','Order',
  'Family','Genus','Species','full_name','ID-replicon',
] as const;

// ── Single autocomplete input that builds "Column:value" tag suggestions ──────
interface TaxonFilterInputProps {
  rows: AcpRow[];
  activeTags: string[];
  onAdd: (tag: string) => void;
}

function TaxonFilterInput({ rows, activeTags, onAdd }: TaxonFilterInputProps) {
  const [query, setQuery]     = useState('');
  const [open,  setOpen]      = useState(false);
  const wrapRef               = useRef<HTMLDivElement>(null);
  const activeSet             = useMemo(() => new Set(activeTags), [activeTags]);

  // Build "Column:value" suggestions matching the current query
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: string[] = [];
    const seen = new Set<string>();

    for (const col of FILTER_COLUMNS) {
      for (const r of rows) {
        const v = (r[col] ?? '').trim();
        if (!v) continue;
        const tag = `${col}:${v}`;
        if (seen.has(tag) || activeSet.has(tag)) continue;
        // match against "col:val", "col", or "val"
        if (q === '' || tag.toLowerCase().includes(q) || v.toLowerCase().includes(q) || col.toLowerCase().includes(q)) {
          seen.add(tag);
          out.push(tag);
          if (out.length >= 40) break;
        }
      }
      if (out.length >= 40) break;
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [rows, query, activeSet]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const commit = (tag: string) => {
    onAdd(tag);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Type taxon or column…"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '5px 8px', borderRadius: 4,
          border: '1px solid rgba(102,126,234,0.35)',
          background: 'rgba(102,126,234,0.08)',
          color: '#e2e8f0', fontSize: 11, outline: 'none',
        }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#1a1f35', border: '1px solid rgba(102,126,234,0.4)',
          borderRadius: 4, maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}>
          {suggestions.map(tag => {
            const colon = tag.indexOf(':');
            const col   = tag.slice(0, colon);
            const val   = tag.slice(colon + 1);
            return (
              <div
                key={tag}
                onMouseDown={() => commit(tag)}
                style={{
                  padding: '5px 8px', cursor: 'pointer', fontSize: 11,
                  borderBottom: '1px solid rgba(102,126,234,0.1)',
                  display: 'flex', gap: 6, alignItems: 'baseline',
                }}
                onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(102,126,234,0.18)')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: '#a78bfa', flexShrink: 0 }}>{col}</span>
                <span style={{ color: '#c7d2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Add Custom Rule form ──────────────────────────────────────────────────────

const RULE_COLUMNS = [
  'Superdomain','Domain','Phylum','Class','Order',
  'Family','Genus','Species','full_name','ID-replicon',
] as const;

const PLOTLY_SYMBOLS = [
  'circle','square','diamond','cross','x',
  'triangle-up','triangle-down','triangle-left','triangle-right',
  'star','hexagram','pentagon',
] as const;

interface AddRuleFormProps {
  rows: AcpRow[];
  onAdd: (rule: CustomRule) => void;
}

function AddRuleForm({ rows, onAdd }: AddRuleFormProps) {
  const [open,    setOpen]    = useState(false);
  const [col,     setCol]     = useState<string>(RULE_COLUMNS[1]); // Domain
  const [value,   setValue]   = useState('');
  const [label,   setLabel]   = useState('');
  const [color,   setColor]   = useState('#f87171');
  const [symbol,  setSymbol]  = useState<string>('circle');
  const [dropOpen,setDropOpen]= useState(false);
  const wrapRef               = useRef<HTMLDivElement>(null);

  // Value suggestions for current column
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      const v = (r[col] ?? '').trim();
      if (!v || seen.has(v)) continue;
      if (!q || v.toLowerCase().includes(q)) { seen.add(v); out.push(v); }
      if (out.length >= 30) break;
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [rows, col, value]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const commit = () => {
    if (!value.trim()) return;
    onAdd({
      id: `${Date.now()}`,
      label: label.trim() || `${col}: ${value}`,
      column: col,
      value: value.trim(),
      color,
      symbol,
    });
    setValue(''); setLabel(''); setOpen(false);
  };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        width: '100%', padding: '5px 0', borderRadius: 5, fontSize: 11,
        border: '1px dashed rgba(102,126,234,0.4)',
        background: 'transparent', color: '#a78bfa', cursor: 'pointer',
      }}
    >+ Add custom trace</button>
  );

  return (
    <div style={{
      padding: '8px', borderRadius: 6,
      border: '1px solid rgba(102,126,234,0.35)',
      background: 'rgba(102,126,234,0.07)',
      marginTop: 4,
    }}>
      <div style={{ fontSize: 10, color: '#a8b5ff', fontWeight: 600, marginBottom: 6 }}>New custom trace</div>

      {/* Column selector */}
      <div style={{ marginBottom: 5 }}>
        <div style={{ fontSize: 9, color: 'rgba(168,181,255,0.6)', marginBottom: 2 }}>Column</div>
        <select
          value={col}
          onChange={e => { setCol(e.target.value); setValue(''); }}
          className="data-dropdown"
          style={{ width: '100%', fontSize: 11 }}
        >
          {RULE_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Value input with autocomplete */}
      <div ref={wrapRef} style={{ marginBottom: 5, position: 'relative' }}>
        <div style={{ fontSize: 9, color: 'rgba(168,181,255,0.6)', marginBottom: 2 }}>Value (substring match)</div>
        <input
          value={value}
          onChange={e => { setValue(e.target.value); setDropOpen(true); }}
          onFocus={() => setDropOpen(true)}
          placeholder={`e.g. Bacteria…`}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '4px 7px',
            borderRadius: 4, border: '1px solid rgba(102,126,234,0.35)',
            background: 'rgba(102,126,234,0.08)', color: '#e2e8f0', fontSize: 11, outline: 'none',
          }}
        />
        {dropOpen && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400,
            background: '#1a1f35', border: '1px solid rgba(102,126,234,0.4)',
            borderRadius: 4, maxHeight: 140, overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}>
            {suggestions.map(s => (
              <div
                key={s}
                onMouseDown={() => { setValue(s); setDropOpen(false); if (!label) setLabel(s); }}
                style={{
                  padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: '#c7d2fe',
                  borderBottom: '1px solid rgba(102,126,234,0.1)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(102,126,234,0.18)')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
              >{s}</div>
            ))}
          </div>
        )}
      </div>

      {/* Label */}
      <div style={{ marginBottom: 5 }}>
        <div style={{ fontSize: 9, color: 'rgba(168,181,255,0.6)', marginBottom: 2 }}>Trace label (optional)</div>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Auto from value…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '4px 7px',
            borderRadius: 4, border: '1px solid rgba(102,126,234,0.35)',
            background: 'rgba(102,126,234,0.08)', color: '#e2e8f0', fontSize: 11, outline: 'none',
          }}
        />
      </div>

      {/* Color + Symbol row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: 'rgba(168,181,255,0.6)', marginBottom: 2 }}>Color</div>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ width: '100%', height: 28, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0 }}
          />
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 9, color: 'rgba(168,181,255,0.6)', marginBottom: 2 }}>Symbol</div>
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="data-dropdown"
            style={{ width: '100%', fontSize: 11 }}
          >
            {PLOTLY_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onMouseDown={commit}
          disabled={!value.trim()}
          style={{
            flex: 1, padding: '5px 0', borderRadius: 4, fontSize: 11, cursor: 'pointer',
            background: value.trim() ? 'rgba(102,126,234,0.35)' : 'rgba(102,126,234,0.1)',
            border: '1px solid rgba(102,126,234,0.5)', color: '#c7d2fe',
          }}
        >Add</button>
        <button
          onClick={() => setOpen(false)}
          style={{
            padding: '5px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
          }}
        >Cancel</button>
      </div>
    </div>
  );
}


// ── Component ─────────────────────────────────────────────────────────────────

function DashboardSidebar({ state, dispatch }: DashboardSidebarProps) {
  const {
    dataSourceOpen, analysisOptionsOpen, filtersOpen,
    visualizationOpen, plotsManagementOpen, configurationOpen,
    selectedFolder, partValue,
    xAxis, yAxis, sizeColumn, colorColumn, repliconFilter, pointSizeScale,
    taxonFilters, loadedAcpRows, topN, customRules,
    testValue, selectedTaxon, selectedTaxonValue, availableTaxonValues,
    visiblePlots,
  } = state;

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">

        {/* ── Data Source ── */}
        <div className="sidebar-section">
          <button className="sidebar-collapse-btn"
            onClick={() => dispatch({ type: 'TOGGLE_SECTION', section: 'dataSourceOpen' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <span>Data Source</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`collapse-icon ${dataSourceOpen ? 'open' : ''}`}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {dataSourceOpen && (
            <div className="filter-group">
              <div className="filter-item">
                <div className="filter-header"><span>Dataset</span></div>
                <div className="dropdown-container">
                  <select className="data-dropdown" value={selectedFolder}
                    onChange={e => dispatch({ type: 'SET_FOLDER', value: e.target.value as DatasetType })}>
                    {Object.entries(DATASET_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="filter-item">
                <div className="filter-header"><span>Part</span></div>
                <div className="dropdown-container">
                  <select className="data-dropdown" value={partValue}
                    onChange={e => dispatch({ type: 'SET_PART', value: e.target.value })}>
                    {PART_VALUES.map(p => <option key={p} value={p}>{PART_LABELS[p]}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Analysis Options ── */}
        <div className="sidebar-section">
          <button className="sidebar-collapse-btn"
            onClick={() => dispatch({ type: 'TOGGLE_SECTION', section: 'analysisOptionsOpen' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <span>Analysis Options</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`collapse-icon ${analysisOptionsOpen ? 'open' : ''}`}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {analysisOptionsOpen && (
            <div className="filter-group">
              <div className="filter-item">
                <div className="filter-header"><span>X Axis</span></div>
                <div className="dropdown-container">
                  <select className="data-dropdown" value={xAxis}
                    onChange={e => dispatch({ type: 'SET_X_AXIS', value: e.target.value })}>
                    {AXIS_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="filter-item">
                <div className="filter-header"><span>Y Axis</span></div>
                <div className="dropdown-container">
                  <select className="data-dropdown" value={yAxis}
                    onChange={e => dispatch({ type: 'SET_Y_AXIS', value: e.target.value })}>
                    {AXIS_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="filter-item">
                <div className="filter-header"><span>Size</span></div>
                <div className="dropdown-container">
                  <select className="data-dropdown" value={sizeColumn}
                    onChange={e => dispatch({ type: 'SET_SIZE_COLUMN', value: e.target.value })}>
                    <option value="">Default (Fixed)</option>
                    {SIZE_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="filter-item">
                <div className="filter-header"><span>Color</span></div>
                <div className="dropdown-container">
                  <select className="data-dropdown" value={colorColumn}
                    onChange={e => dispatch({ type: 'SET_COLOR_COLUMN', value: e.target.value })}>
                    <option value="">Default (By Group)</option>
                    {COLOR_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="filter-item">
                <div className="filter-header"><span>Replicon</span></div>
                <div className="dropdown-container">
                  <select className="data-dropdown" value={repliconFilter}
                    onChange={e => dispatch({ type: 'SET_REPLICON_FILTER', value: e.target.value })}>
                    <option value="">All (Default)</option>
                    <option value="chromosome">Chromosome Only</option>
                    <option value="plasmid">Plasmid Only</option>
                  </select>
                </div>
              </div>
              <div className="filter-item">
                <div className="filter-header"><span>Point Size</span></div>
                <div className="dropdown-container">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="range" min={0.3} max={2} step={0.1} value={pointSizeScale}
                      onChange={e => dispatch({ type: 'SET_POINT_SIZE_SCALE', value: parseFloat(e.target.value) })}
                      style={{ flex: 1 }} />
                    <div style={{ width: 48, textAlign: 'right' }}>{pointSizeScale.toFixed(1)}x</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Filters ── */}
        <div className="sidebar-section">
          <button className="sidebar-collapse-btn"
            onClick={() => dispatch({ type: 'TOGGLE_SECTION', section: 'filtersOpen' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <span>Filters</span>
            {taxonFilters.length > 0 && (
              <span style={{
                marginLeft: 4, background: '#667eea', color: '#fff',
                borderRadius: 8, fontSize: 9, padding: '1px 5px', fontWeight: 700,
              }}>
                {taxonFilters.length}
              </span>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`collapse-icon ${filtersOpen ? 'open' : ''}`}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {filtersOpen && (
            <div style={{ padding: '8px 10px' }}>

              {/* Active tag chips */}
              {taxonFilters.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {taxonFilters.map(tag => {
                    const colon = tag.indexOf(':');
                    const col   = tag.slice(0, colon);
                    const val   = tag.slice(colon + 1);
                    return (
                      <div key={tag} style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        background: 'rgba(102,126,234,0.15)',
                        border: '1px solid rgba(102,126,234,0.35)',
                        borderRadius: 12, padding: '2px 6px 2px 7px',
                        fontSize: 10, maxWidth: '100%',
                      }}>
                        <span style={{ color: '#a78bfa', flexShrink: 0 }}>{col}:</span>
                        <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{val}</span>
                        <button
                          onMouseDown={() => dispatch({ type: 'REMOVE_TAXON_FILTER', tag })}
                          style={{
                            background: 'transparent', border: 'none', color: '#f87171',
                            cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1,
                            flexShrink: 0, marginLeft: 1,
                          }}
                          title="Remove"
                        >×</button>
                      </div>
                    );
                  })}
                  <button
                    onMouseDown={() => dispatch({ type: 'CLEAR_TAXON_FILTERS' })}
                    style={{
                      background: 'transparent', border: '1px solid rgba(239,68,68,0.35)',
                      borderRadius: 12, color: '#f87171', cursor: 'pointer',
                      fontSize: 9, padding: '2px 7px',
                    }}
                  >clear all</button>
                </div>
              )}

              {/* Single autocomplete input */}
              <TaxonFilterInput
                rows={loadedAcpRows}
                activeTags={taxonFilters}
                onAdd={tag => dispatch({ type: 'ADD_TAXON_FILTER', tag })}
              />

              {taxonFilters.length === 0 && (
                <div style={{ fontSize: 10, color: 'rgba(168,181,255,0.4)', marginTop: 8, lineHeight: 1.4 }}>
                  Type a taxon name or column to filter. Any matching tag will include the row (OR logic).
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Visualization ── */}
        <div className="sidebar-section">
          <button className="sidebar-collapse-btn"
            onClick={() => dispatch({ type: 'TOGGLE_SECTION', section: 'visualizationOpen' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6"></path>
              <path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24"></path>
              <path d="m19.07 4.93-4.24 4.24m-5.66 5.66-4.24 4.24"></path>
            </svg>
            <span>Visualization</span>
            {customRules.length > 0 && (
              <span style={{
                marginLeft: 4, background: '#a78bfa', color: '#fff',
                borderRadius: 8, fontSize: 9, padding: '1px 5px', fontWeight: 700,
              }}>{customRules.length}</span>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`collapse-icon ${visualizationOpen ? 'open' : ''}`}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {visualizationOpen && (
            <div style={{ padding: '8px 10px' }}>

              {/* Top N */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#a8b5ff', marginBottom: 4 }}>
                  Show top groups (by count)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range" min={1} max={20} step={1} value={topN}
                    onChange={e => dispatch({ type: 'SET_TOP_N', value: parseInt(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ width: 24, textAlign: 'right', fontSize: 11, color: '#e2e8f0' }}>{topN}</span>
                </div>
                <div style={{ fontSize: 9, color: 'rgba(168,181,255,0.45)', marginTop: 2 }}>
                  Top {topN - 1} groups shown individually; rest grouped as "Others"
                </div>
              </div>

              {/* Custom rules list */}
              {customRules.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#a8b5ff', marginBottom: 4 }}>Custom traces</div>
                  {customRules.map(rule => (
                    <div key={rule.id} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      marginBottom: 4, padding: '4px 6px',
                      background: 'rgba(102,126,234,0.08)',
                      border: '1px solid rgba(102,126,234,0.2)',
                      borderRadius: 5,
                    }}>
                      {/* colour swatch */}
                      <div style={{
                        width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                        background: rule.color, border: '1px solid rgba(255,255,255,0.2)',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rule.label}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(168,181,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rule.column}: {rule.value}
                        </div>
                      </div>
                      <button
                        onMouseDown={() => dispatch({ type: 'REMOVE_CUSTOM_RULE', id: rule.id })}
                        style={{
                          background: 'transparent', border: 'none', color: '#f87171',
                          cursor: 'pointer', fontSize: 13, padding: 0, flexShrink: 0,
                        }}
                        title="Remove rule"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add custom rule form */}
              <AddRuleForm rows={loadedAcpRows} onAdd={rule => dispatch({ type: 'ADD_CUSTOM_RULE', rule })} />
            </div>
          )}
        </div>

        {/* ── Manage Plots ── */}
        <div className="sidebar-section">
          <button className="sidebar-collapse-btn"
            onClick={() => dispatch({ type: 'TOGGLE_SECTION', section: 'plotsManagementOpen' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>Manage Plots</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`collapse-icon ${plotsManagementOpen ? 'open' : ''}`}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {plotsManagementOpen && (
            <div className="plots-list">
              <div className="plot-category">
                <div className="category-title">Main Plots</div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.main}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'main' })} />
                  <span>ACP Scatter Plot</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.studyParameters}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'studyParameters' })} />
                  <span>Study Parameters</span>
                </label></div>
              </div>
              <div className="plot-category">
                <div className="category-title">Point Analysis</div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.matrix}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'matrix' })} />
                  <span>Replicon Matrix (on click)</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.patternCount}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'patternCount' })} />
                  <span>Pattern Count Heatmap (on click)</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.top10}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'top10' })} />
                  <span>Top-10 Pattern Ratio Heatmap (on click)</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.heatmapReplicon}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'heatmapReplicon' })} />
                  <span>Heatmap Replicon Selector</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.xAxis}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'xAxis' })} />
                  <span>X Axis Chart</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.yAxis}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'yAxis' })} />
                  <span>Y Axis Chart</span>
                </label></div>
              </div>
              <div className="plot-category">
                <div className="category-title">COD Heatmaps</div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.mean}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'mean' })} />
                  <span>Mean Heatmap</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.median}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'median' })} />
                  <span>Median Heatmap</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.min}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'min' })} />
                  <span>Min Values Heatmap</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.max}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'max' })} />
                  <span>Max Values Heatmap</span>
                </label></div>
              </div>
              <div className="plot-category">
                <div className="category-title">PC Analysis</div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.pcCombined}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'pcCombined' })} />
                  <span>PC Weighted Sum</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.explainedVariance}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'explainedVariance' })} />
                  <span>Explained Variance</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.pcSelector}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'pcSelector' })} />
                  <span>PC Selector Heatmap</span>
                </label></div>
                <div className="plot-item"><label className="plot-checkbox">
                  <input type="checkbox" checked={visiblePlots.pcvsAll}
                    onChange={() => dispatch({ type: 'TOGGLE_PLOT', plot: 'pcvsAll' })} />
                  <span>PC vs All Grid (10×10)</span>
                </label></div>
              </div>
            </div>
          )}
        </div>

        {/* ── Other / Configuration ── */}
        <div className="sidebar-section">
          <button className="sidebar-collapse-btn"
            onClick={() => dispatch({ type: 'TOGGLE_SECTION', section: 'configurationOpen' })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6m5.66-13.66l-4.24 4.24m0 6.84l4.24 4.24M23 12h-6m-6 0H1m18.66 5.66l-4.24-4.24m0-6.84l4.24-4.24"></path>
            </svg>
            <span>Other</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`collapse-icon ${configurationOpen ? 'open' : ''}`}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {configurationOpen && (
            <div className="sidebar-content">
              <div className="filter-group">
                <div className="filter-item">
                  <div className="filter-header"><span>Analysis</span></div>
                  <div className="dropdown-container">
                    <select className="data-dropdown" value={testValue}
                      onChange={e => dispatch({ type: 'SET_TEST_VALUE', value: e.target.value })}>
                      {Object.entries(TEST_VALUE_CATEGORIES).map(([cat, vals]) => (
                        <optgroup key={cat} label={cat}>
                          {vals.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="filter-item">
                  <div className="filter-header"><span>Taxon</span></div>
                  <div className="dropdown-container">
                    <select className="data-dropdown" value={selectedTaxon}
                      onChange={e => {
                        dispatch({ type: 'SET_TAXON', value: e.target.value });
                        dispatch({ type: 'SET_TAXON_VALUE', value: '' });
                      }}>
                      <option value="">Select Taxon</option>
                      {['Superdomain','Domain','Phylum','Class','Order','Family','Genus','Species'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="filter-item">
                  <div className="filter-header"><span>Taxon Value</span></div>
                  <div className="dropdown-container">
                    <select className="data-dropdown" value={selectedTaxonValue}
                      onChange={e => dispatch({ type: 'SET_TAXON_VALUE', value: e.target.value })}
                      disabled={!selectedTaxon || availableTaxonValues.length === 0}>
                      <option value="">
                        {!selectedTaxon ? 'Select a taxon first'
                          : availableTaxonValues.length === 0 ? 'Loading...'
                          : 'Select Value'}
                      </option>
                      {availableTaxonValues.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <button className="save-config-btn" title="Save current configuration" style={{ marginTop: '16px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                <span>Save Configuration</span>
              </button>
              <button className="save-config-btn" title="Show paths of loaded data files" style={{ marginTop: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                  <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <span>Show File Paths</span>
              </button>
            </div>
          )}
        </div>

      </nav>

      <div className="sidebar-footer">
        <Link to="/" className="sidebar-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span>Back to Home</span>
        </Link>
      </div>
    </aside>
  );
}

export default DashboardSidebar;
