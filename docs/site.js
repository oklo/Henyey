/* HENYEY site application: deck, keypunch, job, charts. No dependencies. */
"use strict";

/* ---------- theme ---------- */
const root = document.documentElement;
document.getElementById("themeToggle").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = root.dataset.theme || (dark ? "dark" : "light");
  root.dataset.theme = cur === "dark" ? "light" : "dark";
  renderAll();
});

/* ---------- deck state ---------- */
const F = id => document.getElementById(id);
const state = { mass: 1.0, x: 0.700, z: 0.020, models: 50, dtyr: 1e7, alfa: 1.65,
                mesh: 151, clim: 0.2, eps: 5e-4, nprin: 10 };
const presets = {
  sun:      { mass: 1.0, x: 0.700, z: 0.020, models: 50,  dtyr: 1e7, alfa: 1.65, nprin: 10 },
  half:     { mass: 0.5, x: 0.708, z: 0.020, models: 60,  dtyr: 1e8, alfa: 1.5, nprin: 10 },
  reddwarf: { mass: 0.3, x: 0.708, z: 0.020, models: 120, dtyr: 1e8, alfa: 1.5, nprin: 20 },
};
F("preset").addEventListener("change", e => {
  Object.assign(state, presets[e.target.value]);
  F("f_mass").value = state.mass; F("f_x").value = state.x; F("f_z").value = state.z;
  F("f_models").value = state.models; F("f_dtyr").value = state.dtyr; F("f_alfa").value = state.alfa;
  renderDeck();
});
for (const [id, key] of [["f_mass","mass"],["f_x","x"],["f_z","z"],
                         ["f_models","models"],["f_dtyr","dtyr"],["f_alfa","alfa"]]) {
  F(id).addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    if (isFinite(v)) { state[key] = v; renderDeck(); }
  });
}

/* Fortran field formatters */
const f105 = v => v.toFixed(5).padStart(10);
const i5   = v => String(Math.round(v)).padStart(5);
function e103(v) {
  const ex = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / Math.pow(10, ex);
  const es = (ex < 0 ? "-" : "+") + String(Math.abs(ex)).padStart(2, "0");
  return (mant.toFixed(3) + "E" + es).padStart(10);
}
function deckLines() {
  const c1 = f105(state.mass) + f105(state.x) + f105(state.z);
  const c2 = i5(state.mesh) + i5(Math.min(400, Math.max(1, state.models))) +
             e103(state.dtyr) + f105(state.clim) + e103(state.eps) +
             i5(state.nprin) + f105(state.alfa);
  return [c1, c2];
}

/* ---------- keypunch (IBM 029 codes for the characters we use) ---------- */
const ROWS = ["12","11","0","1","2","3","4","5","6","7","8","9"];
function punches(ch) {
  if (ch >= "0" && ch <= "9") return [2 + (+ch)];
  if (ch === ".") return [0, 10, 5];        /* 12-8-3 */
  if (ch === "+") return [0, 10, 8];        /* 12-8-6 */
  if (ch === "-") return [1];               /* 11 */
  if (ch >= "A" && ch <= "I") return [0, 2 + (ch.charCodeAt(0) - 64)];
  if (ch >= "J" && ch <= "R") return [1, 2 + (ch.charCodeAt(0) - 73)];
  if (ch >= "S" && ch <= "Z") return [2, 2 + (ch.charCodeAt(0) - 81)];
  return [];
}
function cardSVG(text) {
  /* IBM 5081-style card: true aspect (7 3/8 x 3 1/4 in), manila stock,
     light-blue printing, upper-left corner cut, tall rectangular chads. */
  const padded = (text + " ".repeat(80)).slice(0, 80);
  const W = 830, H = 366, X0 = 26, PITCH = 9.72;
  const ROWY = r => 58 + r * 25.65;            /* rows 12,11,0..9 */
  const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let s = `<svg class="punchcard" viewBox="0 0 ${W} ${H}" role="img" aria-label="Punched card: ${text.trim()}">`;
  /* stock with upper-left corner cut */
  s += `<path d="M 26 2 H 820 A 8 8 0 0 1 828 10 V 356 A 8 8 0 0 1 820 364 ` +
       `H 10 A 8 8 0 0 1 2 356 V 24 Z" fill="var(--card)" stroke="var(--rule)"/>`;
  /* printed digit rows 0-9, 5081 light-blue ink */
  for (let r = 0; r < 10; r++) {
    s += `<text x="${X0}" y="${ROWY(r + 2) + 3.2}" textLength="${80 * PITCH}" lengthAdjust="spacingAndGlyphs" ` +
         `font-family="var(--mono)" font-size="8.6" fill="var(--cardink)">` + String(r).repeat(80) + `</text>`;
  }
  /* column numbers, tiny, in two bands (above row 1 and below row 9) */
  for (const by of [ROWY(2) - 14.5, ROWY(11) + 12.5]) {
    for (let c = 0; c < 80; c++) {
      s += `<text x="${X0 + c * PITCH + PITCH / 2}" y="${by}" text-anchor="middle" ` +
           `font-family="var(--mono)" font-size="5" fill="var(--cardink)">${c + 1}</text>`;
    }
  }
  /* form mark */
  s += `<text x="12" y="360" font-family="var(--mono)" font-size="5.5" fill="var(--cardink)">HFG 5081</text>`;
  /* interpreted characters along the top edge, black ribbon ink */
  s += `<text x="${X0}" y="22" textLength="${80 * PITCH}" lengthAdjust="spacingAndGlyphs" ` +
       `xml:space="preserve" font-family="var(--mono)" font-size="10.5" fill="var(--ink-2)">` +
       esc(padded) + `</text>`;
  /* punches */
  for (let c = 0; c < 80; c++) {
    for (const r of punches(padded[c])) {
      s += `<rect x="${X0 + c * PITCH + 1.76}" y="${ROWY(r) - 8.2}" width="6.2" height="15" rx="0.8" fill="#17150f"/>`;
    }
  }
  s += `</svg>`;
  return s;
}
function renderDeck() {
  const [c1, c2] = deckLines();
  document.getElementById("cards").innerHTML = cardSVG(c1) + cardSVG(c2);
  document.getElementById("deckListing").textContent =
    "$JOB  HENYEY  METHOD II\n" + c1 + "\n" + c2 + "\n$END";
}

/* ---------- job control ---------- */
let worker = null, run = null, renderTimer = null;
const printerScroll = document.getElementById("printerScroll");
const jobStatus = document.getElementById("jobStatus");

function newRun() {
  return { lines: [], track: [], structures: [], curStruct: null, lastModel: 0, done: false };
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
    if (t.length === 12 && /^\d+$/.test(t[0])) {
      run.curStruct.pts.push({ j:+t[0], xi:+t[1], mm:+t[2], r:+t[3], l:+t[4], T:+t[5],
                               rho:+t[6], P:+t[7], X:+t[8], kap:+t[9], eps:+t[10], cv:+t[11] });
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
  worker = new Worker("worker.js");
  run = newRun();
  printerScroll.textContent = "";
  jobStatus.textContent = "JOB SUBMITTED — reading cards…";
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
      jobStatus.textContent =
        `JOB COMPLETE — ${run.track.length} models · ${ev.data.ms} ms of 7094 time · in 1964: one night`;
      printerScroll.scrollTop = 0;
      renderAll(); renderTable();
    } else if (ev.data.type === "error") {
      jobStatus.textContent = "MACHINE CHECK — " + ev.data.message;
    }
  };
  worker.postMessage({ type: "run", deck });
}
document.getElementById("submitJob").addEventListener("click", submitJob);

/* ---------- chart library ---------- */
const tooltip = document.getElementById("tooltip");
function css(v) { return getComputedStyle(root).getPropertyValue(v).trim(); }
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
const SUP = { "-": "\u207b", "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3",
  "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079" };
function logLab(v) {
  const val = Math.pow(10, v);
  if (val >= 0.001 - 1e-12 && val <= 9999) {
    if (val >= 1) return String(Math.round(val));
    return String(+val.toPrecision(1));
  }
  const e = Math.round(v);
  return "10" + String(e).split("").map(c => SUP[c] || c).join("");
}
function lineChart(el, spec) {
  const W = 460, H = 355, L = 64, R = 14, T = 14, B = 40;
  const lgx = spec.logx, lgy = spec.logy;
  const pts = spec.pts.filter(p => isFinite(p.x) && isFinite(p.y)
    && (!lgy || p.y > 0) && (!lgx || p.x > 0));
  el.innerHTML = "";
  if (pts.length < 2) { el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text x="${W/2}" y="${H/2}" text-anchor="middle" font-family="var(--serif)" font-style="italic" font-size="13" fill="var(--ink-3)">awaiting job</text></svg>`; return; }
  const tx = v => lgx ? Math.log10(v) : v;
  const ty = v => lgy ? Math.log10(v) : v;
  const xs = pts.map(p => tx(p.x)), ys = pts.map(p => ty(p.y));
  let x0, x1, y0, y1;
  if (spec.xrange) { x0 = tx(spec.xrange[0]); x1 = tx(spec.xrange[1]); }
  else { x0 = Math.min(...xs); x1 = Math.max(...xs); if (x1 - x0 < 1e-12) x1 = x0 + 1; }
  if (spec.yrange) { y0 = ty(spec.yrange[0]); y1 = ty(spec.yrange[1]); }
  else {
    y0 = Math.min(...ys); y1 = Math.max(...ys);
    const yp = (y1 - y0 || Math.abs(y0) || 1) * 0.08; y0 -= yp; y1 += yp;
  }
  const X = v => L + ((spec.xrev ? (x1 - v) : (v - x0)) / (x1 - x0)) * (W - L - R);
  const Y = v => H - B - (v - y0) / (y1 - y0) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  /* convective bands (structure charts) */
  if (spec.bands) for (const b of spec.bands) {
    const a = X(tx(b[0])), c = X(tx(b[1]));
    s += `<rect x="${Math.min(a,c)}" y="${T}" width="${Math.abs(c-a)}" height="${H-T-B}" fill="var(--band)"/>`;
  }
  /* the full figure box, ticks inward on all four sides, journal style */
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
  s += `<text x="${(L+W-R)/2}" y="${H-3}" text-anchor="middle" font-family="var(--serif)" font-style="italic" font-size="12" fill="var(--ink-2)">${spec.xlab}</text>`;
  if (spec.ylab) {
    const cy = (T + H - B) / 2;
    s += `<text transform="rotate(-90 13 ${cy})" x="13" y="${cy+4}" text-anchor="middle" font-family="var(--serif)" font-style="italic" font-size="12" fill="var(--ink-2)">${spec.ylab}</text>`;
  }
  /* series */
  const lw = spec.lw || 1.6;
  let d = "";
  for (let i = 0; i < pts.length; i++) d += (i ? "L" : "M") + X(xs[i]).toFixed(1) + " " + Y(ys[i]).toFixed(1);
  s += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="${lw}" stroke-linejoin="round"/>`;
  if (spec.dots) for (let i = 0; i < pts.length; i++)
    s += `<circle cx="${X(xs[i]).toFixed(1)}" cy="${Y(ys[i]).toFixed(1)}" r="1.9" fill="var(--ink)"/>`;
  /* unobtrusive arrows marking the direction of evolution */
  if (spec.arrows !== null) {
    const fr = spec.arrows || [0.62];
    const seg = [0];
    for (let i = 1; i < pts.length; i++)
      seg.push(seg[i-1] + Math.hypot(X(xs[i])-X(xs[i-1]), Y(ys[i])-Y(ys[i-1])));
    const total = seg[seg.length-1];
    for (const f of fr) {
      const target = f * total;
      let i = 1; while (i < pts.length-1 && seg[i] < target) i++;
      const dx = X(xs[i]) - X(xs[i-1]), dy = Y(ys[i]) - Y(ys[i-1]);
      if (dx === 0 && dy === 0) continue;
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const mx = (X(xs[i]) + X(xs[i-1])) / 2, my = (Y(ys[i]) + Y(ys[i-1])) / 2;
      s += `<path d="M6 0 L-4 4 L-4 -4 z" transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(${ang.toFixed(1)})" fill="var(--ink)" opacity="0.32"/>`;
    }
  }
  const li = pts.length - 1;
  s += `<circle cx="${X(xs[li])}" cy="${Y(ys[li])}" r="3.4" fill="var(--red)"/>`;
  s += `<line id="ch" x1="0" x2="0" y1="${T}" y2="${H-B}" stroke="var(--ink-3)" stroke-width="1" visibility="hidden"/>`;
  s += `<circle id="hp" r="4" fill="none" stroke="var(--red)" stroke-width="2" visibility="hidden"/>`;
  s += `</svg>`;
  el.innerHTML = s;
  /* hover: nearest-point crosshair + tooltip */
  const svg = el.firstChild, ch = svg.querySelector("#ch"), hp = svg.querySelector("#hp");
  svg.addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect();
    const mx = (ev.clientX - r.left) / r.width * W;
    let best = 0, bd = 1e30;
    for (let i = 0; i < pts.length; i++) { const d2 = Math.abs(X(xs[i]) - mx); if (d2 < bd) { bd = d2; best = i; } }
    const p = pts[best];
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

/* ---------- chart wiring ---------- */
function ageGyr(p) { return p.age / 1e9; }
function renderAll() {
  renderDeck();
  if (!run || run.track.length < 2) return;
  const tk = run.track;
  lineChart(document.getElementById("hrBox"), {
    pts: tk.map(p => ({ x: p.Teff, y: p.L, p })), logy: true, logx: true, xrev: true,
    dots: true, lw: 0.6, arrows: [0.3, 0.68],
    xrange: [2000, 30000], yrange: [1e-4, 1e4],
    ylab: "L / L☉",
    xlab: "Teff (K)",
    tip: q => `model ${q.p.model} · ${fmtNum(ageGyr(q.p))} Gyr<br>L = ${fmtNum(q.p.L)} L☉ · Teff = ${Math.round(q.p.Teff)} K<br>R = ${fmtNum(q.p.R)} R☉`,
  });
  const mk = (id, key, logy, lab) => lineChart(document.getElementById(id), {
    pts: tk.map(p => ({ x: ageGyr(p), y: p[key], p })), logy, logx: true,
    xlab: "age (Gyr)", ylab: lab,
    tip: q => `model ${q.p.model} · ${fmtNum(q.x)} Gyr<br>${lab} = ${fmtNum(q.y)}`,
  });
  mk("lumBox", "L", false, "L / L☉");
  mk("radBox", "R", false, "R / R☉");
  mk("tcBox", "Tc", false, "Tc (K)");
  mk("xcBox", "Xc", false, "Xc");
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
  lab.textContent = `model ${st.model}` + (trk ? ` · age ${fmtNum(ageGyr(trk))} Gyr` : "");
  const bands = [];
  let open = null;
  for (const p of st.pts) {
    if (p.cv === 1 && open === null) open = p.mm;
    if (p.cv === 0 && open !== null) { bands.push([open, p.mm]); open = null; }
  }
  if (open !== null) bands.push([open, 1]);
  const mkS = (id, key, logy, lab2, scale = 1) => lineChart(document.getElementById(id), {
    pts: st.pts.map(p => ({ x: p.mm, y: p[key] * scale, p })), logy, bands, arrows: null,
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
    h += `<tr><td>${p.model}</td><td>${p.age.toExponential(3)}</td><td>${p.it}</td><td>${p.L.toFixed(4)}</td>` +
         `<td>${p.R.toFixed(4)}</td><td>${Math.round(p.Teff)}</td><td>${p.Tc.toExponential(3)}</td>` +
         `<td>${fmtNum(p.rhoc)}</td><td>${p.Xc.toFixed(4)}</td></tr>`;
  }
  el.innerHTML = h + "</table>";
}

/* ---------- boot ---------- */
renderDeck();
