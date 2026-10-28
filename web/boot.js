// Запуск: вкладки, настройки, автозагрузка последнего аккаунта.
document.querySelectorAll('#tabs [data-tab]').forEach(b => (b.onclick = () => openTab(b.dataset.tab)));

function renderSettings() {
  $('#sbody').innerHTML = `<h2>Настройки</h2>
    <div class="field"><label for="key">API-ключ OpenDota (необязательно)</label>
      <div class="row2"><input id="key" type="text" style="flex:1" value="${esc(store.get('od_key') || '')}" placeholder="вставь ключ из opendota.com/api-keys" autocomplete="off">
      <button type="button" id="keysave" class="primary">Сохранить</button></div>
      <small class="muted">Без ключа OpenDota пускает ~60 запросов в минуту. Ключ снимает это ограничение: страницы грузятся быстрее и реже упираются в лимит. Хранится только на этом компьютере.</small></div>
    <div class="field"><label>Кэш данных</label>
      <div class="row2"><button type="button" id="clearcache">Очистить кэш</button><small class="muted" id="cachemsg">Ответы OpenDota хранятся от минут до недели, чтобы не грузить сервис зря.</small></div></div>
    <div id="overlaybox"></div>`;
  $('#keysave').onclick = () => { const v = $('#key').value.trim(); v ? store.set('od_key', v) : store.del('od_key'); $('#cachemsg').textContent = v ? 'Ключ сохранён.' : 'Ключ удалён.'; };
  $('#clearcache').onclick = () => { odApi.clearCache(); App.meta = null; App.itemById = null; $('#cachemsg').textContent = 'Кэш очищен.'; };
  document.dispatchEvent(new CustomEvent('settings-rendered'));
}
$('#gear').onclick = () => { renderSettings(); openModal('settings'); };
$('#sclose').onclick = () => closeModal('settings');
$('#settings').addEventListener('click', e => { if (e.target.id === 'settings') closeModal('settings'); });

const savedQ = store.get('dota_q');
if (savedQ) $('#q').value = savedQ;
const savedTab = store.get('dota_tab');
openTab(tabs[savedTab] ? savedTab : 'stats');
// при запуске сразу показываем последний открытый аккаунт, а не пустую страницу
const savedId = store.get('dota_id') || (savedQ && Core.parseAccount(savedQ));
if (savedId) load(savedId);

// ---------- помощник добивания (только внутри приложения) ----------
const SET_FIELDS = [
  ['melee_hp', 'Здоровье ближнего крипа', 'HP'], ['melee_armor', 'Броня ближнего', ''],
  ['ranged_hp', 'Здоровье дальнего крипа', 'HP'], ['ranged_armor', 'Броня дальнего', ''],
  ['deny_below', 'Отдавать союзных ниже, % здоровья', '%'],
];
let overlayTimer = null;

function stateLine(s) {
  if (!s.available) return '<span class="muted">Помощник добивания не найден рядом с приложением (папка dota-lasthit).</span>';
  if (!s.running) return '<span class="pill">не запущен</span>';
  const parts = [`<span class="pill live">работает</span>`];
  parts.push(s.in_game ? `герой: <b>${esc(s.hero || '…')}</b>${s.damage ? `, урон ${esc(s.damage)}` : ''}` : s.game_found ? 'Dota 2 найдена, но окно не активно' : 'жду окно Dota 2');
  return parts.join(' · ');
}

async function refreshOverlay() {
  const box = $('#ovstate'); if (!box) return;
  try {
    const s = await bridge().overlay_state();
    box.innerHTML = stateLine(s);
    $('#ovtoggle').textContent = s.running ? 'Остановить' : 'Запустить';
    $('#ovtoggle').disabled = !s.available;
    $('#ovtoggle').dataset.running = s.running ? '1' : '';
  } catch (e) { box.innerHTML = esc(e.message || String(e)); }
}

async function renderOverlayBox() {
  const el = $('#overlaybox'); if (!el) return;
  if (!bridge()) { el.innerHTML = '<div class="field"><label>Помощник добивания</label><small class="muted">Управление доступно в приложении Dota2Stats, а не в обычном браузере.</small></div>'; return; }
  let cfg;
  try { cfg = await bridge().get_settings(); } catch (e) { cfg = { ok: false, error: e.message }; }
  el.innerHTML = `<div class="field"><label>Помощник добивания (подсказки над крипами в игре)</label>
      <div class="row2"><span id="ovstate" style="flex:1">…</span><button type="button" id="ovtoggle" class="primary">Запустить</button></div>
      <small class="muted">Работает, когда Dota 2 запущена в оконном режиме или «окно без рамки» и является активным окном. Только смотрит на картинку, ничего не нажимает и не читает память игры.</small></div>
    <div class="field"><label>Допущения про крипов</label>
      ${cfg.ok ? `<div class="row2" style="display:grid;grid-template-columns:1fr 110px;gap:6px 10px">${SET_FIELDS.map(([k, label, unit]) => `<label for="set_${k}">${label}</label><input id="set_${k}" type="number" step="${k === 'deny_below' ? 1 : 0.5}" value="${k === 'deny_below' ? Math.round(cfg.values[k] * 100) : cfg.values[k]}">`).join('')}</div>
        <div class="row2" style="margin-top:8px"><button type="button" id="setsave">Сохранить</button><small class="muted" id="setmsg">По полоске видна только доля здоровья, поэтому тип крипа угадывается: число ударов показывается диапазоном «ближний–дальний».</small></div>`
        : `<small class="muted">${esc(cfg.error || 'Настройки недоступны.')}</small>`}</div>`;
  $('#ovtoggle').onclick = async () => {
    const running = $('#ovtoggle').dataset.running === '1';
    $('#ovtoggle').disabled = true;
    const r = running ? await bridge().overlay_stop() : await bridge().overlay_start();
    if (r && r.ok === false) $('#ovstate').innerHTML = `<span class="loss">${esc(r.error)}</span>`;
    else await refreshOverlay();
    $('#ovtoggle').disabled = false;
  };
  const save = $('#setsave');
  if (save) save.onclick = async () => {
    const values = {};
    SET_FIELDS.forEach(([k]) => { const v = Number($('#set_' + k).value); values[k] = k === 'deny_below' ? v / 100 : v; });
    const r = await bridge().save_settings(values);
    if (!r.ok) { $('#setmsg').textContent = r.error; return; }
    SET_FIELDS.forEach(([k]) => { $('#set_' + k).value = k === 'deny_below' ? Math.round(r.values[k] * 100) : r.values[k]; });
    const running = $('#ovtoggle').dataset.running === '1';
    if (running) { await bridge().overlay_stop(); await wait(500); await bridge().overlay_start(); await refreshOverlay(); }
    $('#setmsg').textContent = running ? 'Сохранено, помощник перезапущен.' : 'Сохранено. Применится при запуске помощника.';
  };
  await refreshOverlay();
  clearInterval(overlayTimer);
  overlayTimer = setInterval(() => { if ($('#settings').hidden) clearInterval(overlayTimer); else refreshOverlay(); }, 1500);
}
document.addEventListener('settings-rendered', renderOverlayBox);
window.addEventListener('pywebviewready', () => { if (!$('#settings').hidden) renderOverlayBox(); });
