// Настоящее приложение: окно pywebview + реальный мост + реальный помощник добивания.
// Подключаемся к встроенному браузеру окна через отладочный порт WebView2. Запуск: node tests/e2e/real_app.cjs
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { launch } = require('./driver.cjs');
const ROOT = path.resolve(__dirname, '..', '..');
const PY = path.resolve(ROOT, '..', 'dota-lasthit', '.venv', 'Scripts', 'python.exe');
const OUT = path.join(ROOT, 'work_shots');
const CDP = 9555;

(async () => {
  const results = [];
  const check = (name, ok, extra = '') => { results.push([name, ok, extra]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
  const EXE = process.env.APP_EXE;
  const app = EXE ? spawn(EXE, [], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP}` } }) : spawn(PY, ['app.py'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP}`, PYTHONIOENCODING: 'utf-8' } });
  let log = ''; app.stdout.on('data', d => (log += d)); app.stderr.on('data', d => (log += d));
  let b;
  try {
    b = await launch({ attach: true, cdp: CDP });
    check('окно приложения открылось и страница загружена', await b.eval(`document.title`) === 'Dota 2 Статистика');
    await b.waitFor(`window.pywebview && window.pywebview.api && window.pywebview.api.detect_heroes`, 20000, 'pywebview.api');
    check('мост доступен странице', true);
    const info = await b.eval(`pywebview.api.lasthit_info()`);
    check('помощник добивания найден', info.available === true, JSON.stringify(info));
    const st = await b.eval(`pywebview.api.get_settings()`);
    check('настройки читаются через мост', st.ok && st.values.melee_hp > 0, JSON.stringify(st.values));
    const det = await b.eval(`pywebview.api.detect_heroes()`);
    check('определение героев отвечает осмысленно', typeof det.ok === 'boolean' && (det.ok || /Dota 2/.test(det.error)), JSON.stringify(det).slice(0, 140));

    // интерфейс настроек с живым помощником
    await b.eval(`document.querySelector('#gear').click(); 1`);
    await b.waitFor(`document.querySelector('#ovtoggle')`, 20000, 'блок помощника');
    check('в настройках статус «не запущен»', await b.eval(`document.querySelector('#ovstate').textContent.includes('не запущен')`));
    await b.eval(`document.querySelector('#ovtoggle').click(); 1`);
    await b.waitFor(`document.querySelector('#ovstate').textContent.includes('работает')`, 30000, 'запуск помощника');
    check('помощник реально запущен из окна', true);
    const state = await b.eval(`pywebview.api.overlay_state()`);
    check('статус содержит pid живого процесса', !!state.pid && spawnSync('tasklist', ['/FI', `PID eq ${state.pid}`]).stdout.toString().includes(String(state.pid)), `pid ${state.pid}`);
    await b.shot(path.join(OUT, '7_real_app_settings.png'));
    await b.eval(`document.querySelector('#ovtoggle').click(); 1`);
    await b.waitFor(`document.querySelector('#ovstate').textContent.includes('не запущен')`, 30000, 'остановка');
    await new Promise(r => setTimeout(r, 800));
    check('после остановки процесс помощника завершён', !spawnSync('tasklist', ['/FI', `PID eq ${state.pid}`]).stdout.toString().includes(String(state.pid)));

    // обычная работа приложения
    await b.eval(`document.querySelector('#sclose').click(); document.querySelector('#q').value='86745912'; document.querySelector('#f').requestSubmit(); 1`);
    await b.waitFor(`document.querySelector('#stats .hero-card') || document.querySelector('#stats .msg.err')`, 90000, 'профиль');
    check('профиль загружается в настоящем окне', await b.eval(`!!document.querySelector('#stats .hero-card')`));
    check('ошибок консоли нет', b.errors.length === 0, b.errors.join(' | '));
  } catch (e) {
    check('сценарий дошёл до конца', false, e.message + '\n--- вывод приложения ---\n' + log.slice(-800));
  } finally {
    if (b) await b.close();
    spawnSync('taskkill', ['/PID', String(app.pid), '/F', '/T']);
  }
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} проверок прошло`);
  process.exit(failed ? 1 : 0);
})();
