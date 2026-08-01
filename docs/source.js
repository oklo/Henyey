/* HENYEY — the program, annotated. Renders the FORTRAN IV deck with
   margin notes in the textbook manner, entered through the flow chart. */
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
  b: "The header names the method: Henyey, Forbes & Gould, ApJ 139, 306 (1964), “Method II.” Everything below is a clean-room reconstruction of that paper — the published equations, not recovered source." },
{ m: "P = (PRESSURE)**(1/4)", span: 5, t: "Artificial variables.",
  b: "The paper’s eqs. (8)–(11): the program never carries P and ρ directly, but p = P¹ᐟ⁴ and q = ρ¹ᐟ³, chosen “in analogy with the polytrope of index three” so that differences and averages stay nearly linear." },
{ m: "COMMON /GRID/", span: 1, t: "The star in COMMON.",
  b: "The whole configuration lives in labeled COMMON blocks: one slot per mesh point, and on each point the four unknowns — r, F (the pseudoflux), T, q. In the paper’s notation u = (r,F), v = (T,q)." },
{ m: "G=666.8", span: 5, t: "Scaled units.",
  b: "Mass in 10³⁰ g, length in 10¹⁰ cm, time in 10⁵ s, temperature in 10⁷ K — the production code’s own units, recalled by P. Bodenheimer. G becomes 666.8, densities are in g/cm³, and every working quantity is of moderate size: a kindness to a 27-bit fraction." },
{ m: "DELS=2.0E-3", span: 2, t: "The fitting mass.",
  b: "The interior mesh stops at (1−δ)M with δ = 0.002. The outer sliver is handled by a separate envelope integration (ENVEL below), exactly the architecture of the paper’s eqs. (30)–(33), where Vardya’s atmosphere program supplied the surface." },
{ m: "M(XI) = M * XI**3", span: 3, t: "The mass mesh.",
  b: "The Lagrangian mesh m(ξ) is fixed once and never changes (Sec. V of the paper). The quintic crowds zones toward both center and surface, where the variables run fastest." },
{ m: "CALL START(TOTM,XHYD0)", span: 1, t: "The first approximation.",
  b: "The paper scaled a previous model homologously. Having no previous model, START builds one: an Emden n = 3 radius shape, a photospheric solution, and an inward march — good enough for Newton to take over." },
{ m: "DTINV=0.", span: 3, t: "The static model.",
  b: "Setting 1/Δt = 0 switches off the backward time differences in the energy equation (24); the first model is a star in complete equilibrium." },
{ m: "DO 300 NMOD=2", span: 1, t: "The evolutionary loop.",
  b: "From here to statement 300 is Fig. 2 of the paper — and Fig. 7 above. Each pass: advance the composition, converge a model, control the time step." },
{ m: "COMPOSITION STEP - HYDROGEN DEPLETION", span: 4, t: "Composition first.",
  b: "“These calculations are the first and last things done for a model” (Sec. IV). Hydrogen is depleted with the converged rates; convective regions are then homogenized by MIX." },
{ m: "NTRY=NTRY+1", span: 3, t: "When Newton balks.",
  b: "A model that will not converge is restored and retried with half the time step — up to eight halvings before the program admits defeat. Vintage pragmatism." },
{ m: "TIME STEP CONTROL", span: 5, t: "The clock.",
  b: "Δt grows when convergence is easy, shrinks when it is hard, and is capped so no step burns more than about three percent of the central hydrogen." },
{ m: "DATA XLE/", span: 3, t: "An Emden table.",
  b: "The Lane–Emden n = 3 mass function, exactly the numbers a 1964 programmer would have keypunched from the standard tabulations." },
{ m: "XLN=XLN+0.5*(E1+E2)", span: 2, t: "An energy-consistent guess.",
  b: "The starting luminosity profile is the integral of the nuclear rates over the guessed structure. A lesson relearned during reconstruction: seed F carelessly and Newton finds a temperature-inverted core to be locally attractive." },
{ m: "SUBROUTINE SOLVE", span: 1, t: "The heart.",
  b: "One converged model: all four difference equations, at all mesh points, solved simultaneously by Newton–Raphson. This subroutine is why every modern stellar-evolution code cites this paper." },
{ m: "GA(K,1)=0.", span: 3, t: "The central condition.",
  b: "Eq. (41): δu₀ = 0 — the recursion δuⱼ + αⱼδvⱼ + γⱼ = 0 starts from α₁ = γ₁ = 0 at the center." },
{ m: "SCALE THE COLUMNS", span: 2, t: "Taming the matrix.",
  b: "“The grand matrix of the system is definitely ill-conditioned” (Sec. IV). Scaling each column by the current value of its variable makes the corrections relative — dimensionless numbers of order one." },
{ m: "NORMALIZE EACH ROW", span: 2, t: "Row equilibration.",
  b: "Each linearized equation is divided by its largest coefficient before pivoting, so equations in erg/s and equations in kelvin meet as equals." },
{ m: "ROWS 3-4 GIVE ALPHA AND GAMMA", span: 2, t: "The recursion advances.",
  b: "Eq. (45): a 2×2 inversion carries α and γ to the next mesh point. The forward sweep runs center to surface; the stored rows of eq. (46) wait for the return trip." },
{ m: "OUTER BOUNDARY - THE FITTING CONDITIONS", span: 7, t: "Fitting the surface.",
  b: "Eqs. (37)–(38) and (42)–(43). The paper interpolated among four stored atmosphere integrations (its Fig. 4); with 2026 abundance the reconstruction simply reruns the envelope three times and differences — the same derivatives, bought instead of budgeted." },
{ m: "DELTA-F/F IS EXAMINED ONLY AT THE SURFACE", span: 3, t: "Limiting the increments.",
  b: "Sec. V: if any relative correction exceeds the limit, all are scaled down together. δF/F is tested only at the surface, “because F can temporarily become zero at some points within the star.”" },
{ m: "J=N-JJ", span: 1, t: "Backward, the hard way.",
  b: "FORTRAN IV DO loops could not run backward; the return sweep of the elimination counts up and subtracts. Back-substitution recovers δv, then δu, point by point toward the center." },
{ m: "IF (DMAX.LT.EPSC)", span: 2, t: "Quadratic convergence.",
  b: "The corrections shrink roughly as the square of their predecessors — the MAX CORRECT column on the front page collapsing from 10⁻¹ to 10⁻⁵ in four or five iterations." },
{ m: "SUBROUTINE PHYSIC", span: 1, t: "Material functions.",
  b: "P, E, κ, ε and — crucially — their partial derivatives with respect to T and q at every point. Newton needs smooth derivatives: the paper’s Fig. 3 shows how a discontinuity in the physics defeats the method." },
{ m: "SUBROUTINE CONVCK", span: 1, t: "The troublesome boundaries.",
  b: "Convective zones by the Schwarzschild criterion (eq. 27). Placing these boundaries was “the most troublesome part” of the 1964 work (Sec. IV); the reconstruction uses a reclassification margin and freezes the pattern late in the iteration — in the Bodenheimer tradition of not being too perfectionist about it." },
{ m: "EQUATION (22) - HYDROSTATIC", span: 2, t: "Hydrostatic equilibrium.",
  b: "The difference equations are transcribed exactly as printed in the paper, eqs. (22)–(26). Note the (q/p)³ grouping: staged to keep intermediates in range — overflow discipline from the 36-bit era." },
{ m: "GEOMETRIC MEAN", span: 3, t: "The geometric mean of ε.",
  b: "Eq. (24) uses √(εⱼεⱼ₊₁), the paper’s choice for a quantity that “varies rapidly from point to point.” The guard handles the envelope, where ε underflows to zero." },
{ m: "IF (ICV(J).EQ.1) GO TO 40", span: 1, t: "Two transport laws.",
  b: "Radiative zones satisfy eq. (25); convective zones the adiabatic eq. (26). The flag from CONVCK chooses, zone by zone." },
{ m: "SUBROUTINE SAHA", span: 1, t: "Ionization in the envelope.",
  b: "The envelope’s material is partially ionized: H, He, He⁺, and a representative metal supply the electron pressure by Saha equilibria, in the manner of Vardya’s treatment described in Henyey, Vardya & Bodenheimer (1965). The fixed-length iteration keeps the mapping smooth, and cₚ, δ, and ∇ₐₑ follow by differencing neighboring equilibria." },
{ m: "SUBROUTINE ENVEL", span: 1, t: "The outer zone.",
  b: "The role of Vardya’s atmosphere program: given total R and L, integrate the outer 0.2 percent of the mass from a gray photosphere (L = 4πσR²T⁴, κP = ⅔ GM/R²) down to the fitting point." },
{ m: "BOEHM-VITENSE (1958) MIXING-LENGTH", span: 5, t: "Convection with a dial.",
  b: "Where a layer is unstable, the gradient comes from Böhm-Vitense’s mixing-length theory — the physics of Henyey, Vardya & Bodenheimer (1965) — with α = ℓ/Hₚ as the free parameter on card 2." },
{ m: "SUBROUTINE STATE", span: 1, t: "The equation of state.",
  b: "Ions and radiation ideal; the electrons carry the degeneracy correction H(G) of eq. (A7) and the relativistic factor K(x) of eq. (A12) from Appendix A of Bodenheimer, Forbes, Gould & Henyey (1965) — the production code’s own equation of state, restored here from its published appendix." },
{ m: "SUBROUTINE OPACV", span: 1, t: "The 1965 opacity.",
  b: "Appendix B of BFGH (1965): the interpolation formula fitted to the Keller–Meyerott table — hydrogen (B1), helium (B2), metals with the guillotine built in (B3), electron scattering (B4), the published mixing rule (B5), Mestel conduction (B6, B7). The scaled temperature is exactly their T₇, so the constants transcribe verbatim." },
{ m: "CHMLG=", span: 3, t: "H⁻ in logarithms.",
  b: "Below about 10⁴ K an H⁻ term, evaluated as a logarithm to dodge single-precision overflow, stands in for Vardya’s atmospheric opacity table and is joined harmonically — the join keeps κ and its derivatives continuous, as Newton requires." },
{ m: "EPP=25.*RHO", span: 2, t: "Proton–proton burning.",
  b: "The Schwarzschild-era interpolation formula; the coefficient is 2.5×10⁶ dressed in scaled units. The CNO cycle follows two lines below." },
{ m: "SUBROUTINE MIX", span: 1, t: "Convective mixing.",
  b: "Composition is homogenized, mass-weighted, across each connected convective region after every time step — the paper’s “reaction rates; chemical composition” box." },
{ m: "SUBROUTINE PRINTM", span: 1, t: "The printer.",
  b: "Line-printer conventions survive: the first character of each line is carriage control — ‘1’ for a new page, ‘0’ for double space. The front page streams exactly this output." },
];

/* extra anchors for the flow chart */
const ANCHORS = [
  { id: "src-comp",  m: "COMPOSITION STEP - HYDROGEN DEPLETION" },
  { id: "src-dtctl", m: "TIME STEP CONTROL" },
];

/* ---------- flow chart (after Fig. 2 of the paper) ---------- */
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
  const A = bx(60, 8,   280, ["READ THE CARDS", "BUILD THE MASS MESH"], "#src-main");
  const B = bx(60, 66,  280, ["FIRST APPROXIMATION", "(START)"], "#src-start");
  const C = bx(60, 124, 280, ["DEPLETE AND MIX THE", "COMPOSITION (MIX)"], "#src-comp");
  const D = bx(60, 182, 280, ["P, E, K, EPSILON AND", "THEIR DERIVATIVES (PHYSIC)"], "#src-physic");
  const E = bx(60, 240, 280, ["LOCATE CONVECTIVE", "ZONES (CONVCK)"], "#src-convck");
  const F = bx(60, 298, 280, ["LINEARIZED DIFFERENCE", "EQS. (22)-(26) (ZONEQ)"], "#src-zoneq");
  const G = bx(60, 356, 280, ["FIT THE ENVELOPE AT", "THE SURFACE (ENVEL)"], "#src-envel");
  const H = bx(60, 414, 280, ["ELIMINATE AND CORRECT", "DELTA-U, DELTA-V (SOLVE)"], "#src-solve");
  const I = bx(60, 476, 280, ["ARE CORRECTIONS", "SMALL ENOUGH"], "#src-solve", true);
  const J = bx(560, 182, 260, ["PRINT THE MODEL", "(PRINTM)"], "#src-printm");
  const K = bx(560, 262, 260, ["ADJUST THE TIME STEP"], "#src-dtctl");
  const L = bx(560, 328, 260, ["DEFINE THE NEW MODEL,", "ADVANCE THE EPOCH"], "#src-main");
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
    /* down the right column */
    arr(`M${J.cx} ${J.bot} V${K.top - 2}`) +
    arr(`M${K.cx} ${K.bot} V${L.top - 2}`) +
    /* next model: back to composition */
    arr(`M${L.cx} ${L.bot} V430 H470 V${(C.top + C.bot)/2} H${C.right + 2}`);
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
const KW = /^(\s{5,}\d*\s*)(SUBROUTINE|IMPLICIT DOUBLE PRECISION|COMMON|DIMENSION|DATA|CALL|RETURN|CONTINUE|FORMAT|WRITE|READ|GO TO|STOP|END|IF|DO)\b/;
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
  const sm = /^ {6}SUBROUTINE (\w+)/.exec(raw);
  if (sm) div.id = "src-" + sm[1].toLowerCase();
  if (idx === 0) div.id = "src-main";
  return div;
}

async function main() {
  flowchart();
  const res = await fetch("source.f");
  const lines = (await res.text()).replace(/\s+$/, "").split("\n");
  const pane = document.getElementById("codepane");
  pane.innerHTML = "";
  const els = lines.map((l, i) => renderLine(l, i));
  for (const el of els) pane.appendChild(el);
  /* extra anchors */
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
