import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL;

// Fields to hide (internal server paths, not useful to display)
const HIDDEN_KEYS = new Set(['output_path', 'input_path']);

// Human-readable labels
const LABELS: Record<string, string> = {
  files:          'Files',
  replica_number: 'Replicas',
  name_output:    'Dataset name',
  split_mode:     'Split mode',
  pipeline_mode:  'Pipeline mode',
  n_jobs:         'Parallel jobs',
  replicons:      'Replicons filter',
  sample_size:    'Sample size',
  min_ir_size:    'Min arm size',
  max_ir_size:    'Max arm size',
  max_gap:        'Max gap',
  max_mismatch:   'Max mismatch',
  output_format:  'Output format',
};

interface Props {
  dataset: string;
}

type ParamValue = string | number | boolean | null;

function StudyParameters({ dataset }: Props) {
  const [params,  setParams]  = useState<Record<string, ParamValue> | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setParams(null);

    fetch(`${BASE}data/${dataset}/parameters.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Record<string, ParamValue>>;
      })
      .then(data => { setParams(data); setLoading(false); })
      .catch((e: unknown) => { setError(String(e)); setLoading(false); });
  }, [dataset]);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    padding: '12px 16px',
    boxSizing: 'border-box',
    overflowY: 'auto',
    color: '#a8b5ff',
    fontFamily: 'inherit',
    fontSize: 13,
  };

  if (loading) return (
    <div className="plot-card-placeholder"><span>Loading parameters…</span></div>
  );
  if (error) return (
    <div className="plot-card-placeholder">
      <span style={{ color: '#f87171' }}>Error: {error}</span>
    </div>
  );
  if (!params) return null;

  const rows = Object.entries(params).filter(([k]) => !HIDDEN_KEYS.has(k));

  return (
    <div style={containerStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key} style={{ borderBottom: '1px solid rgba(102,126,234,0.15)' }}>
              <td style={{
                padding: '6px 12px 6px 0',
                fontWeight: 600,
                color: '#667eea',
                whiteSpace: 'nowrap',
                width: '40%',
              }}>
                {LABELS[key] ?? key}
              </td>
              <td style={{ padding: '6px 0', color: '#e2e8f0' }}>
                {value === -1 ? 'all'
                  : value === null ? '—'
                  : String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default StudyParameters;
