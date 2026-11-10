/**
 * server.ts — serves the interface and proxies the design API.
 *
 * Two processes, one address:
 *
 *   :8000  the design and manufacturability API (Python, owns the chemistry)
 *   :3000  this server — the interface, and a proxy to :8000
 *
 * The browser only ever talks to :3000, so there is no CORS to configure
 * and no second URL for anyone to remember. In development Vite runs in
 * middleware mode for hot reloading; in production the built assets in
 * dist/ are served instead.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const DESIGN_ORIGIN = process.env.DESIGN_ORIGIN ?? 'http://localhost:8000';

app.use(express.json({ limit: '120mb' })); // receptor uploads arrive as base64

/**
 * Paths owned by the Python service. Everything else is the interface.
 * Listed explicitly rather than matched by prefix, so a new page route can
 * never be swallowed by the proxy.
 */
const DESIGN_PATHS = [
  '/status',
  '/method',
  '/targets',
  '/target',
  '/target/select',
  '/run',
  '/manufacture',
  '/eval',
  '/stop',
  '/pose',
  '/voids',
  '/screen',
  '/receptor',
  '/svg',
  '/chembl/actives',
  '/chembl/analogues',
  '/run_log.json',
  '/manufacture_report.json',
  '/eval_results.json',
  '/candidates.csv',
  '/export.json',
];

async function proxy(req: express.Request, res: express.Response) {
  const url = DESIGN_ORIGIN + req.originalUrl;
  try {
    const init: RequestInit = { method: req.method };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(req.body ?? {});
    }
    const upstream = await fetch(url, init);
    const type = upstream.headers.get('content-type');
    const disposition = upstream.headers.get('content-disposition');
    if (type) res.setHeader('content-type', type);
    if (disposition) res.setHeader('content-disposition', disposition);
    res.status(upstream.status);
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({
      ok: false,
      error:
        `the design service is not running at ${DESIGN_ORIGIN} — ` +
        `start both halves with ./start.sh, or run it alone with ` +
        `"cd loop && python3 serve.py"`,
    });
  }
}

for (const designPath of DESIGN_PATHS) {
  app.all(designPath, proxy);
}

async function start() {
  if (process.env.NODE_ENV === 'production') {
    const dist = path.join(__dirname, 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`  bioREACT interface : http://localhost:${PORT}`);
    console.log(`  design API         : ${DESIGN_ORIGIN} (proxied)`);
  });
}

start();
