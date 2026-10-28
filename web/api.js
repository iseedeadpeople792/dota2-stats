// Клиент OpenDota: очередь запросов с паузой, повторы при 429, кэш со сроком жизни, свой API-ключ.
(function (root) {
  const core = typeof require !== 'undefined' ? require('./core.js') : root.Core;

  function createApi({ fetchFn, storage, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)), base = 'https://api.opendota.com/api', getKey = () => '' } = {}) {
    const mem = new Map();          // путь -> { t, data }
    const inflight = new Map();     // путь -> Promise (одинаковые запросы делим)
    let chain = Promise.resolve(), lastAt = 0;

    const PREFIX = 'od:';
    function readCache(path) {
      const hit = mem.get(path);
      const ttl = core.ttlFor(path);
      if (hit && now() - hit.t < ttl) return hit;
      try {
        const raw = storage && storage.getItem(PREFIX + path);
        if (raw) { const o = JSON.parse(raw); if (now() - o.t < ttl) { mem.set(path, o); return o; } }
      } catch { /* битый кэш не должен ломать приложение */ }
      return null;
    }
    function writeCache(path, data) {
      const o = { t: now(), data };
      mem.set(path, o);
      try { storage && storage.setItem(PREFIX + path, JSON.stringify(o)); }
      catch { try { clearCache(true); storage.setItem(PREFIX + path, JSON.stringify(o)); } catch { /* нет места: работаем из памяти */ } }
    }
    function clearCache(onlyStorage) {
      if (!onlyStorage) mem.clear();
      try {
        if (!storage) return;
        const keys = [];
        for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
        keys.forEach(k => storage.removeItem(k));
      } catch { /* ignore */ }
    }

    // последовательная очередь: между запросами пауза (с ключом короче)
    function schedule(task) {
      const run = chain.then(async () => {
        const gap = getKey() ? 120 : 450;
        const wait = lastAt + gap - now();
        if (wait > 0) await sleep(wait);
        try { return await task(); } finally { lastAt = now(); }
      });
      chain = run.catch(() => {});
      return run;
    }

    async function fetchJson(path, tries) {
      const key = getKey();
      const url = base + path + (key ? (path.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(key) : '');
      let lastStatus = 0;
      for (let i = 0; i < tries; i++) {
        let r;
        try { r = await schedule(() => fetchFn(url)); } catch { r = null; }
        if (r && r.ok) { try { return await r.json(); } catch { /* пустое тело под нагрузкой */ } }
        else if (r && r.status === 404) throw new Error('404');
        else if (r) lastStatus = r.status;
        const retryAfter = r && Number(r.headers && r.headers.get && r.headers.get('retry-after'));
        await sleep(retryAfter ? retryAfter * 1000 : 1500 * 2 ** i);
      }
      throw new Error(lastStatus === 429
        ? 'OpenDota ограничила число запросов. Подожди минуту или добавь свой API-ключ в настройках (⚙).'
        : 'OpenDota не отвечает, попробуй чуть позже.');
    }

    // shrink: оставить только нужные поля, чтобы кэш не раздувался
    async function get(path, { tries = 3, shrink, fresh = false } = {}) {
      if (!fresh) { const hit = readCache(path); if (hit) return hit.data; }
      if (inflight.has(path)) return inflight.get(path);
      const p = fetchJson(path, tries).then(data => {
        const out = shrink ? shrink(data) : data;
        writeCache(path, out);
        return out;
      }).finally(() => inflight.delete(path));
      inflight.set(path, p);
      return p;
    }

    return { get, clearCache };
  }

  const exported = { createApi };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.ApiFactory = exported;
})(typeof window !== 'undefined' ? window : globalThis);
