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
   initial hydrogen abundance `X = 0.708`, `Z = 0.020`, 151 mesh points, and
   60 models.
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
| `STATE` | Evaluates the ideal-gas-plus-radiation equation of state |
| `OPAC` | Evaluates the joined classical opacity formulae |
| `ENUC` | Evaluates proton-proton and CNO energy generation |
| `MIX` | Homogenizes the composition within connected convective regions |
| `PRINTM` | Prints a complete model in the line-printer layout |

The physics is intentionally of the period: ideal gas plus radiation;
Kramers, electron-scattering, and H-minus opacity; proton-proton and CNO
burning; and an adiabatic gradient of 0.4. Degeneracy, diffusion, and
modern opacity or reaction tables are absent. This is a study of the
numerical method and computing environment, not a modern calibrated solar
model.

## The supplied calculation

The static model converges in five Henyey iterations. Subsequent models
normally require two iterations. The 60-model sequence reaches:

```text
MODEL    AGE(YR)       IT   L/LSUN   R/RSUN   TEFF     TC       RHOC    XC
    1    0.0000E+00     5    0.6977    0.8802   5633   1.382E7    75.66  0.7080
   60    6.7123E+09     2    1.2410    0.9522   6254   1.794E7   157.40  0.3155
```

### Fitting the actual Sun

A stellar-evolution code of this era was tested by asking it to
reproduce the Sun at the solar age. With the heavy-element fraction
held at `Z = 0.020`, an initial hydrogen abundance of `X = 0.709`
brings the model to `L = 0.999 L_sun` at an age of 4.6 billion years.
The card deck for this calibrated run is supplied as
[henyey-solar.in](henyey-solar.in).

The luminosity fit leaves the radius short: `R = 0.916 R_sun` and
`Teff = 6040 K` at the solar age. With the mixing-length parameter now
installed, the envelope can be driven smoothly between its two limits —
fully adiabatic convection (large alpha, `R = 0.914`) and a fully
radiative envelope (alpha near zero, `R = 0.927`) — and the entire
accessible range remains about seven percent too compact. That
localizes the deficit precisely: it does not lie in the treatment of
convection but in the envelope's equation of state, which here is an
ideal fully ionized gas. The partial ionization of hydrogen and helium
depresses the adiabatic gradient far below 0.4 through the ionization
zones and thickens the envelope; Bodenheimer recalls that Vardya's
atmosphere program carried exactly this physics (including the electron
contribution of ionized metals), which is why the production code could
fit the Sun and this reconstruction, so far, cannot. Installing Saha
ionization in the envelope integration is the identified next step.

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
same 60 models with IBFTC-64. At the printed precision, the two executions
agree in luminosity, radius, effective temperature, central temperature,
central density, central pressure, and central hydrogen abundance. The
largest relative age difference is about `1.5e-5`, from the different
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
cards, runs all 60 models, and compares the result with the saved reference
printout. `make check` additionally runs the compiler's language tests.

The essential manual sequence is:

```sh
bin/ibftc -o build/henyey-7094 henyey.f
build/henyey-7094 < henyey.in > build/henyey-7094.out
```

In period terms, the first command compiles and links the source deck. The
second places `henyey.in` on logical unit 5 and sends logical unit 6 to a
new printout file.
