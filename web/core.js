// Чистые функции без DOM: их можно тестировать в node (см. tests/).
(function (root) {
  const STEAM64_BASE = 76561197960265728n;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('ru-RU');
  const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
  const pct = (a, b) => (b ? (100 * a) / b : 0);
  const dur = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  function ago(ts, nowMs = Date.now()) {
    const d = (nowMs / 1000 - ts) / 86400;
    if (d < 1) return Math.max(1, Math.round(d * 24)) + ' ч назад';
    if (d < 60) return Math.round(d) + ' дн назад';
    if (d < 730) return Math.round(d / 30) + ' мес назад';
    return Math.round(d / 365) + ' г назад';
  }

  // Steam ID (32/64 бита) или ссылка /profiles/<id>. Ник и /id/<имя> здесь не разбираем: null.
  function parseAccount(text) {
    text = String(text || '').trim();
    const m = text.match(/steamcommunity\.com\/profiles\/(\d+)/i);
    const digits = m ? m[1] : /^\d+$/.test(text) ? text : null;
    if (!digits) return null;
    const n = BigInt(digits);
    return String(n > STEAM64_BASE ? n - STEAM64_BASE : n);
  }

  const RANKS = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const rankName = (rt, lb) => (!rt ? 'Нет ранга' : (RANKS[Math.floor(rt / 10)] || '?') + (rt % 10 && rt < 80 ? ' ' + (rt % 10) : '') + (lb ? ` (топ ${lb})` : ''));
  const RANK_COLORS = ['#98a2b3', '#b59b7b', '#7fcf8a', '#e2c36e', '#6fb7ff', '#5fd1c0', '#9a8fff', '#ff8fd8', '#ffd65a'];
  const rankColor = rt => RANK_COLORS[Math.floor((rt || 0) / 10)] || RANK_COLORS[0];
  // Индекс ранга 1..8 для полей OpenDota heroStats ("<i>_pick" / "<i>_win"); без ранга — null
  const rankBracket = rt => { const i = Math.floor((rt || 0) / 10); return i >= 1 && i <= 8 ? i : null; };

  const MODES = { 1: 'All Pick', 2: 'Captains Mode', 3: 'Random Draft', 4: 'Single Draft', 5: 'All Random', 8: 'Reverse CM', 12: 'Least Played', 16: 'Captains Draft', 18: 'Ability Draft', 22: 'All Pick', 23: 'Turbo' };
  const modeName = m => (m.lobby_type === 7 ? 'Рейтинг · ' : '') + (MODES[m.game_mode] || 'Режим ' + m.game_mode);
  const isWin = m => (m.player_slot < 128) === m.radiant_win;

  // ---- сглаживание винрейта: добавляем k «воображаемых» игр на 50% ----
  const smooth = (wins, games, k = 20) => (wins + k / 2) / (games + k);

  // ---- кэш: время жизни по пути запроса ----
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const TTL_RULES = [
    [/^\/heroes$/, DAY], [/^\/constants\//, 7 * DAY], [/^\/heroStats/, 6 * HOUR], [/\/matchups$/, 6 * HOUR],
    [/^\/benchmarks/, DAY], [/\/itemPopularity$/, 6 * HOUR], [/^\/matches\//, 7 * DAY], [/^\/search/, 10 * 60e3], [/^\/players\//, 5 * 60e3],
  ];
  const ttlFor = path => { for (const [re, ms] of TTL_RULES) if (re.test(path)) return ms; return 60e3; };

  // ---- общий формат «винрейт героя» ----
  function heroWinrate(row, bracket) {
    // row: запись /heroStats. bracket 1..8 или null (все ранги суммарно)
    let pick = 0, win = 0;
    if (bracket) { pick = row[`${bracket}_pick`] || 0; win = row[`${bracket}_win`] || 0; }
    else for (let i = 1; i <= 8; i++) { pick += row[`${i}_pick`] || 0; win += row[`${i}_win`] || 0; }
    return { pick, win, wr: pick ? win / pick : 0.5 };
  }

  const api = { esc, fmt, fmt1, pct, dur, ago, parseAccount, rankName, rankColor, rankBracket, modeName, isWin, smooth, ttlFor, heroWinrate, MODES, RANKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
