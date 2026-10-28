// Вкладка «Статистика»: поиск игрока, загрузка и отрисовка профиля.
const TOTAL_LABELS = [
  ['kills', 'Убийства'], ['deaths', 'Смерти'], ['assists', 'Помощь'], ['kda', 'KDA', 'avg'], ['gold_per_min', 'GPM', 'avg'], ['xp_per_min', 'XPM', 'avg'],
  ['last_hits', 'Добито крипов'], ['denies', 'Добито своих (денаи)'], ['hero_damage', 'Урон по героям'], ['tower_damage', 'Урон по строениям'], ['hero_healing', 'Лечение'],
  ['duration', 'Длительность матча, мин', 'min'], ['level', 'Уровень к концу', 'avg'], ['stuns', 'Время станов, с'], ['tower_kills', 'Разрушено башен'],
  ['neutral_kills', 'Убито нейтралов'], ['courier_kills', 'Убито курьеров'], ['purchase_ward_observer', 'Observer-варды'], ['purchase_ward_sentry', 'Sentry-варды'],
  ['purchase_tpscroll', 'Свитки телепорта'], ['actions_per_min', 'Действий в минуту', 'avg'], ['lane_efficiency_pct', 'Эффективность на линии, %', 'avg'], ['pings', 'Пинги'],
];

$('#f').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#q').value.trim();
  if (!text) return;
  openTab('stats');
  const id = Core.parseAccount(text);
  if (id) return load(id);
  const vanity = (text.match(/steamcommunity\.com\/id\/([^/?#]+)/i) || [])[1] || text;
  $('#stats').innerHTML = msg('Ищу игрока…', 'spin');
  try {
    const list = (await api('/search?q=' + encodeURIComponent(vanity))).slice(0, 8);
    if (!list.length) return ($('#stats').innerHTML = msg('Никого не нашёл. Для ссылки вида steamcommunity.com/id/… ник Steam может отличаться от имени в ссылке: введи цифровой Steam ID.', 'err'));
    $('#stats').innerHTML = '<div class="card"><h2>Выбери игрока</h2>' + list.map(p =>
      `<div class="cand"><button data-id="${esc(p.account_id)}"><img src="${esc(p.avatarfull)}" alt=""><span>${esc(p.personaname)}<br><small class="muted">ID ${esc(p.account_id)}</small></span></button></div>`).join('') + '</div>';
    document.querySelectorAll('.cand button').forEach(b => b.onclick = () => load(b.dataset.id));
  } catch (err) { $('#stats').innerHTML = errMsg(err); }
});

async function load(id) {
  $('#stats').innerHTML = msg('Загружаю данные…', 'spin');
  try {
    await ensureHeroes();
    const p = await api(`/players/${id}`);
    if (!p.profile) return ($('#stats').innerHTML = msg('Профиль не найден или скрыт. Включи в Dota 2 «Открыть публичные данные матчей» и подожди несколько минут.', 'err'));
    const get = path => api(`/players/${id}/${path}`);
    // очередь запросов в api.js сама выдерживает паузы; порядок = порядок показа
    const [wl, recent, hs, totals, peers] = [await get('wl'), await get('recentMatches'), await get('heroes'), await get('totals'), await get('peers')];
    App.me = { id, p, wl, recent, hs, totals, peers };
    store.set('dota_id', id);
    store.set('dota_q', $('#q').value);
    renderStats();
    document.dispatchEvent(new CustomEvent('me-loaded'));
  } catch (err) { $('#stats').innerHTML = errMsg(err); }
}

function renderStats() {
  const { p, wl, recent, hs, totals, peers } = App.me;
  const pr = p.profile, games = wl.win + wl.lose;
  const last20 = recent.slice(0, 20), w20 = last20.filter(isWin).length;
  const avg = k => (last20.length ? last20.reduce((s, m) => s + (m[k] || 0), 0) / last20.length : 0);
  const kdaAvg = last20.length ? (avg('kills') + avg('assists')) / Math.max(1, avg('deaths')) : 0;
  const top5 = hs.filter(h => App.heroById[h.hero_id]).slice(0, 5);
  const tMap = Object.fromEntries(totals.map(t => [t.field, t]));
  const mmr = p.mmr_estimate && p.mmr_estimate.estimate;

  let html = `<div class="card hero-card" style="--rank:${rankColor(p.rank_tier)}"><div class="profile">
    <img src="${esc(pr.avatarfull)}" alt="">
    <div class="who"><div class="big">${esc(pr.personaname)}</div>
    <div class="muted">${pr.name ? esc(pr.name) + ' · ' : ''}ID ${esc(App.me.id)}${pr.loccountrycode ? ' · ' + esc(pr.loccountrycode) : ''}</div>
    <div><span class="rank">${esc(rankName(p.rank_tier, p.leaderboard_rank))}</span>${mmr ? ` <span class="muted">· оценка MMR ~${fmt(mmr)}</span>` : ''}</div>
    <div class="muted"><a style="color:inherit" href="https://www.opendota.com/players/${esc(App.me.id)}" target="_blank" rel="noopener">Профиль на OpenDota</a> · <a style="color:inherit" href="${esc(pr.profileurl)}" target="_blank" rel="noopener">Steam</a>${pr.last_login ? ' · был в игре: ' + esc(new Date(pr.last_login).toLocaleDateString('ru-RU')) : ''}</div></div>
    <div class="ring" style="--p:${pct(wl.win, games).toFixed(1)}"><span>${fmt1(pct(wl.win, games))}%<small>винрейт</small></span></div></div>
    <div class="kpis">
      <div class="kpi"><b>${fmt(games)}</b><span>матчей всего</span></div>
      <div class="kpi"><b class="win">${fmt(wl.win)}</b><span>побед</span></div>
      <div class="kpi"><b class="loss">${fmt(wl.lose)}</b><span>поражений</span></div>
      ${tMap.kda && tMap.kda.n ? `<div class="kpi"><b>${fmt1(tMap.kda.sum / tMap.kda.n)}</b><span>средний KDA</span></div>` : ''}
      ${tMap.gold_per_min && tMap.gold_per_min.n ? `<div class="kpi"><b>${fmt(tMap.gold_per_min.sum / tMap.gold_per_min.n)}</b><span>средний GPM</span></div>` : ''}
    </div></div>`;

  if (!last20.length) html += msg('Последних матчей нет: профиль закрыт или игрок давно не играл. Включи в Dota 2 «Открыть публичные данные матчей».', 'err');

  html += `<div class="card"><h2>Топ-5 любимых героев</h2><div class="top5">${top5.map((h, i) => {
    const hero = App.heroById[h.hero_id];
    return `<div class="t"><span class="n">#${i + 1}</span><img src="${heroImg(hero)}" alt="" loading="lazy"><div class="in"><b>${esc(hero.localized_name)}</b>
      <div class="muted">${fmt(h.games)} игр · <span class="${h.win / h.games >= 0.5 ? 'win' : 'loss'}">${fmt1(pct(h.win, h.games))}%</span></div>
      <div class="bar2"><i style="width:${pct(h.win, h.games)}%"></i></div>
      <div class="muted" style="font-size:12px;margin-top:4px">последний раз: ${h.last_played ? ago(h.last_played) : 'давно'}</div></div></div>`;
  }).join('') || '<span class="muted">Нет данных</span>'}</div></div>`;

  html += `<div class="card"><h2>Последние 20 матчей</h2>
    <div class="kpis" style="margin:0 0 12px">
      <div class="kpi"><b class="${w20 >= last20.length / 2 ? 'win' : 'loss'}">${w20}-${last20.length - w20}</b><span>победы-поражения</span></div>
      <div class="kpi"><b>${fmt1(avg('kills'))} / ${fmt1(avg('deaths'))} / ${fmt1(avg('assists'))}</b><span>средние K / D / A</span></div>
      <div class="kpi"><b>${fmt1(kdaAvg)}</b><span>KDA за 20 игр</span></div>
      <div class="kpi"><b>${fmt(avg('gold_per_min'))} / ${fmt(avg('xp_per_min'))}</b><span>GPM / XPM</span></div>
      <div class="kpi"><b>${fmt(avg('last_hits'))}</b><span>крипов в среднем</span></div>
      <div class="kpi"><b>${dur(Math.round(avg('duration')))}</b><span>средняя длительность</span></div>
    </div>
    <div class="scroll"><table><thead><tr><th>Герой</th><th>Итог</th><th>K / D / A</th><th>Режим</th><th>Время</th><th>GPM / XPM</th><th>Урон</th><th>Когда</th><th></th></tr></thead><tbody>
    ${last20.map(m => `<tr class="${isWin(m) ? 'rw' : 'rl'}"><td>${heroTag(m.hero_id)}</td><td class="${isWin(m) ? 'win' : 'loss'}">${isWin(m) ? 'Победа' : 'Поражение'}</td>
      <td class="kda"><b>${m.kills}</b> / <b class="loss">${m.deaths}</b> / <b>${m.assists}</b></td><td>${esc(modeName(m))}</td><td>${dur(m.duration)}</td>
      <td>${m.gold_per_min} / ${m.xp_per_min}</td><td>${fmt(m.hero_damage || 0)}</td><td>${ago(m.start_time)}</td>
      <td><button type="button" class="lnk" data-m="${m.match_id}">Подробнее</button></td></tr>`).join('')}
    </tbody></table></div></div>`;

  html += `<div class="card"><h2>Общая статистика (за все матчи)</h2><div class="scroll"><table><thead><tr><th>Показатель</th><th>В среднем за матч</th><th>Всего</th></tr></thead><tbody>
    ${TOTAL_LABELS.filter(([k]) => tMap[k] && tMap[k].n).map(([k, label, kind]) => {
      const t = tMap[k], a = t.sum / t.n;
      return `<tr><td>${label}</td><td>${kind === 'min' ? fmt1(a / 60) : fmt1(a)}</td><td>${kind === 'avg' ? '—' : fmt(kind === 'min' ? t.sum / 60 : t.sum)}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;

  const friends = peers.filter(x => String(x.account_id) !== String(App.me.id) && x.with_games).slice(0, 5);
  if (friends.length) html += `<div class="card"><h2>Чаще всего играет с</h2><div class="scroll"><table><thead><tr><th>Игрок</th><th>Игр вместе</th><th>Винрейт вместе</th></tr></thead><tbody>
    ${friends.map(f => `<tr><td><span class="hero"><img style="width:28px;height:28px;border-radius:50%" src="${esc(f.avatar)}" alt="">${esc(f.personaname || 'ID ' + f.account_id)}</span></td><td>${fmt(f.with_games)}</td><td class="${f.with_win / f.with_games >= 0.5 ? 'win' : 'loss'}">${fmt1(pct(f.with_win, f.with_games))}%</td></tr>`).join('')}</tbody></table></div></div>`;

  html += `<div class="card"><h2>Все герои</h2><div class="scroll"><table><thead><tr><th>Герой</th><th>Игр</th><th>Победы</th><th>Винрейт</th><th>С ним в команде</th><th>Против него</th><th>Последний раз</th></tr></thead><tbody>
    ${hs.filter(h => h.games && App.heroById[h.hero_id]).map(h => `<tr><td>${heroTag(h.hero_id)}</td><td>${fmt(h.games)}</td><td>${fmt(h.win)}</td>
      <td class="${h.win / h.games >= 0.5 ? 'win' : 'loss'}">${fmt1(pct(h.win, h.games))}%<span class="mini"><i style="width:${pct(h.win, h.games)}%"></i></span></td>
      <td>${h.with_games ? fmt(h.with_games) + ' (' + fmt1(pct(h.with_win, h.with_games)) + '%)' : '—'}</td>
      <td>${h.against_games ? fmt(h.against_games) + ' (' + fmt1(pct(h.against_win, h.against_games)) + '%)' : '—'}</td>
      <td>${h.last_played ? ago(h.last_played) : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#stats').innerHTML = html;
}

registerTab('stats');
