const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../web/core.js');

test('parseAccount: 32-битный ID, 64-битный ID и ссылка на профиль', () => {
  assert.equal(C.parseAccount('12345678'), '12345678');
  assert.equal(C.parseAccount('76561197972611406'), '12345678');
  assert.equal(C.parseAccount('https://steamcommunity.com/profiles/76561197972611406/'), '12345678');
  assert.equal(C.parseAccount('  12345678 '), '12345678');
});

test('parseAccount: ник и vanity-ссылка не считаются ID', () => {
  assert.equal(C.parseAccount('Dendi'), null);
  assert.equal(C.parseAccount('https://steamcommunity.com/id/dendi'), null);
  assert.equal(C.parseAccount(''), null);
  assert.equal(C.parseAccount(undefined), null);
});

test('esc экранирует HTML', () => {
  assert.equal(C.esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(C.esc(null), '');
});

test('rankName / rankBracket', () => {
  assert.equal(C.rankName(0), 'Нет ранга');
  assert.equal(C.rankName(53), 'Legend 3');
  assert.equal(C.rankName(80, 12), 'Immortal (топ 12)');
  assert.equal(C.rankBracket(53), 5);
  assert.equal(C.rankBracket(0), null);
  assert.equal(C.rankBracket(undefined), null);
});

test('isWin учитывает сторону игрока', () => {
  assert.equal(C.isWin({ player_slot: 0, radiant_win: true }), true);
  assert.equal(C.isWin({ player_slot: 130, radiant_win: true }), false);
  assert.equal(C.isWin({ player_slot: 130, radiant_win: false }), true);
});

test('dur и ago', () => {
  assert.equal(C.dur(65), '1:05');
  const now = 1_700_000_000_000;
  assert.equal(C.ago(now / 1000 - 3600 * 5, now), '5 ч назад');
  assert.equal(C.ago(now / 1000 - 86400 * 10, now), '10 дн назад');
  assert.equal(C.ago(now / 1000 - 86400 * 400, now), '13 мес назад');
});

test('smooth тянет малые выборки к 50%', () => {
  assert.equal(C.smooth(0, 0), 0.5);
  assert.ok(C.smooth(3, 3) < 0.7);            // 3 победы из 3 не значат 100%
  assert.ok(C.smooth(900, 1000) > 0.85);       // большая выборка почти не искажается
});

test('ttlFor: разные сроки для разных путей', () => {
  assert.ok(C.ttlFor('/heroes') > C.ttlFor('/players/1/wl'));
  assert.ok(C.ttlFor('/heroes/5/matchups') >= 3600e3);
  assert.equal(C.ttlFor('/unknown'), 60e3);
});

test('heroWinrate: по рангу и суммарно', () => {
  const row = { '3_pick': 100, '3_win': 55, '4_pick': 300, '4_win': 150 };
  assert.deepEqual(C.heroWinrate(row, 3), { pick: 100, win: 55, wr: 0.55 });
  assert.equal(C.heroWinrate(row, null).pick, 400);
  assert.equal(C.heroWinrate({}, 2).wr, 0.5);
});
