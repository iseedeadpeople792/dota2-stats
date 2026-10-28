const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../web/pickcore.js');

const heroes = [
  { id: 1, localized_name: 'A', roles: ['Carry'] },
  { id: 2, localized_name: 'B', roles: ['Support', 'Disabler'] },
  { id: 3, localized_name: 'C', roles: ['Carry', 'Durable'] },
  { id: 9, localized_name: 'Enemy', roles: ['Carry'] },
];
// враг 9 побеждает героя 1 в 70% из 400 игр, героя 2 в 40%, героя 3 в 50%
const rows = new Map([[1, { games_played: 400, wins: 280 }], [2, { games_played: 400, wins: 160 }], [3, { games_played: 400, wins: 200 }]]);
const base = { heroes, taken: new Set([9]), role: '', enemyRows: [{ e: 9, rows }], mine: new Map(), useMine: true, meta: null, bracket: null };

test('лучший ответ на врага — тот, кто его чаще побеждает', () => {
  const r = P.suggest(base);
  assert.deepEqual(r.top.map(x => x.h.id), [2, 3, 1]);
  assert.ok(r.top[0].score > 0.5 && r.top[2].score < 0.5);
});

test('занятые герои и фильтр роли исключаются', () => {
  assert.ok(!P.suggest(base).top.some(x => x.h.id === 9));
  assert.deepEqual(P.suggest({ ...base, role: 'Support' }).top.map(x => x.h.id), [2]);
});

test('малая выборка не даёт «100%» — сглаживание', () => {
  const tiny = new Map([[1, { games_played: 3, wins: 0 }]]);              // враг проиграл все 3 игры
  const r = P.suggest({ ...base, enemyRows: [{ e: 9, rows: tiny }] });
  const a = r.top.find(x => x.h.id === 1);
  assert.ok(a.per[0].wr < 0.7);
  assert.equal(a.best, null);                                             // 3 игры — не «показательная» пара
});

test('«почему»: лучшая и худшая пара ищутся среди пар с достаточной выборкой', () => {
  const e2 = new Map([[1, { games_played: 200, wins: 60 }]]);             // кандидат 1 побеждает 2-го врага в 70%
  const r = P.suggest({ ...base, enemyRows: [{ e: 9, rows }, { e: 8, rows: e2 }] });
  const a = r.top.find(x => x.h.id === 1);
  assert.equal(a.best.e, 8);
  assert.equal(a.worst.e, 9);
});

test('личная статистика слегка двигает оценку и зависит от числа игр', () => {
  const none = P.suggest(base).top.find(x => x.h.id === 1).score;
  const good = P.suggest({ ...base, mine: new Map([[1, { games: 30, win: 25 }]]) }).top.find(x => x.h.id === 1).score;
  const few = P.suggest({ ...base, mine: new Map([[1, { games: 2, win: 2 }]]) }).top.find(x => x.h.id === 1).score;
  assert.ok(good > none && good - none <= 0.35 * 0.5 + 1e-9);
  assert.ok(few - none < good - none);
  assert.equal(P.suggest({ ...base, useMine: false, mine: new Map([[1, { games: 30, win: 25 }]]) }).top.find(x => x.h.id === 1).score, none);
});

test('поправка на ранг: герой сильнее на вашем ранге получает плюс', () => {
  const meta = new Map([[1, { '4_pick': 5000, '4_win': 2750, '5_pick': 5000, '5_win': 2250 }]]);
  const lo = P.suggest({ ...base, meta, bracket: 4 }).top.find(x => x.h.id === 1);
  const hi = P.suggest({ ...base, meta, bracket: 5 }).top.find(x => x.h.id === 1);
  assert.ok(lo.rankShift > 0 && hi.rankShift < 0);
  assert.equal(P.suggest({ ...base, meta, bracket: null }).top.find(x => x.h.id === 1).rankShift, 0);
});

test('мало данных помечается', () => {
  const few = new Map([[1, { games_played: 10, wins: 5 }]]);
  assert.equal(P.suggest({ ...base, enemyRows: [{ e: 9, rows: few }] }).lowData, true);
  assert.equal(P.suggest(base).lowData, false);
});

test('список «не брать» — худшие по оценке', () => {
  assert.equal(P.suggest(base).avoid[0].h.id, 1);
});

test('лимиты групп и запрет дублей', () => {
  const st = { allies: [1, 2, 3, 4], enemies: [], bans: [] };
  assert.equal(P.canAdd(st, 'allies', 5), false);       // 4 союзника — предел
  assert.equal(P.canAdd(st, 'enemies', 5), true);
  assert.equal(P.canAdd(st, 'enemies', 1), false);      // уже выбран
});

test('missingRoles', () => {
  const by = { 1: { roles: ['Carry'] }, 2: { roles: ['Support', 'Disabler'] } };
  assert.deepEqual(P.missingRoles(by, [1, 2]), ['Initiator', 'Durable']);
  assert.deepEqual(P.missingRoles(by, []), []);
});

test('shrinkMatchups оставляет только нужные поля', () => {
  assert.deepEqual(P.shrinkMatchups([{ hero_id: 1, games_played: 5, wins: 2, extra: 'x' }]), [{ hero_id: 1, games_played: 5, wins: 2 }]);
});

test('applyDetection: враги — противоположная команда, себя в союзники не пишем', () => {
  const res = { radiant: [{ id: 1, name: 'Me' }, { id: 2, name: 'Ally' }], dire: [{ id: 3 }, { id: 4 }, { id: 5 }], me: 'Me', me_team: 'radiant', unsure: 1 };
  assert.deepEqual(P.applyDetection(res), { enemyTeam: 'dire', enemies: [3, 4, 5], allies: [2], unsure: 1 });
});

test('applyDetection: если свою сторону не нашли, просим указать врагов', () => {
  const res = { radiant: [{ id: 1 }], dire: [{ id: 2 }], me: null, me_team: null };
  assert.deepEqual(P.applyDetection(res), { needTeam: true });
  assert.deepEqual(P.applyDetection(res, 'radiant').enemies, [1]);
});

test('applyDetection: лимиты и дубли', () => {
  const dire = [1, 2, 3, 4, 5, 6, 6].map(id => ({ id }));
  const out = P.applyDetection({ radiant: [], dire, me_team: 'radiant', me: null });
  assert.equal(out.enemies.length, 5);
  assert.equal(new Set(out.enemies).size, 5);
});
