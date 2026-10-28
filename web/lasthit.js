// Вкладка «Добивание»: темп добивания игрока против эталонов OpenDota и разбор по минутам.
const lh = { deep: null, busy: false, progress: '' };
const BENCH_HEROES = 5;

const shrinkBench = d => ({ lh: d.result.last_hits_per_min, dn: d.result.denies_per_min });
const benchmark = id => api(`/benchmarks?hero_id=${id}`, { shrink: shrinkBench });

function pctText(p) {
  if (!p) return '—';
  const n = Math.round(p.pct * 100);
  return p.edge === 'below' ? `ниже ${n}-го` : p.edge === 'above' ? `выше ${n}-го` : `около ${n}-го`;
}

function benchRow(row, bench) {
  const pts = bench.lh, p = TrendCore.percentileOf(row.lhpm, pts);
  const max = Math.max(...pts.map(x => x.value), row.lhpm) || 1;
  const med = (pts.find(x => Math.abs(x.percentile - 0.5) < 1e-6) || {}).value;
  return `<div><span class="hero"><img src="${heroImg(App.heroById[row.hero_id])}" alt="" style="width:46px;height:26px">${esc(App.heroById[row.hero_id].localized_name)}</span>
      <span class="muted">· ${row.games} игр · ${fmt1(row.lhpm)} крипов/мин (${fmt(row.lh / row.games)} за игру), денаев ${fmt1(row.dnpm)}/мин</span>
      <div class="pbar" style="margin-top:4px"><i style="width:${(row.lhpm / max) * 100}%"></i>${med ? `<u style="left:${(med / max) * 100}%" title="медиана"></u>` : ''}</div></div>
    <b>${pctText(p)}<br><small class="muted">перцентиль</small></b>`;
}

async function loadDeep() {
  lh.busy = true; lh.deep = null; lh.progress = ''; renderLastHit();
  try {
    const ms = [...(await ensureMatches())].sort((a, b) => b.start_time - a.start_time).filter(m => m.duration >= 900 && !m.leaver_status).slice(0, 14);
    const rows = [];
    for (let i = 0; i < ms.length && rows.length < 8; i++) {
      lh.progress = `Разбираю матчи… ${i + 1}/${ms.length}, найдено подходящих: ${rows.length}`; renderLastHit();
      try {
        const full = await fetchMatch(ms[i].match_id);
        const p = full.players.find(x => String(x.account_id) === String(App.me.id));
        if (p && p.lh_t && p.lh_t.length > 10) rows.push({ m: ms[i], p });
      } catch (e) { if (e.message !== '404') throw e; }
    }
    lh.deep = rows;
  } catch (e) { lh.deep = { error: e.message }; }
  lh.busy = false; lh.progress = ''; renderLastHit();
}

function deepHtml() {
  if (lh.busy) return msg(esc(lh.progress || 'Загружаю…'), 'spin');
  if (!lh.deep) return `<div class="muted" style="margin-bottom:10px">Берёт до 8 последних разобранных матчей и показывает, сколько крипов ты добил к 5-й, 10-й и 15-й минуте. Занимает несколько секунд: каждый матч — отдельный запрос.</div><button type="button" class="primary" id="deep">Разобрать последние матчи</button>`;
  if (lh.deep.error) return errMsg(lh.deep.error) + '<button type="button" id="deep">Повторить</button>';
  if (!lh.deep.length) return '<div class="msg">Среди последних матчей нет разобранных в OpenDota: подробная разбивка по минутам доступна только для них. Запросить разбор можно на странице матча в OpenDota.</div><button type="button" id="deep" style="margin-top:8px">Повторить</button>';
  const T = TrendCore, at = (r, min) => T.lhAt(r.p, min);
  const avg = min => { const v = lh.deep.map(r => at(r, min)).filter(x => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const chron = [...lh.deep].reverse();
  return `<div class="kpis" style="margin:0 0 12px">
      <div class="kpi"><b>${fmt1(avg(5) ?? 0)}</b><span>в среднем к 5-й минуте</span></div>
      <div class="kpi"><b>${fmt1(avg(10) ?? 0)}</b><span>в среднем к 10-й минуте</span></div>
      <div class="kpi"><b>${avg(15) === null ? '—' : fmt1(avg(15))}</b><span>в среднем к 15-й минуте</span></div></div>
    ${Charts.line([{ name: 'крипов к 10-й минуте', color: '#ff9b3d', values: chron.map(r => at(r, 10)) }], { min: 0, label: 'Добито к 10-й минуте' })}
    <div class="scroll" style="margin-top:10px"><table><thead><tr><th>Герой</th><th>Итог</th><th>Роль</th><th>5 мин</th><th>10 мин</th><th>15 мин</th><th>Всего</th><th>Когда</th></tr></thead><tbody>
    ${lh.deep.map(r => `<tr class="${isWin(r.m) ? 'rw' : 'rl'}"><td>${heroTag(r.m.hero_id)}</td><td class="${isWin(r.m) ? 'win' : 'loss'}">${isWin(r.m) ? 'Победа' : 'Поражение'}</td>
      <td>${esc((TrendCore.ROLE_NAMES[r.p.lane_role] || '—').replace(/ \(\d\)/, ''))}</td><td>${at(r, 5) ?? '—'}</td><td><b>${at(r, 10) ?? '—'}</b></td><td>${at(r, 15) ?? '—'}</td><td>${r.m.last_hits}</td><td>${ago(r.m.start_time)}</td></tr>`).join('')}
    </tbody></table></div>
    <button type="button" id="deep" style="margin-top:10px">Обновить разбор</button>`;
}

async function renderLastHit() {
  const el = $('#lasthit');
  if (!App.me) { el.innerHTML = needAccount; return; }
  if (!el.dataset.ready) el.innerHTML = msg('Считаю темп добивания…', 'spin');
  try {
    await ensureHeroes();
    const ms = await ensureMatches();
    const valid = TrendCore.validMatches(ms);
    if (valid.length < 5) { el.innerHTML = msg('Слишком мало полных матчей для расчёта (нужно хотя бы 5 длиннее 10 минут).', 'err'); return; }
    const byHero = TrendCore.lhByHero(valid, 3).filter(h => App.heroById[h.hero_id]).slice(0, BENCH_HEROES);
    const benches = [];
    for (const h of byHero) { try { benches.push(await benchmark(h.hero_id)); } catch { benches.push(null); } }
    const lhSeries = TrendCore.rollingSeries(valid, TrendCore.lhPerMin, 10), dnSeries = TrendCore.rollingSeries(valid, TrendCore.denyPerMin, 10);
    const total = valid.reduce((s, m) => s + m.last_hits, 0) / valid.reduce((s, m) => s + m.duration / 60, 0);
    el.innerHTML = `<div class="card"><h2>Твой темп добивания</h2>
        <div class="kpis" style="margin-top:0"><div class="kpi"><b>${fmt1(total)}</b><span>крипов в минуту (${valid.length} игр)</span></div>
          <div class="kpi"><b>${fmt1(valid.reduce((s, m) => s + m.denies, 0) / valid.reduce((s, m) => s + m.duration / 60, 0))}</b><span>денаев в минуту</span></div></div>
        <h2 style="margin-top:18px">Скользящий темп (окно 10 игр)</h2>
        ${Charts.line([{ name: 'крипов/мин', color: '#ff9b3d', values: lhSeries }, { name: 'денаев/мин ×5', color: '#6fb7ff', values: dnSeries.map(v => v * 5) }], { min: 0, label: 'Темп добивания' })}</div>
      <div class="card"><h2>Против эталонов по твоим героям</h2>
        <div class="bench">${byHero.map((h, i) => (benches[i] ? benchRow(h, benches[i]) : `<div>${heroTag(h.hero_id)} <span class="muted">эталон недоступен</span></div><b>—</b>`)).join('') || '<span class="muted">Нет героев с тремя и более играми.</span>'}</div>
        <div class="muted" style="margin-top:10px;font-size:12px">Эталон OpenDota: распределение «крипов в минуту за весь матч» у игроков этого героя (все ранги вместе). Жёлтая отметка на полосе — медиана. Это ориентир, а не норма: темп зависит от роли, длины игры и счёта.</div></div>
      <div class="card"><h2>Разбор по минутам</h2>${deepHtml()}</div>`;
    el.dataset.ready = '1';
    const d = $('#deep'); if (d) d.onclick = loadDeep;
  } catch (e) { el.innerHTML = errMsg(e); }
}
registerTab('lasthit', () => { if (!$('#lasthit').dataset.ready || !App.me) renderLastHit(); });
document.addEventListener('me-loaded', () => { delete $('#lasthit').dataset.ready; lh.deep = null; if (!$('#lasthit').hidden) renderLastHit(); });
