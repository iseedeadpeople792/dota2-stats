// Общее состояние, доступ к OpenDota и справочники.
const $ = s => document.querySelector(s);
const { esc, fmt, fmt1, pct, dur, ago, rankName, rankColor, modeName, isWin } = Core;
const IMG = 'https://cdn.cloudflare.steamstatic.com';
const wait = ms => new Promise(r => setTimeout(r, ms));

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* нет места или запрещено */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
const odApi = ApiFactory.createApi({
  fetchFn: u => fetch(u),
  storage: (() => { try { return localStorage; } catch { return null; } })(),
  getKey: () => store.get('od_key') || '',
});
const api = (path, opts) => odApi.get(path, opts);

const App = { heroes: [], heroById: {}, me: null, meta: null, itemById: null };

const heroImg = h => (h ? IMG + '/apps/dota2/images/dota_react/heroes/' + h.name.replace('npc_dota_hero_', '') + '.png' : '');
const heroTag = id => {
  const h = App.heroById[id];
  return h ? `<span class="hero"><img src="${heroImg(h)}" alt="" loading="lazy">${esc(h.localized_name)}</span>` : `Герой ${id}`;
};

async function ensureHeroes() {
  if (App.heroes.length) return;
  const rows = await api('/heroes', { shrink: d => d.map(h => ({ id: h.id, name: h.name, localized_name: h.localized_name, roles: h.roles, primary_attr: h.primary_attr, attack_type: h.attack_type })) });
  App.heroes = [...rows].sort((a, b) => a.localized_name.localeCompare(b.localized_name));
  App.heroById = Object.fromEntries(App.heroes.map(h => [h.id, h]));
}

// Мета-статистика героев по рангам (для поправки в помощнике пиков)
async function ensureMeta() {
  if (App.meta) return App.meta;
  try { App.meta = new Map((await api('/heroStats', { shrink: PickCore.shrinkHeroStats })).map(r => [r.id, r])); }
  catch { App.meta = new Map(); }       // без меты помощник работает, просто без поправки
  return App.meta;
}

async function ensureItems() {
  if (App.itemById) return;
  try {
    const rows = await api('/constants/items', { shrink: c => Object.values(c).filter(v => v.id).map(v => ({ id: v.id, dname: v.dname, img: v.img })) });
    App.itemById = Object.fromEntries(rows.map(r => [r.id, r]));
  } catch { App.itemById = {}; }        // без картинок предметов таблицы всё равно покажутся
}
const itemImg = id => {
  const it = App.itemById && App.itemById[id];
  return it && it.img ? `<img src="${IMG}${esc(it.img)}" title="${esc(it.dname)}" alt="${esc(it.dname)}" loading="lazy">` : '<span class="empty"></span>';
};

const msg = (text, cls = '') => `<div class="msg ${cls}">${text}</div>`;
const errMsg = e => msg(esc(e && e.message ? e.message : String(e)), 'err');

// ---------- вкладки ----------
const tabs = {};     // имя -> { el, show(): вызывается при открытии }
function registerTab(name, show) { tabs[name] = { el: $('#' + name), show }; }
function openTab(name) {
  for (const [n, t] of Object.entries(tabs)) t.el.hidden = n !== name;
  document.querySelectorAll('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (tabs[name] && tabs[name].show) tabs[name].show();
  window.scrollTo(0, 0);
  store.set('dota_tab', name);
}

// ---------- окна ----------
function openModal(id) { $('#' + id).hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal(id) { $('#' + id).hidden = true; document.body.style.overflow = ''; }

// ---------- мост к Python (есть только внутри приложения, не в обычном браузере) ----------
const bridge = () => (window.pywebview && window.pywebview.api) || null;
