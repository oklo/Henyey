#!/usr/bin/env python3
"""Compare printed Henyey model summaries from two compiler runs."""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path


BAD_DIAGNOSTICS = (
    "NO CONVERGENCE",
    "TIME STEP HALVED",
    "SINGULAR MATRIX",
    "MACHINE CHECK",
)


@dataclass(frozen=True)
class Model:
    number: int
    age: float
    step: float
    iterations: int
    luminosity: float
    radius: float
    teff: float
    central_temperature: float
    central_density: float
    central_pressure: float
    central_hydrogen: float


FIELDS = (
    "age",
    "step",
    "luminosity",
    "radius",
    "teff",
    "central_temperature",
    "central_density",
    "central_pressure",
    "central_hydrogen",
)


def load(path: Path) -> tuple[str, list[Model]]:
    text = path.read_text(encoding="ascii")
    models: list[Model] = []
    for line in text.splitlines():
        fields = line.split()
        if (
            len(fields) == 11
            and fields[0].isdigit()
            and "E" in fields[1]
            and "E" in fields[2]
        ):
            models.append(
                Model(
                    int(fields[0]),
                    float(fields[1]),
                    float(fields[2]),
                    int(fields[3]),
                    *(float(value) for value in fields[4:]),
                )
            )
    return text, models


def relative_error(reference: float, candidate: float) -> float:
    return abs(candidate - reference) / max(abs(reference), 1.0e-30)


def fail(message: str) -> None:
    print(f"HENYEY COMPARISON FAILED: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()

    reference_text, reference = load(args.reference)
    candidate_text, candidate = load(args.candidate)
    for diagnostic in BAD_DIAGNOSTICS:
        if diagnostic in candidate_text:
            fail(f"candidate contains {diagnostic!r}")
    expected = len(reference)
    if expected == 0 or len(candidate) != expected:
        fail(
            f"expected {expected or 'some'} models, found {len(reference)} "
            f"reference and {len(candidate)} candidate"
        )
    if [model.number for model in reference] != list(range(1, expected + 1)):
        fail(f"reference model numbering is not 1 through {expected}")
    if [model.number for model in candidate] != list(range(1, expected + 1)):
        fail(f"candidate model numbering is not 1 through {expected}")

    iteration_differences = [
        (left.number, left.iterations, right.iterations)
        for left, right in zip(reference, candidate)
        if left.iterations != right.iterations
    ]
    if iteration_differences:
        fail(f"iteration counts differ: {iteration_differences}")

    # The default per-field tolerance. The Saha/BFGH physics (August
    # 2026) lengthened the arithmetic path per iteration, and the 27-bit
    # and binary64 runs legitimately drift a little further apart over a
    # 60-model sequence; 1e-3 on the printed track quantities remains
    # far below any physical significance.
    limits = {"age": 1.0e-4, "step": 1.0e-4}
    default_limit = 1.0e-3
    print("FIELD                 MAX RELATIVE ERROR   MODEL")
    for field in FIELDS:
        errors = [
            (relative_error(getattr(left, field), getattr(right, field)), left.number)
            for left, right in zip(reference, candidate)
        ]
        maximum, model = max(errors)
        limit = limits.get(field, default_limit)
        print(f"{field:22} {maximum:18.8e} {model:7d}")
        if not math.isfinite(maximum) or maximum > limit:
            fail(f"{field} relative error {maximum:.6g} exceeds {limit:.6g}")

    final = candidate[-1]
    print(
        "HENYEY COMPARISON PASSED: "
        f"{len(candidate)} models, final age={final.age:.7g} yr, "
        f"L={final.luminosity:.4g} Lsun, R={final.radius:.4g} Rsun, "
        f"Xc={final.central_hydrogen:.4g}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
