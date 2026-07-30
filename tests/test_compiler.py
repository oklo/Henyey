from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
IBFTC = ROOT / "bin" / "ibftc"
IBSYS = ROOT / "bin" / "ibsys"


def run(*command: object, input_text: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(part) for part in command],
        cwd=ROOT,
        input=input_text,
        text=True,
        capture_output=True,
        env={**os.environ, "F4_BOUNDS_CHECK": "1"},
    )


class CompilerIntegrationTest(unittest.TestCase):
    def test_henyey_tridiagonal_kernel(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "henyey"
            compiled = run(IBFTC, "-o", executable, ROOT / "examples" / "henyey.f")
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            executed = run(executable)
            self.assertEqual(executed.returncode, 0, executed.stderr)
            numbers = [float(item) for item in executed.stdout.split()]
            self.assertEqual(len(numbers), 5)
            for actual, expected in zip(numbers, (1, 2, 3, 4, 5)):
                self.assertAlmostEqual(actual, expected, places=5)

    def test_ibsys_card_deck(self) -> None:
        executed = run(IBSYS, ROOT / "examples" / "cards.job")
        self.assertEqual(executed.returncode, 0, executed.stderr)
        self.assertIn("IBSYS 7090/7094", executed.stdout)
        numbers = [
            float(item)
            for item in executed.stdout.split()
            if item.replace(".", "", 1).isdigit() and "." in item
        ]
        self.assertIn(25.0, numbers)

    def test_single_precision_is_27_fraction_bits(self) -> None:
        source = """\
      PROGRAM PREC
      REAL X
      X=1.0+2.0**(-28)
      WRITE(6,100) X
  100 FORMAT(F20.10)
      END
"""
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "prec.f"
            executable = Path(directory) / "prec"
            source_path.write_text(source, encoding="ascii")
            compiled = run(IBFTC, "-o", executable, source_path)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            executed = run(executable)
            self.assertEqual(executed.returncode, 0, executed.stderr)
            self.assertEqual(float(executed.stdout.strip()), 1.0)
            native = Path(directory) / "prec-native"
            compiled = run(
                IBFTC, "--arithmetic", "native", "-o", native, source_path
            )
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            native_run = run(native)
            self.assertGreater(float(native_run.stdout.strip()), 1.0)

    def test_common_statement_and_external_functions(self) -> None:
        source = """\
      PROGRAM LINKS
      REAL A(3),SCALE,CUBE,F
      INTEGER I
      COMMON/MODEL/A,SCALE
      DATA A/1.0,2.0,3.0/
      DATA SCALE/2.0/
      F(X)=X*SCALE
      CALL BUMP
      WRITE(6,100) (F(CUBE(A(I))),I=1,3)
  100 FORMAT(1H ,3F10.2)
      END
      SUBROUTINE BUMP
      REAL A(3),SCALE
      INTEGER I
      COMMON/MODEL/A,SCALE
      DO 10 I=1,3
      A(I)=A(I)+1.0
   10 CONTINUE
      RETURN
      END
      REAL FUNCTION CUBE(X)
      REAL X
      CUBE=X**3
      RETURN
      END
"""
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "links.f"
            executable = Path(directory) / "links"
            source_path.write_text(source, encoding="ascii")
            compiled = run(IBFTC, "-o", executable, source_path)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            executed = run(executable)
            self.assertEqual(executed.returncode, 0, executed.stderr)
            numbers = [float(item) for item in executed.stdout.split()]
            self.assertEqual(numbers, [16.0, 54.0, 128.0])

    def test_rejects_free_form_source(self) -> None:
        source = "program nope\nend\n"
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "free.f"
            source_path.write_text(source, encoding="ascii")
            checked = run(IBFTC, "--check", source_path)
            self.assertNotEqual(checked.returncode, 0)
            self.assertIn("columns 1-5", checked.stderr)

    def test_integer_literal_before_dotted_logical_operator(self) -> None:
        source = """\
      PROGRAM DOTOP
      INTEGER I,J
      I=4
      J=0
      IF (I.GT.3 .AND. I.LE.5) J=1
      WRITE(6,100) J
  100 FORMAT(I2)
      END
"""
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "dotop.f"
            executable = Path(directory) / "dotop"
            source_path.write_text(source, encoding="ascii")
            compiled = run(IBFTC, "-o", executable, source_path)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            executed = run(executable)
            self.assertEqual(executed.returncode, 0, executed.stderr)
            self.assertEqual(int(executed.stdout.strip()), 1)

    def test_scale_factor_preserves_exponential_value(self) -> None:
        source = """\
      PROGRAM SCALE
      REAL X
      X=1.25
      WRITE(6,100) X,X,X
      WRITE(6,101) 0.0
  100 FORMAT(1PE11.4,1X,0PE11.4,1X,1PF8.2)
  101 FORMAT(0PE11.4)
      END
"""
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "scale.f"
            executable = Path(directory) / "scale"
            source_path.write_text(source, encoding="ascii")
            compiled = run(IBFTC, "-o", executable, source_path)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            executed = run(executable)
            self.assertEqual(executed.returncode, 0, executed.stderr)
            self.assertEqual(
                executed.stdout.splitlines(),
                [" 1.2500E+00  0.1250E+01    12.50", " 0.0000E+00"],
            )

    def test_specific_minmax_intrinsic_result_types(self) -> None:
        source = """\
      PROGRAM MINMAX
      INTEGER I,J
      REAL X,Y
      I=MAX1(2.9,3.1)
      J=MIN1(2.9,3.1)
      X=AMAX0(2,3)
      Y=AMIN0(2,3)
      WRITE(6,100) I,J,X,Y
  100 FORMAT(2I3,2F6.1)
      END
"""
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "minmax.f"
            executable = Path(directory) / "minmax"
            source_path.write_text(source, encoding="ascii")
            compiled = run(IBFTC, "-o", executable, source_path)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            executed = run(executable)
            self.assertEqual(executed.returncode, 0, executed.stderr)
            values = executed.stdout.split()
            self.assertEqual(values, ["3", "2", "3.0", "2.0"])


if __name__ == "__main__":
    unittest.main()
