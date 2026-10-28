// Проверка интерфейса моста: страница + подставной window.pywebview.api (игры здесь нет).
// Запуск: node tests/e2e/bridge.cjs
const path = require('node:path');
const { launch } = require('./driver.cjs');
const OUT = path.resolve(__dirname, '..', '..', 'work_shots');
require('node:fs').mkdirSync(OUT, { recursive: true });

const STUB = `
(() => {
  const calls = [];
  window.__calls = calls;
  window.__detect = { ok: true, me: 'Earth Spirit', me_team: 'radiant',
    radiant: [{ id: 107, name: 'Earth Spirit' }, { id: 1, name: 'Anti-Mage' }, { id: 2, name: 'Axe' }],
    dire: [{ id: 3, name: 'Bane' }, { id: 4, name: 'Bloodseeker' }, { id: 5, name: 'Crystal Maiden' }, { id: 6, name: 'Drow Ranger' }, { id: 7, name: 'Earthshaker' }], unsure: 1 };
  let running = false, settings = { melee_hp: 550, melee_armor: 2, ranged_hp: 300, ranged_armor: 0, deny_below: 0.5 };
  const api = {
    detect_heroes: async () => { calls.push('detect'); return window.__detect; },
    get_settings: async () => ({ ok: true, values: settings }),
    save_settings: async v => { calls.push('save:' + JSON.stringify(v)); settings = { ...settings, ...v, melee_hp: Math.min(v.melee_hp, 3000) }; return { ok: true, values: settings }; },
    overlay_state: async () => ({ available: true, running, in_game: running, game_found: running, hero: 'Earth Spirit', damage: 72 }),
    overlay_start: async () => { calls.push('start'); running = true; return { ok: true }; },
    overlay_stop: async () => { calls.push('stop'); running = false; return { ok: true }; },
  };
  window.pywebview = { api };
})();`;

(async () => {
  const b = await launch({ cdp: 9334, port: 8766 });
  const results = [];
  const check = (name, ok, extra = '') => { results.push([name, ok, extra]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
  try {
    // 1) обычный браузер: моста нет, и это сказано понятно
    await b.goto(b.base + '/');
    await b.eval(`document.querySelector('[data-tab=picks]').click(); 1`);
    await b.waitFor(`document.querySelector('#detect')`, 30000, 'вкладка пиков');
    check('без моста: подсказка вместо кнопки', await b.eval(`document.querySelector('#detect').textContent.includes('работает в приложении') && !document.querySelector('#detbtn')`));
    await b.eval(`document.querySelector('#gear').click(); 1`);
    await b.waitFor(`document.querySelector('#overlaybox .field')`, 10000, 'настройки');
    check('без моста: настройки объясняют, где управлять помощником', await b.eval(`document.querySelector('#overlaybox').textContent.includes('доступно в приложении Dota2Stats')`));

    // 2) с мостом
    await b.addInitScript(STUB);
    await b.goto(b.base + '/');
    await b.eval(`document.querySelector('[data-tab=picks]').click(); 1`);
    await b.waitFor(`document.querySelector('#detbtn')`, 30000, 'кнопка определения');
    await b.eval(`document.querySelector('#detbtn').click(); 1`);
    await b.waitFor(`document.querySelectorAll('.side.e .slot').length > 0`, 30000, 'враги заполнены');
    check('враги = вражеская команда (5), союзники без меня (2)', (await b.eval(`document.querySelectorAll('.side.e .slot').length`)) === 5 && (await b.eval(`document.querySelectorAll('.side.a .slot').length`)) === 2);
    check('показана сводка с предупреждением о возможной ошибке', await b.eval(`document.querySelector('#detmsg').textContent.includes('не распознано слотов: 1') && document.querySelector('#detmsg').textContent.includes('может ошибаться')`));

    // 3) своя сторона неизвестна -> просим указать
    await b.eval(`window.__detect = { ...window.__detect, me: null, me_team: null }; document.querySelector('#clear').click(); document.querySelector('#detbtn').click(); 1`);
    await b.waitFor(`document.querySelector('[data-enemy=radiant]')`, 15000, 'выбор команды');
    check('если свою сторону не нашли — предлагает выбрать врагов', (await b.eval(`document.querySelectorAll('.side.e .slot').length`)) === 0);
    await b.eval(`document.querySelector('[data-enemy=dire]').click(); 1`);
    await b.waitFor(`document.querySelectorAll('.side.e .slot').length === 5`, 15000, 'враги после выбора');
    check('после выбора команды враги подставлены', true);

    // 4) ошибка моста показывается
    await b.eval(`window.__detect = { ok: false, error: 'Окно Dota 2 не найдено.' }; document.querySelector('#detbtn').click(); 1`);
    await b.waitFor(`document.querySelector('#detmsg').textContent.includes('не найдено')`, 15000, 'ошибка');
    check('ошибка определения показана пользователю', true);
    await b.shot(path.join(OUT, '5_detect.png'));

    // 5) настройки помощника
    await b.eval(`document.querySelector('#gear').click(); 1`);
    await b.waitFor(`document.querySelector('#ovtoggle')`, 15000, 'блок помощника');
    check('статус «не запущен» и кнопка «Запустить»', await b.eval(`document.querySelector('#ovstate').textContent.includes('не запущен') && document.querySelector('#ovtoggle').textContent === 'Запустить'`));
    await b.eval(`document.querySelector('#ovtoggle').click(); 1`);
    await b.waitFor(`document.querySelector('#ovstate').textContent.includes('работает')`, 15000, 'запущен');
    check('после запуска виден герой и урон', await b.eval(`document.querySelector('#ovstate').textContent.includes('Earth Spirit') && document.querySelector('#ovstate').textContent.includes('72')`));
    await b.eval(`const i = document.querySelector('#set_melee_hp'); i.value = '9999'; document.querySelector('#setsave').click(); 1`);
    await b.waitFor(`document.querySelector('#setmsg').textContent.includes('перезапущен')`, 15000, 'сохранение');
    const calls = await b.eval(`window.__calls.join(' | ')`);
    check('сохранение перезапускает помощника (stop → start)', /stop \| start$/.test(calls), calls);
    check('значение вернулось ограниченным (3000)', (await b.eval(`document.querySelector('#set_melee_hp').value`)) === '3000');
    check('процент отдачи передан как доля (0.5)', calls.includes('"deny_below":0.5'));
    await b.shot(path.join(OUT, '6_settings_bridge.png'));
    await b.eval(`document.querySelector('#ovtoggle').click(); 1`);
    await b.waitFor(`document.querySelector('#ovstate').textContent.includes('не запущен')`, 15000, 'остановка');
    check('остановка работает', true);
    check('ошибок консоли нет', b.errors.length === 0, b.errors.join(' | '));
  } catch (e) {
    check('сценарий дошёл до конца', false, e.message);
    await b.shot(path.join(OUT, 'fail_bridge.png')).catch(() => {});
  } finally { await b.close(); }
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} проверок прошло`);
  process.exit(failed ? 1 : 0);
})();
