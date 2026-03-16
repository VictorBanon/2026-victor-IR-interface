# article_webv3 — Build & Deployment Guide

## Requirements

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Python 3** (for the preprocessing scripts that run before build)

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Local development

```bash
npm run dev
```

This will:
1. Run the preprocessing scripts (`scripts/preprocess-acp.mjs` and `scripts/preprocess_scatter.py`) to generate optimised `.json.gz` data files from the raw CSVs
2. Start the Vite dev server at **http://localhost:5173**

The app hot-reloads on any source file change. Data files in `public/` are served directly.

---

## 3. Production build

```bash
npm run build
```

This will:
1. Run the same preprocessing scripts
2. Type-check all TypeScript (`tsc -b`)
3. Bundle and minify everything into **`dist/`**

The `dist/` folder is fully self-contained and static — no server-side code is needed.

### Base URL (sub-path deployment)

The app is currently configured to be served from a sub-path. This is set in `vite.config.ts`:

```ts
export default defineConfig({
  base: '/projects/sirig/',   // ← change this to match your deployment URL
  plugins: [react()],
})
```

| Deployment scenario | `base` value |
|---|---|
| Served at root (`https://example.com/`) | `'/'` |
| Served at a sub-path (`https://example.com/projects/sirig/`) | `'/projects/sirig/'` |
| GitHub Pages at `https://user.github.io/repo/` | `'/repo/'` |

After changing `base`, re-run `npm run build`.

---

## 4. Preview the production build locally

```bash
npm run preview
```

Serves the `dist/` folder locally at **http://localhost:4173** so you can verify the production build before deploying.

---

## 5. Deploy

The `dist/` folder can be deployed to any static file host. Copy its contents to the server root (or sub-path matching `base`).

### Nginx

```nginx
server {
    listen 80;
    server_name example.com;

    # Sub-path deployment matching base: '/projects/sirig/'
    location /projects/sirig/ {
        alias /var/www/article_webv3/dist/;
        index index.html;
        try_files $uri $uri/ /projects/sirig/index.html;
    }

    # Enable gzip transfer for .csv.gz data files
    location ~* \.csv\.gz$ {
        alias /var/www/article_webv3/dist/;
        add_header Content-Encoding gzip;
        add_header Content-Type text/plain;
    }
}
```

> **Important — `.csv.gz` files:** The app decompresses data files client-side using the
> browser's `DecompressionStream` API. If your server sends `.csv.gz` files with the
> `Content-Encoding: gzip` header, the browser decompresses them transparently.
> If it does **not** set that header, the app decompresses them manually.
> Either mode works, but setting the header is more efficient.

### Apache

```apache
Alias /projects/sirig/ /var/www/article_webv3/dist/

<Directory /var/www/article_webv3/dist/>
    Options -Indexes
    AllowOverride All
    Require all granted

    # SPA fallback — redirect all non-file requests to index.html
    FallbackResource /projects/sirig/index.html
</Directory>

# Serve .csv.gz as gzip-encoded plain text
<FilesMatch "\.csv\.gz$">
    AddEncoding gzip .gz
    ForceType text/plain
</FilesMatch>
```

### GitHub Pages

1. Set `base` in `vite.config.ts` to `'/your-repo-name/'`
2. Run `npm run build`
3. Push the contents of `dist/` to the `gh-pages` branch (or use the `dist/` folder as the GitHub Pages source)

---

## 6. Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Preprocess data + start dev server |
| `npm run build` | Preprocess data + type-check + production bundle → `dist/` |
| `npm run preview` | Serve `dist/` locally for inspection |
| `npm run lint` | Run ESLint across all source files |
| `node scripts/preprocess-acp.mjs` | Regenerate `.json.gz` ACP files only |
| `python3 scripts/preprocess_scatter.py` | Regenerate scatter pre-processed data only |
