// Вкладка «Пики»: помощник выбора героя.
const pick = { allies: [], enemies: [], bans: [], mode: 'enemies', search: '', role: '', useMine: true, useMeta: true, result: null, busy: false, items: {} };
const MODE_LABEL = { enemies: 'Враги', allies: 'Союзники', bans: 'Баны' };
const PHASES = [['start_game_items', 'Старт'], ['early_game_items', 'Ранняя'], ['mid_game_items', 'Середина'], ['late_game_items', 'Поздняя']];

const matchups = id => api(`/heroes/${id}/matchups`, { shrink: PickCore.shrinkMatchups });

async function computeSuggestions() {
  pick.busy = true; pick.result = null; renderPicks();
  try {
    const [meta] = await Promise.all([ensureMeta(), ensureHeroes()]);
    const enemyRows = [];
    for (const e of pick.enemies) enemyRows.push({ e, rows: new Map((await matchups(e)).map(r => [r.hero_id, r])) });
    const mine = App.me ? new Map(App.me.hs.map(h => [h.hero_id, h])) : new Map();
    pick.result = PickCore.suggest({
      heroes: App.heroes, taken: new Set([...pick.allies, ...pick.enemies, ...pick.bans]), role: pick.role,
      enemyRows, mine, useMine: pick.useMine, meta: pick.useMeta ? meta : null, bracket: App.me ? Core.rankBracket(App.me.p.rank_tier) : null,
    });
  } catch (err) { pick.result = { error: err.message }; }
  pick.busy = false; renderPicks();
}

function teamHint() {
  const need = PickCore.missingRoles(App.heroById, pick.allies);
  return need.length ? `В вашей команде пока нет ролей: ${need.map(r => `<span class="pill">${esc(r)}</span>`).join('')}` : '';
}

function slotsHtml(key) {
  return `<div class="slots">${pick[key].map(id => `<span class="slot"><img src="${heroImg(App.heroById[id])}" alt="">${esc(App.heroById[id].localized_name)}<button data-rm="${key}:${id}" aria-label="Убрать">✕</button></span>`).join('') || '<span class="muted">пусто</span>'}</div>`;
}

function gridHtml() {
  const taken = new Set([...pick.allies, ...pick.enemies, ...pick.bans]);
  const q = pick.search.toLowerCase();
  const full = pick[pick.mode].length >= PickCore.LIMITS[pick.mode];
  return App.heroes.filter(h => !q || h.localized_name.toLowerCase().includes(q))
    .map(h => `<button type="button" data-h="${h.id}" title="${esc(h.localized_name)}" ${taken.has(h.id) || full ? 'disabled' : ''}><img src="${heroImg(h)}" alt="${esc(h.localized_name)}" loading="lazy"></button>`).join('');
}

function whyHtml(r) {
  const parts = [];
  if (r.best) parts.push(`лучше всего против <b>${esc(App.heroById[r.best.e].localized_name)}</b>: <b class="win">${fmt1(100 * r.best.wr)}%</b>`);
  if (r.worst && r.worst !== r.best) parts.push(`сложнее всего против <b>${esc(App.heroById[r.worst.e].localized_name)}</b>: <b class="${r.worst.wr >= 0.5 ? 'win' : 'loss'}">${fmt1(100 * r.worst.wr)}%</b>`);
  if (Math.abs(r.rankShift) >= 0.005) parts.push(`на вашем ранге ${r.rankShift > 0 ? 'сильнее' : 'слабее'} обычного (${r.rankShift > 0 ? '+' : ''}${fmt1(100 * r.rankShift)}%)`);
  return parts.length ? `<span class="why">${parts.join(' · ')}</span>` : '';
}

function itemsHtml(id) {
  const d = pick.items[id];
  if (!d) return '';
  if (d === 'loading') return '<div class="items-pop muted">Загружаю предметы…</div>';
  if (d === 'error') return '<div class="items-pop muted">Не удалось загрузить предметы.</div>';
  return `<div class="items-pop">${PHASES.map(([k, label]) => {
    const top = Object.entries(d[k] || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return top.length ? `<div class="ph"><small>${label}</small>${top.map(([iid]) => itemImg(Number(iid))).join('')}</div>` : '';
  }).join('')}</div>`;
}

function suggestionsHtml() {
  if (pick.busy) return msg('Считаю…', 'spin');
  const r = pick.result;
  if (r && r.error) return errMsg(r.error);
  if (!r) return '<div class="msg">Отметь вражеских героев и нажми «Подобрать». Чем больше врагов выбрано, тем точнее совет.</div>';
  const rows = r.top.map((x, i) => `
      <div class="row${i === 0 ? ' best' : ''}"><img src="${heroImg(x.h)}" alt=""><div style="min-width:0"><b>${esc(x.h.localized_name)}</b>${i === 0 ? '<span class="tag">лучший</span>' : ''}<small>${x.h.roles.slice(0, 3).map(esc).join(', ')}</small>
      ${whyHtml(x)}
      <small>${x.per.map(p => `против ${esc(App.heroById[p.e].localized_name)}: ${fmt1(100 * p.wr)}%`).join(' · ')}</small>
      ${x.personal !== null ? `<small>твои игры на нём: ${x.mg} (${fmt1(100 * x.personal)}%)</small>` : ''}
      <button type="button" class="lnk" data-items="${x.h.id}">${pick.items[x.h.id] ? 'Скрыть предметы' : 'Популярные предметы'}</button>${itemsHtml(x.h.id)}</div>
      <div class="sc ${x.score >= 0.5 ? 'win' : 'loss'}">${x.score >= 0.5 ? '+' : ''}${fmt1(100 * (x.score - 0.5))}%<small>${pick.useMine && x.personal !== null ? 'с учётом твоих игр' : 'к 50%'}</small></div></div>`).join('');
  const avoid = r.avoid.length ? `<div class="avoid"><h3>Лучше не брать</h3>${r.avoid.map(x => `<span class="slot"><img src="${heroImg(x.h)}" alt="">${esc(x.h.localized_name)} <span class="muted">${fmt1(100 * (x.score - 0.5))}%</span></span>`).join('')}</div>` : '';
  return (r.lowData ? '<div class="warn">Против выбранных героев мало сыгранных матчей, оценка приблизительная.</div>' : '') + `<div class="sug">${rows}</div>${avoid}`;
}

function renderPicks() {
  if (!App.heroes.length) {
    ensureHeroes().then(renderPicks).catch(err => ($('#picks').innerHTML = errMsg(err)));
    $('#picks').innerHTML = msg('Загружаю героев…', 'spin');
    return;
  }
  const roles = [...new Set(App.heroes.flatMap(h => h.roles))].sort();
  const bracket = App.me ? Core.rankBracket(App.me.p.rank_tier) : null;
  $('#picks').innerHTML = `<div class="cols">
    <div class="card"><h2>Драфт</h2>
      <div class="modes">${Object.keys(MODE_LABEL).map(k => `<button type="button" data-mode="${k}" class="${pick.mode === k ? 'on' : ''}">${MODE_LABEL[k]} (${pick[k].length}/${PickCore.LIMITS[k]})</button>`).join('')}</div>
      <div class="side e"><b>Враги</b> ${slotsHtml('enemies')}</div>
      <div class="side a"><b>Союзники</b> ${slotsHtml('allies')}</div>
      <div class="side b"><b>Баны</b> ${slotsHtml('bans')}</div>
      <input id="hs" type="text" placeholder="Поиск героя (по-английски)" value="${esc(pick.search)}" style="width:100%;margin-bottom:8px" aria-label="Поиск героя">
      <div class="grid" id="grid">${gridHtml()}</div>
      <div class="muted" style="margin-top:8px">Клик по герою добавляет его в выбранную группу (${MODE_LABEL[pick.mode]}).</div>
      <div id="detect" class="row2" style="margin-top:10px"></div>
    </div>
    <div class="card"><h2>Что пикать</h2>
      <div class="row2" style="margin-bottom:10px">
        <select id="role" aria-label="Роль"><option value="">Любая роль</option>${roles.map(r => `<option ${pick.role === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <button type="button" class="primary" id="go" ${pick.enemies.length ? '' : 'disabled'}>Подобрать</button>
        <button type="button" id="clear">Сбросить</button>
      </div>
      <div class="row2" style="margin-bottom:10px">
        <label class="row2"><input type="checkbox" id="mine" ${pick.useMine ? 'checked' : ''} ${App.me ? '' : 'disabled'}>учитывать мои игры${App.me ? '' : ' (загрузи аккаунт)'}</label>
        <label class="row2"><input type="checkbox" id="meta" ${pick.useMeta ? 'checked' : ''} ${bracket ? '' : 'disabled'}>поправка на мой ранг${bracket ? '' : ' (нужен ранг)'}</label>
      </div>
      <div class="muted" style="margin-bottom:8px">${teamHint()}</div>
      ${suggestionsHtml()}
      <div class="muted" style="margin-top:10px;font-size:12px">Оценка основана на статистике матчей героев друг против друга (OpenDota) и не учитывает союзников, предметы и твой уровень. Это подсказка, а не приговор.</div>
    </div></div>`;
  $('#picks').classList.add('settled');
  renderDetect();
  $('#go').onclick = computeSuggestions;
  $('#clear').onclick = () => { Object.assign(pick, { allies: [], enemies: [], bans: [], result: null, items: {} }); renderPicks(); };
  $('#role').onchange = e => { pick.role = e.target.value; if (pick.result && !pick.result.error) computeSuggestions(); };
  $('#mine').onchange = e => { pick.useMine = e.target.checked; if (pick.result && !pick.result.error) computeSuggestions(); };
  $('#meta').onchange = e => { pick.useMeta = e.target.checked; if (pick.result && !pick.result.error) computeSuggestions(); };
  // поиск перерисовывает только сетку героев, а не всю вкладку
  $('#hs').oninput = e => { pick.search = e.target.value; $('#grid').innerHTML = gridHtml(); };
  document.dispatchEvent(new CustomEvent('picks-rendered'));
}

// ---- определение героев с экрана (только внутри приложения) ----
pick.detectNote = '';
function renderDetect() {
  const box = $('#detect');
  if (!box) return;
  if (!bridge()) { box.innerHTML = '<span class="muted">Определение героев с экрана работает в приложении Dota2Stats.</span>'; return; }
  box.innerHTML = `<button type="button" id="detbtn">Определить героев с экрана</button><span class="muted" id="detmsg" style="flex:1">${pick.detectNote || 'Запусти матч: герои всех команд видны на верхней панели игры.'}</span>`;
  $('#detbtn').onclick = () => detectFromScreen();
}

async function detectFromScreen(forceEnemy) {
  const note = t => { pick.detectNote = t; const m = $('#detmsg'); if (m) m.innerHTML = t; };
  $('#detbtn').disabled = true;
  note('Смотрю на экран игры…');
  try {
    await ensureHeroes();
    const res = forceEnemy && pick.lastDetect ? pick.lastDetect : await bridge().detect_heroes();
    if (!res.ok) { note(esc(res.error || 'Не получилось определить героев.')); $('#detbtn').disabled = false; return; }
    pick.lastDetect = res;
    const a = PickCore.applyDetection(res, forceEnemy);
    if (a.needTeam) {
      note(`Не нашёл твоего героя на панели, поэтому не знаю, кто враг. <button type="button" class="lnk" data-enemy="radiant">Враги — Силы Света</button> · <button type="button" class="lnk" data-enemy="dire">Враги — Силы Тьмы</button>`);
      $('#detbtn').disabled = false; return;
    }
    const known = id => App.heroById[id];
    pick.enemies = a.enemies.filter(known); pick.allies = a.allies.filter(known); pick.result = null;
    pick.detectNote = `Определено: врагов ${pick.enemies.length}, союзников ${pick.allies.length}${a.unsure ? `, не распознано слотов: ${a.unsure}` : ''}. Проверь список: распознавание может ошибаться.`;
    renderPicks();
  } catch (e) { note(esc(e.message || String(e))); const b = $('#detbtn'); if (b) b.disabled = false; }
}
window.addEventListener('pywebviewready', () => { if (!$('#picks').hidden) renderPicks(); });

// делегирование кликов: работает и после частичных перерисовок
$('#picks').addEventListener('click', async e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.enemy) detectFromScreen(t.dataset.enemy);
  else if (t.dataset.h) {
    const id = Number(t.dataset.h);
    if (PickCore.canAdd(pick, pick.mode, id)) { pick[pick.mode].push(id); pick.result = null; renderPicks(); }
  } else if (t.dataset.rm) {
    const [k, id] = t.dataset.rm.split(':');
    pick[k] = pick[k].filter(x => x !== Number(id)); pick.result = null; renderPicks();
  } else if (t.dataset.mode) { pick.mode = t.dataset.mode; renderPicks(); }
  else if (t.dataset.items) {
    const id = Number(t.dataset.items);
    if (pick.items[id]) { delete pick.items[id]; renderPicks(); return; }
    pick.items[id] = 'loading'; renderPicks();
    try { await ensureItems(); pick.items[id] = await api(`/heroes/${id}/itemPopularity`); } catch { pick.items[id] = 'error'; }
    renderPicks();
  }
});

registerTab('picks', renderPicks);
