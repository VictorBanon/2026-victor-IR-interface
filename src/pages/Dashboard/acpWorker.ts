/**
 * acpWorker.ts
 *
 * Web Worker that fetches and parses an ACP JSON.gz (or CSV.gz fallback)
 * entirely off the main thread.
 *
 * Message in:  { url: string }
 * Message out: { ok: true,  header: string[], rows: string[][] }
 *            | { ok: false, error: string }
 */

async function decompress(buffer: ArrayBuffer): Promise<string> {
  const ds     = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(new Uint8Array(buffer));
  writer.close();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (value) chunks.push(value);
    done = d;
  }
  const total  = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(merged);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} – ${url}`);
  const enc          = res.headers.get('Content-Encoding');
  const alreadyGunzipped = enc === 'gzip' || enc === 'br';
  if (url.endsWith('.gz') && !alreadyGunzipped) {
    return decompress(await res.arrayBuffer());
  }
  return res.text();
}

function csvToArrays(text: string): { header: string[]; rows: string[][] } {
  const lines  = text.trim().split('\n');
  const header = lines[0].replace(/\r$/, '').split(',').map(h => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].replace(/\r$/, '');
    if (l) rows.push(l.split(',').map(v => v.trim()));
  }
  return { header, rows };
}

self.onmessage = async (e: MessageEvent<{ url: string }>) => {
  const csvUrl  = e.data.url;
  const jsonUrl = csvUrl.replace(/\.csv(\.gz)?$/, '.json.gz');

  try {
    // Try pre-processed JSON first (zero CSV parsing)
    let result: { header: string[]; rows: string[][] };
    try {
      const text = await fetchText(jsonUrl);
      result = JSON.parse(text) as { header: string[]; rows: string[][] };
    } catch {
      // Fallback to CSV
      const text = await fetchText(csvUrl);
      result = csvToArrays(text);
    }
    self.postMessage({ ok: true, header: result.header, rows: result.rows });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
