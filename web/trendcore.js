// Расчёты для вкладок «Динамика» и «Добивание». Без DOM.
(function (root) {
  const core = typeof require !== 'undefined' ? require('./core.js') : root.Core;

  const MATCH_FIELDS = ['hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'game_mode', 'lobby_type', 'kills', 'deaths', 'assists',
    'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'hero_damage', 'lane_role', 'party_size', 'leaver_status'];
  const matchesPath = (id, n = 100) => `/players/${id}/matches?limit=${n}&` + MATCH_FIELDS.map(f => 'project=' + f).join('&');

  const ROLE_NAMES = { 1: 'Лёгкая линия (1)', 2: 'Мид (2)', 3: 'Сложная линия (3)', 4: 'Лес (4)' };
  const lhPerMin = m => (m.duration > 0 ? (m.last_hits || 0) / (m.duration / 60) : 0);
  const denyPerMin = m => (m.duration > 0 ? (m.denies || 0) / (m.duration / 60) : 0);
  const kdaOf = m => ((m.kills || 0) + (m.assists || 0)) / Math.max(1, m.deaths || 0);

  // Матчи, где игрок не вышел из игры и игра не оборвалась на старте: иначе темп искажается.
  const validMatches = ms => ms.filter(m => m.duration >= 600 && !m.leaver_status && m.last_hits !== undefined);

  // Винрейт за последние n игр, начиная с самых новых
  function formWindows(ms, sizes = [10, 20, 50, 100]) {
    const sorted = [...ms].sort((a, b) => b.start_time - a.start_time);
    const use = sizes.filter(n => n < sorted.length);
    if (sorted.length >= 5) use.push(sorted.length);        // последнее окно — «всё, что есть»
    return use.map(n => {
      const part = sorted.slice(0, n), w = part.filter(core.isWin).length;
      return { n: part.length, win: w, wr: w / part.length };
    });
  }

  // Скользящий винрейт: точка на каждый матч (от старых к новым), окно размером win
  function rollingSeries(ms, getter, win = 10) {
    const sorted = [...ms].sort((a, b) => a.start_time - b.start_time);
    const vals = sorted.map(getter);
    return vals.map((_, i) => {
      const from = Math.max(0, i - win + 1), part = vals.slice(from, i + 1);
      return part.reduce((s, v) => s + v, 0) / part.length;
    }).slice(Math.min(win - 1, vals.length - 1));
  }
  const rollingWinrate = (ms, win = 10) => rollingSeries(ms, m => (core.isWin(m) ? 1 : 0), win);

  // Часть суток по местному времени
  const DAY_PARTS = [['Ночь (0–6)', 0, 6], ['Утро (6–12)', 6, 12], ['День (12–18)', 12, 18], ['Вечер (18–24)', 18, 24]];
  const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  function bucketWinrate(ms, keyFn, labels) {
    const acc = labels.map(label => ({ label, games: 0, win: 0 }));
    for (const m of ms) { const i = keyFn(m); if (acc[i]) { acc[i].games++; if (core.isWin(m)) acc[i].win++; } }
    return acc.map(a => ({ ...a, wr: a.games ? a.win / a.games : null }));
  }
  const byWeekday = (ms, tzOffsetMin = new Date().getTimezoneOffset()) =>
    bucketWinrate(ms, m => new Date((m.start_time - tzOffsetMin * 60) * 1000).getUTCDay(), WEEKDAYS);
  const byDayPart = (ms, tzOffsetMin = new Date().getTimezoneOffset()) =>
    bucketWinrate(ms, m => { const h = new Date((m.start_time - tzOffsetMin * 60) * 1000).getUTCHours(); return DAY_PARTS.findIndex(([, a, b]) => h >= a && h < b); }, DAY_PARTS.map(p => p[0]));
  const byRole = ms => bucketWinrate(ms, m => (m.lane_role >= 1 && m.lane_role <= 4 ? m.lane_role - 1 : -1), Object.values(ROLE_NAMES));
  const bySide = ms => bucketWinrate(ms, m => (m.player_slot < 128 ? 0 : 1), ['Силы Света', 'Силы Тьмы']);
  const byParty = ms => bucketWinrate(ms, m => (m.party_size > 1 ? 1 : 0), ['Соло', 'С друзьями']);

  // Полоса серии побед/поражений в конце списка (самые новые матчи)
  function currentStreak(ms) {
    const sorted = [...ms].sort((a, b) => b.start_time - a.start_time);
    if (!sorted.length) return { win: null, len: 0 };
    const first = core.isWin(sorted[0]); let len = 0;
    for (const m of sorted) { if (core.isWin(m) === first) len++; else break; }
    return { win: first, len };
  }

  // ---- эталоны OpenDota ----
  // points: [{percentile, value}] по возрастанию. Возвращает 0..1 либо граничные 'ниже'/'выше'.
  function percentileOf(value, points) {
    if (!points || !points.length) return null;
    const p = [...points].sort((a, b) => a.percentile - b.percentile);
    if (value <= p[0].value) return { pct: p[0].percentile, edge: 'below' };
    if (value >= p[p.length - 1].value) return { pct: p[p.length - 1].percentile, edge: 'above' };
    for (let i = 1; i < p.length; i++) {
      if (value <= p[i].value) {
        const a = p[i - 1], b = p[i], t = (value - a.value) / (b.value - a.value || 1);
        return { pct: a.percentile + t * (b.percentile - a.percentile), edge: null };
      }
    }
    return null;
  }

  // Средний темп добивания по героям (только герои с минимум minGames игр)
  function lhByHero(ms, minGames = 3) {
    const map = new Map();
    for (const m of validMatches(ms)) {
      const a = map.get(m.hero_id) || { hero_id: m.hero_id, games: 0, lh: 0, dn: 0, mins: 0 };
      a.games++; a.lh += m.last_hits || 0; a.dn += m.denies || 0; a.mins += m.duration / 60;
      map.set(m.hero_id, a);
    }
    return [...map.values()].filter(a => a.games >= minGames)
      .map(a => ({ ...a, lhpm: a.lh / a.mins, dnpm: a.dn / a.mins })).sort((x, y) => y.games - x.games);
  }

  // LH на 10-й минуте из полной записи матча (lh_t накопительный по минутам)
  const lhAt = (player, minute = 10) => (player && player.lh_t && player.lh_t.length > minute ? player.lh_t[minute] : null);

  const api = { matchesPath, MATCH_FIELDS, ROLE_NAMES, lhPerMin, denyPerMin, kdaOf, validMatches, formWindows, rollingSeries, rollingWinrate, byWeekday, byDayPart, byRole, bySide, byParty, currentStreak, percentileOf, lhByHero, lhAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrendCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
