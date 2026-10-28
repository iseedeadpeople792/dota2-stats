// Окно «Подробнее» с разбором матча.
const PLAYER_FIELDS = ['account_id', 'personaname', 'name', 'hero_id', 'isRadiant', 'player_slot', 'level', 'kills', 'deaths', 'assists', 'net_worth', 'last_hits', 'denies',
  'gold_per_min', 'xp_per_min', 'hero_damage', 'tower_damage', 'hero_healing', 'item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'item_neutral', 'lh_t', 'lane_role'];
const MATCH_FIELDS = ['match_id', 'radiant_win', 'duration', 'start_time', 'game_mode', 'lobby_type', 'first_blood_time', 'radiant_score', 'dire_score', 'radiant_gold_adv', 'radiant_xp_adv'];

// Полная запись матча весит сотни КБ; в кэш кладём только то, что показываем.
function shrinkMatch(m) {
  const o = {};
  MATCH_FIELDS.forEach(k => { if (m[k] !== undefined) o[k] = m[k]; });
  o.players = (m.players || []).map(p => { const q = {}; PLAYER_FIELDS.forEach(k => { if (p[k] !== undefined) q[k] = p[k]; }); return q; });
  return o;
}
const fetchMatch = id => api('/matches/' + id, { shrink: shrinkMatch });

function advChart(gold, xp) {
  const n = gold.length, W = 640, H = 150;
  const max = Math.max(1000, ...gold.map(Math.abs), ...xp.map(Math.abs));
  const pts = a => a.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H / 2 - (v / max) * (H / 2 - 10)).toFixed(1)}`).join(' ');
  return `<div class="chart"><div class="muted" style="margin-bottom:6px">Преимущество по ходу игры: выше линии лидируют Силы Света, ниже Силы Тьмы. Максимум ${fmt(max)}.
      <span class="pill" style="color:var(--gold)">золото</span><span class="pill" style="color:#6fb7ff">опыт</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График преимущества по золоту и опыту">
      <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="rgba(255,255,255,.25)" stroke-dasharray="4 4"/>
      ${xp.length === n ? `<polyline points="${pts(xp)}" fill="none" stroke="#6fb7ff" stroke-width="1.5" opacity=".8"/>` : ''}
      <polyline points="${pts(gold)}" fill="none" stroke="#f1c55b" stroke-width="2.5"/></svg></div>`;
}

function teamTable(players, title, cls) {
  const sum = k => players.reduce((s, p) => s + (p[k] || 0), 0);
  const isMe = p => App.me && String(p.account_id) === String(App.me.id);
  return `<div class="team ${cls}"><h3>${title} <span class="muted">${sum('kills')} убийств · ${fmt(sum('net_worth'))} золота</span></h3><div class="scroll"><table><thead><tr>
    <th>Герой</th><th>Игрок</th><th>Ур.</th><th>K / D / A</th><th>Золото</th><th>LH / DN</th><th>LH на 10 мин</th><th>GPM / XPM</th><th>Урон</th><th>По стр.</th><th>Лечение</th><th>Предметы</th></tr></thead><tbody>
    ${players.map(p => `<tr class="${isMe(p) ? 'me' : ''}"><td>${heroTag(p.hero_id)}</td>
      <td>${esc(p.personaname || p.name || 'Скрыт')}${isMe(p) ? ' <span class="pill">ты</span>' : ''}</td>
      <td>${p.level ?? '—'}</td><td class="kda"><b>${p.kills}</b> / <b class="loss">${p.deaths}</b> / <b>${p.assists}</b></td>
      <td>${fmt(p.net_worth || 0)}</td><td>${p.last_hits ?? 0} / ${p.denies ?? 0}</td><td>${p.lh_t && p.lh_t.length > 10 ? p.lh_t[10] : '—'}</td>
      <td>${p.gold_per_min ?? 0} / ${p.xp_per_min ?? 0}</td>
      <td>${fmt(p.hero_damage || 0)}</td><td>${fmt(p.tower_damage || 0)}</td><td>${fmt(p.hero_healing || 0)}</td>
      <td><div class="items">${[0, 1, 2, 3, 4, 5].map(i => itemImg(p['item_' + i])).join('')}${p.item_neutral ? `<span class="items neutral">${itemImg(p.item_neutral)}</span>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

function renderMatch(m) {
  const side = p => p.isRadiant ?? p.player_slot < 128;
  const mine = App.me && m.players.find(p => String(p.account_id) === String(App.me.id));
  const mineWin = mine ? side(mine) === m.radiant_win : null;
  $('#mbody').innerHTML = `<div class="mhead">
      <div class="score"><span class="r">${m.radiant_score ?? '?'}</span> : <span class="d">${m.dire_score ?? '?'}</span></div>
      <div><div class="verdict ${m.radiant_win ? 'win' : 'loss'}">Победа: ${m.radiant_win ? 'Силы Света (Radiant)' : 'Силы Тьмы (Dire)'}</div>
      <div class="muted">${esc(modeName(m))} · ${dur(m.duration)} · ${new Date(m.start_time * 1000).toLocaleString('ru-RU')}${m.first_blood_time ? ' · первая кровь на ' + dur(m.first_blood_time) : ''} · матч ${m.match_id}</div>
      ${mineWin === null ? '' : `<div class="${mineWin ? 'win' : 'loss'}"><b>Для этого аккаунта: ${mineWin ? 'победа' : 'поражение'}</b></div>`}</div></div>
    ${teamTable(m.players.filter(side), 'Силы Света (Radiant)', 'rad')}${teamTable(m.players.filter(p => !side(p)), 'Силы Тьмы (Dire)', 'dire')}
    ${m.radiant_gold_adv && m.radiant_gold_adv.length > 1 ? advChart(m.radiant_gold_adv, m.radiant_xp_adv || []) : '<div class="muted" style="margin-top:14px">График преимущества недоступен: этот матч не разобран в OpenDota.</div>'}`;
}

async function showMatch(id) {
  openModal('modal');
  $('#mbody').innerHTML = msg('Загружаю матч…', 'spin');
  try {
    await Promise.all([ensureHeroes(), ensureItems()]);
    renderMatch(await fetchMatch(id));
  } catch (e) {
    $('#mbody').innerHTML = e.message === '404'
      ? msg('Этого матча нет в OpenDota. Старые или закрытые матчи там могут не храниться.', 'err')
      : errMsg(e);
  }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) showMatch(b.dataset.m); });
$('#mclose').onclick = () => closeModal('modal');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal('modal'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal('modal'); if (!$('#settings').hidden) closeModal('settings'); } });
