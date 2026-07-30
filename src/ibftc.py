#!/usr/bin/env python3
"""A small IBM 7090/7094 FORTRAN IV source-to-native compiler.

The front end intentionally accepts card-image fixed form rather than modern
Fortran.  It emits C99 which is linked with the 7094 compatibility runtime.
"""

from __future__ import annotations

import argparse
import dataclasses
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable, Optional


class CompileError(Exception):
    def __init__(self, message: str, source: str = "", line: int = 0):
        self.message = message
        self.source = source
        self.line = line
        where = f"{source}:{line}: " if source and line else ""
        super().__init__(where + message)


@dataclasses.dataclass
class Statement:
    label: Optional[int]
    text: str
    source: str
    line: int

    def fail(self, message: str) -> CompileError:
        return CompileError(message, self.source, self.line)


@dataclasses.dataclass
class Expr:
    kind: str
    value: object = None
    args: list["Expr"] = dataclasses.field(default_factory=list)


INTEGER = "INTEGER"
REAL = "REAL"
DOUBLE = "DOUBLE"
LOGICAL = "LOGICAL"


@dataclasses.dataclass
class Symbol:
    name: str
    type: str
    dims: list[Expr] = dataclasses.field(default_factory=list)
    argument: bool = False
    external: bool = False
    common: Optional[tuple[str, int]] = None


@dataclasses.dataclass
class DataInit:
    names: list[str]
    values: list[str]
    statement: Statement


@dataclasses.dataclass
class DoInfo:
    ident: int
    terminal: int
    variable: str
    start: Expr
    end: Expr
    step: Expr
    statement: Statement


@dataclasses.dataclass
class Unit:
    kind: str
    name: str
    args: list[str]
    statements: list[Statement]
    result_type: Optional[str] = None
    symbols: dict[str, Symbol] = dataclasses.field(default_factory=dict)
    formats: dict[int, str] = dataclasses.field(default_factory=dict)
    data: list[DataInit] = dataclasses.field(default_factory=list)
    common_groups: list[tuple[str, list[str], Statement]] = dataclasses.field(
        default_factory=list
    )
    executable: list[Statement] = dataclasses.field(default_factory=list)
    dos: dict[int, DoInfo] = dataclasses.field(default_factory=dict)
    do_terminals: dict[int, list[DoInfo]] = dataclasses.field(default_factory=dict)
    implicit_ranges: list[tuple[str, str, str]] = dataclasses.field(
        default_factory=list
    )
    statement_functions: dict[str, tuple[list[str], Expr, Statement]] = (
        dataclasses.field(default_factory=dict)
    )

    def implicit_type(self, name: str) -> str:
        initial = name[0].upper()
        for lo, hi, typ in reversed(self.implicit_ranges):
            if lo <= initial <= hi:
                return typ
        return INTEGER if name[0].upper() in "IJKLMN" else REAL

    def symbol(self, name: str) -> Symbol:
        name = name.upper()
        if name == self.name and self.kind == "FUNCTION":
            return Symbol(name, self.result_type or self.implicit_type(name))
        if name not in self.symbols:
            self.symbols[name] = Symbol(name, self.implicit_type(name))
        return self.symbols[name]


TYPE_WORDS = {
    "INTEGER": INTEGER,
    "REAL": REAL,
    "DOUBLEPRECISION": DOUBLE,
    "LOGICAL": LOGICAL,
}

SPEC_PREFIXES = (
    "INTEGER",
    "REAL",
    "DOUBLEPRECISION",
    "LOGICAL",
    "DIMENSION",
    "COMMON",
    "EXTERNAL",
    "DATA",
    "IMPLICIT",
    "EQUIVALENCE",
)


def compact(text: str) -> str:
    """Remove blanks outside quoted strings."""
    out: list[str] = []
    quote = False
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "'":
            out.append(ch)
            if quote and i + 1 < len(text) and text[i + 1] == "'":
                out.append("'")
                i += 2
                continue
            quote = not quote
        elif not ch.isspace() or quote:
            out.append(ch)
        i += 1
    return "".join(out)


def split_top(text: str, delimiter: str = ",") -> list[str]:
    result: list[str] = []
    level = 0
    quote = False
    start = 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "'":
            if quote and i + 1 < len(text) and text[i + 1] == "'":
                i += 2
                continue
            quote = not quote
        elif not quote:
            if ch == "(":
                level += 1
            elif ch == ")":
                level -= 1
            elif ch == delimiter and level == 0:
                result.append(text[start:i])
                start = i + 1
        i += 1
    result.append(text[start:])
    return [part.strip() for part in result if part.strip()]


def fixed_form(path: Path) -> list[Statement]:
    statements: list[Statement] = []
    pending: Optional[Statement] = None
    try:
        lines = path.read_text(encoding="ascii").splitlines()
    except UnicodeDecodeError as exc:
        raise CompileError("card deck is not ASCII", str(path), exc.start) from exc

    for number, raw in enumerate(lines, 1):
        if "\t" in raw[:72]:
            raise CompileError("tabs are not valid card columns", str(path), number)
        card = raw[:80].ljust(80)
        if card[0] in ("C", "c", "*") or not card[:72].strip():
            continue
        label_field = card[:5]
        continuation = card[5]
        body = card[6:72].rstrip()
        sequence = card[72:80]
        if sequence and not all(32 <= ord(ch) < 127 for ch in sequence):
            raise CompileError("non-ASCII card sequence field", str(path), number)
        if label_field.strip() and not label_field.strip().isdigit():
            raise CompileError(
                "columns 1-5 must be a numeric statement label", str(path), number
            )
        if continuation not in (" ", "0"):
            if pending is None:
                raise CompileError(
                    "continuation card has no initial card", str(path), number
                )
            pending.text += body
            continue
        if pending is not None:
            statements.append(pending)
        label = int(label_field) if label_field.strip() else None
        pending = Statement(label, body, str(path), number)
    if pending is not None:
        statements.append(pending)
    return statements


HEADER_RE = re.compile(
    r"^(?:(INTEGER|REAL|DOUBLEPRECISION|LOGICAL))?"
    r"FUNCTION([A-Z][A-Z0-9]*)\(([^)]*)\)$"
)


def split_units(statements: list[Statement]) -> list[Unit]:
    units: list[Unit] = []
    current: list[Statement] = []
    kind = "PROGRAM"
    name = "MAIN"
    args: list[str] = []
    result_type: Optional[str] = None

    def finish() -> None:
        nonlocal current, kind, name, args, result_type
        if current:
            units.append(Unit(kind, name, args, current, result_type))
        current = []
        kind, name, args, result_type = "PROGRAM", "MAIN", [], None

    for stmt in statements:
        text = compact(stmt.text).upper()
        if not current:
            program = re.match(r"^PROGRAM([A-Z][A-Z0-9]*)$", text)
            subroutine = re.match(
                r"^SUBROUTINE([A-Z][A-Z0-9]*)(?:\(([^)]*)\))?$", text
            )
            function = HEADER_RE.match(text)
            block = re.match(r"^BLOCKDATA([A-Z][A-Z0-9]*)?$", text)
            if program:
                name = program.group(1)
                continue
            if subroutine:
                kind, name = "SUBROUTINE", subroutine.group(1)
                args = (
                    [x for x in subroutine.group(2).split(",") if x]
                    if subroutine.group(2)
                    else []
                )
                continue
            if function:
                kind, name = "FUNCTION", function.group(2)
                args = [x for x in function.group(3).split(",") if x]
                result_type = (
                    TYPE_WORDS.get(function.group(1))
                    if function.group(1)
                    else (INTEGER if name[0] in "IJKLMN" else REAL)
                )
                continue
            if block:
                kind, name = "BLOCKDATA", block.group(1) or "BLOCK"
                continue
        current.append(stmt)
        if text == "END":
            finish()
    if current:
        last = current[-1]
        raise last.fail("program unit has no END card")
    if not units:
        raise CompileError("source deck contains no program units")
    return units


@dataclasses.dataclass
class Token:
    kind: str
    value: str
    pos: int


class Lexer:
    DOT_OPS = {
        ".LT.",
        ".LE.",
        ".EQ.",
        ".NE.",
        ".GT.",
        ".GE.",
        ".AND.",
        ".OR.",
        ".NOT.",
        ".EQV.",
        ".NEQV.",
        ".TRUE.",
        ".FALSE.",
    }

    def __init__(self, text: str):
        self.text = text
        self.tokens: list[Token] = []
        self._scan()

    def _scan(self) -> None:
        text = self.text
        i = 0
        while i < len(text):
            ch = text[i]
            if ch.isspace():
                i += 1
                continue
            if ch == "'":
                start = i
                i += 1
                value = ""
                while i < len(text):
                    if text[i] == "'":
                        if i + 1 < len(text) and text[i + 1] == "'":
                            value += "'"
                            i += 2
                            continue
                        i += 1
                        break
                    value += text[i]
                    i += 1
                else:
                    raise CompileError("unterminated character constant")
                self.tokens.append(Token("STRING", value, start))
                continue
            upper = text[i:].upper()
            dot = next((op for op in self.DOT_OPS if upper.startswith(op)), None)
            if dot:
                self.tokens.append(Token("OP", dot, i))
                i += len(dot)
                continue
            if text.startswith("**", i):
                self.tokens.append(Token("OP", "**", i))
                i += 2
                continue
            if ch in "+-*/(),=":
                kind = "OP" if ch in "+-*/=" else ch
                self.tokens.append(Token(kind, ch, i))
                i += 1
                continue
            number = re.match(
                r"(?:\d+\.\d*|\.\d+|\d+)(?:[EDed][+-]?\d+)?", text[i:]
            )
            if number:
                value = number.group(0)
                end = i + len(value)
                # With insignificant blanks, "3 .AND." becomes "3.AND.".
                # Do not consume the relational operator's leading dot as
                # the optional decimal point of an integer-valued literal.
                if (
                    value.endswith(".")
                    and end < len(text)
                    and text[end].isalpha()
                ):
                    value = value[:-1]
                    end -= 1
                hollerith = re.match(r"^(\d+)$", value)
                if hollerith and end < len(text) and text[end] in "Hh":
                    count = int(value)
                    payload = text[end + 1 : end + 1 + count]
                    if len(payload) != count:
                        raise CompileError("short Hollerith constant")
                    self.tokens.append(Token("STRING", payload, i))
                    i = end + 1 + count
                else:
                    self.tokens.append(Token("NUMBER", value.upper(), i))
                    i = end
                continue
            name_match = re.match(r"[A-Za-z][A-Za-z0-9]*", text[i:])
            if name_match:
                value = name_match.group(0).upper()
                self.tokens.append(Token("NAME", value, i))
                i += len(name_match.group(0))
                continue
            raise CompileError(f"unexpected character {ch!r} in expression")
        self.tokens.append(Token("EOF", "", len(text)))


class ExprParser:
    BINDING = {
        ".EQV.": (1, 2),
        ".NEQV.": (1, 2),
        ".OR.": (2, 3),
        ".AND.": (3, 4),
        ".LT.": (4, 5),
        ".LE.": (4, 5),
        ".EQ.": (4, 5),
        ".NE.": (4, 5),
        ".GT.": (4, 5),
        ".GE.": (4, 5),
        "+": (5, 6),
        "-": (5, 6),
        "*": (6, 7),
        "/": (6, 7),
        "**": (9, 8),
    }

    def __init__(self, text: str):
        self.tokens = Lexer(text).tokens
        self.index = 0

    def peek(self) -> Token:
        return self.tokens[self.index]

    def take(self) -> Token:
        token = self.peek()
        self.index += 1
        return token

    def accept(self, value: str) -> bool:
        if self.peek().value == value:
            self.take()
            return True
        return False

    def parse(self) -> Expr:
        expr = self.expression(0)
        if self.peek().kind != "EOF":
            raise CompileError(f"unexpected token {self.peek().value!r}")
        return expr

    def expression(self, min_binding: int) -> Expr:
        token = self.take()
        if token.kind == "NUMBER":
            left = Expr("number", token.value)
        elif token.kind == "STRING":
            left = Expr("string", token.value)
        elif token.value in (".TRUE.", ".FALSE."):
            left = Expr("logical", token.value == ".TRUE.")
        elif token.kind == "NAME":
            if self.accept("("):
                args: list[Expr] = []
                if not self.accept(")"):
                    while True:
                        args.append(self.expression(0))
                        if self.accept(")"):
                            break
                        if not self.accept(","):
                            raise CompileError("expected ',' or ')' in argument list")
                left = Expr("call", token.value, args)
            else:
                left = Expr("name", token.value)
        elif token.value == "(":
            left = self.expression(0)
            if not self.accept(")"):
                raise CompileError("missing ')' in expression")
        elif token.value in ("+", "-", ".NOT."):
            left = Expr("unary", token.value, [self.expression(7)])
        else:
            raise CompileError(f"expected expression, found {token.value!r}")

        while True:
            op = self.peek().value
            if op not in self.BINDING:
                break
            left_binding, right_binding = self.BINDING[op]
            if left_binding < min_binding:
                break
            self.take()
            right = self.expression(right_binding)
            left = Expr("binary", op, [left, right])
        return left


def parse_expr(text: str, stmt: Optional[Statement] = None) -> Expr:
    try:
        return ExprParser(text).parse()
    except CompileError as exc:
        if stmt is not None and not exc.source:
            raise stmt.fail(exc.message) from exc
        raise


def parse_name_dims(item: str, stmt: Statement) -> tuple[str, list[Expr]]:
    match = re.match(r"^([A-Z][A-Z0-9]*)(?:\((.*)\))?$", compact(item).upper())
    if not match:
        raise stmt.fail(f"invalid declarator {item!r}")
    dims = (
        [parse_expr(part, stmt) for part in split_top(match.group(2))]
        if match.group(2)
        else []
    )
    return match.group(1), dims


def parse_slash_groups(text: str, stmt: Statement) -> list[tuple[list[str], list[str]]]:
    groups: list[tuple[list[str], list[str]]] = []
    pos = 0
    while pos < len(text):
        first = text.find("/", pos)
        if first < 0:
            break
        second = text.find("/", first + 1)
        if second < 0:
            raise stmt.fail("unterminated DATA value group")
        names_text = text[pos:first].lstrip(",")
        groups.append(
            (split_top(names_text), split_top(text[first + 1 : second]))
        )
        pos = second + 1
    if not groups:
        raise stmt.fail("invalid DATA statement")
    return groups


def analyze_unit(unit: Unit) -> None:
    for arg in unit.args:
        sym = unit.symbol(arg)
        sym.argument = True

    executable_started = False
    for stmt in unit.statements:
        text = compact(stmt.text)
        upper = text.upper()
        if upper == "END":
            unit.executable.append(stmt)
            continue
        if upper.startswith("FORMAT("):
            if stmt.label is None:
                raise stmt.fail("FORMAT statement requires a label")
            format_match = re.match(r"^\s*FORMAT\s*(\(.*)$", stmt.text, re.I)
            if not format_match:
                raise stmt.fail("invalid FORMAT statement")
            unit.formats[stmt.label] = format_match.group(1).rstrip()
            continue

        decl_match = re.match(
            r"^(DOUBLEPRECISION|INTEGER|REAL|LOGICAL)(.*)$", upper
        )
        if not executable_started and decl_match:
            typ = TYPE_WORDS[decl_match.group(1)]
            for item in split_top(decl_match.group(2).lstrip(",")):
                name, dims = parse_name_dims(item, stmt)
                sym = unit.symbol(name)
                sym.type, sym.dims = typ, dims
            continue

        if not executable_started and upper.startswith("DIMENSION"):
            for item in split_top(text[len("DIMENSION") :]):
                name, dims = parse_name_dims(item, stmt)
                unit.symbol(name).dims = dims
            continue

        if not executable_started and upper.startswith("EXTERNAL"):
            for name in split_top(upper[len("EXTERNAL") :]):
                unit.symbol(name).external = True
            continue

        if not executable_started and upper.startswith("COMMON"):
            rest = text[len("COMMON") :]
            current_block = "BLANK"
            current_names: list[str] = []
            i = 0
            for item in split_top(rest):
                while item.startswith("/"):
                    end = item.find("/", 1)
                    if end < 0:
                        raise stmt.fail("invalid COMMON block name")
                    if current_names:
                        unit.common_groups.append(
                            (current_block, current_names, stmt)
                        )
                    current_block = item[1:end].upper() or "BLANK"
                    current_names = []
                    item = item[end + 1 :]
                if item:
                    name, dims = parse_name_dims(item, stmt)
                    sym = unit.symbol(name)
                    if dims:
                        sym.dims = dims
                    current_names.append(name)
                i += 1
            if current_names:
                unit.common_groups.append((current_block, current_names, stmt))
            continue

        if not executable_started and upper.startswith("DATA"):
            for names, values in parse_slash_groups(text[len("DATA") :], stmt):
                unit.data.append(
                    DataInit([compact(x).upper() for x in names], values, stmt)
                )
            continue

        if not executable_started and upper.startswith("IMPLICIT"):
            # The default I-N convention is implemented. Explicit maps are parsed
            # conservatively because they alter undeclared symbols only.
            rest = upper[len("IMPLICIT") :]
            if rest == "NONE":
                raise stmt.fail("IMPLICIT NONE did not exist in 1964 FORTRAN IV")
            for spec in split_top(rest):
                match = re.match(
                    r"(DOUBLEPRECISION|INTEGER|REAL|LOGICAL)\((.*)\)", spec
                )
                if not match:
                    raise stmt.fail("invalid IMPLICIT specification")
                typ = TYPE_WORDS[match.group(1)]
                for letter_range in split_top(match.group(2)):
                    ends = letter_range.split("-")
                    lo, hi = ends[0], ends[-1]
                    unit.implicit_ranges.append((lo, hi, typ))
                    for sym in unit.symbols.values():
                        if lo <= sym.name[0] <= hi:
                            sym.type = typ
            continue

        if not executable_started and upper.startswith("EQUIVALENCE"):
            raise stmt.fail("EQUIVALENCE is not implemented; use COMMON arrays")

        statement_function = re.match(
            r"^([A-Z][A-Z0-9]*)\(([^()]*)\)=(.+)$", upper
        )
        if not executable_started and statement_function:
            function_name = statement_function.group(1)
            dummy_names = [
                name for name in statement_function.group(2).split(",") if name
            ]
            declared = unit.symbols.get(function_name)
            if declared is None or not declared.dims:
                if not dummy_names or not all(
                    re.fullmatch(r"[A-Z][A-Z0-9]*", name)
                    for name in dummy_names
                ):
                    raise stmt.fail("invalid statement function arguments")
                unit.statement_functions[function_name] = (
                    dummy_names,
                    parse_expr(statement_function.group(3), stmt),
                    stmt,
                )
                unit.symbol(function_name)
                continue

        executable_started = True
        unit.executable.append(stmt)

    for index, stmt in enumerate(unit.executable):
        text = compact(stmt.text).upper()
        match = re.match(
            r"^DO(\d+)([A-Z][A-Z0-9]*)=(.+)$", text
        )
        if not match:
            continue
        parts = split_top(match.group(3))
        if len(parts) not in (2, 3):
            raise stmt.fail("DO requires initial, limit, and optional increment")
        variable = match.group(2)
        unit.symbol(variable)
        info = DoInfo(
            len(unit.dos) + 1,
            int(match.group(1)),
            variable,
            parse_expr(parts[0], stmt),
            parse_expr(parts[1], stmt),
            parse_expr(parts[2], stmt) if len(parts) == 3 else Expr("number", "1"),
            stmt,
        )
        unit.dos[index] = info
        unit.do_terminals.setdefault(info.terminal, []).insert(0, info)
    labels = {stmt.label for stmt in unit.executable if stmt.label is not None}
    for info in unit.dos.values():
        if info.terminal not in labels:
            raise info.statement.fail(f"undefined DO terminal label {info.terminal}")


def expanded_data_values(values: list[str], stmt: Statement) -> list[str]:
    result: list[str] = []
    for value in values:
        match = re.match(r"^(\d+)\*(.+)$", value.strip())
        if match:
            result.extend([match.group(2)] * int(match.group(1)))
        else:
            result.append(value)
    return result


def c_identifier(name: str) -> str:
    return re.sub(r"[^a-z0-9_]", "_", name.lower())


def c_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


class Generator:
    INTRINSICS = {
        "ABS",
        "IABS",
        "DABS",
        "SQRT",
        "DSQRT",
        "EXP",
        "DEXP",
        "ALOG",
        "DLOG",
        "ALOG10",
        "DLOG10",
        "SIN",
        "DSIN",
        "COS",
        "DCOS",
        "TAN",
        "ASIN",
        "ACOS",
        "ATAN",
        "ATAN2",
        "SINH",
        "COSH",
        "TANH",
        "MOD",
        "AMOD",
        "DMOD",
        "MAX0",
        "MAX1",
        "AMAX0",
        "AMAX1",
        "DMAX1",
        "MIN0",
        "MIN1",
        "AMIN0",
        "AMIN1",
        "DMIN1",
        "FLOAT",
        "SNGL",
        "DBLE",
        "IFIX",
        "IDINT",
        "INT",
        "SIGN",
        "ISIGN",
        "DSIGN",
        "DIM",
        "IDIM",
        "DDIM",
    }

    def __init__(self, units: list[Unit], arithmetic: str):
        self.units = units
        self.unit_map = {unit.name: unit for unit in units}
        self.arithmetic = arithmetic
        self.lines: list[str] = []
        self.unit: Unit
        self.temp = 0
        self.common_slots: dict[str, list[Symbol]] = {}

    def emit(self, line: str = "") -> None:
        self.lines.append(line)

    def prepare_common(self) -> None:
        for unit in self.units:
            for block, names, stmt in unit.common_groups:
                slots = self.common_slots.setdefault(block, [])
                if slots and len(slots) != len(names):
                    raise stmt.fail(
                        f"COMMON /{block}/ has {len(names)} items; "
                        f"previous declaration has {len(slots)}"
                    )
                if not slots:
                    for name in names:
                        sym = unit.symbol(name)
                        slots.append(Symbol(name, sym.type, sym.dims))
                for index, name in enumerate(names):
                    sym = unit.symbol(name)
                    expected = slots[index]
                    if sym.type != expected.type or len(sym.dims) != len(expected.dims):
                        raise stmt.fail(
                            f"inconsistent type or rank in COMMON /{block}/ "
                            f"position {index + 1}"
                        )
                    sym.common = (block, index)

    def c_type(self, typ: str) -> str:
        return {
            INTEGER: "F4Integer",
            REAL: "F4Real",
            DOUBLE: "F4Double",
            LOGICAL: "F4Logical",
        }[typ]

    def dimension_c(self, expr: Expr) -> str:
        return self.expression(expr, INTEGER)

    def array_count(self, sym: Symbol) -> str:
        return " * ".join(f"({self.dimension_c(dim)})" for dim in sym.dims)

    def common_name(self, block: str, index: int) -> str:
        return f"f4c_{c_identifier(block)}_{index}"

    def symbol_ref(self, sym: Symbol) -> str:
        if sym.name == self.unit.name and self.unit.kind == "FUNCTION":
            return "_f4_result"
        if sym.common:
            return self.common_name(*sym.common)
        name = "v_" + c_identifier(sym.name)
        if sym.argument and not sym.dims:
            return f"(*{name})"
        return name

    def array_ref(self, sym: Symbol, subscripts: list[Expr]) -> str:
        if len(subscripts) != len(sym.dims):
            raise CompileError(
                f"{sym.name} has rank {len(sym.dims)}, "
                f"but {len(subscripts)} subscripts were supplied"
            )
        terms: list[str] = []
        stride = "1"
        for subscript, dim in zip(subscripts, sym.dims):
            sub = self.expression(subscript, INTEGER)
            extent = self.dimension_c(dim)
            terms.append(f"f4_subscript({sub}, {extent}) * ({stride})")
            stride = f"({stride}) * ({extent})"
        return f"{self.symbol_ref(sym)}[{' + '.join(terms)}]"

    def expr_type(self, expr: Expr) -> str:
        if expr.kind == "number":
            value = str(expr.value)
            if "D" in value:
                return DOUBLE
            return REAL if "." in value or "E" in value else INTEGER
        if expr.kind == "logical":
            return LOGICAL
        if expr.kind == "string":
            return "STRING"
        if expr.kind == "name":
            return self.unit.symbol(str(expr.value)).type
        if expr.kind == "call":
            name = str(expr.value)
            sym = self.unit.symbols.get(name)
            if sym and sym.dims:
                return sym.type
            if name in self.unit.statement_functions:
                return self.unit.symbol(name).type
            if name in (
                "IABS",
                "MAX0",
                "MAX1",
                "MIN0",
                "MIN1",
                "IFIX",
                "IDINT",
                "INT",
                "ISIGN",
                "IDIM",
            ):
                return INTEGER
            if name.startswith("D") or name == "DBLE":
                return DOUBLE
            if name in self.INTRINSICS:
                return REAL
            if name in self.unit_map and self.unit_map[name].kind == "FUNCTION":
                return self.unit_map[name].result_type or REAL
            return self.unit.symbol(name).type
        if expr.kind == "unary":
            return LOGICAL if expr.value == ".NOT." else self.expr_type(expr.args[0])
        if expr.kind == "binary":
            if str(expr.value).startswith("."):
                return LOGICAL
            types = (self.expr_type(expr.args[0]), self.expr_type(expr.args[1]))
            if DOUBLE in types:
                return DOUBLE
            if REAL in types:
                return REAL
            return INTEGER
        raise CompileError(f"cannot determine type of {expr.kind}")

    def convert(self, code: str, source: str, target: str) -> str:
        if source == target:
            return code
        if target == DOUBLE:
            return f"f4_dq((double)({code}))"
        if target == REAL:
            return f"f4_q((double)({code}))"
        if target == INTEGER:
            return f"f4_int((double)({code}))"
        if target == LOGICAL:
            return f"(({code}) != 0)"
        return code

    def expression(self, expr: Expr, wanted: Optional[str] = None) -> str:
        typ = self.expr_type(expr)
        if expr.kind == "number":
            value = str(expr.value)
            if typ == INTEGER:
                code = f"INT64_C({int(value)})"
            elif typ == DOUBLE:
                code = f"f4_dq({value.replace('D', 'e')})"
            else:
                code = f"f4_q({value.replace('E', 'e')})"
        elif expr.kind == "logical":
            code = "1" if expr.value else "0"
        elif expr.kind == "string":
            code = c_string(str(expr.value))
        elif expr.kind == "name":
            code = self.symbol_ref(self.unit.symbol(str(expr.value)))
        elif expr.kind == "call":
            code = self.call_expression(expr)
        elif expr.kind == "unary":
            child_type = self.expr_type(expr.args[0])
            child = self.expression(expr.args[0], child_type)
            if expr.value == "+":
                code = child
            elif expr.value == ".NOT.":
                code = f"(!({child}))"
            elif child_type == INTEGER:
                code = f"f4_ineg({child})"
            elif child_type == DOUBLE:
                code = f"f4_dneg({child})"
            else:
                code = f"f4_neg({child})"
        elif expr.kind == "binary":
            code = self.binary_expression(expr, typ)
        else:
            raise CompileError(f"cannot generate expression {expr.kind}")
        return self.convert(code, typ, wanted) if wanted else code

    def binary_expression(self, expr: Expr, typ: str) -> str:
        op = str(expr.value)
        left_type = self.expr_type(expr.args[0])
        right_type = self.expr_type(expr.args[1])
        if op.startswith("."):
            left = self.expression(expr.args[0])
            right = self.expression(expr.args[1])
            c_op = {
                ".LT.": "<",
                ".LE.": "<=",
                ".EQ.": "==",
                ".NE.": "!=",
                ".GT.": ">",
                ".GE.": ">=",
                ".AND.": "&&",
                ".OR.": "||",
                ".EQV.": "==",
                ".NEQV.": "!=",
            }[op]
            return f"({left} {c_op} {right})"
        operand_type = (
            DOUBLE
            if DOUBLE in (left_type, right_type)
            else REAL
            if REAL in (left_type, right_type)
            else INTEGER
        )
        left = self.expression(expr.args[0], operand_type)
        right = self.expression(expr.args[1], operand_type)
        if operand_type == INTEGER:
            fn = {
                "+": "f4_iadd",
                "-": "f4_isub",
                "*": "f4_imul",
                "/": "f4_idiv",
                "**": "f4_ipow",
            }[op]
        else:
            prefix = "f4_d" if operand_type == DOUBLE else "f4_"
            fn = {
                "+": prefix + "add",
                "-": prefix + "sub",
                "*": prefix + "mul",
                "/": prefix + "div",
                "**": prefix + "pow",
            }[op]
        return f"{fn}({left}, {right})"

    def argument_code(self, expr: Expr, expected: Symbol) -> str:
        if expr.kind == "name":
            sym = self.unit.symbol(str(expr.value))
            if expected.dims:
                if not sym.dims:
                    raise CompileError(f"{sym.name} is not an array")
                return self.symbol_ref(sym)
            if sym.dims:
                return self.symbol_ref(sym)
            ref = self.symbol_ref(sym)
            if sym.argument and not sym.dims:
                return "v_" + c_identifier(sym.name)
            return f"&{ref}"
        if expr.kind == "call":
            sym = self.unit.symbols.get(str(expr.value))
            if sym and sym.dims:
                return f"&{self.array_ref(sym, expr.args)}"
        value = self.expression(expr, expected.type)
        return f"&({self.c_type(expected.type)}){{{value}}}"

    def call_expression(self, expr: Expr) -> str:
        name = str(expr.value)
        sym = self.unit.symbols.get(name)
        if sym and sym.dims:
            return self.array_ref(sym, expr.args)
        if name in self.unit.statement_functions:
            dummy_names, body, statement = self.unit.statement_functions[name]
            if len(dummy_names) != len(expr.args):
                raise statement.fail(
                    f"{name} expects {len(dummy_names)} arguments, "
                    f"got {len(expr.args)}"
                )
            replacements = dict(zip(dummy_names, expr.args))
            expanded = self.substitute_expression(body, replacements)
            return self.expression(expanded, self.unit.symbol(name).type)
        if name in self.INTRINSICS:
            args = [self.expression(arg) for arg in expr.args]
            if name in {
                "MAX0",
                "MAX1",
                "AMAX0",
                "AMAX1",
                "DMAX1",
                "MIN0",
                "MIN1",
                "AMIN0",
                "AMIN1",
                "DMIN1",
            }:
                if len(args) < 2:
                    raise CompileError(f"{name} requires at least two arguments")
                code = f"f4_intr_{name.lower()}({args[0]}, {args[1]})"
                for arg in args[2:]:
                    code = f"f4_intr_{name.lower()}({code}, {arg})"
                return code
            return f"f4_intr_{name.lower()}({', '.join(args)})"
        target = self.unit_map.get(name)
        if target is None or target.kind != "FUNCTION":
            raise CompileError(f"unknown function {name}")
        if len(expr.args) != len(target.args):
            raise CompileError(
                f"{name} expects {len(target.args)} arguments, got {len(expr.args)}"
            )
        args = [
            self.argument_code(arg, target.symbol(arg_name))
            for arg, arg_name in zip(expr.args, target.args)
        ]
        return f"f4u_{c_identifier(name)}({', '.join(args)})"

    def substitute_expression(
        self, expr: Expr, replacements: dict[str, Expr]
    ) -> Expr:
        if expr.kind == "name" and str(expr.value) in replacements:
            return replacements[str(expr.value)]
        return Expr(
            expr.kind,
            expr.value,
            [self.substitute_expression(arg, replacements) for arg in expr.args],
        )

    def lvalue(self, text: str, stmt: Statement) -> tuple[str, str]:
        expr = parse_expr(text, stmt)
        if expr.kind == "name":
            sym = self.unit.symbol(str(expr.value))
            if sym.dims:
                raise stmt.fail(f"array {sym.name} requires subscripts")
            return self.symbol_ref(sym), sym.type
        if expr.kind == "call":
            sym = self.unit.symbol(str(expr.value))
            if not sym.dims:
                raise stmt.fail(f"{sym.name} is not a declared array")
            try:
                return self.array_ref(sym, expr.args), sym.type
            except CompileError as exc:
                raise stmt.fail(exc.message) from exc
        raise stmt.fail("left side of assignment is not a variable")

    def assignment(self, text: str, stmt: Statement) -> str:
        level = 0
        split = -1
        for i, ch in enumerate(text):
            if ch == "(":
                level += 1
            elif ch == ")":
                level -= 1
            elif ch == "=" and level == 0:
                split = i
                break
        if split < 0:
            raise stmt.fail("expected assignment")
        target, typ = self.lvalue(text[:split], stmt)
        value = parse_expr(text[split + 1 :], stmt)
        return f"{target} = {self.expression(value, typ)};"

    def simple_statement(self, text: str, stmt: Statement) -> list[str]:
        upper = compact(text).upper()
        if upper == "CONTINUE":
            return [";"]
        if upper.startswith("GOTO"):
            rest = upper[4:]
            match = re.match(r"^(\d+)$", rest)
            if match:
                return [f"goto L{match.group(1)};"]
            computed = re.match(r"^\(([^)]*)\),?(.+)$", rest)
            if computed:
                labels = [x for x in computed.group(1).split(",") if x]
                selector = self.expression(parse_expr(computed.group(2), stmt), INTEGER)
                lines = [f"switch ((int)({selector})) {{"]
                lines.extend(
                    f"case {i}: goto L{label};"
                    for i, label in enumerate(labels, 1)
                )
                lines.append("default: break; }")
                return lines
            raise stmt.fail("invalid GO TO statement")
        if upper.startswith("CALL"):
            match = re.match(r"^CALL([A-Z][A-Z0-9]*)(?:\((.*)\))?$", upper)
            if not match:
                raise stmt.fail("invalid CALL statement")
            name = match.group(1)
            target = self.unit_map.get(name)
            if target is None or target.kind != "SUBROUTINE":
                raise stmt.fail(f"unknown subroutine {name}")
            actual = (
                [parse_expr(x, stmt) for x in split_top(match.group(2))]
                if match.group(2)
                else []
            )
            if len(actual) != len(target.args):
                raise stmt.fail(
                    f"{name} expects {len(target.args)} arguments, got {len(actual)}"
                )
            args = [
                self.argument_code(expr, target.symbol(dummy))
                for expr, dummy in zip(actual, target.args)
            ]
            return [f"f4u_{c_identifier(name)}({', '.join(args)});"]
        if upper.startswith("RETURN"):
            if self.unit.kind == "FUNCTION":
                return ["return _f4_result;"]
            return ["return;"]
        if upper.startswith("STOP"):
            code = upper[4:] or "0"
            if code.isdigit():
                return [f"f4_stop({int(code)});"]
            return ["f4_stop(0);"]
        if upper.startswith("PAUSE"):
            return ["f4_pause();"]
        if upper.startswith(("WRITE", "PRINT", "READ")):
            return self.io_statement(text, stmt)
        if "=" in upper:
            return [self.assignment(text, stmt)]
        raise stmt.fail(f"unsupported executable statement {text.strip()!r}")

    def parse_io(self, text: str, stmt: Statement) -> tuple[str, str, str, list[str]]:
        stripped = text.strip()
        upper = stripped.upper()
        if upper.startswith("PRINT"):
            rest = stripped[5:].lstrip()
            parts = split_top(rest)
            if not parts:
                raise stmt.fail("PRINT requires a format")
            return "WRITE", "6", parts[0], parts[1:]
        kind = "WRITE" if upper.startswith("WRITE") else "READ"
        rest = stripped[len(kind) :].lstrip()
        if not rest.startswith("("):
            if kind == "READ":
                parts = split_top(rest)
                return kind, "5", parts[0], parts[1:]
            raise stmt.fail(f"{kind} requires a control list")
        level = 0
        close = -1
        for i, ch in enumerate(rest):
            if ch == "(":
                level += 1
            elif ch == ")":
                level -= 1
                if level == 0:
                    close = i
                    break
        if close < 0:
            raise stmt.fail(f"unterminated {kind} control list")
        controls = split_top(rest[1:close])
        if not controls:
            raise stmt.fail(f"{kind} has no logical unit")
        unit = controls[0]
        fmt = controls[1] if len(controls) > 1 else "*"
        items = split_top(rest[close + 1 :].lstrip(","))
        return kind, unit, fmt, items

    def format_code(self, fmt: str, stmt: Statement) -> str:
        fmt = fmt.strip()
        if fmt == "*":
            return "NULL"
        if fmt.isdigit():
            number = int(fmt)
            if number not in self.unit.formats:
                raise stmt.fail(f"undefined FORMAT label {number}")
            return c_string(self.unit.formats[number])
        raise stmt.fail("assigned and character FORMATs are not implemented")

    def implied_do(
        self, item: str, stmt: Statement
    ) -> Optional[tuple[list[str], Symbol, Expr, Expr, Expr]]:
        stripped = item.strip()
        if not (stripped.startswith("(") and stripped.endswith(")")):
            return None
        parts = split_top(stripped[1:-1])
        if len(parts) < 2:
            return None
        control_index = next(
            (index for index in range(len(parts) - 1, 0, -1) if "=" in parts[index]),
            -1,
        )
        if control_index < 1:
            return None
        control = parts[control_index]
        equal = control.find("=")
        variable = compact(control[:equal]).upper()
        if not re.fullmatch(r"[A-Z][A-Z0-9]*", variable):
            return None
        bounds = [control[equal + 1 :], *parts[control_index + 1 :]]
        if len(bounds) not in (2, 3):
            raise stmt.fail("implied DO requires initial, limit, and optional step")
        sym = self.unit.symbol(variable)
        if sym.type != INTEGER or sym.dims:
            raise stmt.fail("implied DO variable must be a scalar INTEGER")
        return (
            parts[:control_index],
            sym,
            parse_expr(bounds[0], stmt),
            parse_expr(bounds[1], stmt),
            parse_expr(bounds[2], stmt)
            if len(bounds) == 3
            else Expr("number", "1"),
        )

    def output_value(self, item: str, stmt: Statement) -> str:
        expr = parse_expr(item, stmt)
        typ = self.expr_type(expr)
        maker = {
            INTEGER: "f4_value_integer",
            REAL: "f4_value_real",
            DOUBLE: "f4_value_double",
            LOGICAL: "f4_value_logical",
            "STRING": "f4_value_string",
        }[typ]
        return f"{maker}({self.expression(expr)})"

    def input_ref(self, item: str, stmt: Statement) -> str:
        target, typ = self.lvalue(item, stmt)
        maker = {
            INTEGER: "f4_ref_integer",
            REAL: "f4_ref_real",
            DOUBLE: "f4_ref_double",
            LOGICAL: "f4_ref_logical",
        }[typ]
        return f"{maker}(&{target})"

    def implied_do_lines(
        self,
        implied: tuple[list[str], Symbol, Expr, Expr, Expr],
        stmt: Statement,
        list_name: str,
        writing: bool,
    ) -> list[str]:
        body, sym, start, end, step = implied
        self.temp += 1
        ident = self.temp
        ref = self.symbol_ref(sym)
        add = "f4_value_list_add" if writing else "f4_ref_list_add"
        lines = [
            "{",
            f"  F4Integer _io_end_{ident} = "
            f"{self.expression(end, INTEGER)};",
            f"  F4Integer _io_step_{ident} = "
            f"{self.expression(step, INTEGER)};",
            f"  {ref} = {self.expression(start, INTEGER)};",
            f"  if (_io_step_{ident} == 0) "
            'f4_machine_error("ZERO IMPLIED DO INCREMENT");',
            f"  if ((_io_step_{ident} > 0 && {ref} > _io_end_{ident}) ||",
            f"      (_io_step_{ident} < 0 && {ref} < _io_end_{ident})) "
            f"goto DIO{ident}_DONE;",
            f"DIO{ident}_BODY: ;",
        ]
        for item in body:
            if self.implied_do(item, stmt):
                raise stmt.fail("nested implied DO lists are not implemented")
            value = (
                self.output_value(item, stmt)
                if writing
                else self.input_ref(item, stmt)
            )
            lines.append(f"  {add}(&{list_name}, {value});")
        lines.extend(
            [
                f"  {{ F4Integer _io_next = "
                f"f4_iadd({ref}, _io_step_{ident});",
                f"    if ((_io_step_{ident} > 0 && "
                f"_io_next <= _io_end_{ident}) ||",
                f"        (_io_step_{ident} < 0 && "
                f"_io_next >= _io_end_{ident})) {{",
                f"      {ref} = _io_next;",
                f"      goto DIO{ident}_BODY;",
                "    }",
                "  }",
                f"DIO{ident}_DONE: ;",
                "}",
            ]
        )
        return lines

    def io_statement(self, text: str, stmt: Statement) -> list[str]:
        kind, unit_text, fmt_text, items = self.parse_io(text, stmt)
        unit_code = self.expression(parse_expr(unit_text, stmt), INTEGER)
        format_code = self.format_code(fmt_text, stmt)
        self.temp += 1
        list_name = f"_io_list_{self.temp}"
        if kind == "WRITE":
            lines = ["{", f"  F4ValueList {list_name} = f4_value_list();"]
            for item in items:
                implied = self.implied_do(item, stmt)
                if implied:
                    lines.extend(
                        "  " + line
                        for line in self.implied_do_lines(
                            implied, stmt, list_name, True
                        )
                    )
                else:
                    lines.append(
                        f"  f4_value_list_add(&{list_name}, "
                        f"{self.output_value(item, stmt)});"
                    )
            lines.extend(
                [
                    f"  f4_write((int)({unit_code}), {format_code}, "
                    f"{list_name}.count, {list_name}.items);",
                    f"  f4_value_list_free(&{list_name});",
                    "}",
                ]
            )
            return lines
        lines = ["{", f"  F4RefList {list_name} = f4_ref_list();"]
        for item in items:
            implied = self.implied_do(item, stmt)
            if implied:
                lines.extend(
                    "  " + line
                    for line in self.implied_do_lines(
                        implied, stmt, list_name, False
                    )
                )
            else:
                lines.append(
                    f"  f4_ref_list_add(&{list_name}, "
                    f"{self.input_ref(item, stmt)});"
                )
        lines.extend(
            [
                f"  f4_read((int)({unit_code}), {format_code}, "
                f"{list_name}.count, {list_name}.items);",
                f"  f4_ref_list_free(&{list_name});",
                "}",
            ]
        )
        return lines

    def statement_lines(self, stmt: Statement, index: int) -> list[str]:
        text = compact(stmt.text)
        upper = text.upper()
        if upper == "END":
            return []
        if index in self.unit.dos:
            info = self.unit.dos[index]
            sym = self.unit.symbol(info.variable)
            ref = self.symbol_ref(sym)
            typ = sym.type
            return [
                f"{ref} = {self.expression(info.start, typ)};",
                f"_do_end_{info.ident} = {self.expression(info.end, typ)};",
                f"_do_step_{info.ident} = {self.expression(info.step, typ)};",
                f"D{info.ident}_BODY: ;",
            ]
        if upper.startswith("IF("):
            level = 0
            close = -1
            for i, ch in enumerate(text[2:], 2):
                if ch == "(":
                    level += 1
                elif ch == ")":
                    level -= 1
                    if level == 0:
                        close = i
                        break
            if close < 0:
                raise stmt.fail("unterminated IF expression")
            condition = parse_expr(text[3:close], stmt)
            tail = text[close + 1 :]
            arithmetic = re.match(r"^(\d+),(\d+),(\d+)$", tail)
            if arithmetic:
                value = self.expression(condition)
                return [
                    "{ double _f4_if = (double)(" + value + ");",
                    f"if (_f4_if < 0) goto L{arithmetic.group(1)};",
                    f"if (_f4_if == 0) goto L{arithmetic.group(2)};",
                    f"goto L{arithmetic.group(3)}; }}",
                ]
            body = self.simple_statement(tail, stmt)
            cond = self.expression(condition, LOGICAL)
            condition_code = cond if cond.startswith("(") else f"({cond})"
            return [f"if {condition_code} {{", *["  " + x for x in body], "}"]
        return self.simple_statement(text, stmt)

    def do_epilogue(self, info: DoInfo) -> list[str]:
        sym = self.unit.symbol(info.variable)
        ref = self.symbol_ref(sym)
        if sym.type == INTEGER:
            next_value = f"f4_iadd({ref}, _do_step_{info.ident})"
        elif sym.type == DOUBLE:
            next_value = f"f4_dadd({ref}, _do_step_{info.ident})"
        else:
            next_value = f"f4_add({ref}, _do_step_{info.ident})"
        return [
            "{",
            f"  {self.c_type(sym.type)} _do_next = {next_value};",
            f"  if ((_do_step_{info.ident} >= 0 && "
            f"_do_next <= _do_end_{info.ident}) ||",
            f"      (_do_step_{info.ident} < 0 && "
            f"_do_next >= _do_end_{info.ident})) {{",
            f"    {ref} = _do_next;",
            f"    goto D{info.ident}_BODY;",
            "  }",
            "}",
        ]

    def data_initializers(self) -> list[str]:
        lines: list[str] = []
        for init in self.unit.data:
            values = expanded_data_values(init.values, init.statement)
            targets: list[tuple[str, str]] = []
            for name_text in init.names:
                expr = parse_expr(name_text, init.statement)
                if expr.kind == "name":
                    sym = self.unit.symbol(str(expr.value))
                    if sym.dims:
                        # Whole-array DATA is expanded in storage order.
                        count = 1
                        for dimension in sym.dims:
                            if (
                                dimension.kind != "number"
                                or self.expr_type(dimension) != INTEGER
                            ):
                                raise init.statement.fail(
                                    "DATA initialization of adjustable array"
                                )
                            count *= int(str(dimension.value))
                        targets.extend(
                            (f"{self.symbol_ref(sym)}[{i}]", sym.type)
                            for i in range(count)
                        )
                    else:
                        targets.append((self.symbol_ref(sym), sym.type))
                elif expr.kind == "call":
                    sym = self.unit.symbol(str(expr.value))
                    targets.append((self.array_ref(sym, expr.args), sym.type))
                else:
                    raise init.statement.fail("invalid DATA target")
            if len(targets) != len(values):
                raise init.statement.fail(
                    f"DATA has {len(targets)} targets and {len(values)} values"
                )
            for (target, typ), value in zip(targets, values):
                expr = parse_expr(value, init.statement)
                lines.append(f"{target} = {self.expression(expr, typ)};")
        return lines

    def signature(self, unit: Unit, prototype: bool = False) -> str:
        result = (
            "void"
            if unit.kind in ("PROGRAM", "SUBROUTINE", "BLOCKDATA")
            else self.c_type(unit.result_type or REAL)
        )
        args: list[str] = []
        for name in unit.args:
            sym = unit.symbol(name)
            args.append(
                f"{self.c_type(sym.type)} *"
                + ("" if prototype else "v_" + c_identifier(name))
            )
        if not args:
            args = ["void"]
        return f"static {result} f4u_{c_identifier(unit.name)}({', '.join(args)})"

    def generate_unit(self, unit: Unit) -> None:
        self.unit = unit
        data = self.data_initializers()
        compiled_statements: list[tuple[Statement, list[str], list[str]]] = []
        for index, stmt in enumerate(unit.executable):
            if compact(stmt.text).upper() == "END":
                continue
            try:
                body = self.statement_lines(stmt, index)
            except CompileError as exc:
                if not exc.source:
                    raise stmt.fail(exc.message) from exc
                raise
            epilogue: list[str] = []
            if stmt.label in unit.do_terminals:
                for info in unit.do_terminals[stmt.label]:
                    epilogue.extend(self.do_epilogue(info))
            compiled_statements.append((stmt, body, epilogue))

        self.emit(self.signature(unit) + " {")
        if unit.kind == "FUNCTION":
            self.emit(
                f"  {self.c_type(unit.result_type or REAL)} _f4_result = 0;"
            )
        for sym in unit.symbols.values():
            if sym.argument or sym.common or (
                unit.kind == "FUNCTION" and sym.name == unit.name
            ):
                continue
            ctype = self.c_type(sym.type)
            name = "v_" + c_identifier(sym.name)
            if sym.dims:
                self.emit(f"  static {ctype} {name}[{self.array_count(sym)}];")
            else:
                self.emit(f"  static {ctype} {name};")
        for info in unit.dos.values():
            typ = self.c_type(unit.symbol(info.variable).type)
            self.emit(f"  {typ} _do_end_{info.ident}, _do_step_{info.ident};")
        if data:
            self.emit("  static int _f4_data_done;")
            self.emit("  if (!_f4_data_done) {")
            for line in data:
                self.emit("    " + line)
            self.emit("    _f4_data_done = 1;")
            self.emit("  }")

        for stmt, body, epilogue in compiled_statements:
            if stmt.label is not None:
                self.emit(f"L{stmt.label}: ;")
            for line in body:
                self.emit("  " + line)
            for line in epilogue:
                self.emit("  " + line)
        if unit.kind == "FUNCTION":
            self.emit("  return _f4_result;")
        elif unit.kind in ("PROGRAM", "SUBROUTINE"):
            self.emit("  return;")
        self.emit("}")
        self.emit()

    def generate(self) -> str:
        self.prepare_common()
        self.emit("/* Generated by ibftc.  Do not edit. */")
        self.emit('#include "f4runtime.h"')
        self.emit()
        for block, slots in self.common_slots.items():
            for index, sym in enumerate(slots):
                suffix = f"[{self.array_count_for_common(sym)}]" if sym.dims else ""
                self.emit(
                    f"static {self.c_type(sym.type)} "
                    f"{self.common_name(block, index)}{suffix};"
                )
        if self.common_slots:
            self.emit()
        for unit in self.units:
            self.unit = unit
            self.emit(self.signature(unit, prototype=True) + ";")
        self.emit()
        for unit in self.units:
            self.generate_unit(unit)
        programs = [unit for unit in self.units if unit.kind == "PROGRAM"]
        if len(programs) != 1:
            raise CompileError(
                f"link requires exactly one main program, found {len(programs)}"
            )
        main = programs[0]
        self.emit("int main(int argc, char **argv) {")
        self.emit("  f4_runtime_init(argc, argv);")
        for unit in self.units:
            if unit.kind == "BLOCKDATA":
                self.emit(f"  f4u_{c_identifier(unit.name)}();")
        self.emit(f"  f4u_{c_identifier(main.name)}();")
        self.emit("  f4_runtime_finish();")
        self.emit("  return 0;")
        self.emit("}")
        return "\n".join(self.lines) + "\n"

    def array_count_for_common(self, sym: Symbol) -> str:
        # COMMON dimensions must be constant in FORTRAN IV.
        previous = getattr(self, "unit", None)
        self.unit = self.units[0]
        for dimension in sym.dims:
            if dimension.kind != "number" or self.expr_type(dimension) != INTEGER:
                raise CompileError("COMMON array dimensions must be integer constants")
        value = self.array_count(sym)
        if previous is not None:
            self.unit = previous
        return value


def compiler_command() -> list[str]:
    env_cc = os.environ.get("CC")
    if env_cc:
        return shlex.split(env_cc)
    for candidate in ("cc", "clang", "gcc"):
        path = shutil_which(candidate)
        if path:
            return [path]
    raise CompileError("no host C compiler found (set CC)")


def shutil_which(command: str) -> Optional[str]:
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        candidate = Path(directory) / command
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def compile_sources(
    paths: list[Path],
    output: Path,
    emit_c: Optional[Path],
    keep_c: bool,
    arithmetic: str,
    check_only: bool,
) -> None:
    statements: list[Statement] = []
    for path in paths:
        statements.extend(fixed_form(path))
    units = split_units(statements)
    for unit in units:
        analyze_unit(unit)
    generated = Generator(units, arithmetic).generate()
    if check_only:
        print(f"IBFTC: {len(units)} PROGRAM UNIT(S), NO ERRORS")
        return

    root = Path(__file__).resolve().parent.parent
    runtime = root / "runtime"
    temporary: Optional[tempfile.NamedTemporaryFile] = None
    if emit_c:
        emit_c.write_text(generated, encoding="ascii")
        c_path = emit_c
    else:
        temporary = tempfile.NamedTemporaryFile(
            mode="w", suffix=".c", prefix="ibftc_", delete=False, encoding="ascii"
        )
        temporary.write(generated)
        temporary.close()
        c_path = Path(temporary.name)
    command = [
        *compiler_command(),
        "-std=c99",
        "-O2",
        "-Wall",
        "-Wextra",
        "-Wno-unused-label",
        f"-DF4_DEFAULT_NATIVE={1 if arithmetic == 'native' else 0}",
        "-I",
        str(runtime),
        str(c_path),
        str(runtime / "f4runtime.c"),
        "-lm",
        "-o",
        str(output),
    ]
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        if result.stdout:
            sys.stderr.write(result.stdout)
        if result.stderr:
            sys.stderr.write(result.stderr)
        raise CompileError("host C compilation failed")
    if temporary and not keep_c:
        c_path.unlink(missing_ok=True)
    print(f"IBFTC: {len(units)} PROGRAM UNIT(S), NO ERRORS")
    print(f"IBLDR: EXECUTABLE WRITTEN TO {output}")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ibftc",
        description="IBM 7090/7094 FORTRAN IV source-to-native compiler",
    )
    parser.add_argument("source", nargs="+", type=Path, help="fixed-form source deck")
    parser.add_argument("-o", "--output", type=Path, default=Path("a.out"))
    parser.add_argument("--emit-c", type=Path, help="retain generated C at this path")
    parser.add_argument("--keep-c", action="store_true")
    parser.add_argument("--check", action="store_true", help="check without linking")
    parser.add_argument(
        "--arithmetic",
        choices=("ibm7094", "native"),
        default="ibm7094",
        help="arithmetic model (default: ibm7094)",
    )
    args = parser.parse_args(argv)
    try:
        compile_sources(
            args.source,
            args.output,
            args.emit_c,
            args.keep_c,
            args.arithmetic,
            args.check,
        )
    except CompileError as exc:
        print(f"IBFTC ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
