#!/usr/bin/env python3
"""IBSYS/IBJOB-style batch deck driver for ibftc."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


class DeckError(Exception):
    pass


def parse_deck(path: Path) -> tuple[str, list[str], str]:
    try:
        lines = path.read_text(encoding="ascii").splitlines()
    except UnicodeDecodeError as exc:
        raise DeckError("job deck is not ASCII") from exc
    job_name = path.stem.upper()
    source: list[str] = []
    data: list[str] = []
    state = "CONTROL"
    saw_ibjob = False
    saw_compiler = False
    for number, line in enumerate(lines, 1):
        card = line[:80]
        if card.startswith("$"):
            fields = card.split()
            control = fields[0].upper()
            if control == "$JOB":
                if len(card) > 15 and card[15:].strip():
                    job_name = card[15:].strip()
                elif len(fields) > 1:
                    job_name = " ".join(fields[1:])
                state = "CONTROL"
            elif control == "$EXECUTE":
                if len(fields) > 1 and fields[1].upper() != "IBJOB":
                    raise DeckError(
                        f"{path}:{number}: only $EXECUTE IBJOB is supported"
                    )
            elif control == "$IBJOB":
                saw_ibjob = True
                state = "CONTROL"
            elif control == "$IBFTC":
                if not saw_ibjob:
                    raise DeckError(
                        f"{path}:{number}: $IBFTC must follow $IBJOB"
                    )
                saw_compiler = True
                state = "SOURCE"
            elif control == "$DATA":
                state = "DATA"
            elif control in ("$IBSYS", "$STOP", "$ENDJOB"):
                state = "DONE"
            elif control in ("$*", "$IBREL", "$ENTRY"):
                state = "CONTROL"
            else:
                raise DeckError(f"{path}:{number}: unsupported control card {control}")
            continue
        if state == "SOURCE":
            source.append(line)
        elif state == "DATA":
            data.append(line)
        elif state == "DONE" and card.strip():
            raise DeckError(f"{path}:{number}: cards follow end of job")
    if not saw_compiler:
        raise DeckError("job contains no $IBFTC source deck")
    return job_name, source, "\n".join(data) + ("\n" if data else "")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ibsys", description="run an IBSYS-style FORTRAN IV batch deck"
    )
    parser.add_argument("deck", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--keep", action="store_true", help="retain extracted source")
    parser.add_argument(
        "--arithmetic", choices=("ibm7094", "native"), default="ibm7094"
    )
    args = parser.parse_args(argv)
    try:
        job_name, source, data = parse_deck(args.deck)
    except (OSError, DeckError) as exc:
        print(f"IBSYS ERROR: {exc}", file=sys.stderr)
        return 1

    root = Path(__file__).resolve().parent.parent
    bindir = Path(os.environ.get("IBFTC_BINDIR", str(root / "bin")))
    ibftc = bindir / "ibftc"
    if not ibftc.exists():
        installed = shutil.which("ibftc")
        if installed is None:
            print("IBSYS ERROR: ibftc is not installed on PATH", file=sys.stderr)
            return 1
        ibftc = Path(installed)
    print("IBSYS 7090/7094 FORTRAN IV COMPATIBILITY MONITOR", flush=True)
    print(f"JOB: {job_name}", flush=True)
    with tempfile.TemporaryDirectory(prefix="ibsys_") as directory:
        work = Path(directory)
        source_path = work / "sysin.f"
        executable = args.output.resolve() if args.output else work / "sysload"
        source_path.write_text("\n".join(source) + "\n", encoding="ascii")
        result = subprocess.run(
            [
                str(ibftc),
                "--arithmetic",
                args.arithmetic,
                "-o",
                str(executable),
                str(source_path),
            ]
        )
        if result.returncode:
            return result.returncode
        if args.keep:
            kept = args.deck.with_suffix(".extracted.f")
            kept.write_text("\n".join(source) + "\n", encoding="ascii")
            print(f"IBSYS: SOURCE DECK RETAINED AS {kept}", flush=True)
        print("IBJOB: EXECUTION BEGINS", flush=True)
        run = subprocess.run(
            [str(executable)],
            input=data,
            text=True,
            env=os.environ.copy(),
        )
        print(f"IBJOB: EXECUTION ENDS, STATUS {run.returncode}", flush=True)
        return run.returncode


if __name__ == "__main__":
    raise SystemExit(main())
