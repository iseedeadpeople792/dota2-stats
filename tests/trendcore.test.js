const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../web/trendcore.js');

// матч: игрок на стороне Света (slot 0); radiant_win управляет исходом
const mk = (i, win, extra = {}) => ({ hero_id: 1, start_time: 1_700_000_000 + i * 3600, duration: 2400, player_slot: 0, radiant_win: win, kills: 5, deaths: 2, assists: 7, last_hits: 240, denies: 12, lane_role: 1, party_size: 1, leaver_status: 0, ...extra });

test('lhPerMin считает темп за минуту', () => {
  assert.equal(T.lhPerMin({ last_hits: 240, duration: 2400 }), 6);
  assert.equal(T.lhPerMin({ last_hits: 10, duration: 0 }), 0);
});

test('validMatches отбрасывает короткие игры и ливеров', () => {
  const ms = [mk(0, true), mk(1, true, { duration: 300 }), mk(2, true, { leaver_status: 1 })];
  assert.equal(T.validMatches(ms).length, 1);
});

test('formWindows: окна по последним играм, новые первыми', () => {
  const ms = Array.from({ length: 30 }, (_, i) => mk(i, i >= 20));       // старые 20 — поражения, новые 10 — победы
  const w = T.formWindows(ms);
  assert.deepEqual(w.map(x => x.n), [10, 20, 30]);                        // окно 50/100 не шире данных → показываем всё доступное один раз
  assert.equal(w[0].wr, 1);
  assert.ok(Math.abs(w[1].wr - 0.5) < 1e-9);
});

test('rollingWinrate: окно скользит и идёт от старых к новым', () => {
  const ms = Array.from({ length: 12 }, (_, i) => mk(i, i >= 6));
  const s = T.rollingWinrate(ms, 4);
  assert.equal(s[0], 0);                                                  // первые 4 игры — поражения
  assert.equal(s[s.length - 1], 1);                                       // последние 4 — победы
  assert.equal(s.length, 9);
});

test('byDayPart и byWeekday учитывают часовой пояс', () => {
  // 1_700_000_000 = 2023-11-14 22:13:20 UTC (вторник)
  const m = mk(0, true, { start_time: 1_700_000_000 });
  const utc = T.byDayPart([m], 0);
  assert.equal(utc.find(x => x.label.startsWith('Вечер')).games, 1);
  const plus5 = T.byDayPart([m], -300);                                   // UTC+5 -> 03:13 следующего дня
  assert.equal(plus5.find(x => x.label.startsWith('Ночь')).games, 1);
  assert.equal(T.byWeekday([m], 0).find(x => x.label === 'Вт').games, 1);
  assert.equal(T.byWeekday([m], -300).find(x => x.label === 'Ср').games, 1);
});

test('byRole / bySide / byParty', () => {
  const ms = [mk(0, true), mk(1, false, { lane_role: 2 }), mk(2, true, { player_slot: 130, radiant_win: false, party_size: 3 })];
  assert.equal(T.byRole(ms)[0].games, 2);
  assert.equal(T.byRole(ms)[1].win, 0);
  assert.equal(T.bySide(ms)[1].win, 1);
  assert.equal(T.byParty(ms)[1].games, 1);
  assert.equal(T.byRole(ms)[3].wr, null);                                 // пустая группа — не 0%
});

test('currentStreak', () => {
  const ms = [mk(0, false), mk(1, true), mk(2, true), mk(3, true)];
  assert.deepEqual(T.currentStreak(ms), { win: true, len: 3 });
  assert.deepEqual(T.currentStreak([]), { win: null, len: 0 });
});

test('percentileOf: интерполяция и границы', () => {
  const pts = [{ percentile: 0.1, value: 2 }, { percentile: 0.5, value: 4 }, { percentile: 0.9, value: 8 }];
  assert.equal(T.percentileOf(4, pts).pct, 0.5);
  assert.ok(Math.abs(T.percentileOf(6, pts).pct - 0.7) < 1e-9);
  assert.deepEqual(T.percentileOf(1, pts), { pct: 0.1, edge: 'below' });
  assert.deepEqual(T.percentileOf(10, pts), { pct: 0.9, edge: 'above' });
  assert.equal(T.percentileOf(3, []), null);
});

test('lhByHero: средний темп и порог игр', () => {
  const ms = [mk(0, true), mk(1, true), mk(2, true), mk(3, true, { hero_id: 2 })];
  const r = T.lhByHero(ms, 3);
  assert.equal(r.length, 1);
  assert.equal(r[0].hero_id, 1);
  assert.equal(r[0].lhpm, 6);
});

test('lhAt берёт значение из накопительного массива', () => {
  assert.equal(T.lhAt({ lh_t: [0, 1, 3, 6, 9, 14, 20, 25, 31, 38, 45, 52] }, 10), 45);
  assert.equal(T.lhAt({ lh_t: [0, 1] }, 10), null);
  assert.equal(T.lhAt({}, 10), null);
});

test('matchesPath просит нужные поля', () => {
  const p = T.matchesPath(5, 100);
  assert.ok(p.startsWith('/players/5/matches?limit=100&project=hero_id'));
  assert.ok(p.includes('project=last_hits') && p.includes('project=lane_role'));
});
