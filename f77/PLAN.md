# Recreating the 1997 code: Laughlin, Bodenheimer & Adams (ApJ 482, 420)

This directory holds the FORTRAN 77 line of the family tree: a clean-room
recreation of the stellar-evolution program used in Laughlin &
Bodenheimer (1993, ApJ 403, 303; "LB93") and Laughlin, Bodenheimer &
Adams (1997, ApJ 482, 420; "LBA97"), built outward from the verified
1964 Method II solver in the repository root. The goal is a good working
routine that can be extended past what was solved in 1997 — historical
fidelity matters less here than correctness and extensibility. The
dialect is FORTRAN 77, double precision throughout.

## Physics bill of materials (from LBA97 section 2 and LB93 section 2)

| Ingredient | Source | Status |
| --- | --- | --- |
| EOS | Saumon, Chabrier & Van Horn (1995) H and He tables, mass-weighted (LB93 used Fontaine, Graboske & Van Horn 1977, additive volumes) | tables to be acquired; interim: BFGH65 App. A degeneracy installed |
| Interior radiative opacity | Weiss, Keady & Magee (1990) analytic formulations; King IVa (H-rich) to Ross-Aller 2 (He-rich), linear interpolation in composition | formulae in paper; interim: BFGH65 App. B installed |
| Conductive opacity | Hubbard & Lampe (1969) ApJS tables, H and He mixtures | tables in paper |
| Low-T molecular opacity | Alexander, Johnson & Rypma (1983); grains/ice from Pollack, McKay & Christofferson (1985) | tables in papers |
| He-rich opacity scaling | LBA97 eq. (2.1): kappa_He = kappa_H [1 - (0.7 - X_H)/2], atmospheric layers only | in paper |
| Nuclear rates | Bahcall (1989); 3He followed as an explicit species out of equilibrium below Tc ~ 8e6 K (p+p and 3He+3He separate); PPII/PPIII branching from Parker, Bahcall & Fowler (1964); CNO above 2e7 K; initial 3He = 0; no primordial D | DONE via CF88 + BFGH65 App. C network (Phase 2b): explicit C12/C13/N14/O16, Be7 energy branching |
| Screening | Graboske, DeWitt, Grossman & Cooper (1973), weak + intermediate | in print |
| Convection | Adiabatic gradient wherever convective (justified in LB93 via Burrows et al. 1989 mixing-length insensitivity); nonadiabatic MLT only in the atmospheric layers | — |
| Atmosphere (LB93 "case B") | Given Teff and g at the outer mesh point, iterate EOS + hydrostatic equilibrium for P(tau); take rho(P,T) at tau = 2/3 as the outer boundary condition | described in LB93 |
| Composition | X = 0.70, Y = 0.28, Z = 0.02 | — |

Start/stop conventions from LB93: models begin high on the Hayashi track
(log L/Lsun > -1, rho_c < 0.1, Tc < 5e5) and are evolved until
L < 1e-6 Lsun or the hydrogen-burning main sequence is reached.

## Phases

1. **Solver base** — `henyey77.f`: the root-directory 1964 program
   ported to F77 double precision (quoted strings for Hollerith, generic
   intrinsics, IMPLICIT DOUBLE PRECISION, reordered COMMON). DONE:
   compiles with no warnings and reproduces the single-precision solar
   run (80 models, identical printed values at model 80).
2. **Composition vector** — DONE (July 2026). (X, 3He, 4He) per mesh
   point with 4He from the sum rule; pp chain with explicit
   out-of-equilibrium 3He: p(p,e+nu)d(p,g)3He, 3He(3He,2p)4He, and
   3He(4He,g)7Be completed through PPII (effective Q-values 6.671,
   12.860, 18.982 MeV, neutrino losses removed); CNO via the N14(p,g)
   bottleneck. Cross sections from Caughlan & Fowler (1988), the
   working equivalent of LBA97's Bahcall (1989). Screening after
   Graboske et al. (1973): exact Debye-Hueckel weak form plus an
   intermediate form 0.380*Lambda0**0.860 with the (Z1+Z2)**1.86
   charge combination, the smaller exponent taken; the composition
   factor of the intermediate form is simplified (mean z**1.58 over
   ions) — VERIFIED August 2026 against the GDGC paper itself and
   replaced by the exact prescription: H12 = f(xi12)*Lambda12**0.860
   with f(xi) = 0.380*((1+xi)**1.86 - xi**1.86 - 1)/xi**0.86,
   xi12 = Z1*Z2/<z**2>, and Lambda12 equal to the weak-screening
   exponent (GDGC eqs. 14, 16, 19; reproduces their Table 3 charge
   factors to better than one percent). Strong screening
   (Lambda12 > ~2) remains uninstalled. The
   PPIII branch (Parker, Bahcall & Fowler 1964 ratios) is not yet
   installed; below ~1.5e7 K it is under one percent of 7Be
   completions. 3He advances by a closed-form backward-Euler step
   (stable for steps long or short against the 3He lifetime); H1
   explicitly; convective regions mix both species; the 3He step
   limiter consults only energetically significant points. Card 1
   gained an optional fourth field: initial 3He (blank/0 = LBA97
   convention; negative = local equilibrium, for comparison with the
   1964-physics program). Validation: equilibrium-init solar model
   converges to L = 0.679 Lsun at ZAMS (root code: 0.698, a ~3%
   rate-difference effect) and evolves normally; an X3=0 solar model
   starts compact and hot (rho_c = 96) and the core expands as 3He
   builds (rho_c -> 87), the LBA97 signature; a 0.3 Msun model runs
   200 models to 1.7e11 yr in 1-2 iterations per step, accumulating
   2.3% central 3He with the chain terminating at 3He, as expected at
   Tc ~ 6e6 K.

   **Phase 2b - DONE (2026-08-05).** The full network of BFGH65
   Appendix C: seven explicit species (H1, He3, He4, C12, C13, N14,
   O16) advanced by the appendix's implicit scheme (their eq. C9) in
   its three-step iterated cycle - the linear CNO solve of eqs.
   (C17)-(C20) in closed form, the He3 quadratic (C21), the H1
   quadratic (C22) with He4 from the sum rule (C23). N15 branches by
   the constant fraction f = 1.1e-3 to O16; the Be7 branching (CF88
   proton capture against CF88 electron capture) enters the energy
   only, PPII completion at 18.982 MeV against PPIII at 12.50 MeV, as
   Appendix C prescribes. CNO rates are CF88 (C12, C13, N14 bottleneck
   as before, O16(p,g) with its saturation form), screened per pair
   charge (Z1*Z2 = 6, 7, 8) by the exact GDGC intermediate form.
   Initial CNO: 0.172/0.002/0.053/0.482 of Z for C12/C13/N14/O16, the
   remaining 0.291 of Z inert; ENUC evaluates the seven-channel
   epsilon with derivatives by centered differences of an ENUCV
   evaluator (house style); MIX homogenizes all six followed species;
   PRINTM appends the central CNO abundances. Validation: the solar
   model converts central C12 to N14 within ~0.5 Gyr and sits at CN
   equilibrium (C13/C12 = 0.31) with O16 slowly draining to N14 -
   exactly Peter's recollection that CNO at solar abundances went to
   equilibrium in the pre-MS; recalibrated solar deck X = 0.691,
   alpha = 1.72 gives L = 0.994, R = 1.000, Teff = 5776, Tc = 1.539e7
   at 4.57 Gyr.

   **A numerical lesson worth keeping.** First runs of the new network
   destroyed hydrogen ~10x faster than the luminosity could account
   for. The cause was catastrophic cancellation in the backward-Euler
   quadratic root (-B + SQRT(B**2 - 4AC))/(2A): at cool mesh points
   the quadratic coefficient A ~ Dt*rate collapses toward zero, the
   root becomes 0/0, and the square root's last-bit error is amplified
   by 1/A into composition noise reaching percent level per step,
   which convective mixing then spreads over the star. The He3 update
   had carried the same unstable form since Phase 2. Both quadratics
   now use the cancellation-free conjugate root 2(-C)/(B + SQRT(...)),
   exact as A -> 0. With the stable roots the 0.3 Msun model runs 400
   models to 3.7e11 yr glued to the dt cap, shows the LBA97 core
   expansion (Tc dips from 7.04e6 to 6.75e6 as He3 builds, then
   recovers), and the "boundary flapping" wobble recorded below is
   gone - that specimen was largely this cancellation noise, not
   convection-zone physics. The phase 7(i) instrumentation interest
   stands, but with a cleaner baseline.

   UPDATE (2026-08-05): the 3He time-step measure moved
   from BURN to the main program and now compares the MIXED
   composition with the pre-step one. Measuring the pre-mix local
   change had throttled fully convective stars: the hot center's
   local 3He production is large relative to the mixed reservoir,
   but convection immediately dilutes it, so the old measure held a
   0.3 Msun model to dt ~ 2e7 yr indefinitely. With the post-mix
   measure the same model rides the dt cap (9.5e8 yr) and reaches
   2.4e11 yr in 400 models, 24x farther. Around 2.3e11 yr
   (Xc ~ 0.59, still fully convective at Tc = 7.7e6) the model
   develops a slow wobble - Tc dips ~1%, Xc locally increases from
   remixing, dt drops to ~3e7 yr - which looks like convective-
   boundary flapping across time steps: the first captured specimen
   of the 1997 convergence trouble that phase 7(i) exists to
   instrument.
3. **Tabular EOS** — SCVH95 with C1-continuous interpolation (smooth
   derivatives are required by the Newton scheme; see the discontinuity
   discussion and Fig. 3 of HFG 1964). Brown-dwarf-capable at the low
   end.
4. **Opacity stack** — WKM90 analytic high-T + AJR83/PMC85 low-T +
   Hubbard-Lampe conduction, joined smoothly; eq. (2.1) He-enrichment
   scaling.
5. **Atmosphere** — LB93 case-B radiative atmosphere with MLT in the
   nonadiabatic layers, supplying the fitting conditions and their
   (R, L) derivatives as in the present ENVEL. PARTIAL (July 2026):
   Boehm-Vitense MLT with free alpha (card 2, blank = 1.5) is
   installed in ENVEL of both code lines; the solar-radius experiment
   shows the full alpha range spans only R = 0.914-0.927 Rsun with the
   ideal-gas envelope, isolating Saha ionization thermodynamics (the
   Vardya physics) as the binding constraint. UPDATE (August 2026):
   the Saha envelope (H, He I/II, representative metal; HVB65 Sec. II
   without turbulent pressure) is implemented on the `saha-envelope`
   branch for the FORTRAN IV line. The thermodynamics behaves
   correctly (grad-ad dips to ~0.15 through the ionization zones)
   but exposes the low-temperature opacity: the H-minus formula
   beyond its 3000-6000 K validity plus the interior-calibrated
   Kramers law give kappa ~ 1e3 cm2/g at 1-3e4 K where reality is
   tens, and the solar radius regresses to 0.73 Rsun — the failure
   mode the HVB65 abstract itself names ("inadequate knowledge
   concerning opacities at low temperatures"). CRITICAL PATH:
   implement the opacity (and degeneracy) treatment of the BFGH65
   appendices in OPAC, merge the branch, and redo the (alpha, X)
   solar fit, for both code lines; then the tau-integration of the
   case-B boundary. UPDATE 2 (August 2026): DONE for the '64 line -
   Appendix A degeneracy (H(G), relativistic K(x)) in STATE and
   Appendix B Keller-Meyerott opacity with Mestel conduction in
   OPAC, merged with the saha-envelope branch; the scaled T unit is
   exactly BFGH's T7, so the constants transcribe verbatim. The two
   restorations bracket the Sun (BFGH alone R = 1.06, Saha alone
   0.73) but combine to ~25% compact, nearly alpha-independent.
   REMAINING for the solar fit: the HVB65 outer radiative layer -
   the T-tau relation (their eq. 10, less blanketing) and a bounded
   mid-temperature opacity standing in for Vardya's atmospheric
   table. UPDATE 3 (2026-08-05): the missing layer was found and
   both lines now fit the Sun. Root cause of the alpha-insensitive
   25%-compact radius: the envelope march started at the photosphere
   and its first column-mass step landed below the entire
   superadiabatic layer, so the mixing-length parameter was
   connected to nothing. ENVEL (both lines) now integrates the
   HVB65 blanketed T-tau relation (eq. 10, coefficients eqs. 11-12,
   zeta of eq. 9; subroutine TTAU) in optical depth from tau = 0.01
   to the onset of convective instability, then continues the
   column-mass march from the column mass actually reached. The
   f77 line simultaneously received full BFGH parity: Appendix A
   degeneracy in STATE/STATEV (composition enters as moles of ions
   and electrons, 3He counted separately), Appendix B opacity in
   OPAC/OPACV (written in T7 so the constants transcribe verbatim,
   C1-continuous via centered differences), and the Saha envelope
   (SAHA/SAHA1, c.g.s.). Solar calibrations: '64 line X = 0.700,
   alpha = 1.65 gives L = 1.006, R = 1.001, Teff = 5790 at
   4.64 Gyr; f77 line (CF88 rates run ~7% fainter, X3 = 0 start)
   X = 0.692, alpha = 1.75 gives L = 0.998, R = 0.999,
   Teff = 5783, Tc = 1.546e7 at 4.63 Gyr. Both alphas sit inside
   the production code's remembered range of 1-2. Appendix A
   remains a placeholder for Phase 3 SCVH; the envelope structure
   (T-tau layer, onset switch, resolved superadiabatic march) is
   exactly the scaffold the LB93 case-B atmosphere drops into.
6. **Validation against the published record** — LBA97 Table 1
   (0.08, 0.15, 0.20 Msun vs. Burrows et al. 1993); the 0.1 Msun
   narrative: ZAMS at Teff = 2228 K, log L = -3.38; 3He peak mass
   fraction 9.95% at 1.38e12 yr; rho_c falling 309 -> 204 g/cc;
   radiative-core onset at 5742 Gyr; helium white dwarf end state;
   tau_H ~ 1e13 yr for the minimum-mass star.
7. **Extensions (the 2026 science)** — (i) convergence instrumentation
   and adaptive mesh-point insertion (the "temporary points" of HFG64);
   (ii) controlled experiments on the red-giant question by separately
   disabling the three ingredients identified in LBA97 section 4;
   (iii) complete evolutionary tracks for 0.25-0.43 Msun, where a
   hydrogen shell burns over a degenerate helium core.

## Details recovered from Peter Bodenheimer (July 2026)

Peter's recollections of the production 1964 Berkeley code, which shift
some phase priorities:

- **Scaled units**: mass 1e30 g, length 1e10 cm, time 1e5 s,
  temperature 1e7 K. (In these units G = 667.4.) Unknown whether the
  UNIVAC version used them.
- **EOS**: ideal gas + radiation + partial-to-complete degeneracy —
  the 1964 production code already carried degeneracy.
- **Atmosphere (Vardya's program)**: partial ionization of H and He and
  of the outermost electron of some metals (e.g. Fe) for the electron
  pressure; Boehm-Vitense mixing-length convection with superadiabatic
  gradients; the ratio of mixing length to scale height was a free
  parameter — "if this is put in, it should be possible to fit the
  Sun."
- **Nuclear**: all three pp branches computed; 3He tracked and stored
  (the chain can terminate there in very low-mass stars); CNO followed
  C12, N14, and O16 with all rates computed, no equilibrium assumption;
  rates as available in the early 1960s.
- **Opacities**: uncertain; Los Alamos tables were just appearing;
  probably an analytic approximation; no molecular opacities.
- Peter's own Fortran translation "really didn't have problems with
  convection zone boundaries."

Implications: the phase-2 network is closer to the original 1964 code
than to a simplification of it; phase 5's mixing-length alpha is the
historically correct second solar-calibration knob; a phase-2b
(PPIII branch, C12/N14/O16 non-equilibrium CNO) would complete the
original's network; degeneracy in the EOS (phase 3) was present even
in 1964.

## Historical notes recovered from LB93

LB93 ran two aggregates: case A used a photospheric boundary condition
kappa*P proportional to g, with the photospheric pressure "chosen by
trial and error" so that 0.1 Msun landed at log L = -3.15; case B used
the radiative model atmosphere described above. LB93 also uniformly
depressed the Fontaine et al. (1977) pressure by 2.5% in the nonideal
regime, blended smoothly to ideal — an ad hoc softening that LBA97
section 3.1 reports is reproduced, "in a physically justifiable manner,"
by the Saumon et al. (1995) equation of state. The LBA97 main-sequence
model corresponds to LB93 model B with the SCVH EOS swap.
