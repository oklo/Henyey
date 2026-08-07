/* OLD RED DWARFS — the program, annotated. Renders the FORTRAN 77 deck
   with margin notes in the textbook manner, entered through the flow chart. */
"use strict";

/* ---------- theme ---------- */
const root = document.documentElement;
document.getElementById("themeToggle").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = root.dataset.theme || (dark ? "dark" : "light");
  root.dataset.theme = cur === "dark" ? "light" : "dark";
});

/* ---------- the annotated guide ----------
   Each note anchors to the first source line containing `m`, and
   highlights `span` lines when hovered. */
const NOTES = [
{ m: "A PROGRAM FOR THE AUTOMATIC", span: 12, t: "The pedigree.",
  b: "The same 1964 Henyey skeleton as the companion page, carried forward: this is the FORTRAN 77 line, a clean-room recreation of the program behind Laughlin & Bodenheimer (1993) and Laughlin, Bodenheimer & Adams (1997), “The End of the Main Sequence.” Double precision throughout — the 27-bit courtesies of the 7094 are no longer needed." },
{ m: "FULL NUCLEAR NETWORK OF THEIR APPENDIX C", span: 6, t: "The header confesses the physics.",
  b: "SCVH tables for the equation of state, the blanketed-then-grey T–τ atmosphere, the Appendix C seven-species network, molecule-and-grain opacities. Every piece is named for its published source; the annotations below give the details." },
{ m: "COMMON /VARBL/", span: 1, t: "The star in COMMON, plus isotopes.",
  b: "The four Henyey unknowns per mesh point as before — and now the composition is a vector: hydrogen and ³He live here, the CNO species in a companion block. A red dwarf's biography is largely the history of X3A." },
{ m: "EQUATION OF STATE SELECTION (CARD 2, FIELD 8)", span: 5, t: "Physics by switch.",
  b: "Three integer switches choose the equation of state (SCVH tables or the 1965 Berkeley formula), the opacity stack (molecules-and-grains or the legacy H⁻), and the starting point (main sequence or Hayashi track). The 1997 physics is all zeros; the switches keep the older physics alive for controlled experiments — which is the point of the whole recreation." },
{ m: "IF (IEOS.EQ.0) CALL SCVRD", span: 1, t: "Tables before stars.",
  b: "The Saumon–Chabrier–Van Horn tables are read once, before anything else happens. On this page they are baked into the WebAssembly module; in the repository they are two plain files from 1995." },
{ m: "NO CONVERGENCE FROM THE EPSILON-SHAPED PSEUDOFLUX GUESS", span: 8, t: "Two basins, one retry.",
  b: "A hard-won lesson: stars with radiative interiors need the first luminosity profile normalized upward or the convection zones are misclassified and Newton diverges; fully convective dwarfs need the opposite. Rather than guess which star it has been given, the machine tries the soft start and, on failure, rebuilds and tries once more with the boost." },
{ m: "THE HE3 STEP MEASURE COMPARES THE MIXED COMPOSITION", span: 7, t: "Measure after mixing.",
  b: "The time step is held to about ten percent change in ³He — but measured on the mixed reservoir, not point by point. Local production that convection instantly dilutes is not a reason to crawl; an earlier version of this line crawled for a hundred billion years." },
{ m: "THE CEILING SUITS THE TRILLION-YEAR REGIME", span: 4, t: "A clock for deep time.",
  b: "The time step may grow to about ten billion years. For the Sun the composition limiters bind far sooner; for a red dwarf on the main sequence, ten gigayears is a heartbeat." },
{ m: "SUBROUTINE START(TOTM", span: 1, t: "The first approximation.",
  b: "An Emden polytrope shape, crude mass–radius and mass–luminosity guesses (with a shallower law below 0.6 M☉, where the classical M³·⁵ strands Newton outside its basin), the envelope fit, and an inward march." },
{ m: "HAYASHI-TRACK START - THE RADIUS FOLLOWS", span: 8, t: "Born high on the Hayashi track.",
  b: "The 1993 paper's starting convention: log L above −1, central density below 0.1, central temperature below half a million kelvin. The initial static model is closed by a uniform artificial energy generation L/M — contraction power, assumed evenly spread — and after the first model converges the artifice is dropped and the time-dependent terms take over. The star then contracts onto the main sequence because physics says it must." },
{ m: "SUBROUTINE SOLVE", span: 1, t: "The Henyey method itself.",
  b: "Unchanged from 1964: linearize the four difference equations at every shell, sweep a block elimination from center to surface, fit the envelope, back-substitute, damp, repeat. The corrections shrink quadratically when all is well; every figure on the front page is this loop converging." },
{ m: "SUBROUTINE PHYSIC", span: 1, t: "The material functions.",
  b: "Pressure, energy, opacity, and nuclear energy generation with their derivatives, at every mesh point, every iteration. The derivatives are centered differences of the evaluators throughout this line — simple, uniform, and exactly as smooth as the evaluators themselves." },
{ m: "DURING THE HAYASHI-START STATIC SOLVE", span: 5, t: "The artificial sun inside.",
  b: "During the Hayashi-start static solve only, each gram is credited with L/M of contraction power. It carries no temperature or density derivatives — Newton sees it as a constant — and it vanishes the moment evolution begins." },
{ m: "SUBROUTINE CONVCK", span: 1, t: "Where convection reigns.",
  b: "The Schwarzschild criterion with hysteresis, frozen late in the iteration to keep the boundaries from chattering. For most of a red dwarf's life the answer is simply: everywhere." },
{ m: "SUBROUTINE ZONEQ", span: 1, t: "The four equations of a zone.",
  b: "Hydrostatic equilibrium, mass continuity, energy balance with the time-dependent terms (which carry the gravitational contraction), and transport — radiative or adiabatic. Equations 22–26 of the 1964 paper, in double precision." },
{ m: "SUBROUTINE ENVEL", span: 1, t: "The case-B atmosphere.",
  b: "The outer 0.2 percent of the mass, integrated as Laughlin & Bodenheimer (1993) describe case B: a radiative T–τ layer iterated with the real equation of state down the optical-depth scale, then a column-mass march with Böhm-Vitense mixing length through the superadiabatic layers. The fitting values and their derivatives close the Henyey system at the surface." },
{ m: "THE LB93 CASE-B ATMOSPHERE IS A GREY RADIATIVE MODEL", span: 6, t: "Grey, by choice.",
  b: "With the 1997 physics selected, the blanketing terms of the 1965 relation are dropped and what remains is Böhm-Vitense's fit to the exact grey Hopf function. The blanketed law survives on the legacy path — one line of code holds the two eras apart." },
{ m: "SUBROUTINE TTAU", span: 1, t: "The temperature law.",
  b: "T⁴ against optical depth, with the underflow-guarded exponentials and a floor. Both atmospheres — the 1965 blanketed law and the 1997 grey one — live in this single routine." },
{ m: "SUBROUTINE SCVRD", span: 1, t: "Reading 1995.",
  b: "The SCVH tables: 63 isotherms, log T from 2.10 to 7.06, pressures from 10⁴ dyn cm⁻² up. The reader verifies the published grid spacing and derives the slopes of the internal energy from the tabulated density and entropy derivatives through dU = T dS + (P/ρ²)dρ — the tables give nine columns and the code wants a tenth." },
{ m: "SUBROUTINE HERM1", span: 1, t: "One cubic segment.",
  b: "Hermite interpolation with prescribed end slopes, continuing linearly beyond its ends so extrapolation off a table edge stays tame. Everything tabular in this program — equation of state, opacity, the bridge between them — rests on this ten-line routine." },
{ m: "SUBROUTINE SCVI1", span: 1, t: "Interpolating with the authors' own derivatives.",
  b: "The published tables carry ∂lnρ/∂lnP and ∂lnρ/∂lnT at every node, so the interpolant uses them as segment slopes: the surface honors the published derivatives exactly and is C1 in both directions — the continuity that the Newton scheme demands, supplied by Saumon, Chabrier & Van Horn themselves." },
{ m: "SUBROUTINE SCVEV", span: 1, t: "From (T, P) tables to (T, ρ) stars.",
  b: "The stellar structure wants pressure at given density; the tables are indexed the other way. A Newton iteration on log P against the additive-volume mixture density inverts them, converged to eleven decimals so the centered differences taken upstream stay smooth." },
{ m: "SUBROUTINE SCVENV", span: 1, t: "The envelope's thermodynamics.",
  b: "Density, specific heat, expansion coefficient, and adiabatic gradient straight from the tables at given (T, P) — no inversion needed on this side. The tables carry molecular hydrogen, so a cool envelope follows the true dissociation-depressed adiabat: ∇ad falls to 0.13 at 2800 K, where a Saha treatment without molecules saw 0.4. This, with the molecular opacities, is what puts a red dwarf's photosphere at the right temperature." },
{ m: "SUBROUTINE THERME", span: 1, t: "A dispatcher.",
  b: "SCVH when the 1997 physics is selected, the Saha equilibrium on the legacy path. The envelope integration calls one name and never knows the difference." },
{ m: "SUBROUTINE AJRV", span: 1, t: "Molecules and grains.",
  b: "The Rosseland means of Alexander, Johnson & Rypma (1983), Table 2: water vapor, TiO, CO, CN, and the silicate and iron grains below 1600 K, over log T = 2.80–4.00. Transcribed digit by digit from the journal scan; the grain-condensation cells jump by decades between neighbors, so the interpolation is monotone-limited Hermite — an unlimited cubic oscillates there, and Newton cannot abide oscillation." },
{ m: "BLOCK DATA AJRDAT", span: 1, t: "A table as source code.",
  b: "The 1983 master grid, 374 numbers in DATA statements, absent cells carrying the sentinel 99. In 1983 this data lived on a page of The Astrophysical Journal; here it is compiled into the star." },
{ m: "SUBROUTINE OPACV", span: 1, t: "The opacity, assembled.",
  b: "Below 10⁴ K, the molecule-and-grain table with the 1997 paper's helium-enrichment scaling. Above 10⁵ K, the 1965 interior formula. Between them — where neither source is trustworthy — log κ is bridged in log T by a cubic whose end slopes match the adjoining branches: the treatment Henyey, Vardya & Bodenheimer invented in 1965 for exactly this gap. The H⁻ stand-in of the legacy path is retired here; its T⁹ fit is unphysical past 6000 K." },
{ m: "SUBROUTINE BFGOP", span: 1, t: "The 1965 interior opacity.",
  b: "The Keller–Meyerott interpolation formula with Mestel conduction, from Appendix B of the Berkeley group's 1965 paper — standing in for the paywalled Weiss–Keady–Magee tables the 1997 paper used. This substitution is the largest known difference from 1997, and the head-to-head table on the front page shows its size." },
{ m: "SUBROUTINE ENUCV", span: 1, t: "Seven channels of energy.",
  b: "Effective Q-values with the neutrino losses removed, channel by channel — including the ⁷Be branching between electron capture and proton capture, which affects only the energy, exactly as Appendix C prescribes. The full CN cycle sums to 25.03 MeV; the pieces are accounted separately because a red dwarf never runs the full cycle." },
{ m: "SUBROUTINE RATES", span: 1, t: "Cross sections and screening.",
  b: "Caughlan & Fowler (1988) throughout, screened by the exact Graboske, DeWitt, Grossman & Cooper (1973) weak and intermediate forms, pair charge by pair charge. The ⁷Be electron-capture rate reproduces the hundred-day solar lifetime; at a red dwarf's center the branch is a curiosity, but it is an honest curiosity." },
{ m: "SUBROUTINE BURN", span: 1, t: "The Appendix C machine.",
  b: "The implicit composition step of the 1965 Appendix C, exactly: the four CNO equations solved linearly in closed form, the ³He quadratic, the hydrogen quadratic, helium by the sum rule — iterated until the hydrogen abundance is unchanged. Stable for time steps long or short against any species' lifetime, which is what a code must be when its time steps span from 10⁴ to 10¹⁰ years." },
{ m: "CANCELLATION-FREE ROOT FORM", span: 4, t: "The conjugate root.",
  b: "The schoolbook quadratic root (−B+√(B²−4AC))/2A is a catastrophic cancellation when A vanishes — and A is Δt times a reaction rate, which vanishes at every cool mesh point. The conjugate form 2(−C)/(B+√(B²−4AC)) is exact in that limit. The rounding noise of the schoolbook form, amplified and stirred by convective mixing, once destroyed hydrogen ten times faster than the star could shine; it also manufactured a plausible-looking instability that took a day to unmask." },
{ m: "SUBROUTINE MIX", span: 1, t: "Convective mixing.",
  b: "All six followed species homogenized, mass-weighted, over each connected convective region. A fully convective star is a single well-stirred pot, which is why its ³He history is so clean an observable of its interior." },
{ m: "SUBROUTINE PRINTM", span: 1, t: "The printed structure.",
  b: "The interior run of the model in the line-printer layout, now thirteen columns wide — ³He earned its own column in this line — with the central CNO abundances appended beneath." },
];

/* extra anchors for the flow chart */
const ANCHORS = [
  { id: "src-burncall", m: "CALL BURN(DT)" },
  { id: "src-dtctl",    m: "TIME STEP CONTROL" },
  { id: "src-scvread",  m: "IF (IEOS.EQ.0) CALL SCVRD" },
  { id: "src-hayashi",  m: "HAYASHI-TRACK START - THE RADIUS" },
];

/* ---------- flow chart (the 1964 pattern, with the 1997 organs) ---------- */
function flowchart() {
  const bx = (x, y, w, lines, href, dec) => {
    const h = 16 + lines.length * 13;
    let t = "";
    lines.forEach((ln, i) => {
      t += `<text x="${x + w/2}" y="${y + 14 + i * 13}" text-anchor="middle">${ln}</text>`;
    });
    const shape = dec
      ? `<rect class="dec" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2}"/>`
      : `<rect class="box" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    return { svg: `<a href="${href}">${shape}${t}</a>`, cx: x + w/2, top: y, bot: y + h, left: x, right: x + w };
  };
  const arr = (d) => `<path class="arr" d="${d}"/>`;
  const P = [];
  const A = bx(60, 8,   280, ["READ THE INPUT,", "READ THE SCVH TABLES (SCVRD)"], "#src-scvread");
  const B = bx(60, 66,  280, ["FIRST APPROXIMATION -", "HAYASHI OR MS (START)"], "#src-hayashi");
  const C = bx(60, 124, 280, ["ADVANCE THE NETWORK,", "MIX (BURN, MIX)"], "#src-burn");
  const D = bx(60, 182, 280, ["SCVH EOS, AJR OPACITY,", "CF88 RATES (PHYSIC)"], "#src-physic");
  const E = bx(60, 240, 280, ["LOCATE CONVECTIVE", "ZONES (CONVCK)"], "#src-convck");
  const F = bx(60, 298, 280, ["LINEARIZED DIFFERENCE", "EQS. (22)-(26) (ZONEQ)"], "#src-zoneq");
  const G = bx(60, 356, 280, ["FIT THE CASE-B", "ATMOSPHERE (ENVEL)"], "#src-envel");
  const H = bx(60, 414, 280, ["ELIMINATE AND CORRECT", "DELTA-U, DELTA-V (SOLVE)"], "#src-solve");
  const I = bx(60, 476, 280, ["ARE CORRECTIONS", "SMALL ENOUGH"], "#src-solve", true);
  const J = bx(560, 182, 260, ["PRINT THE MODEL", "(PRINTM)"], "#src-printm");
  const K = bx(560, 262, 260, ["ADJUST THE TIME STEP", "(H, HE3 LIMITERS)"], "#src-dtctl");
  const L = bx(560, 334, 260, ["DEFINE THE NEW MODEL,", "ADVANCE THE EPOCH"], "#src-main");
  for (const b of [A,B,C,D,E,F,G,H,I,J,K,L]) P.push(b.svg);
  const arrows =
    arr(`M${A.cx} ${A.bot} V${B.top - 2}`) +
    arr(`M${B.cx} ${B.bot} V${C.top - 2}`) +
    arr(`M${C.cx} ${C.bot} V${D.top - 2}`) +
    arr(`M${D.cx} ${D.bot} V${E.top - 2}`) +
    arr(`M${E.cx} ${E.bot} V${F.top - 2}`) +
    arr(`M${F.cx} ${F.bot} V${G.top - 2}`) +
    arr(`M${G.cx} ${G.bot} V${H.top - 2}`) +
    arr(`M${H.cx} ${H.bot} V${I.top - 2}`) +
    /* NO: loop back to the physics */
    arr(`M${I.left} ${I.top + 16} H28 V${(D.top + D.bot)/2} H${D.left - 2}`) +
    /* YES: around the outside, into the right-hand column */
    arr(`M${I.right} ${I.top + 16} H852 V${(J.top + J.bot) / 2} H${J.right + 2}`) +
    arr(`M${J.cx} ${J.bot} V${K.top - 2}`) +
    arr(`M${K.cx} ${K.bot} V${L.top - 2}`) +
    /* next model: back to the composition step */
    arr(`M${L.cx} ${L.bot} V436 H470 V${(C.top + C.bot)/2} H${C.right + 2}`);
  const labels =
    `<text class="yn" x="40" y="${I.top + 10}">NO</text>` +
    `<text class="yn" x="${I.right + 8}" y="${I.top + 10}">YES</text>`;
  document.getElementById("flowfig").innerHTML =
    `<svg viewBox="0 0 880 540">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="var(--ink)"/></marker></defs>
      ${arrows}${labels}${P.join("")}
    </svg>`;
}

/* ---------- the listing ---------- */
const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const KW = /^(\s{5,}\d*\s*)(SUBROUTINE|BLOCK DATA|IMPLICIT DOUBLE PRECISION|COMMON|DIMENSION|DATA|CALL|RETURN|CONTINUE|FORMAT|WRITE|READ|OPEN|CLOSE|GO TO|STOP|END IF|END|ELSE|IF|DO)\b/;
function renderLine(raw, idx) {
  const div = document.createElement("div");
  div.className = "codeline";
  const ln = document.createElement("span");
  ln.className = "ln"; ln.textContent = idx + 1;
  const txt = document.createElement("span");
  txt.className = "txt";
  let h;
  if (/^C/.test(raw)) { div.classList.add("cmt"); h = esc(raw); }
  else {
    const label = raw.slice(0, 5), rest = raw.slice(5);
    let lh = label.trim() ? `<span class="lblf">${esc(label)}</span>` : esc(label);
    let rh = esc(rest);
    const m = KW.exec(rest);
    if (m) rh = esc(m[1]) + `<span class="kw">${esc(m[2])}</span>` + esc(rest.slice(m[1].length + m[2].length));
    h = lh + rh;
  }
  txt.innerHTML = h || " ";
  div.appendChild(ln); div.appendChild(txt);
  const sm = /^ {6}SUBROUTINE (\w+)/.exec(raw) || /^ {6}BLOCK DATA (\w+)/.exec(raw);
  if (sm) div.id = "src-" + sm[1].toLowerCase();
  if (idx === 0) div.id = "src-main";
  return div;
}

async function main() {
  flowchart();
  const res = await fetch("rdsource.f");
  const lines = (await res.text()).replace(/\s+$/, "").split("\n");
  const pane = document.getElementById("codepane");
  pane.innerHTML = "";
  const els = lines.map((l, i) => renderLine(l, i));
  for (const el of els) pane.appendChild(el);
  for (const a of ANCHORS) {
    const i = lines.findIndex(l => l.includes(a.m));
    if (i >= 0 && !els[i].id) els[i].id = a.id;
  }
  /* margin notes */
  const notesPane = document.getElementById("notespane");
  const narrow = () => matchMedia("(max-width: 960px)").matches;
  const placed = [];
  NOTES.forEach((n, k) => {
    const i = lines.findIndex(l => l.includes(n.m));
    if (i < 0) { console.warn("note unmatched:", n.m); return; }
    const el = document.createElement("div");
    el.className = "mnote";
    el.innerHTML = `<b>${n.t}</b> ${n.b}`;
    const span = n.span || 1;
    els[i].classList.add("noted");
    const enter = () => { el.classList.add("hl"); for (let j = i; j < i + span && j < els.length; j++) els[j].classList.add("hl"); };
    const leave = () => { el.classList.remove("hl"); for (let j = i; j < i + span && j < els.length; j++) els[j].classList.remove("hl"); };
    el.addEventListener("mouseenter", enter); el.addEventListener("mouseleave", leave);
    els[i].addEventListener("mouseenter", enter); els[i].addEventListener("mouseleave", leave);
    el.addEventListener("click", () => els[i].scrollIntoView({ behavior: "smooth", block: "center" }));
    placed.push({ el, line: i });
  });
  function layout() {
    if (narrow()) {
      for (const p of placed) {
        p.el.classList.add("inline");
        p.el.style.top = "";
        const target = els[p.line];
        if (p.el.parentElement !== target.parentElement || p.el.nextSibling !== target)
          target.parentElement.insertBefore(p.el, target);
      }
      return;
    }
    notesPane.innerHTML = "";
    let prevBot = 0;
    for (const p of placed) {
      p.el.classList.remove("inline");
      notesPane.appendChild(p.el);
      let top = els[p.line].offsetTop;
      if (top < prevBot + 14) top = prevBot + 14;
      p.el.style.top = top + "px";
      prevBot = top + p.el.offsetHeight;
    }
    notesPane.style.height = Math.max(pane.offsetHeight, prevBot + 20) + "px";
  }
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  layout();
  let rt = null;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 200); });
}
main();
