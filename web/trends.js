// Вкладка «Динамика»: форма, серии и разрезы по последним 100 матчам.
async function ensureMatches() {
  if (!App.me) return null;
  if (!App.me.matches) App.me.matches = await api(TrendCore.matchesPath(App.me.id, 100));
  return App.me.matches;
}

const needAccount = '<div class="msg">Сначала загрузи аккаунт на вкладке «Статистика»: введи Steam ID и нажми «Показать».</div>';

async function renderTrends() {
  const el = $('#trends');
  if (!App.me) { el.innerHTML = needAccount; return; }
  el.innerHTML = msg('Загружаю последние 100 матчей…', 'spin');
  try {
    await ensureHeroes();
    const ms = await ensureMatches();
    if (!ms || ms.length < 5) { el.innerHTML = msg('Слишком мало матчей для динамики (нужно хотя бы 5).', 'err'); return; }
    const T = TrendCore, win = T.formWindows(ms), streak = T.currentStreak(ms);
    const valid = T.validMatches(ms);
    const wr = T.rollingWinrate(ms, 10).map(v => v * 100);
    const kda = T.rollingSeries(ms, T.kdaOf, 10);
    el.innerHTML = `<div class="card"><h2>Форма</h2>
      <div class="kpis" style="margin-top:0">${win.map(w => `<div class="kpi"><b class="${w.wr >= 0.5 ? 'win' : 'loss'}">${fmt1(100 * w.wr)}%</b><span>последние ${w.n} игр (${w.win}-${w.n - w.win})</span></div>`).join('')}
        <div class="kpi"><b class="${streak.win ? 'win' : 'loss'}">${streak.len} ${streak.win ? 'побед' : 'поражений'}</b><span>текущая серия</span></div></div>
      <h2 style="margin-top:18px">Винрейт на скользящем окне в 10 игр</h2>${Charts.line([{ name: 'винрейт, %', color: '#43d392', values: wr }], { min: 0, max: 100, baseline: 50, label: 'Скользящий винрейт', fmtY: v => Math.round(v) + '%' })}
      <h2 style="margin-top:18px">KDA на скользящем окне в 10 игр</h2>${Charts.line([{ name: 'KDA', color: '#f1c55b', values: kda }], { label: 'Скользящий KDA' })}
      <div class="muted" style="margin-top:8px;font-size:12px">Данные: последние ${ms.length} матчей. Окно сглаживает случайные серии: смотри на направление линии, а не на отдельные точки.</div></div>
    <div class="cols">
      <div class="card"><h2>По ролям на линии</h2>${Charts.winBars(T.byRole(ms))}</div>
      <div class="card"><h2>Сторона и состав</h2>${Charts.winBars(T.bySide(ms))}<div style="height:12px"></div>${Charts.winBars(T.byParty(ms))}</div>
      <div class="card"><h2>Когда ты играешь лучше: время суток</h2>${Charts.winBars(T.byDayPart(ms))}</div>
      <div class="card"><h2>Дни недели</h2>${Charts.winBars(T.byWeekday(ms), 6)}</div></div>
    <div class="muted" style="font-size:12px">Полоса показывает винрейт, белая отметка — 50%. Группы меньше 8 игр бледные: на такой выборке разница может быть случайной. Время по часовому поясу этого компьютера. Матчей без выхода из игры: ${valid.length} из ${ms.length}.</div>`;
  } catch (e) { el.innerHTML = errMsg(e); }
}
registerTab('trends', renderTrends);
document.addEventListener('me-loaded', () => { if (!$('#trends').hidden) renderTrends(); });
