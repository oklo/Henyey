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
const state = { mass: 1.0, x: 0.709, z: 0.020, models: 80, dtyr: 1e7, alfa: 1.5,
                mesh: 151, clim: 0.2, eps: 5e-4, nprin: 10 };
const presets = {
  sun:      { mass: 1.0, x: 0.709, z: 0.020, models: 80,  dtyr: 1e7, alfa: 1.5, nprin: 10 },
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
  const padded = (text + " ".repeat(80)).slice(0, 80);
  const X0 = 26, PITCH = 9.72, W = 836, H = 258, y0 = 46, ry = 18.6;
  let s = `<svg class="punchcard" viewBox="0 0 ${W} ${H}" role="img" aria-label="Punched card: ${text.trim()}">`;
  s += `<path d="M18 2 h${W-36} a10 10 0 0 1 10 10 v${H-24} a10 10 0 0 1 -10 10 h-${W-36} a10 10 0 0 1 -10 -10 v-${H-52} z" fill="var(--card)" stroke="var(--rule)"/>`;
  /* printed digit rows (rows 0-9) */
  for (let r = 0; r < 10; r++) {
    const y = y0 + (r + 2) * ry;
    s += `<text x="${X0}" y="${y}" textLength="${80 * PITCH}" lengthAdjust="spacingAndGlyphs" ` +
         `font-family="var(--mono)" font-size="9.5" fill="var(--card-ink)" opacity="0.55">` +
         String(r).repeat(80) + `</text>`;
  }
  /* interpreted characters along the top */
  s += `<text x="${X0}" y="24" textLength="${80 * PITCH}" lengthAdjust="spacingAndGlyphs" ` +
       `xml:space="preserve" font-family="var(--mono)" font-size="11" fill="var(--ink-2)">` +
       padded.replace(/&/g,"&amp;").replace(/</g,"&lt;") + `</text>`;
  /* punches */
  for (let c = 0; c < 80; c++) {
    for (const r of punches(padded[c])) {
      const y = y0 + r * ry;
      s += `<rect x="${X0 + c * PITCH - 0.6}" y="${y - 12}" width="6.4" height="14" rx="1.4" fill="var(--ink)"/>`;
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
      printerScroll.scrollTop = printerScroll.scrollHeight;
      jobStatus.textContent = `JOB RUNNING — model ${run.lastModel} · ${Math.round(performance.now() - t0)} ms`;
      if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; renderAll(); }, 160);
    } else if (ev.data.type === "done") {
      run.done = true;
      jobStatus.textContent =
        `JOB COMPLETE — ${run.track.length} models · ${ev.data.ms} ms of 7094 time · in 1964: one night`;
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
function lineChart(el, spec) {
  const W = 460, H = 240, L = 56, R = 12, T = 12, B = 34;
  const pts = spec.pts.filter(p => isFinite(p.x) && isFinite(p.y) && (!spec.logy || p.y > 0));
  el.innerHTML = "";
  if (pts.length < 2) { el.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text x="${W/2}" y="${H/2}" text-anchor="middle" font-family="var(--mono)" font-size="12" fill="var(--ink-3)">awaiting job</text></svg>`; return; }
  const ys = pts.map(p => spec.logy ? Math.log10(p.y) : p.y);
  const xs = pts.map(p => p.x);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 < 1e-12) x1 = x0 + 1;
  const ypad = (y1 - y0 || Math.abs(y0) || 1) * 0.08; y0 -= ypad; y1 += ypad;
  const xr = spec.xrev;
  const X = v => L + (xr ? (x1 - v) : (v - x0)) / (x1 - x0) * (W - L - R);
  const Y = v => H - B - ((spec.logy ? v : v) - y0) / (y1 - y0) * (H - T - B);
  const acc = css("--accent");
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  /* convective bands (structure charts) */
  if (spec.bands) for (const b of spec.bands) {
    const a = X(b[0]), c = X(b[1]);
    s += `<rect x="${Math.min(a,c)}" y="${T}" width="${Math.abs(c-a)}" height="${H-T-B}" fill="var(--accent-2)" opacity="0.13"/>`;
  }
  /* grid + axes */
  const ytk = spec.logy ? niceTicks(y0, y1, 4).filter(v => true) : niceTicks(y0, y1, 4);
  for (const v of ytk) {
    s += `<line class="gridline" x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    const lab = spec.logy ? "10^" + fmtNum(v) : fmtNum(v);
    s += `<text class="tick" x="${L-6}" y="${Y(v)+3.5}" text-anchor="end" font-family="var(--mono)" font-size="10.5" fill="var(--ink-3)">${lab}</text>`;
  }
  for (const v of niceTicks(x0, x1, 5)) {
    s += `<text x="${X(v)}" y="${H-B+16}" text-anchor="middle" font-family="var(--mono)" font-size="10.5" fill="var(--ink-3)">${fmtNum(v)}</text>`;
  }
  s += `<line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" stroke="var(--rule)"/>`;
  s += `<text x="${(L+W-R)/2}" y="${H-4}" text-anchor="middle" font-family="var(--mono)" font-size="10.5" fill="var(--ink-3)">${spec.xlab}</text>`;
  /* series */
  let d = "";
  for (let i = 0; i < pts.length; i++) d += (i ? "L" : "M") + X(xs[i]).toFixed(1) + " " + Y(ys[i]).toFixed(1);
  s += `<path d="${d}" fill="none" stroke="${acc}" stroke-width="2" stroke-linejoin="round"/>`;
  const li = pts.length - 1;
  s += `<circle cx="${X(xs[li])}" cy="${Y(ys[li])}" r="3.4" fill="${acc}"/>`;
  s += `<line id="ch" x1="0" x2="0" y1="${T}" y2="${H-B}" stroke="var(--ink-3)" stroke-width="1" visibility="hidden"/>`;
  s += `<circle id="hp" r="4" fill="none" stroke="${acc}" stroke-width="2" visibility="hidden"/>`;
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
    pts: tk.map(p => ({ x: p.Teff, y: p.L, p })), logy: true, xrev: true,
    xlab: "Teff (K) — hotter to the left",
    tip: q => `model ${q.p.model} · ${fmtNum(ageGyr(q.p))} Gyr<br>L = ${fmtNum(q.p.L)} L☉ · Teff = ${Math.round(q.p.Teff)} K<br>R = ${fmtNum(q.p.R)} R☉`,
  });
  const mk = (id, key, logy, lab) => lineChart(document.getElementById(id), {
    pts: tk.map(p => ({ x: ageGyr(p), y: p[key], p })), logy, xlab: "age (Gyr)",
    tip: q => `model ${q.p.model} · ${fmtNum(q.x)} Gyr<br>${lab} = ${fmtNum(q.y)}`,
  });
  mk("lumBox", "L", false, "L/L☉");
  mk("radBox", "R", false, "R/R☉");
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
    pts: st.pts.map(p => ({ x: p.mm, y: p[key] * scale, p })), logy, bands,
    xlab: lab2, tip: q => `m/M = ${fmtNum(q.p.mm)} · r = ${fmtNum(q.p.r)} cm<br>${key} = ${fmtNum(q.p[key])}`,
  });
  mkS("stTBox", "T", true, "T (K) vs m/M");
  mkS("stRhoBox", "rho", true, "ρ (g/cm³) vs m/M");
  mkS("stLBox", "l", false, "L (erg/s) vs m/M");
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
