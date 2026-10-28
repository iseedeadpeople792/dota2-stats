// Живая проверка: реальный браузер, реальный OpenDota. Запуск: node tests/e2e/smoke.cjs
const path = require('node:path');
const { launch } = require('./driver.cjs');
const OUT = path.resolve(__dirname, '..', '..', 'work_shots');
require('node:fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await launch();
  const results = [];
  const check = (name, ok, extra = '') => { results.push([name, ok, extra]); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
  try {
    await b.goto(b.base + '/');
    check('страница загрузилась без ошибок', b.errors.length === 0, b.errors.join(' | '));
    check('вкладки на месте', (await b.eval(`document.querySelectorAll('#tabs [data-tab]').length`)) === 4);

    // 1) статистика игрока
    await b.eval(`document.querySelector('#q').value='86745912'; document.querySelector('#f').requestSubmit(); 1`);
    await b.waitFor(`document.querySelector('#stats .hero-card') || document.querySelector('#stats .msg.err')`, 90000, 'профиль');
    const err1 = await b.eval(`(document.querySelector('#stats .msg.err')||{}).textContent||''`);
    check('профиль загрузился', !err1, err1);
    check('есть 20 строк матчей', (await b.eval(`document.querySelectorAll('#stats tbody tr.rw, #stats tbody tr.rl').length`)) === 20);
    await b.shot(path.join(OUT, '1_stats.png'));

    // 2) разбор матча
    await b.eval(`document.querySelector('[data-m]').click(); 1`);
    await b.waitFor(`document.querySelector('#mbody .team') || document.querySelector('#mbody .msg.err')`, 60000, 'матч');
    const err2 = await b.eval(`(document.querySelector('#mbody .msg.err')||{}).textContent||''`);
    check('разбор матча открылся', !err2, err2);
    check('в матче 10 игроков', (await b.eval(`document.querySelectorAll('#mbody tbody tr').length`)) === 10);
    await b.shot(path.join(OUT, '2_match.png'));
    await b.eval(`document.querySelector('#mclose').click(); 1`);

    // 2b) динамика
    await b.eval(`document.querySelector('[data-tab=trends]').click(); 1`);
    await b.waitFor(`document.querySelector('#trends .chartbox') || document.querySelector('#trends .msg.err')`, 60000, 'динамика');
    const errT = await b.eval(`(document.querySelector('#trends .msg.err')||{}).textContent||''`);
    check('динамика построилась', !errT, errT);
    check('на «Динамике» есть формы, 2 графика и разрезы', (await b.eval(`document.querySelectorAll('#trends .kpi').length`)) >= 3 && (await b.eval(`document.querySelectorAll('#trends .chartbox svg polyline').length`)) >= 2 && (await b.eval(`document.querySelectorAll('#trends .pbar').length`)) >= 10);
    await b.shot(path.join(OUT, '2b_trends.png'));

    // 2c) добивание
    await b.eval(`document.querySelector('[data-tab=lasthit]').click(); 1`);
    await b.waitFor(`document.querySelector('#lasthit .bench .pbar') || document.querySelector('#lasthit .msg.err')`, 90000, 'добивание');
    const errL = await b.eval(`(document.querySelector('#lasthit .msg.err')||{}).textContent||''`);
    check('добивание построилось', !errL, errL);
    check('показаны эталоны по героям с перцентилем', (await b.eval(`document.querySelectorAll('#lasthit .bench b').length`)) >= 1 && !(await b.eval(`document.querySelector('#lasthit .bench b').textContent.startsWith('—')`)));
    await b.eval(`document.querySelector('#deep').click(); 1`);
    await b.waitFor(`document.querySelector('#lasthit table') || document.querySelector('#lasthit .msg.err') || document.querySelector('#lasthit .msg:not(.spin)')`, 120000, 'разбор по минутам');
    check('разбор по минутам дал таблицу', await b.eval(`!!document.querySelector('#lasthit table')`), await b.eval(`(document.querySelector('#lasthit .msg')||{}).textContent||''`));
    await b.shot(path.join(OUT, '2c_lasthit.png'));

    // 3) помощник пиков
    await b.eval(`document.querySelector('[data-tab=picks]').click(); 1`);
    await b.waitFor(`document.querySelectorAll('#grid button').length > 100`, 30000, 'сетка героев');
    for (const n of [0, 5, 9]) await b.eval(`document.querySelectorAll('#grid button:not([disabled])')[${n}].click(); 1`);
    check('выбрано 3 врага', (await b.eval(`document.querySelectorAll('.side.e .slot').length`)) === 3);
    await b.eval(`document.querySelector('#go').click(); 1`);
    await b.waitFor(`document.querySelector('.sug .row') || document.querySelector('#picks .msg.err')`, 90000, 'подсказки');
    const err3 = await b.eval(`(document.querySelector('#picks .msg.err')||{}).textContent||''`);
    check('подсказки посчитаны', !err3, err3);
    check('12 подсказок и список «не брать»', (await b.eval(`document.querySelectorAll('.sug .row').length`)) === 12 && (await b.eval(`document.querySelectorAll('.avoid .slot').length`)) === 5);
    check('есть объяснение «почему»', (await b.eval(`document.querySelectorAll('.sug .why').length`)) > 0);
    await b.shot(path.join(OUT, '3_picks.png'));
    await b.eval(`document.querySelector('[data-items]').click(); 1`);
    await b.waitFor(`document.querySelector('.items-pop .ph') || document.querySelector('.items-pop')`, 30000, 'предметы');
    await b.waitFor(`!document.querySelector('.items-pop').textContent.includes('Загружаю')`, 30000, 'предметы загружены');
    check('показаны популярные предметы', (await b.eval(`document.querySelectorAll('.items-pop img').length`)) > 0);
    // лимит врагов 5
    for (let i = 0; i < 4; i++) await b.eval(`(document.querySelectorAll('#grid button:not([disabled])')[0]||{click(){}}).click(); 1`);
    check('врагов не больше 5', (await b.eval(`document.querySelectorAll('.side.e .slot').length`)) === 5);
    // поиск обновляет только сетку
    await b.eval(`const i=document.querySelector('#hs'); i.value='axe'; i.dispatchEvent(new Event('input')); 1`);
    check('поиск «axe» оставил 1 героя', (await b.eval(`document.querySelectorAll('#grid button').length`)) === 1);

    // 4) настройки
    await b.eval(`document.querySelector('#gear').click(); 1`);
    check('окно настроек открылось', await b.eval(`!document.querySelector('#settings').hidden && !!document.querySelector('#key')`));
    await b.shot(path.join(OUT, '4_settings.png'));
    await b.eval(`document.querySelector('#sclose').click(); 1`);

    // 5) перезапуск: аккаунт подгружается сам, ответы из кэша
    await b.goto(b.base + '/');
    await b.waitFor(`document.querySelector('#stats .hero-card')`, 30000, 'автозагрузка профиля');
    check('после перезапуска профиль загрузился сам', true);
    check('итого ошибок консоли: 0', b.errors.length === 0, b.errors.join(' | '));
  } catch (e) {
    check('сценарий дошёл до конца', false, e.message);
    await b.shot(path.join(OUT, 'fail.png')).catch(() => {});
  } finally {
    await b.close();
  }
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} проверок прошло`);
  process.exit(failed ? 1 : 0);
})();
