# Henyey

## A 1964 stellar-evolution calculation, reconstructed

This repository contains a working reconstruction of Method II from
L. G. Henyey, J. E. Forbes, and N. L. Gould,
["A New Method of Automatic Computation of Stellar
Evolution"](https://adsabs.harvard.edu/pdf/1964ApJ...139..306H),
*Astrophysical Journal* **139**, 306 (1964).

It also contains a new compiler and batch environment for the FORTRAN IV
programming model of an IBM 7094 installation in 1964. The calculation can
therefore be run in its period source form and with approximately the
single-precision arithmetic available at the time, but at modern speed.

**An important qualification:** the stellar program is a new implementation
of the published method, not a recovered copy of the original Henyey,
Forbes, and Gould source deck. The compiler is likewise a clean-room
reconstruction, not IBM software and not an instruction-by-instruction
7094 emulator.

## You do not need to know GitHub

GitHub calls this project folder a "repository." Everything needed for a
first look is available through these three links:

1. [Read the FORTRAN IV source deck](henyey.f). It is about 1,000 lines,
   extensively commented, and is kept in the old fixed-column form.
2. [See the two input cards](henyey.in). They specify a one-solar-mass star,
   initial hydrogen abundance `X = 0.700`, `Z = 0.020`, mixing-length
   parameter `alpha = 1.65`, 151 mesh points, and 50 models. These are the
   calibrated values: the sequence passes through the actual Sun at the
   solar age.
3. [See the complete line-printer-style output](henyey.out). The first
   model, intermediate structures, iteration history, and final model are
   all present.

Clicking a file name displays it in the browser. The browser's Back button
returns here. No command line or knowledge of Git is required simply to
read the calculation.

To obtain an ordinary folder containing the whole project, use the green
**Code** button near the top of this page and choose **Download ZIP**.

## What the program does

All dependent quantities are carried on one set of Lagrangian mesh points.
The source uses the artificial variables introduced in the paper:

```text
p = P^(1/4)            equation (8)
q = rho^(1/3)          equation (9)
l = xi^2 F             equation (10), the pseudoflux
K = 3 kappa p^3 /
    (256 pi G sigma T^3)  equation (11)
```

The program implements the centered difference equations (22)-(26) and
the block elimination of equations (39)-(46). In the notation of the
paper, `u = (r,F)` and `v = (T,q)`, with the forward recursion

```text
delta u_j + alpha_j delta v_j + gamma_j = 0
```

followed by stored back substitution. Corrections are limited during the
Newton process; `delta F/F` is tested only at the surface because the
pseudoflux may pass through zero in the interior.

The outermost 0.2 percent of the mass is treated by a separate envelope
integration. The original scheme interpolated among stored atmosphere
cases. Here the envelope is reintegrated to obtain the boundary
derivatives numerically. That is one deliberate difference between this
reconstruction and the production program described in 1964.

The envelope integration itself proceeds in two stages, following the
atmosphere paper of Henyey, Vardya & Bodenheimer (1965, ApJ 142, 841).
The outermost layers are radiative and follow that paper's blanketed
T-tau relation (their eq. 10, with the line-blanketing coefficients of
eqs. 11-12), integrated in optical depth from tau = 0.01 to the onset
of convective instability. From there the march continues on a
logarithmic column-mass scale, resolving the superadiabatic layer,
with the smaller of the radiative and mixing-length gradients.

The sequence follows the flow of Figure 2: hydrogen depletion and
convective mixing, evaluation of the material functions and their
derivatives, Henyey iterations, and time-step control. A failed step is
restored and retried with half the time interval.

Internally the program works in the scaled units of the original
Berkeley production code, as recalled by Peter Bodenheimer: mass in
units of 10^30 g, length 10^10 cm, time 10^5 s, and temperature 10^7 K
(so that G = 666.8 and the density unit is 1 g cm^-3). All working
quantities are then of moderate magnitude, which is not a nicety on a
machine with a 27-bit fraction. Printed output is converted back to
cgs. Where the layers of the envelope integration are convectively
unstable, the temperature gradient now comes from the Bohm-Vitense
(1958) mixing-length theory; the ratio of mixing length to pressure
scale height is a new final field on the second input card (blank
selects 1.5), again following Bodenheimer's description of the
production program's Vardya atmosphere.

## Guide to the source

The main program occupies the first part of [henyey.f](henyey.f) and
controls the evolutionary sequence. Its subroutines are arranged in the
order in which one would naturally inspect the calculation:

| Routine | Purpose |
| --- | --- |
| `START` | Constructs an initial approximation from an `n = 3` Emden model and an inward integration |
| `SOLVE` | Performs the forward block elimination, surface solution, correction limiting, and back substitution |
| `PHYSIC` | Evaluates the material functions and their derivatives |
| `CONVCK` | Locates convective zones using the Schwarzschild criterion |
| `ZONEQ` | Forms the four linearized difference equations for one interval |
| `ENVEL` | Integrates the outer envelope and supplies the fitting conditions |
| `TTAU` | Evaluates the blanketed radiative T-tau relation of HVB (1965) |
| `SAHA` | Solves the envelope's Saha ionization equilibrium (HVB 1965) |
| `STATE` | Evaluates the BFGH (1965) Appendix A equation of state, degenerate electrons included |
| `OPAC` | Evaluates the BFGH (1965) Appendix B opacity, H-minus joined at low temperature |
| `ENUC` | Evaluates proton-proton and CNO energy generation |
| `MIX` | Homogenizes the composition within connected convective regions |
| `PRINTM` | Prints a complete model in the line-printer layout |

The physics is the Berkeley group's own, restored from the appendices of
Bodenheimer, Forbes, Gould & Henyey (1965) and from Henyey, Vardya &
Bodenheimer (1965): their Keller-Meyerott opacity formula with Mestel
conduction, their degenerate-electron equation of state, Saha
ionization, the blanketed T-tau outer radiative layer, Bohm-Vitense
mixing-length convection in the envelope integration, H-minus opacity
standing in at low temperature for Vardya's atmospheric table, and
proton-proton and CNO burning. Diffusion and modern opacity or
reaction tables are absent. This is a study of the numerical method
and computing environment, with the period physics carried far enough
that the model sun lands on the actual one.

## The supplied calculation

The static model converges in twelve Henyey iterations. Subsequent
models normally require two or three. The 50-model sequence starts on
the zero-age main sequence, passes through the present Sun near model
29, and reaches the old main sequence:

```text
MODEL    AGE(YR)       IT   L/LSUN   R/RSUN   TEFF     TC       RHOC    XC
    1    0.0000E+00    12    0.6965    0.8811   5628   1.348E7    87.35  0.7000
   29    4.6388E+09     3    1.0060    1.0010   5790   1.572E7   157.50  0.3785
   50    6.4948E+09     3    1.2050    1.0770   5838   1.754E7   221.20  0.1996
```

### Fitting the actual Sun

The calibration history is itself a faithful reenactment. With an
ideal fully ionized envelope the model sun came out seven percent
compact, and the mixing-length parameter could not close the gap - the
entire alpha range spanned only R = 0.914-0.927 R_sun, isolating the
envelope thermodynamics. Restoring Saha ionization (the Vardya
physics) made the envelope follow the true ionization-depressed
adiabat and swung the radius compact; restoring the 1965 opacity and
degeneracy appendices swung it back large. With that stack the
luminosity calibrated readily but the radius sat about 25 percent
compact and nearly alpha-independent. The reason turned out to be the
missing outer radiative layer: the envelope march began at the
photosphere and stepped straight over the superadiabatic region, so
the mixing-length dial was connected to nothing. Henyey's group needed
a separate paper for exactly this layer - Henyey, Vardya & Bodenheimer
(1965) - and restoring its blanketed T-tau relation both moved the
radius and put alpha back in control.

With the T-tau layer in place the sequence calibrates inside the
production code's remembered range of alpha between 1 and 2. The
supplied deck (`X = 0.700`, `Z = 0.020`, `alpha = 1.65`) gives, at the
solar age of 4.64 Gyr,

```text
L = 1.006 L_sun   R = 1.001 R_sun   TEFF = 5790 K   TC = 1.57E7 K
```

against the actual 1.000, 1.000, 5772, and 1.57E7. The remaining
percent-level residuals are period physics: the reaction rates and
Vardya's full atmospheric opacity table are still the classical
interpolation formulae.

The complete radial structures are printed at the initial model, every
twentieth model, and the final model. In those tables:

| Column | Meaning |
| --- | --- |
| `XI` | Lagrangian mesh coordinate |
| `M/M` | Fractional enclosed mass |
| `R`, `L` | Radius and luminosity in cgs units |
| `T`, `RHO`, `P` | Temperature, density, and pressure |
| `X` | Hydrogen mass fraction |
| `KAPPA`, `EPS` | Opacity and nuclear energy generation |
| `CV` | Convective-zone flag |

## The 7094-compatible environment

The compiler, called **IBFTC-64**, accepts 80-column card images with
statement labels in columns 1-5, continuation in column 6, and source in
columns 7-72. Arrays are one-based and column-major, arguments are passed
by reference, and local storage is static.

Its default `REAL` arithmetic is reduced after each operation to the IBM
7094 single format: an 8-bit excess-128 exponent and a 27-bit explicit
fraction. Logical units 5 and 6 act as the card reader and line printer.
The compiler translates the deck to native C, which accounts for the speed;
the runtime then imposes the selected 7094 numerical limits.

The saved printout was also generated with a modern legacy Fortran
compiler as an independent reference. An automated comparison runs the
same 50 models with IBFTC-64. At the printed precision, the two executions
agree in luminosity, radius, effective temperature, central temperature,
central density, central pressure, and central hydrogen abundance. The
largest relative age difference is about `2.8e-5`, from the different
single-precision arithmetic.

The compiler's precise scope and its known omissions are documented in
[the FORTRAN IV dialect contract](docs/DIALECT.md). More detail about
building, running, and the limits of the emulation is in
[the technical notes](docs/COMPILER.md).

## Reproducing the run (optional)

This section is only for a reader who wants to run the calculation.
Python 3 and a C compiler are required; no downloaded programming packages
are needed. In a terminal opened in the project folder:

```sh
make check-henyey
```

That command compiles the source with 7094 arithmetic, reads the two input
cards, runs all 50 models, and compares the result with the saved reference
printout. `make check` additionally runs the compiler's language tests.

The essential manual sequence is:

```sh
bin/ibftc -o build/henyey-7094 henyey.f
build/henyey-7094 < henyey.in > build/henyey-7094.out
```

In period terms, the first command compiles and links the source deck. The
second places `henyey.in` on logical unit 5 and sends logical unit 6 to a
new printout file.
