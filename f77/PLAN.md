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
| EOS | Saumon, Chabrier & Van Horn (1995) H and He tables, mass-weighted (LB93 used Fontaine, Graboske & Van Horn 1977, additive volumes) | tables to be acquired |
| Interior radiative opacity | Weiss, Keady & Magee (1990) analytic formulations; King IVa (H-rich) to Ross-Aller 2 (He-rich), linear interpolation in composition | formulae in paper |
| Conductive opacity | Hubbard & Lampe (1969) ApJS tables, H and He mixtures | tables in paper |
| Low-T molecular opacity | Alexander, Johnson & Rypma (1983); grains/ice from Pollack, McKay & Christofferson (1985) | tables in papers |
| He-rich opacity scaling | LBA97 eq. (2.1): kappa_He = kappa_H [1 - (0.7 - X_H)/2], atmospheric layers only | in paper |
| Nuclear rates | Bahcall (1989); 3He followed as an explicit species out of equilibrium below Tc ~ 8e6 K (p+p and 3He+3He separate); PPII/PPIII branching from Parker, Bahcall & Fowler (1964); CNO above 2e7 K; initial 3He = 0; no primordial D | in print |
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
2. **Composition vector** — carry (X, 3He, 4He) per mesh point; explicit
   3He rate network with Bahcall (1989) rates and Graboske et al. (1973)
   screening; convective mixing of all species. Validate in the
   1964-physics limit (3He equilibrium should reproduce present tracks).
3. **Tabular EOS** — SCVH95 with C1-continuous interpolation (smooth
   derivatives are required by the Newton scheme; see the discontinuity
   discussion and Fig. 3 of HFG 1964). Brown-dwarf-capable at the low
   end.
4. **Opacity stack** — WKM90 analytic high-T + AJR83/PMC85 low-T +
   Hubbard-Lampe conduction, joined smoothly; eq. (2.1) He-enrichment
   scaling.
5. **Atmosphere** — LB93 case-B radiative atmosphere with MLT in the
   nonadiabatic layers, supplying the fitting conditions and their
   (R, L) derivatives as in the present ENVEL.
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
