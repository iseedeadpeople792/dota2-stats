// Небольшие SVG-графики без библиотек.
const Charts = (() => {
  // series: [{ name, color, values: number[] }], общая ось X по индексу. opts: { w, h, min, max, baseline, fmtY }
  function line(series, opts = {}) {
    const W = opts.w || 640, H = opts.h || 170, padL = 38, padB = 6, padT = 8;
    const all = series.flatMap(s => s.values).filter(Number.isFinite);
    if (all.length < 2) return '<div class="muted">Мало данных для графика.</div>';
    let min = opts.min ?? Math.min(...all), max = opts.max ?? Math.max(...all);
    if (max - min < 1e-9) { max += 1; min -= 1; }
    const n = Math.max(...series.map(s => s.values.length));
    const x = i => padL + (i / Math.max(1, n - 1)) * (W - padL - 6);
    const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    const f = opts.fmtY || (v => String(Math.round(v * 10) / 10));
    const ticks = [min, (min + max) / 2, max];
    const grid = ticks.map(v => `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,.08)"/><text x="${padL - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#8e99ab">${f(v)}</text>`).join('');
    const base = opts.baseline !== undefined && opts.baseline >= min && opts.baseline <= max
      ? `<line x1="${padL}" y1="${y(opts.baseline).toFixed(1)}" x2="${W}" y2="${y(opts.baseline).toFixed(1)}" stroke="rgba(255,255,255,.35)" stroke-dasharray="4 4"/>` : '';
    const lines = series.map(s => `<polyline points="${s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"/>`).join('');
    const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'График')}">${grid}${base}${lines}</svg>${legend}</div>`;
  }

  // Строки «название — игры — полоса винрейта» с отметкой 50%
  function winBars(rows, minGames = 8) {
    return `<div class="bench">${rows.map(r => {
      const ok = r.games >= minGames && r.wr !== null;
      const w = r.wr === null ? 0 : r.wr * 100;
      return `<div><span>${esc(r.label)}</span> <span class="muted">· ${r.games} игр${r.games && r.games < minGames ? ', мало данных' : ''}</span>
        <div class="pbar" style="margin-top:3px;opacity:${ok ? 1 : 0.45}"><i style="width:${w}%"></i><u style="left:50%"></u></div></div>
        <b class="${r.wr === null ? 'muted' : r.wr >= 0.5 ? 'win' : 'loss'}">${r.wr === null ? '—' : fmt1(w) + '%'}</b>`;
    }).join('')}</div>`;
  }
  return { line, winBars };
})();
