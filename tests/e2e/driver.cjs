// Мини-драйвер: статический сервер + Edge без окна + управление через DevTools Protocol.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function serve(port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

async function launch({ port = 8765, cdp = 9333, width = 1280, height = 900, attach = false } = {}) {
  // attach: подключиться к уже запущенному браузеру/окну приложения (отладочный порт), ничего не запуская
  const srv = attach ? null : await serve(port);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-e2e-'));
  const edge = attach ? null : spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${cdp}`, `--user-data-dir=${dir}`, `--window-size=${width},${height}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${cdp}/json`)).json(); if (targets.find(t => t.type === 'page' && (!attach || /127.0.0.1|localhost/.test(t.url)))) break; } catch { /* ещё стартует */ }
    await new Promise(r => setTimeout(r, 250));
  }
  const page = targets.find(t => t.type === 'page' && (!attach || /127.0.0.1|localhost/.test(t.url)));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/net::ERR_/.test(m.params.entry.text + (m.params.entry.url || ''))) errors.push('log ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');

  const api = {
    errors,
    base: `http://127.0.0.1:${port}`,
    addInitScript: src => send('Page.addScriptToEvaluateOnNewDocument', { source: src }),
    goto: async url => { await send('Page.navigate', { url }); await new Promise(r => setTimeout(r, 600)); },
    eval: async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    waitFor: async (expr, timeout = 60000, label = expr) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) { if (await api.eval(`!!(${expr})`)) return true; await new Promise(r => setTimeout(r, 300)); }
      throw new Error('timeout waiting for: ' + label);
    },
    shot: async file => { await new Promise(r => setTimeout(r, 900)); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    resize: (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }),
    close: async () => { try { ws.close(); } catch {} if (edge) edge.kill(); if (srv) srv.close(); await new Promise(r => setTimeout(r, 300)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
  return api;
}
module.exports = { launch };
