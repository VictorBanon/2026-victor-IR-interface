/**
 * scripts/preprocess-acp.mjs
 *
 * Converts every  hc_acp_*.csv  in public/data/  into a  hc_acp_*.json.gz
 * containing a compact array-of-arrays payload:
 *
 *   { header: string[], rows: string[][] }
 *
 * Storing rows as arrays (not objects) removes the 32-column key overhead
 * from every row, shrinking the payload ~40 % and eliminating all CSV
 * parsing work in the browser (only JSON.parse remains).
 *
 * Usage:
 *   node scripts/preprocess-acp.mjs
 *
 * The script is idempotent – it skips a target if it already exists and
 * is newer than the source.  Pass --force to always regenerate.
 */

import { createReadStream, createWriteStream, statSync, existsSync, readFileSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..', 'public', 'data');
const FORCE     = process.argv.includes('--force');

// ── helpers ──────────────────────────────────────────────────────────────────

function readPlainText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function parseCsv(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  const header = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    rows.push(lines[i].split(',').map(v => v.trim()));
  }
  return { header, rows };
}

async function writeJsonGz(filePath, data) {
  const json    = JSON.stringify(data);
  const dest    = createWriteStream(filePath);
  const gzip    = createGzip({ level: 9 });
  gzip.pipe(dest);
  gzip.write(json);
  gzip.end();
  await new Promise((res, rej) => { dest.on('finish', res); dest.on('error', rej); });
}

function isOutdated(srcPath, destPath) {
  if (!existsSync(destPath)) return true;
  const srcMtime  = statSync(srcPath).mtimeMs;
  const destMtime = statSync(destPath).mtimeMs;
  return srcMtime > destMtime;
}

// ── walk public/data/ and collect hc_acp_*.csv files ─────────────────────────

async function findAcpFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...await findAcpFiles(full));
    } else if (e.isFile() && e.name.startsWith('hc_acp_') && e.name.endsWith('.csv')) {
      results.push(full);
    }
  }
  return results;
}

// ── main ──────────────────────────────────────────────────────────────────────

const files = await findAcpFiles(ROOT);
console.log(`Found ${files.length} hc_acp_*.csv file(s) under ${ROOT}\n`);

let converted = 0, skipped = 0;

for (const srcPath of files) {
  const destPath = srcPath.replace(/\.csv$/, '.json.gz');

  if (!FORCE && !isOutdated(srcPath, destPath)) {
    console.log(`  skip  ${srcPath.replace(ROOT, '')}`);
    skipped++;
    continue;
  }

  process.stdout.write(`  conv  ${srcPath.replace(ROOT, '')} … `);
  const t0   = Date.now();
  const text = readPlainText(srcPath);
  const data = parseCsv(text);
  await writeJsonGz(destPath, data);
  const ms   = Date.now() - t0;
  const kb   = Math.round(statSync(destPath).size / 1024);
  console.log(`done (${data.rows.length} rows → ${kb} KB, ${ms} ms)`);
  converted++;
}

console.log(`\nDone: ${converted} converted, ${skipped} skipped.`);
