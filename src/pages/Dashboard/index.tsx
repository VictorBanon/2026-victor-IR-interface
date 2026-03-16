import { useReducer, useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardSidebar from './DashboardSidebar';
import type { SidebarState, SidebarAction, VisiblePlots } from './DashboardSidebar';
import PlotCard from './PlotCard';
import type { CardSize } from './PlotCard';
import HeatmapMatrix from './HeatmapMatrix';
import HeatmapMinMax from './HeatmapMinMax';
import AxisChart from './AxisChart';
import ScatterAcp from './ScatterAcp';
import RepliconMatrix from './RepliconMatrix';
import PcSelectorHeatmap from './PcSelectorHeatmap';
import PcWeightedSum from './PcWeightedSum';
import ExplainedVariance from './ExplainedVariance';
import PcVsAll from './PcVsAll';
import HeatmapRepliconSelector from './HeatmapRepliconSelector';
import PatternCountHeatmap from './PatternCountHeatmap';
import Top10Heatmap from './Top10Heatmap';
import StudyParameters from './StudyParameters';
import { hcFilePath, acpFilePath, pcFilePath, allDataFilePath, explainedVarianceFilePath, pcSelectorFilePath, patternCountFilePath, top10FilePath, taxon_path_get } from './dataUtils';
import './Dashboard.css';

// ── Sidebar reducer ───────────────────────────────────────────────────────────

const initialSidebarState: SidebarState = {
  dataSourceOpen: false,
  analysisOptionsOpen: true,
  filtersOpen: false,
  visualizationOpen: false,
  plotsManagementOpen: false,
  configurationOpen: false,
  selectedFolder: '14k',
  partValue: 'all',
  xAxis: 'PC1',
  yAxis: 'PC2',
  sizeColumn: '',
  colorColumn: 'Domain',
  repliconFilter: '',
  pointSizeScale: 1,
  taxonFilters: [],
  loadedAcpRows: [],
  topN: 5,
  customRules: [],
  testValue: 'hc',
  selectedTaxon: '',
  selectedTaxonValue: '',
  availableTaxonValues: [],
  visiblePlots: {
    main: true,
    matrix: true,
    patternCount: false,
    top10: false,
    studyParameters: false,
    xAxis: false,
    yAxis: false,
    mean: false,
    median: false,
    min: false,
    max: false,
    pcSelector: false,
    pcCombined: false,
    explainedVariance: false,
    pcvsAll: false,
    heatmapReplicon: false,
  },
};

function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case 'TOGGLE_SECTION':
      return { ...state, [action.section]: !state[action.section] };
    case 'SET_FOLDER':
      return { ...state, selectedFolder: action.value };
    case 'SET_PART':
      return { ...state, partValue: action.value };
    case 'SET_X_AXIS':
      return { ...state, xAxis: action.value };
    case 'SET_Y_AXIS':
      return { ...state, yAxis: action.value };
    case 'SET_SIZE_COLUMN':
      return { ...state, sizeColumn: action.value };
    case 'SET_COLOR_COLUMN':
      return { ...state, colorColumn: action.value };
    case 'SET_REPLICON_FILTER':
      return { ...state, repliconFilter: action.value };
    case 'SET_POINT_SIZE_SCALE':
      return { ...state, pointSizeScale: action.value };
    case 'ADD_TAXON_FILTER':
      if (state.taxonFilters.includes(action.tag)) return state;
      return { ...state, taxonFilters: [...state.taxonFilters, action.tag] };
    case 'REMOVE_TAXON_FILTER':
      return { ...state, taxonFilters: state.taxonFilters.filter(t => t !== action.tag) };
    case 'CLEAR_TAXON_FILTERS':
      return { ...state, taxonFilters: [] };
    case 'SET_LOADED_ACP_ROWS':
      return { ...state, loadedAcpRows: action.value };
    case 'SET_TAX_SEARCH':
    case 'SET_ROW_FILTER':
    case 'CLEAR_ROW_FILTERS':
      return state; // no-op, kept for compat
    case 'SET_TOP_N':
      return { ...state, topN: action.value };
    case 'ADD_CUSTOM_RULE':
      return { ...state, customRules: [...state.customRules, action.rule] };
    case 'REMOVE_CUSTOM_RULE':
      return { ...state, customRules: state.customRules.filter(r => r.id !== action.id) };
    case 'UPDATE_CUSTOM_RULE':
      return { ...state, customRules: state.customRules.map(r => r.id === action.rule.id ? action.rule : r) };
    case 'SET_TEST_VALUE':
      return { ...state, testValue: action.value };
    case 'SET_TAXON':
      return { ...state, selectedTaxon: action.value };
    case 'SET_TAXON_VALUE':
      return { ...state, selectedTaxonValue: action.value };
    case 'SET_AVAILABLE_TAXON_VALUES':
      return { ...state, availableTaxonValues: action.value };
    case 'TOGGLE_PLOT':
      return {
        ...state,
        visiblePlots: {
          ...state.visiblePlots,
          [action.plot]: !state.visiblePlots[action.plot],
        },
      };
    default:
      return state;
  }
}

// ── Plot definitions ──────────────────────────────────────────────────────────

type PlotKey = keyof VisiblePlots & string;

interface PlotDef {
  key: PlotKey;
  title: string;
  size: CardSize;
}

const PLOT_DEFS: PlotDef[] = [
  { key: 'main',            title: 'ACP Scatter Plot',        size: 'rectangle' },
  { key: 'studyParameters', title: 'Study Parameters',        size: 'square'    },
  { key: 'mean',            title: 'Mean Heatmap',            size: 'square'    },
  { key: 'median',          title: 'Median Heatmap',          size: 'square'    },
  { key: 'min',             title: 'Min Values Heatmap',      size: 'square'    },
  { key: 'max',             title: 'Max Values Heatmap',      size: 'square'    },
  { key: 'matrix',          title: 'Replicon Matrix',         size: 'square'    },
  { key: 'patternCount',    title: 'Pattern Count Heatmap',         size: 'square'    },
  { key: 'top10',           title: 'Top-10 Pattern Ratio Heatmap',  size: 'square'    },
  { key: 'xAxis',           title: 'X Axis Chart',            size: 'square'    },
  { key: 'yAxis',           title: 'Y Axis Chart',            size: 'square'    },
  { key: 'pcCombined',      title: 'PC Weighted Sum',              size: 'rectangle' },
  { key: 'explainedVariance', title: 'Explained Variance',         size: 'square'    },
  { key: 'pcSelector',      title: 'PC Selector Heatmap',         size: 'rectangle' },
  { key: 'pcvsAll',         title: 'PC vs All Grid (10×10)',       size: 'full'      },
  { key: 'heatmapReplicon', title: 'Heatmap Replicon Selector',   size: 'rectangle' },
];

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const [sidebarState, sidebarDispatch] = useReducer(sidebarReducer, initialSidebarState);
  const {
    visiblePlots, selectedFolder, partValue, repliconFilter,
    selectedTaxon, selectedTaxonValue, xAxis, yAxis, testValue, colorColumn,
    sizeColumn, pointSizeScale, topN, customRules,
    taxonFilters, loadedAcpRows,
  } = sidebarState;

  // ── Bootstrap from URL search params (e.g. ?dataset=14k&replicons=chr_GCA_1,chr_GCA_2) ──
  const [searchParams] = useSearchParams();
  const [selectedReplicons, setSelectedReplicons] = useState<string[]>(() => {
    const raw = searchParams.get('replicons') ?? '';
    return raw ? raw.split(',').filter(Boolean) : [];
  });

  // ID-replicon → fullname, populated when ScatterAcp loads its CSV
  const [repliconLabels, setRepliconLabels] = useState<Record<string, string>>({});

  // Apply dataset from URL once on mount
  useEffect(() => {
    const ds = searchParams.get('dataset');
    if (ds === '14k' || ds === '60_cla') {
      sidebarDispatch({ type: 'SET_FOLDER', value: ds });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRepliconSelect = useCallback((id: string) => {
    setSelectedReplicons(prev => {
      if (prev.includes(id)) return prev.filter(r => r !== id);
      return [...prev, id];
    });
  }, []);

  const plotProps = useMemo(
    () => ({ dataset: selectedFolder, part: partValue, repliconFilter, selectedTaxon, selectedTaxonValue }),
    [selectedFolder, partValue, repliconFilter, selectedTaxon, selectedTaxonValue],
  );

  const handleRemove = useCallback((id: string) => {
    sidebarDispatch({ type: 'TOGGLE_PLOT', plot: id as PlotKey });
  }, []);

  // ── Pre-compute source file paths for each plot ───────────────────────────
  const taxonPath  = taxon_path_get(selectedTaxon, selectedTaxonValue);
  const taxonValue = taxonPath; // stub — always 'Prokaryote'

  const PC_COLS = new Set(['PC1','PC2','PC3','PC4','PC5','PC6','PC7','PC8','PC9','PC10']);

  const acpPath  = acpFilePath(selectedFolder, taxonPath, taxonValue, testValue, partValue, repliconFilter);
  const evType   = partValue === 'cod' ? 'hc_cod' : partValue === 'non' ? 'hc_non' : 'hc_all';
  const hcPaths: Partial<Record<PlotKey, string>> = {
    main:             acpPath,
    mean:             hcFilePath(selectedFolder, taxonPath, taxonValue, partValue, 'mean',    repliconFilter),
    median:           hcFilePath(selectedFolder, taxonPath, taxonValue, partValue, 'median',  repliconFilter),
    min:              hcFilePath(selectedFolder, taxonPath, taxonValue, partValue, 'min_max', repliconFilter),
    max:              hcFilePath(selectedFolder, taxonPath, taxonValue, partValue, 'min_max', repliconFilter),
    xAxis:            PC_COLS.has(xAxis) ? pcFilePath(selectedFolder, taxonPath, taxonValue, xAxis, partValue, repliconFilter) : acpPath,
    yAxis:            PC_COLS.has(yAxis) ? pcFilePath(selectedFolder, taxonPath, taxonValue, yAxis, partValue, repliconFilter) : acpPath,
    explainedVariance: explainedVarianceFilePath(selectedFolder, taxonPath, taxonValue, evType, repliconFilter),
    pcSelector:       pcSelectorFilePath(selectedFolder, taxonPath, taxonValue, 'PC0', 'hc_all'),
    pcCombined:       acpFilePath(selectedFolder, taxonPath, taxonValue, 'hc', 'all', ''),
    pcvsAll:          acpPath,
    heatmapReplicon:  allDataFilePath(selectedFolder, taxonPath, taxonPath, partValue, repliconFilter),
    patternCount:     patternCountFilePath(selectedFolder, taxonPath, taxonPath, partValue, repliconFilter),
    top10:            top10FilePath(selectedFolder, taxonPath, taxonPath, partValue, repliconFilter),
  };

  // ── Static plot content (does NOT depend on selectedReplicons) ────────────
  // Memoized so that changing selectedReplicons never remounts these plots.
  const staticPlotContent = useMemo<Partial<Record<PlotKey, React.ReactNode>>>(() => ({
    mean:        <HeatmapMatrix     {...plotProps} stat="mean"   title="Mean Heatmap"   />,
    median:      <HeatmapMatrix     {...plotProps} stat="median" title="Median Heatmap" />,
    studyParameters: <StudyParameters dataset={selectedFolder} />,
    min:         <HeatmapMinMax     {...plotProps} which="min"   title="Min Values"     />,
    max:         <HeatmapMinMax     {...plotProps} which="max"   title="Max Values"     />,
    xAxis:       <AxisChart         {...plotProps} testValue={testValue} column={xAxis} />,
    yAxis:       <AxisChart         {...plotProps} testValue={testValue} column={yAxis} />,
    pcSelector:        <PcSelectorHeatmap      {...plotProps} />,
    explainedVariance: <ExplainedVariance      {...plotProps} />,
    pcvsAll:           <PcVsAll               {...plotProps} testValue={testValue} colorColumn={colorColumn} topN={topN} rowFilters={taxonFilters} />,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [plotProps, testValue, xAxis, yAxis, colorColumn, topN, taxonFilters]);

  // ── PC Weighted Sum + Heatmap Replicon Selector — separate memo so ────────
  // loadedAcpRows updates don't remount these components.
  const heatmapRepliconContent = useMemo(() => (
    <HeatmapRepliconSelector {...plotProps} acpRows={loadedAcpRows} onRepliconSelect={handleRepliconSelect} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [plotProps, loadedAcpRows, handleRepliconSelect]);

  const pcCombinedContent = useMemo(() => (
    <PcWeightedSum {...plotProps} acpRows={loadedAcpRows} />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [plotProps, loadedAcpRows]);

  // ── Scatter (depends on selectedReplicons for highlight overlay) ──────────
  const scatterContent = useMemo(() => (
    <ScatterAcp
      {...plotProps}
      testValue={testValue}
      xAxis={xAxis}
      yAxis={yAxis}
      colorColumn={colorColumn}
      sizeColumn={sizeColumn}
      pointSizeScale={pointSizeScale}
      topN={topN}
      customRules={customRules}
      rowFilters={taxonFilters}
      onRepliconSelect={handleRepliconSelect}
      selectedReplicons={selectedReplicons}
      onRowsLoaded={(labels, rows) => {
        setRepliconLabels(labels);
        sidebarDispatch({ type: 'SET_LOADED_ACP_ROWS', value: rows });
      }}
    />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [plotProps, testValue, xAxis, yAxis, colorColumn, sizeColumn, pointSizeScale, topN, customRules, handleRepliconSelect, selectedReplicons, taxonFilters]);

  const plotContent: Partial<Record<PlotKey, React.ReactNode>> = {
    main: scatterContent,
    heatmapReplicon: heatmapRepliconContent,
    pcCombined: pcCombinedContent,
    ...staticPlotContent,
  };

  // matrix, patternCount and top10 plots are shown as one card per selected replicon (dynamic)
  const activePlots = PLOT_DEFS.filter(p => p.key !== 'matrix' && p.key !== 'patternCount' && p.key !== 'top10' && visiblePlots[p.key]);

  return (
    <div className="dashboard-container">
      <DashboardSidebar
        state={sidebarState}
        dispatch={sidebarDispatch}
      />

      <main className="dashboard-main">
        <div className="plots-grid">
          {activePlots.length === 0 && !(visiblePlots.matrix && selectedReplicons.length > 0) && !(visiblePlots.patternCount && selectedReplicons.length > 0) && !(visiblePlots.top10 && selectedReplicons.length > 0) ? (
            <div className="plots-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              <p>No plots selected. Enable plots in <strong>Manage Plots</strong>.</p>
            </div>
          ) : (
            <>
              {/* ── ACP Scatter ── */}
              {activePlots.filter(p => p.key === 'main').map(p => (
                <PlotCard
                  key={String(p.key)}
                  id={String(p.key)}
                  title={p.title}
                  size={p.size}
                  filePath={hcPaths[p.key]}
                  onRemove={handleRemove}
                >
                  {plotContent[p.key]}
                </PlotCard>
              ))}

              {/* ── Replicon Matrix cards (one per selected point) ── */}
              {visiblePlots.matrix && selectedReplicons.map((repId, idx) => {
                const fullname = repliconLabels[repId];
                const title = fullname ?? `Replicon Matrix ${idx + 1}`;
                const matrixFilePath = allDataFilePath(selectedFolder, taxonPath, taxonPath, partValue, repliconFilter);
                return (
                  <PlotCard
                    key={`matrix-${repId}`}
                    id={`matrix-${repId}`}
                    title={title}
                    size="square"
                    filePath={matrixFilePath}
                    onRemove={() => setSelectedReplicons(prev => prev.filter(r => r !== repId))}
                  >
                    <RepliconMatrix {...plotProps} selectedReplicon={repId} label={fullname} />
                  </PlotCard>
                );
              })}

              {/* ── Pattern Count Heatmap cards (one per selected point) ── */}
              {visiblePlots.patternCount && selectedReplicons.map((repId, idx) => {
                const fullname = repliconLabels[repId];
                const title = fullname ? `Pattern Count — ${fullname}` : `Pattern Count ${idx + 1}`;
                const patCountPath = patternCountFilePath(selectedFolder, taxonPath, taxonPath, partValue, repliconFilter);
                return (
                  <PlotCard
                    key={`patternCount-${repId}`}
                    id={`patternCount-${repId}`}
                    title={title}
                    size="square"
                    filePath={patCountPath}
                    onRemove={() => setSelectedReplicons(prev => prev.filter(r => r !== repId))}
                  >
                    <PatternCountHeatmap {...plotProps} selectedReplicon={repId} label={fullname} />
                  </PlotCard>
                );
              })}

              {/* ── Top-10 Pattern Ratio Heatmap cards (one per selected point) ── */}
              {visiblePlots.top10 && selectedReplicons.map((repId, idx) => {
                const fullname = repliconLabels[repId];
                const title = fullname ? `Top-10 Patterns — ${fullname}` : `Top-10 Patterns ${idx + 1}`;
                const top10Path = top10FilePath(selectedFolder, taxonPath, taxonPath, partValue, repliconFilter);
                return (
                  <PlotCard
                    key={`top10-${repId}`}
                    id={`top10-${repId}`}
                    title={title}
                    size="square"
                    filePath={top10Path}
                    onRemove={() => setSelectedReplicons(prev => prev.filter(r => r !== repId))}
                  >
                    <Top10Heatmap {...plotProps} selectedReplicon={repId} label={fullname} />
                  </PlotCard>
                );
              })}

              {/* ── Heatmaps and remaining plots ── */}
              {activePlots.filter(p => p.key !== 'main').map(p => (
                <PlotCard
                  key={String(p.key)}
                  id={String(p.key)}
                  title={p.title}
                  size={p.size}
                  filePath={hcPaths[p.key]}
                  onRemove={handleRemove}
                >
                  {plotContent[p.key]}
                </PlotCard>
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
