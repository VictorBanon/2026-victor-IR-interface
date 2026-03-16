import { useState, useEffect } from 'react';

export type CardSize = 'square' | 'rectangle' | 'full'; // 1×1 | 2×1 | 3×2

interface PlotCardProps {
  id: string;
  title: string;
  size: CardSize;
  filePath?: string;         // source file URL for download + path popup
  onRemove: (id: string) => void;
  children?: React.ReactNode;
}

// ── Download helper ───────────────────────────────────────────────────────────
async function downloadFile(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function PlotCard({ id, title, size, filePath, onRemove, children }: PlotCardProps) {
  const [maximized,    setMaximized]    = useState(false);
  const [showPathInfo, setShowPathInfo] = useState(false);
  const [dlError,      setDlError]      = useState<string | null>(null);

  // When the card is maximized/restored the CSS grid span changes and Plotly
  // needs to re-measure its container. Fire a synthetic resize after the
  // browser has committed the new layout (two rAF ticks).
  useEffect(() => {
    let rafId: number;
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [maximized]);

  const filename = filePath ? filePath.split('/').pop() ?? 'data.csv.gz' : 'data.csv.gz';

  function handleDownload() {
    if (!filePath) return;
    setDlError(null);
    downloadFile(filePath, filename).catch(e => setDlError(String(e)));
  }

  // ── Shared header actions ─────────────────────────────────────────────────
  function Actions({ isMaximized }: { isMaximized: boolean }) {
    return (
      <div className="plot-card-actions">
        {/* Download */}
        <button
          className="plot-card-btn"
          title={filePath ? `Download ${filename}` : 'No file available'}
          disabled={!filePath}
          onClick={handleDownload}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        {/* File path info */}
        <button
          className="plot-card-btn"
          title="Show file path"
          disabled={!filePath}
          onClick={() => setShowPathInfo(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </button>

        {/* Maximize / Minimize */}
        {isMaximized ? (
          <button className="plot-card-btn" title="Minimize" onClick={() => setMaximized(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 14 10 14 10 20"/>
              <polyline points="20 10 14 10 14 4"/>
              <line x1="10" y1="14" x2="3" y2="21"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
            </svg>
          </button>
        ) : (
          <button className="plot-card-btn" title="Maximize" onClick={() => setMaximized(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        )}

        {/* Remove */}
        <button className="plot-card-btn plot-card-btn--danger" title="Remove plot" onClick={() => onRemove(id)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* ── Path info popup ── */}
      {showPathInfo && (
        <div className="plot-info-backdrop" onClick={() => setShowPathInfo(false)}>
          <div className="plot-info-modal" onClick={e => e.stopPropagation()}>
            <div className="plot-info-modal-header">
              <span>Source file</span>
              <button className="plot-info-close" onClick={() => setShowPathInfo(false)}>✕</button>
            </div>
            <div className="plot-info-modal-body">
              <p className="plot-info-title">{title}</p>
              <code className="plot-info-path">{filePath}</code>
              <p className="plot-info-filename">
                <strong>File:</strong> {filename}
              </p>
            </div>
            <div className="plot-info-modal-footer">
              <button className="plot-info-dl-btn" onClick={() => { handleDownload(); setShowPathInfo(false); }}>
                Download file
              </button>
              <button className="plot-info-cancel-btn" onClick={() => setShowPathInfo(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Download error toast ── */}
      {dlError && (
        <div className="plot-dl-error" onClick={() => setDlError(null)}>
          ⚠ {dlError}
        </div>
      )}

      {/* ── Card (normal or maximized — same element, different CSS class) ── */}
      <div className={`plot-card plot-card--${maximized ? 'maximized' : size}`}>
        <div className="plot-card-header">
          <span className="plot-card-title">{title}</span>
          <Actions isMaximized={maximized} />
        </div>
        <div className="plot-card-body">
          {children ?? (
            <div className="plot-card-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
              <span>{title}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default PlotCard;
