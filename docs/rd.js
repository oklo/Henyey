/* OLD RED DWARFS site application: job, printer, LBA97-style figures.
   No dependencies. Companion to site.js, for the FORTRAN 77 line. */
"use strict";

/* ---------- theme ---------- */
const root = document.documentElement;
document.getElementById("themeToggle").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = root.dataset.theme || (dark ? "dark" : "light");
  root.dataset.theme = cur === "dark" ? "light" : "dark";
  renderAll();
});

/* ---------- run state ---------- */
const F = id => document.getElementById(id);
const state = { mass: 0.10, x: 0.700, z: 0.020, x3: 0.0, models: 4300, dtyr: 1e4,
                alfa: 1.36, mesh: 151, clim: 0.2, eps: 5e-4, nprin: 250,
                ieos: 0, iopc: 0, ihay: 1 };
const presets = {
  complete:  { mass: 0.10, x: 0.700, z: 0.020, models: 4300, dtyr: 1e4, alfa: 1.36, nprin: 250, ihay: 1 },
  flagship:  { mass: 0.10, x: 0.700, z: 0.020, models: 1200, dtyr: 1e4, alfa: 1.36, nprin: 60,  ihay: 1 },
  browndwarf:{ mass: 0.08, x: 0.700, z: 0.020, models: 450,  dtyr: 1e4, alfa: 1.36, nprin: 50,  ihay: 1 },
  m015:      { mass: 0.15, x: 0.700, z: 0.020, models: 600,  dtyr: 1e4, alfa: 1.36, nprin: 60,  ihay: 1 },
  m020:      { mass: 0.20, x: 0.700, z: 0.020, models: 600,  dtyr: 1e4, alfa: 1.36, nprin: 60,  ihay: 1 },
  m030:      { mass: 0.30, x: 0.700, z: 0.020, models: 400,  dtyr: 1e8, alfa: 1.36, nprin: 50,  ihay: 0 },
  sun:       { mass: 1.00, x: 0.735, z: 0.020, models: 50,   dtyr: 1e7, alfa: 1.79, nprin: 10,  ihay: 0 },
};
F("preset").addEventListener("change", e => {
  Object.assign(state, presets[e.target.value]);
  F("f_mass").value = state.mass; F("f_x").value = state.x;
  F("f_models").value = state.models; F("f_dtyr").value = state.dtyr;
  F("f_alfa").value = state.alfa; F("f_ihay").checked = state.ihay === 1;
  renderJob();
});
for (const [id, key] of [["f_mass","mass"],["f_x","x"],
                         ["f_models","models"],["f_dtyr","dtyr"],["f_alfa","alfa"]]) {
  F(id).addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    if (isFinite(v)) { state[key] = v; renderJob(); }
  });
}
F("f_ihay").addEventListener("change", e => { state.ihay = e.target.checked ? 1 : 0; renderJob(); });

/* Fortran field images */
const f105 = v => v.toFixed(5).padStart(10);
const i5   = v => String(Math.round(v)).padStart(5);
function e103(v) {
  const ex = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / Math.pow(10, ex);
  const es = (ex < 0 ? "-" : "+") + String(Math.abs(ex)).padStart(2, "0");
  return (mant.toFixed(3) + "E" + es).padStart(10);
}
function deckLines() {
  const c1 = f105(state.mass) + f105(state.x) + f105(state.z) + f105(state.x3);
  const c2 = i5(state.mesh) + i5(Math.min(6000, Math.max(1, state.models))) +
             e103(state.dtyr) + f105(state.clim) + e103(state.eps) +
             i5(state.nprin) + f105(state.alfa) +
             i5(state.ieos) + i5(state.iopc) + i5(state.ihay);
  return [c1, c2];
}
function renderJob() {
  const [c1, c2] = deckLines();
  document.getElementById("deckListing").textContent =
    "$ run reddwarf  <<EOF                      ! FORTRAN 77, double precision\n" +
    c1 + "\n" + c2 + "\nEOF";
}

/* ---------- job control ---------- */
let worker = null, run = null, renderTimer = null;
const printerScroll = document.getElementById("printerScroll");
const jobStatus = document.getElementById("jobStatus");

function newRun() {
  return { lines: [], track: [], structures: [], curStruct: null, lastModel: 0, done: false,
           ihay: state.ihay };
}
const TRACK_RE = /^ +(\d+) +([\d.]+E[+-]\d+) +([\d.]+E[+-]\d+) +(\d+) +([-\d.]+E[+-]\d+) +([-\d.]+E[+-]\d+) +([-\d.]+E[+-]\d+) +([-\d.]+E[+-]\d+) +([-\d.]+E[+-]\d+) +([-\d.]+E[+-]\d+) +([-\d.]+E[+-]\d+)/;
function handleLine(l) {
  run.lines.push(l);
  const m = TRACK_RE.exec(l);
  if (m) {
    run.track.push({ model: +m[1], age: +m[2], dt: +m[3], it: +m[4], L: +m[5], R: +m[6],
                     Teff: +m[7], Tc: +m[8], rhoc: +m[9], Pc: +m[10], Xc: +m[11] });
    run.lastModel = +m[1];
    return;
  }
  if (/^0? {2}J\s+XI\s/.test(l)) { run.curStruct = { model: run.lastModel, pts: [] }; return; }
  if (run.curStruct) {
    const t = l.trim().split(/\s+/);
    if (t.length === 13 && /^\d+$/.test(t[0])) {
      run.curStruct.pts.push({ j:+t[0], xi:+t[1], mm:+t[2], r:+t[3], l:+t[4], T:+t[5],
                               rho:+t[6], P:+t[7], X:+t[8], x3:+t[9], kap:+t[10],
                               eps:+t[11], cv:+t[12] });
      return;
    }
    if (run.curStruct.pts.length > 5) {
      const last = run.structures[run.structures.length - 1];
      if (!last || last.model !== run.curStruct.model) run.structures.push(run.curStruct);
    }
    run.curStruct = null;
  }
}
function submitJob() {
  if (worker) worker.terminate();
  worker = new Worker("rdworker.js");
  run = newRun();
  printerScroll.textContent = "";
  jobStatus.textContent = "JOB SUBMITTED — reading the input…";
  const deck = deckLines().join("\n") + "\n";
  const t0 = performance.now();
  worker.onmessage = ev => {
    if (ev.data.type === "lines") {
      const frag = document.createDocumentFragment();
      for (const l of ev.data.lines) {
        handleLine(l);
        const div = document.createElement("div");
        div.textContent = l.length ? l : " ";
        if (TRACK_RE.test(l)) div.className = "hl";
        frag.appendChild(div);
      }
      printerScroll.appendChild(frag);
      jobStatus.textContent = `JOB RUNNING — model ${run.lastModel} · ${Math.round(performance.now() - t0)} ms`;
      if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; renderAll(); }, 160);
    } else if (ev.data.type === "done") {
      run.done = true;
      const tk = run.track;
      const span = tk.length ? tk[tk.length - 1].age : 0;
      const spanTxt = span >= 1e12 ? (span/1e12).toFixed(2) + " trillion years"
                    : span >= 1e9  ? (span/1e9).toFixed(2) + " Gyr"
                    : (span/1e6).toFixed(1) + " Myr";
      jobStatus.textContent =
        `JOB COMPLETE — ${tk.length} models · ${spanTxt} of evolution in ${ev.data.ms} ms`;
      printerScroll.scrollTop = 0;
      renderAll(); renderTable();
    } else if (ev.data.type === "error") {
      jobStatus.textContent = "MACHINE CHECK — " + ev.data.message;
    }
  };
  worker.postMessage({ type: "run", deck });
}
document.getElementById("submitJob").addEventListener("click", submitJob);

/* ---------- chart library (multi-series capable) ---------- */
const tooltip = document.getElementById("tooltip");
function niceTicks(lo, hi, n) {
  if (!(hi > lo)) hi = lo + 1;
  const span = hi - lo, step0 = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = span / n / step0;
  const step = step0 * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const t = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * span; v += step) t.push(v);
  return t;
}
function fmtNum(v) {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e5 || a < 1e-2) { const e = Math.floor(Math.log10(a)); return (v/10**e).toFixed(1) + "e" + e; }
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return (+v.toFixed(2)).toString();
  return (+v.toFixed(3)).toString();
}
function logTicks(a, b) {
  const t = [], span = b - a;
  const mant = span <= 1.6 ? [1, 2, 3, 5] : (span <= 3.4 ? [1, 2, 5] : [1]);
  for (let e = Math.floor(a) - 1; e <= Math.ceil(b) + 1; e++)
    for (const m of mant) {
      const v = e + Math.log10(m);
      if (v >= a - 1e-9 && v <= b + 1e-9) t.push(v);
    }
  return t;
}
const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³",
  "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
function logLab(v) {
  const val = Math.pow(10, v);
  if (val >= 0.001 - 1e-12 && val <= 9999) {
    if (val >= 1) return String(Math.round(val));
    return String(+val.toPrecision(1));
  }
  const e = Math.round(v);
  return "10" + String(e).split("").map(c => SUP[c] || c).join("");
}
let CLIPN = 0;
function lineChart(el, spec) {
  const W = spec.w || 460, H = spec.h || 355, L = 64, R = 14, T = 14, B = 40;
  const lgx = spec.logx, lgy = spec.logy;
  const series = (spec.series || [{ pts: spec.pts, dots: spec.dots, lw: spec.lw }]).map(sr => ({
    ...sr,
    pts: sr.pts.filter(p => isFinite(p.x) && isFinite(p.y)
      && (!lgy || p.y > 0) && (!lgx || p.x > 0)),
  }));
  el.innerHTML = "";
  const main = series[0].pts;
  if (main.length < 2) { el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text x="${W/2}" y="${H/2}" text-anchor="middle" font-family="var(--serif)" font-style="italic" font-size="13" fill="var(--ink-3)">awaiting job</text></svg>`; return; }
  const tx = v => lgx ? Math.log10(v) : v;
  const ty = v => lgy ? Math.log10(v) : v;
  let x0, x1, y0, y1;
  const allx = series.flatMap(sr => sr.pts.map(p => tx(p.x)));
  const ally = series.flatMap(sr => sr.pts.map(p => ty(p.y)));
  if (spec.xrange) { x0 = tx(spec.xrange[0]); x1 = tx(spec.xrange[1]); }
  else { x0 = Math.min(...allx); x1 = Math.max(...allx); if (x1 - x0 < 1e-12) x1 = x0 + 1; }
  if (spec.yrange) { y0 = ty(spec.yrange[0]); y1 = ty(spec.yrange[1]); }
  else {
    y0 = Math.min(...ally); y1 = Math.max(...ally);
    const yp = (y1 - y0 || Math.abs(y0) || 1) * 0.08; y0 -= yp; y1 += yp;
  }
  const X = v => L + ((spec.xrev ? (x1 - v) : (v - x0)) / (x1 - x0)) * (W - L - R);
  const Y = v => H - B - (v - y0) / (y1 - y0) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  if (spec.bands) for (const b of spec.bands) {
    const a = X(tx(b[0])), c = X(tx(b[1]));
    s += `<rect x="${Math.min(a,c)}" y="${T}" width="${Math.abs(c-a)}" height="${H-T-B}" fill="var(--band)"/>`;
  }
  const ytk = lgy ? logTicks(y0, y1) : niceTicks(y0, y1, 4);
  const xtk = lgx ? logTicks(x0, x1) : niceTicks(x0, x1, 5);
  for (const v of ytk) {
    s += `<line x1="${L}" x2="${L+5}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--ink)" stroke-width="0.9"/>`;
    s += `<line x1="${W-R}" x2="${W-R-5}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--ink)" stroke-width="0.9"/>`;
    const lab = lgy ? logLab(v) : fmtNum(v);
    s += `<text x="${L-5}" y="${Y(v)+3.5}" text-anchor="end" font-family="var(--serif)" font-size="11.5" fill="var(--ink-2)">${lab}</text>`;
  }
  for (const v of xtk) {
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${H-B}" y2="${H-B-5}" stroke="var(--ink)" stroke-width="0.9"/>`;
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${T+5}" stroke="var(--ink)" stroke-width="0.9"/>`;
    const lab = lgx ? logLab(v) : fmtNum(v);
    s += `<text x="${X(v)}" y="${H-B+15}" text-anchor="middle" font-family="var(--serif)" font-size="11.5" fill="var(--ink-2)">${lab}</text>`;
  }
  s += `<rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="none" stroke="var(--ink)" stroke-width="1.1"/>`;
  const cid = "rdclip" + (CLIPN++);
  s += `<defs><clipPath id="${cid}"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>`;
  s += `<g clip-path="url(#${cid})">`;
  s += `<text x="${(L+W-R)/2}" y="${H-3}" text-anchor="middle" font-family="var(--serif)" font-style="italic" font-size="12" fill="var(--ink-2)">${spec.xlab}</text>`;
  if (spec.ylab) {
    const cy = (T + H - B) / 2;
    s += `<text transform="rotate(-90 13 ${cy})" x="13" y="${cy+4}" text-anchor="middle" font-family="var(--serif)" font-style="italic" font-size="12" fill="var(--ink-2)">${spec.ylab}</text>`;
  }
  for (const sr of series) {
    const px = sr.pts.map(p => X(tx(p.x))), py = sr.pts.map(p => Y(ty(p.y)));
    let d = "";
    for (let i = 0; i < sr.pts.length; i++) d += (i ? "L" : "M") + px[i].toFixed(1) + " " + py[i].toFixed(1);
    s += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="${sr.lw || 1.6}"` +
         (sr.dash ? ` stroke-dasharray="${sr.dash}"` : "") + ` stroke-linejoin="round"/>`;
    if (sr.dots) for (let i = 0; i < sr.pts.length; i++)
      s += `<circle cx="${px[i].toFixed(1)}" cy="${py[i].toFixed(1)}" r="1.9" fill="var(--ink)"/>`;
    if (sr.label) {
      const li = Math.floor(sr.pts.length * (sr.labelAt == null ? 0.5 : sr.labelAt));
      s += `<text x="${px[li]}" y="${py[li] - 7}" text-anchor="middle" font-family="var(--serif)" font-style="italic" font-size="11.5" fill="var(--ink-2)">${sr.label}</text>`;
    }
  }
  /* direction arrows and current-model point apply to the first series */
  const xs = main.map(p => tx(p.x)), ys = main.map(p => ty(p.y));
  if (spec.arrows) {
    const seg = [0];
    for (let i = 1; i < main.length; i++)
      seg.push(seg[i-1] + Math.hypot(X(xs[i])-X(xs[i-1]), Y(ys[i])-Y(ys[i-1])));
    const total = seg[seg.length-1];
    for (const f of spec.arrows) {
      const target = f * total;
      let i = 1; while (i < main.length-1 && seg[i] < target) i++;
      const dx = X(xs[i]) - X(xs[i-1]), dy = Y(ys[i]) - Y(ys[i-1]);
      if (dx === 0 && dy === 0) continue;
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const mx = (X(xs[i]) + X(xs[i-1])) / 2, my = (Y(ys[i]) + Y(ys[i-1])) / 2;
      s += `<path d="M6 0 L-4 4 L-4 -4 z" transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${ang.toFixed(1)})" fill="var(--ink)" opacity="0.32"/>`;
    }
  }
  if (spec.mark !== false) {
    const li = main.length - 1;
    s += `<circle cx="${X(xs[li])}" cy="${Y(ys[li])}" r="3.4" fill="var(--red)"/>`;
  }
  s += `</g>`;
  /* event annotations in the journal manner - a dot, a short
     leader, an italic label */
  if (spec.notes) for (const n of spec.notes) {
    const px = X(tx(n.x)), py = Y(ty(n.y));
    if (px < L - 2 || px > W - R + 2 || py < T - 2 || py > H - B + 2) continue;
    s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.4" fill="none" stroke="var(--ink)" stroke-width="1"/>`;
    s += `<line x1="${(px + n.dx * 0.25).toFixed(1)}" y1="${(py + n.dy * 0.25).toFixed(1)}" x2="${(px + n.dx * 0.8).toFixed(1)}" y2="${(py + n.dy * 0.8).toFixed(1)}" stroke="var(--ink-3)" stroke-width="0.8"/>`;
    s += `<text x="${(px + n.dx).toFixed(1)}" y="${(py + n.dy + 3.5).toFixed(1)}" text-anchor="${n.anchor || "start"}" font-family="var(--serif)" font-style="italic" font-size="10.5" fill="var(--ink-2)">${n.text}</text>`;
  }
  if (spec.extraSVG) s += spec.extraSVG;
  s += `<line id="ch" x1="0" x2="0" y1="${T}" y2="${H-B}" stroke="var(--ink-3)" stroke-width="1" visibility="hidden"/>`;
  s += `<circle id="hp" r="4" fill="none" stroke="var(--red)" stroke-width="2" visibility="hidden"/>`;
  s += `</svg>`;
  el.innerHTML = s;
  if (!spec.tip) return;
  const svg = el.firstChild, ch = svg.querySelector("#ch"), hp = svg.querySelector("#hp");
  svg.addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect();
    const mx = (ev.clientX - r.left) / r.width * W;
    let best = 0, bd = 1e30;
    for (let i = 0; i < main.length; i++) { const d2 = Math.abs(X(xs[i]) - mx); if (d2 < bd) { bd = d2; best = i; } }
    const p = main[best];
    ch.setAttribute("x1", X(xs[best])); ch.setAttribute("x2", X(xs[best]));
    ch.setAttribute("visibility", "visible");
    hp.setAttribute("cx", X(xs[best])); hp.setAttribute("cy", Y(ys[best]));
    hp.setAttribute("visibility", "visible");
    tooltip.hidden = false;
    tooltip.innerHTML = spec.tip(p);
    const tw = tooltip.offsetWidth;
    tooltip.style.left = Math.min(ev.clientX + 14, innerWidth - tw - 8) + "px";
    tooltip.style.top = (ev.clientY + 14) + "px";
  });
  svg.addEventListener("mouseleave", () => {
    ch.setAttribute("visibility", "hidden"); hp.setAttribute("visibility", "hidden"); tooltip.hidden = true;
  });
}

/* ---------- figures ---------- */
function ageLab(a) {
  if (a >= 1e12) return (a/1e12).toFixed(2) + " Tyr";
  if (a >= 1e9)  return (a/1e9).toFixed(2) + " Gyr";
  return (a/1e6).toFixed(1) + " Myr";
}
function renderAll() {
  renderJob();
  if (!run || run.track.length < 2) return;
  const tk = run.track;
  /* core-composition samples from the printed structures (used by
     the HR inset, the annotations, and Fig. 2) */
  const tX3 = run.structures.map(st => {
    const trk = tk.find(t => t.model === st.model);
    return trk ? { x: trk.age / 1e12, x3: st.pts[0].x3, X: st.pts[0].X, model: st.model } : null;
  }).filter(Boolean);
  /* Fig. 1 — the HR diagram in the manner of LBA97 Fig. 1: linear
     effective temperature, hot to the left, log luminosity, one dot
     per converged model, the life's milestones labeled along the
     track, and the core composition inset. */
  const teMax = Math.max(6000, Math.ceil(Math.max(...tk.map(p => p.Teff)) / 1000) * 1000);
  const lMin = Math.min(...tk.map(p => p.L).filter(v => v > 0));
  const lMax = Math.max(...tk.map(p => p.L));
  const notes = [];
  if (run.ihay && tk.length > 30) {
    notes.push({ x: tk[3].Teff, y: tk[3].L, text: "Hayashi track", dx: 16, dy: -8 });
    /* the zero-age main sequence: the luminosity minimum of the
       contraction phase */
    let zi = -1, zl = 1e30;
    for (let i = 5; i < tk.length / 2; i++) if (tk[i].L < zl) { zl = tk[i].L; zi = i; }
    if (zi > 5 && zi < tk.length / 2 - 1 && tk[zi].L < tk[3].L / 3)
      notes.push({ x: tk[zi].Teff, y: tk[zi].L, text: "Z.A.M.S.", dx: 20, dy: 22 });
  }
  if (tX3.length > 2) {
    let mi = 0;
    tX3.forEach((q, i) => { if (q.x3 > tX3[mi].x3) mi = i; });
    if (tX3[mi].x3 > 0.01 && mi > 0 && mi < tX3.length - 1) {
      const trk = tk.find(t => t.model === tX3[mi].model);
      if (trk) notes.push({ x: trk.Teff, y: trk.L, text: `³He = ${(tX3[mi].x3 * 100).toFixed(1)}%`, dx: 18, dy: 18 });
    }
  }
  const ei = tk.findIndex(p => p.Xc < 1e-3);
  if (ei > 30) notes.push({ x: tk[ei].Teff, y: tk[ei].L, text: "core H exhausted", dx: 14, dy: -12 });
  let ci = 0;
  tk.forEach((p, i) => { if (p.Teff > tk[ci].Teff) ci = i; });
  if (run.ihay && ci > tk.length * 0.5 && tk[ci].Teff > 4500)
    notes.push({ x: tk[ci].Teff, y: tk[ci].L, text: `the corner — ${Math.round(tk[ci].Teff)} K`, dx: -6, dy: -16, anchor: "middle" });
  const lp = tk[tk.length - 1];
  if (run.done && run.ihay && lp.L < 1e-4 && ci < tk.length - 5)
    notes.push({ x: lp.Teff, y: lp.L, text: "helium white dwarf", dx: -14, dy: -12, anchor: "end" });
  /* the composition inset, in the paper's own manner */
  let inset = "";
  if (run.ihay && tX3.length > 2 && tk[tk.length - 1].age > 5e11) {
    const x0 = 118, iy0 = 252, iw = 175, ih = 112;
    const tmax = Math.max(...tX3.map(q => q.x), tk[tk.length - 1].age / 1e12);
    const xI = v => x0 + (v / tmax) * iw;
    const yI = v => iy0 + ih - Math.max(0, Math.min(1, v)) * ih;
    const path = (pts) => pts.map((p, i) => (i ? "L" : "M") + xI(p[0]).toFixed(1) + " " + yI(p[1]).toFixed(1)).join("");
    const hSeries = tk.filter((p, i) => i % 5 === 0 || i === tk.length - 1).map(p => [p.age / 1e12, p.Xc]);
    const he4 = tX3.map(q => [q.x, Math.max(0, 1 - q.X - q.x3 - state.z)]);
    const he3 = tX3.map(q => [q.x, q.x3]);
    inset =
      `<g font-family="var(--serif)" font-size="9.5" fill="var(--ink-2)">` +
      `<rect x="${x0}" y="${iy0}" width="${iw}" height="${ih}" fill="var(--paper)" stroke="var(--ink)" stroke-width="0.9"/>` +
      `<path d="${path(hSeries)}" fill="none" stroke="var(--ink)" stroke-width="1.2"/>` +
      `<path d="${path(he4)}" fill="none" stroke="var(--ink)" stroke-width="1.0"/>` +
      `<path d="${path(he3)}" fill="none" stroke="var(--ink)" stroke-width="0.9" stroke-dasharray="4 2.5"/>` +
      `<text x="${x0 + iw / 2}" y="${iy0 - 5}" text-anchor="middle" font-style="italic">core composition</text>` +
      `<text x="${xI(hSeries[0][0]) + 4}" y="${yI(hSeries[0][1]) + 10}" font-style="italic">H</text>` +
      (he4.length ? `<text x="${(xI(he4[he4.length - 1][0]) - 12).toFixed(1)}" y="${(yI(he4[he4.length - 1][1]) + 12).toFixed(1)}" font-style="italic">⁴He</text>` : "") +
      (tX3.length > 2 ? `<text x="${xI(tX3[Math.floor(tX3.length / 2)].x).toFixed(1)}" y="${(yI(tX3[Math.floor(tX3.length / 2)].x3) - 5).toFixed(1)}" font-style="italic">³He</text>` : "") +
      `<text x="${x0}" y="${iy0 + ih + 11}" font-size="8.5">0</text>` +
      `<text x="${x0 + iw}" y="${iy0 + ih + 11}" text-anchor="end" font-size="8.5">${tmax.toFixed(1)} Tyr</text>` +
      `<text x="${x0 - 4}" y="${iy0 + ih + 3}" text-anchor="end" font-size="8.5">0</text>` +
      `<text x="${x0 - 4}" y="${iy0 + 8}" text-anchor="end" font-size="8.5">1</text>` +
      `</g>`;
  }
  lineChart(document.getElementById("hrBox"), {
    w: 620, h: 430,
    pts: tk.map(p => ({ x: p.Teff, y: p.L, p })), logy: true, logx: false, xrev: true,
    dots: true, lw: 0.6, arrows: [0.12, 0.45, 0.85],
    xrange: [1000, teMax], yrange: [Math.max(1e-6, lMin * 0.5), lMax * 2.5],
    ylab: "L / L☉", xlab: "Teff (K)",
    notes, extraSVG: inset,
    tip: q => `model ${q.p.model} · ${ageLab(q.p.age)}<br>L = ${fmtNum(q.p.L)} L☉ · Teff = ${Math.round(q.p.Teff)} K<br>R = ${fmtNum(q.p.R)} R☉ · Xc = ${q.p.Xc.toFixed(3)}`,
  });
  /* Fig. 2 — core composition against time, readable size with
     hover, complementing the inset. */
  const comp = {
    series: [
      { pts: tk.map(p => ({ x: p.age / 1e12, y: p.Xc, p })), lw: 1.6, label: "H", labelAt: 0.45 },
      { pts: tX3.map(q => ({ x: q.x, y: Math.max(1 - q.X - q.x3 - state.z, 1e-4) })), lw: 1.3, label: "⁴He", labelAt: 0.55 },
      { pts: tX3.map(q => ({ x: q.x, y: Math.max(q.x3, 1e-4) })), lw: 1.1, dash: "5 3", label: "³He", labelAt: 0.5 },
    ],
    logy: false, yrange: [0, 1],
    xlab: "time (trillions of years)", ylab: "mass fraction",
    tip: p => `model ${p.p.model} · ${ageLab(p.p.age)}<br>central H = ${p.p.Xc.toFixed(3)}`,
  };
  if (tX3.length < 2) comp.series = comp.series.slice(0, 1);
  lineChart(document.getElementById("compBox"), comp);
  /* Figs. 3-6 — the vital signs on a logarithmic clock */
  const mk = (id, key, logy, lab) => lineChart(document.getElementById(id), {
    pts: tk.map(p => ({ x: p.age / 1e9, y: p[key], p })), logy, logx: true,
    xlab: "age (Gyr)", ylab: lab,
    tip: q => `model ${q.p.model} · ${ageLab(q.p.age)}<br>${lab} = ${fmtNum(q.y)}`,
  });
  mk("lumBox", "L", true, "L / L☉");
  mk("radBox", "R", true, "R / R☉");
  mk("tcBox", "Tc", true, "Tc (K)");
  mk("rhocBox", "rhoc", true, "ρc (g cm⁻³)");
  renderStructure();
}
function renderStructure() {
  const scrub = document.getElementById("structScrub"), lab = document.getElementById("structLabel");
  const ss = run ? run.structures : [];
  if (!ss.length) { scrub.disabled = true; lab.textContent = "no structure printed yet"; return; }
  scrub.disabled = false; scrub.max = ss.length - 1;
  if (+scrub.value > ss.length - 1) scrub.value = ss.length - 1;
  const st = ss[+scrub.value];
  const trk = run.track.find(t => t.model === st.model);
  lab.textContent = `model ${st.model}` + (trk ? ` · age ${ageLab(trk.age)}` : "");
  const bands = [];
  let open = null;
  for (const p of st.pts) {
    if (p.cv === 1 && open === null) open = p.mm;
    if (p.cv === 0 && open !== null) { bands.push([open, p.mm]); open = null; }
  }
  if (open !== null) bands.push([open, 1]);
  const mkS = (id, key, logy, lab2) => lineChart(document.getElementById(id), {
    pts: st.pts.map(p => ({ x: p.mm, y: p[key], p })), logy, bands, mark: false,
    xlab: "m / M", ylab: lab2,
    tip: q => `m/M = ${fmtNum(q.p.mm)} · r = ${fmtNum(q.p.r)} cm<br>${key} = ${fmtNum(q.p[key])}`,
  });
  mkS("stTBox", "T", true, "T (K)");
  mkS("stRhoBox", "rho", true, "ρ (g cm⁻³)");
  mkS("stLBox", "l", false, "L (erg s⁻¹)");
}
document.getElementById("structScrub").addEventListener("input", renderStructure);

function renderTable() {
  const el = document.getElementById("trackTable");
  if (!run || !run.track.length) { el.textContent = ""; return; }
  let h = "<table><tr><th>model</th><th>age (yr)</th><th>iter</th><th>L/L☉</th><th>R/R☉</th><th>Teff</th><th>Tc</th><th>ρc</th><th>Xc</th></tr>";
  for (const p of run.track) {
    h += `<tr><td>${p.model}</td><td>${p.age.toExponential(3)}</td><td>${p.it}</td><td>${p.L.toExponential(3)}</td>` +
         `<td>${p.R.toFixed(4)}</td><td>${Math.round(p.Teff)}</td><td>${p.Tc.toExponential(3)}</td>` +
         `<td>${fmtNum(p.rhoc)}</td><td>${p.Xc.toFixed(4)}</td></tr>`;
  }
  el.innerHTML = h + "</table>";
}

/* ---------- boot ---------- */
renderJob();
