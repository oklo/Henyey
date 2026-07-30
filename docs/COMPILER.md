# IBFTC-64 Technical Notes

IBFTC-64 is a clean-room FORTRAN IV compiler and batch environment aimed at
the programmer-visible behavior of an IBM 7094 scientific installation in
1964. It compiles fixed-form card images to optimized native C and links a
runtime that applies the 7094 numeric limits after each operation.

The result is intended for period numerical software, particularly Henyey
relaxation and stellar-evolution codes. It is much faster than instruction-
level emulation while retaining the source form, batch workflow, storage
order, calling convention, and single-precision arithmetic that influence
such a calculation.

## Build

The bootstrap requires Python 3 and a C99 compiler. No downloaded packages
are needed.

```sh
make check
bin/ibftc -o build/henyey examples/henyey.f
build/henyey
bin/ibsys examples/cards.job
```

`make install PREFIX=$HOME/.local` installs `ibftc` and `ibsys`.

## Commands

Compile one or more source decks:

```sh
bin/ibftc -o model model.f opacity.f eos.f
```

Keep the generated C for inspection:

```sh
bin/ibftc --emit-c build/model.c -o build/model model.f
```

Run an IBSYS-style card deck:

```sh
bin/ibsys model.job
```

Use `--arithmetic native` to keep the FORTRAN IV language environment but
skip 7094 precision chopping. The default is `--arithmetic ibm7094`.

Logical units 2 and 5 are standard input and unit 6 is the line printer.
Assign another logical unit with an environment variable:

```sh
F4_UNIT_7=opacity.dat bin/ibftc -o model model.f
F4_UNIT_7=opacity.dat ./model
```

## Historical Target

The selected target is the IBM 7094 with the IBSYS/IBJOB FORTRAN IV compiler
workflow. This is a concrete 1964 environment, not a generic mixture of old
Fortran dialects:

- 80-column ASCII files represent card images.
- Labels occupy columns 1-5, continuation is column 6, and source is columns
  7-72. Columns 73-80 are ignored as card sequence fields.
- `REAL` has the 7094 single format: sign, 8-bit excess-128 exponent, and a
  27-bit explicit fraction. Results are chopped to that representation.
- `INTEGER` is constrained to a 35-bit sign/magnitude range.
- Arrays are 1-based and column-major. Arguments are passed by reference.
- Local storage is static, matching the practical behavior of these batch
  compilers.
- `$JOB`, `$EXECUTE IBJOB`, `$IBJOB`, `$IBFTC`, `$DATA`, `$IBSYS`, and
  `$STOP` provide a reproducible batch-deck workflow.

IBM's FORTRAN IV compiler was the `IBFTC` component of IBJOB, and source
decks were introduced by an `$IBFTC` card. See the
[IBM IBJOB manual](https://www.bitsavers.org/pdf/ibm/7090/C28-6389-1_v13_IBJOB_Jun65.pdf)
and this [1965 NASA 7094 operations
guide](https://ntrs.nasa.gov/api/citations/19670081851/downloads/19670081851.pdf).
A later stellar-evolution calculation explicitly reports using the
Berkeley IBM 7094 and the Henyey, Forbes, and Gould program:
[Forbes 1968](https://adsabs.harvard.edu/pdf/1968ApJ...153..495F).

## Fidelity Boundary

This project reproduces the environment at the FORTRAN source and numerical
model level. It does not execute 7094 instructions, reproduce tape timing,
encode 6-bit BCD in memory, or use IBM's copyrighted compiler and library
binaries. Transcendental functions use the host math library and are then
quantized, so their last bit can differ from the period IBLIB routine.
Double precision is represented by the host `double`, which has one fewer
significand bit than the 7094's 54-bit explicit double fraction.

That boundary is deliberate: an actual IBSYS image under a 7094 emulator is
the reference path for instruction- and library-exact archaeology, but it
is not the fast environment this project was built to provide.

The exact accepted source subset and known omissions are in
[the dialect contract](DIALECT.md).

## Henyey Workflow

`henyey.f` is a single source deck for both a modern reference compiler and
IBFTC-64; no compatibility fork is required.

Compile and run with 7094 arithmetic:

```sh
bin/ibftc -o build/henyey-7094 henyey.f
build/henyey-7094 < henyey.in > build/henyey-7094.out
```

Build, run, and compare all 60 model summaries against the saved modern
Fortran reference:

```sh
make check-henyey
```

Use `make check` to perform that calculation and run the compiler test
suite as well.
