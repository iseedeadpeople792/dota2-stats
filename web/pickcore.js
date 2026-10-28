// Логика помощника пиков без DOM.
(function (root) {
  const core = typeof require !== 'undefined' ? require('./core.js') : root.Core;

  const LIMITS = { enemies: 5, allies: 4, bans: 14 };   // союзников 4: пятый — вы сами
  const MIN_PAIR_GAMES = 30;                            // меньше этого пара не считается показательной
  const LOW_DATA = 150;                                 // суммарно игр против выбранных врагов

  // rows: массив записей /heroes/{id}/matchups. Храним только нужное, чтобы кэш не раздувался.
  const shrinkMatchups = rows => rows.map(r => ({ hero_id: r.hero_id, games_played: r.games_played, wins: r.wins }));

  // heroStats -> Map id -> { all, byBracket[1..8] }, только нужные поля
  const shrinkHeroStats = rows => rows.map(r => {
    const o = { id: r.id };
    for (let i = 1; i <= 8; i++) { o[`${i}_pick`] = r[`${i}_pick`] || 0; o[`${i}_win`] = r[`${i}_win`] || 0; }
    return o;
  });

  /**
   * @param {object} p
   *  heroes: [{id, localized_name, roles}]
   *  taken: Set<id>                 — уже выбранные/забаненные
   *  role: ''|string                — фильтр роли
   *  enemyRows: [{e, rows: Map<heroId,{games_played,wins}>}]  — wins = победы вражеского героя e против героя из ключа
   *  mine: Map<heroId,{games,win}>  — личная статистика
   *  useMine: bool
   *  meta: Map<heroId,row>|null     — shrinkHeroStats, для поправки на ранг
   *  bracket: 1..8|null
   */
  function suggest(p) {
    const { heroes, taken, role = '', enemyRows, mine, useMine, meta, bracket } = p;
    const out = [];
    for (const h of heroes) {
      if (taken.has(h.id) || (role && !h.roles.includes(role))) continue;
      const per = enemyRows.map(({ e, rows }) => {
        const r = rows.get(h.id);
        const g = r ? r.games_played : 0;
        const w = r ? g - r.wins : 0;                  // победы кандидата
        return { e, g, w, wr: core.smooth(w, g) };
      });
      let score = per.length ? per.reduce((s, x) => s + x.wr, 0) / per.length : 0.5;
      let rankShift = 0;
      if (bracket && meta && meta.get(h.id)) {
        const row = meta.get(h.id);
        const all = core.heroWinrate(row, null), br = core.heroWinrate(row, bracket);
        if (br.pick >= 200 && all.pick >= 1000) rankShift = 0.5 * (br.wr - all.wr);   // герой сильнее/слабее именно на вашем ранге
        score += rankShift;
      }
      const m = mine.get(h.id), mg = m ? m.games : 0;
      const personal = m && mg ? core.smooth(m.win, mg, 10) : null;
      if (useMine && personal !== null) score += 0.35 * (personal - 0.5) * Math.min(1, mg / 15);
      const solid = per.filter(x => x.g >= MIN_PAIR_GAMES);
      const best = solid.length ? solid.reduce((a, b) => (b.wr > a.wr ? b : a)) : null;
      const worst = solid.length ? solid.reduce((a, b) => (b.wr < a.wr ? b : a)) : null;
      out.push({ h, per, score, personal, mg, rankShift, best, worst, games: per.reduce((s, x) => s + x.g, 0) });
    }
    out.sort((a, b) => b.score - a.score);
    return { top: out.slice(0, 12), avoid: out.slice(-5).reverse(), lowData: !!enemyRows.length && out.length > 0 && out.slice(0, 12).every(r => r.games < LOW_DATA) };
  }

  // Какие роли ещё не закрыты у союзников
  function missingRoles(heroesById, allyIds) {
    const have = new Set(allyIds.flatMap(id => (heroesById[id] ? heroesById[id].roles : [])));
    return allyIds.length ? ['Support', 'Initiator', 'Disabler', 'Durable', 'Carry'].filter(r => !have.has(r)) : [];
  }

  // Можно ли добавить героя в группу: свободен ли и не превышен ли лимит
  function canAdd(state, key, id) {
    const all = [...state.allies, ...state.enemies, ...state.bans];
    return !all.includes(id) && state[key].length < LIMITS[key];
  }

  // Результат распознавания верхней панели игры -> враги и союзники для драфта.
  // res: { radiant: [{id,name}], dire: [...], me, me_team, unsure }. Если свою сторону определить не удалось,
  // нужно, чтобы пользователь указал вражескую команду (enemyTeam).
  function applyDetection(res, enemyTeam) {
    const enemy = enemyTeam || (res.me_team ? (res.me_team === 'radiant' ? 'dire' : 'radiant') : null);
    if (!enemy) return { needTeam: true };
    const ally = enemy === 'radiant' ? 'dire' : 'radiant';
    const uniq = (list, n) => [...new Set(list.map(h => h.id))].slice(0, n);
    return {
      enemyTeam: enemy,
      enemies: uniq(res[enemy], LIMITS.enemies),
      allies: uniq(res[ally].filter(h => h.name !== res.me), LIMITS.allies),   // себя в союзники не пишем
      unsure: res.unsure || 0,
    };
  }

  const api = { suggest, missingRoles, canAdd, applyDetection, shrinkMatchups, shrinkHeroStats, LIMITS, MIN_PAIR_GAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PickCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
