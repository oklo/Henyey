# The Saumon, Chabrier & Van Horn (1995) equation-of-state tables

Phase 3 of the plan calls for the SCVH95 hydrogen and helium tables
(Saumon, Chabrier & Van Horn 1995, ApJS 99, 713), the equation of
state used by Laughlin, Bodenheimer & Adams (1997). These are the
original distributed tables, in the interpolated ("_i") form that
smooths across the plasma phase transition - the version in general
use by stellar-evolution codes.

## Files

| File | Content |
| --- | --- |
| `h_tab_i.dat` | Pure hydrogen, 63 isotherms, log T = 2.10 to 7.06 |
| `he_tab_i.dat` | Pure helium, same grid |
| `z_tab_i.dat` | A companion metals table in the same format (from the YREC distribution, not part of SCVH95 itself) |

## Format

Each block begins with a header `log10(T)  N`, followed by N rows,
one per pressure point (log P from 4.0 in steps of 0.2):

```text
log P   x1   x2   log rho   log S   log U   dlrho/dlT|P   dlrho/dlP|T   dlS/dlT|P   dlS/dlP|T   grad(ad)
```

For hydrogen the concentrations x1, x2 are the H2 and neutral-H
number fractions; for helium, neutral He and He+. Entropy S and
internal energy U are per gram, c.g.s. Mixtures at given hydrogen
mass fraction X are formed by the additive-volume rule with the
ideal entropy of mixing (SCVH95 section 5; LB93 section 2).

## Provenance

Obtained 2026-08-05 from the public data release of the Yale
Rotating Stellar Evolution Code (YREC), github.com/yreclab/yrec,
`input/eos/scv/`, which redistributes the authors' original tables.
