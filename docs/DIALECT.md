# IBFTC-64 Dialect Contract

This file is the coding contract for programs intended to compile with
IBFTC-64. Source must be uppercase-compatible FORTRAN IV fixed form. Blanks
are ignored for syntax but remain significant in Hollerith `FORMAT` fields.

## Supported

Program organization:

- Main programs, `SUBROUTINE`, typed and implicitly typed `FUNCTION`, and
  `BLOCK DATA`
- Independent program units in one or several source files
- Call-by-reference scalar and adjustable-dimension array arguments
- Named and blank `COMMON`, with matching item declarations in each unit
- Statement functions and `EXTERNAL` declarations

Data and expressions:

- `INTEGER`, `REAL`, `DOUBLE PRECISION`, and `LOGICAL`
- Implicit I-N integer typing and explicit `IMPLICIT` letter maps
- Scalar and multidimensional arrays in column-major order
- `DIMENSION` and `DATA`, including repetition such as `20*0.0`
- Arithmetic, relational, and logical operators, including `**`
- Common FORTRAN IV math, conversion, sign, difference, min, and max
  intrinsics

Control:

- Labeled `DO` with positive or negative constant/expression increment
- Arithmetic `IF` and one-statement logical `IF`
- Unconditional and computed `GO TO`
- `CALL`, `RETURN`, `CONTINUE`, `STOP`, and `PAUSE`

Input/output:

- `READ`, `WRITE`, and `PRINT`
- Labeled `FORMAT` with nested/repeated groups and `I`, `F`, `E`, `D`, `L`,
  `A`, `X`, `/`, `P`, quoted, and Hollerith descriptors
- Scalar and one-level implied-`DO` I/O lists
- List-directed `*` as an explicitly documented convenience extension
- Logical units 2/5, 6, and host files assigned through `F4_UNIT_n`

## Not Yet Implemented

- `COMPLEX`
- `EQUIVALENCE`
- Assigned `GO TO`, `ASSIGN`, alternate returns, and subprogram arguments
- Nested implied-`DO` I/O
- Mixed-layout association of a `COMMON` block; declare matching items,
  ranks, and types in every program unit
- Tape positioning, unformatted records, `ENCODE`/`DECODE`, and sense
  switches
- Full 7094 line-printer carriage control
- Exact IBLIB transcendental algorithms
- Relocatable 7094 object decks or MAP assembly output

Unsupported constructs produce a compiler diagnostic rather than silently
being translated with modern semantics. `IMPLICIT NONE`, free form,
zero-based/lower-bound array declarations, character variables, and
post-FORTRAN-IV structured syntax should not be used.

## Recommended Stellar-Code Style

Keep mesh limits as `INTEGER` arguments and declare every dummy array:

```fortran
      SUBROUTINE RELAX(N,A,B,C,R,X)
      INTEGER N,I
      REAL A(N),B(N),C(N),R(N),X(N)
```

Use double precision only where the original algorithm explicitly would
have paid for it. Default `REAL` is intentionally about eight decimal
digits, not the host's binary64 precision.

Compile each integrated deck during development:

```sh
bin/ibftc --check main.f solver.f opacity.f
bin/ibftc -o build/star main.f solver.f opacity.f
```

For numerical comparisons, run both arithmetic modes:

```sh
bin/ibftc -o build/star7094 model.f
bin/ibftc --arithmetic native -o build/star-native model.f
```

Differences between those runs identify sensitivity to the period word
length. Bounds checking defaults on for development; set
`F4_BOUNDS_CHECK=0` only when reproducing an original unchecked run.
