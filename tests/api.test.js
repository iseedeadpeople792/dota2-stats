const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../web/api.js');

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null };
}
const res = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: k => headers[k.toLowerCase()] } });

function setup(responses, extra = {}) {
  const calls = [];
  let i = 0, clock = 1_000_000;
  const fetchFn = async url => { calls.push(url); const r = responses[Math.min(i++, responses.length - 1)]; if (r instanceof Error) throw r; return r; };
  const sleeps = [];
  const api = createApi({ fetchFn, storage: extra.storage ?? memStorage(), now: () => clock, sleep: async ms => { sleeps.push(ms); clock += ms; }, getKey: () => extra.key ?? '' });
  return { api, calls, sleeps, advance: ms => (clock += ms) };
}

test('второй запрос того же пути берётся из кэша', async () => {
  const { api, calls } = setup([res([1, 2, 3])]);
  assert.deepEqual(await api.get('/heroes'), [1, 2, 3]);
  assert.deepEqual(await api.get('/heroes'), [1, 2, 3]);
  assert.equal(calls.length, 1);
});

test('кэш переживает перезапуск (читается из хранилища) и протухает', async () => {
  const storage = memStorage();
  const a = setup([res({ v: 1 })], { storage });
  await a.api.get('/players/1/wl');
  const b = setup([res({ v: 2 })], { storage });           // «новый запуск»: память пуста, хранилище то же
  assert.deepEqual(await b.api.get('/players/1/wl'), { v: 1 });
  assert.equal(b.calls.length, 0);
  b.advance(10 * 60e3);                                     // /players/ живёт 5 минут
  assert.deepEqual(await b.api.get('/players/1/wl'), { v: 2 });
});

test('одинаковые одновременные запросы объединяются', async () => {
  const { api, calls } = setup([res({ ok: 1 })]);
  const [x, y] = await Promise.all([api.get('/heroes/1/matchups'), api.get('/heroes/1/matchups')]);
  assert.deepEqual(x, y);
  assert.equal(calls.length, 1);
});

test('429 повторяется с паузой, потом успех', async () => {
  const { api, calls, sleeps } = setup([res(null, 429, { 'retry-after': '2' }), res({ ok: 1 })]);
  assert.deepEqual(await api.get('/players/9/wl'), { ok: 1 });
  assert.equal(calls.length, 2);
  assert.ok(sleeps.includes(2000));                         // уважает Retry-After
});

test('постоянный 429 даёт понятное сообщение про лимит', async () => {
  const { api } = setup([res(null, 429)]);
  await assert.rejects(api.get('/players/9/wl', { tries: 2 }), /ограничила число запросов/);
});

test('404 не повторяется и бросает "404"', async () => {
  const { api, calls } = setup([res(null, 404)]);
  await assert.rejects(api.get('/matches/1'), /404/);
  assert.equal(calls.length, 1);
});

test('сетевая ошибка повторяется', async () => {
  const { api, calls } = setup([new Error('net'), res({ ok: 1 })]);
  assert.deepEqual(await api.get('/players/2/wl'), { ok: 1 });
  assert.equal(calls.length, 2);
});

test('API-ключ добавляется к адресу', async () => {
  const { api, calls } = setup([res({}), res({})], { key: 'abc 1' });
  await api.get('/heroes');
  await api.get('/players/1/wl?limit=5');
  assert.ok(calls[0].endsWith('/heroes?api_key=abc%201'));
  assert.ok(calls[1].endsWith('/players/1/wl?limit=5&api_key=abc%201'));
});

test('shrink урезает данные до записи в кэш', async () => {
  const storage = memStorage();
  const { api } = setup([res([{ a: 1, big: 'x'.repeat(100) }])], { storage });
  await api.get('/heroes/3/matchups', { shrink: d => d.map(({ a }) => ({ a })) });
  assert.ok(!storage.getItem('od:/heroes/3/matchups').includes('xxxx'));
});

test('переполнение хранилища не ломает запрос', async () => {
  const storage = memStorage();
  storage.setItem = () => { throw new Error('QuotaExceeded'); };
  const { api } = setup([res({ ok: 1 })], { storage });
  assert.deepEqual(await api.get('/heroes'), { ok: 1 });
});

test('запросы идут по очереди с паузой между ними', async () => {
  const { api, sleeps } = setup([res({ n: 1 }), res({ n: 2 })]);
  await Promise.all([api.get('/players/1/a'), api.get('/players/1/b')]);
  assert.ok(sleeps.some(ms => ms > 0 && ms <= 450));
});
