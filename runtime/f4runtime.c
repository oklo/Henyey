#include "f4runtime.h"

#include <ctype.h>
#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define F4_INTEGER_MAX (INT64_C(34359738367))
#define F4_MAX_UNITS 100

#ifndef F4_DEFAULT_NATIVE
#define F4_DEFAULT_NATIVE 0
#endif

static int f4_native_arithmetic = F4_DEFAULT_NATIVE;
static int f4_bounds_check = 1;
static FILE *f4_units[F4_MAX_UNITS];

static int f4_truthy_env(const char *name, int fallback) {
    const char *value = getenv(name);
    if (value == NULL) {
        return fallback;
    }
    return strcmp(value, "0") != 0 && strcmp(value, "NO") != 0 &&
           strcmp(value, "FALSE") != 0;
}

void f4_runtime_init(int argc, char **argv) {
    int unit;
    (void)argc;
    (void)argv;
    f4_native_arithmetic = f4_truthy_env(
        "F4_NATIVE_ARITHMETIC", f4_native_arithmetic);
    f4_bounds_check = f4_truthy_env("F4_BOUNDS_CHECK", 1);
    f4_units[2] = stdin;
    f4_units[5] = stdin;
    f4_units[6] = stdout;
    for (unit = 0; unit < F4_MAX_UNITS; ++unit) {
        char name[32];
        const char *path;
        if (f4_units[unit] != NULL) {
            continue;
        }
        snprintf(name, sizeof(name), "F4_UNIT_%d", unit);
        path = getenv(name);
        if (path != NULL) {
            f4_units[unit] = fopen(path, "r+");
            if (f4_units[unit] == NULL) {
                f4_units[unit] = fopen(path, "w+");
            }
            if (f4_units[unit] == NULL) {
                fprintf(stderr, "F4 IOCS: CANNOT OPEN UNIT %d: %s\n",
                        unit, strerror(errno));
                exit(2);
            }
        }
    }
}

void f4_runtime_finish(void) {
    int unit;
    fflush(stdout);
    for (unit = 0; unit < F4_MAX_UNITS; ++unit) {
        if (f4_units[unit] != NULL && f4_units[unit] != stdin &&
            f4_units[unit] != stdout && f4_units[unit] != stderr) {
            fclose(f4_units[unit]);
            f4_units[unit] = NULL;
        }
    }
}

void f4_machine_error(const char *message) {
    fprintf(stderr, "7094 MACHINE CHECK: %s\n", message);
    exit(2);
}

void f4_stop(int code) {
    if (code != 0) {
        fprintf(stdout, "STOP %d\n", code);
    }
    f4_runtime_finish();
    exit(code == 0 ? 0 : 1);
}

void f4_pause(void) {
    fputs("PAUSE - PRESS RETURN\n", stderr);
    (void)getchar();
}

static double f4_quantize(double value, int bits) {
    int exponent;
    double magnitude;
    double fraction;
    double scaled;
    if (f4_native_arithmetic || value == 0.0) {
        return value;
    }
    if (!isfinite(value)) {
        f4_machine_error("FLOATING-POINT OVERFLOW");
    }
    magnitude = fabs(value);
    fraction = frexp(magnitude, &exponent);
    if (exponent < -127) {
        return copysign(0.0, value);
    }
    if (exponent > 127) {
        f4_machine_error("FLOATING-POINT OVERFLOW");
    }
    scaled = trunc(ldexp(fraction, bits));
    fraction = ldexp(scaled, -bits);
    return copysign(ldexp(fraction, exponent), value);
}

F4Real f4_q(double value) { return f4_quantize(value, 27); }
F4Double f4_dq(double value) { return f4_quantize(value, 54); }

F4Integer f4_int(double value) {
    double chopped;
    if (!isfinite(value)) {
        f4_machine_error("INVALID REAL TO INTEGER CONVERSION");
    }
    chopped = trunc(value);
    if (fabs(chopped) > (double)F4_INTEGER_MAX) {
        f4_machine_error("INTEGER OVERFLOW");
    }
    return (F4Integer)chopped;
}

static F4Integer f4_checked_integer(__int128 value) {
    if (value > F4_INTEGER_MAX || value < -F4_INTEGER_MAX) {
        f4_machine_error("INTEGER OVERFLOW");
    }
    return (F4Integer)value;
}

F4Integer f4_iadd(F4Integer a, F4Integer b) {
    return f4_checked_integer((__int128)a + b);
}
F4Integer f4_isub(F4Integer a, F4Integer b) {
    return f4_checked_integer((__int128)a - b);
}
F4Integer f4_imul(F4Integer a, F4Integer b) {
    return f4_checked_integer((__int128)a * b);
}
F4Integer f4_idiv(F4Integer a, F4Integer b) {
    if (b == 0) {
        f4_machine_error("INTEGER DIVIDE CHECK");
    }
    return a / b;
}
F4Integer f4_ipow(F4Integer a, F4Integer b) {
    F4Integer result = 1;
    if (b < 0) {
        return (a == 1) ? 1 : (a == -1 ? ((-b) & 1 ? -1 : 1) : 0);
    }
    while (b != 0) {
        if (b & 1) {
            result = f4_imul(result, a);
        }
        b >>= 1;
        if (b != 0) {
            a = f4_imul(a, a);
        }
    }
    return result;
}
F4Integer f4_ineg(F4Integer a) { return f4_checked_integer(-(__int128)a); }

F4Real f4_add(F4Real a, F4Real b) { return f4_q(a + b); }
F4Real f4_sub(F4Real a, F4Real b) { return f4_q(a - b); }
F4Real f4_mul(F4Real a, F4Real b) { return f4_q(a * b); }
F4Real f4_div(F4Real a, F4Real b) {
    if (b == 0.0) {
        f4_machine_error("FLOATING-POINT DIVIDE CHECK");
    }
    return f4_q(a / b);
}
F4Real f4_pow(F4Real a, F4Real b) { return f4_q(pow(a, b)); }
F4Real f4_neg(F4Real a) { return f4_q(-a); }
F4Double f4_dadd(F4Double a, F4Double b) { return f4_dq(a + b); }
F4Double f4_dsub(F4Double a, F4Double b) { return f4_dq(a - b); }
F4Double f4_dmul(F4Double a, F4Double b) { return f4_dq(a * b); }
F4Double f4_ddiv(F4Double a, F4Double b) {
    if (b == 0.0) {
        f4_machine_error("DOUBLE-PRECISION DIVIDE CHECK");
    }
    return f4_dq(a / b);
}
F4Double f4_dpow(F4Double a, F4Double b) { return f4_dq(pow(a, b)); }
F4Double f4_dneg(F4Double a) { return f4_dq(-a); }

size_t f4_subscript(F4Integer index, F4Integer extent) {
    if (f4_bounds_check && (index < 1 || index > extent)) {
        f4_machine_error("ARRAY SUBSCRIPT OUT OF RANGE");
    }
    return (size_t)(index - 1);
}

#define F4_VALUE_CTOR(name, tag, member, ctype) \
    F4Value name(ctype value) {                 \
        F4Value result;                         \
        result.type = tag;                      \
        result.value.member = value;            \
        return result;                          \
    }

F4_VALUE_CTOR(f4_value_integer, F4_T_INTEGER, integer, F4Integer)
F4_VALUE_CTOR(f4_value_real, F4_T_REAL, real, F4Real)
F4_VALUE_CTOR(f4_value_double, F4_T_DOUBLE, double_precision, F4Double)
F4_VALUE_CTOR(f4_value_logical, F4_T_LOGICAL, logical, F4Logical)
F4_VALUE_CTOR(f4_value_string, F4_T_STRING, string, const char *)

#define F4_REF_CTOR(name, tag, ctype) \
    F4Ref name(ctype *value) {         \
        F4Ref result;                  \
        result.type = tag;             \
        result.address = value;        \
        return result;                 \
    }

F4_REF_CTOR(f4_ref_integer, F4_T_INTEGER, F4Integer)
F4_REF_CTOR(f4_ref_real, F4_T_REAL, F4Real)
F4_REF_CTOR(f4_ref_double, F4_T_DOUBLE, F4Double)
F4_REF_CTOR(f4_ref_logical, F4_T_LOGICAL, F4Logical)

F4ValueList f4_value_list(void) {
    F4ValueList result = {0, 0, NULL};
    return result;
}

void f4_value_list_add(F4ValueList *list, F4Value value) {
    if (list->count == list->capacity) {
        size_t capacity = list->capacity == 0 ? 16 : list->capacity * 2;
        F4Value *items = (F4Value *)realloc(
            list->items, capacity * sizeof(*items));
        if (items == NULL) {
            f4_machine_error("IO LIST STORAGE EXHAUSTED");
        }
        list->items = items;
        list->capacity = capacity;
    }
    list->items[list->count++] = value;
}

void f4_value_list_free(F4ValueList *list) {
    free(list->items);
    list->items = NULL;
    list->count = list->capacity = 0;
}

F4RefList f4_ref_list(void) {
    F4RefList result = {0, 0, NULL};
    return result;
}

void f4_ref_list_add(F4RefList *list, F4Ref value) {
    if (list->count == list->capacity) {
        size_t capacity = list->capacity == 0 ? 16 : list->capacity * 2;
        F4Ref *items = (F4Ref *)realloc(
            list->items, capacity * sizeof(*items));
        if (items == NULL) {
            f4_machine_error("IO LIST STORAGE EXHAUSTED");
        }
        list->items = items;
        list->capacity = capacity;
    }
    list->items[list->count++] = value;
}

void f4_ref_list_free(F4RefList *list) {
    free(list->items);
    list->items = NULL;
    list->count = list->capacity = 0;
}

static FILE *f4_unit(int unit, int writing) {
    if (unit < 0 || unit >= F4_MAX_UNITS) {
        f4_machine_error("INVALID LOGICAL UNIT");
    }
    if (f4_units[unit] == NULL) {
        if (writing && unit == 6) {
            return stdout;
        }
        if (!writing && (unit == 2 || unit == 5)) {
            return stdin;
        }
        f4_machine_error("UNASSIGNED LOGICAL UNIT");
    }
    return f4_units[unit];
}

static double f4_value_as_double(const F4Value *value) {
    switch (value->type) {
    case F4_T_INTEGER:
        return (double)value->value.integer;
    case F4_T_REAL:
        return value->value.real;
    case F4_T_DOUBLE:
        return value->value.double_precision;
    case F4_T_LOGICAL:
        return (double)value->value.logical;
    default:
        return 0.0;
    }
}

static F4Integer f4_value_as_integer(const F4Value *value) {
    if (value->type == F4_T_INTEGER) {
        return value->value.integer;
    }
    return f4_int(f4_value_as_double(value));
}

static void f4_put_spaces(FILE *file, int count) {
    while (count-- > 0) {
        fputc(' ', file);
    }
}

typedef struct {
    FILE *file;
    size_t count;
    const F4Value *values;
    size_t item;
    int scale;
} F4WriteState;

static const char *f4_find_group_end(const char *start) {
    int depth = 1;
    const char *p = start;
    while (*p != '\0') {
        if (*p == '(') {
            ++depth;
        } else if (*p == ')' && --depth == 0) {
            return p;
        } else if (*p == '\'') {
            ++p;
            while (*p != '\0' && *p != '\'') {
                ++p;
            }
        }
        ++p;
    }
    f4_machine_error("UNBALANCED FORMAT");
    return start;
}

static void f4_write_sequence(
    const char *start, const char *end, F4WriteState *state);

static void f4_write_descriptor(
    char code, int width, int precision, F4WriteState *state) {
    const F4Value *value;
    char buffer[256];
    int length;
    if (state->item >= state->count) {
        return;
    }
    value = &state->values[state->item++];
    switch (code) {
    case 'I':
        snprintf(buffer, sizeof(buffer), "%*lld", width,
                 (long long)f4_value_as_integer(value));
        break;
    case 'F':
        snprintf(buffer, sizeof(buffer), "%*.*f", width, precision,
                 ldexp(f4_value_as_double(value), 0) *
                     pow(10.0, state->scale));
        break;
    case 'E':
    case 'D':
        snprintf(buffer, sizeof(buffer), "%*.*E", width, precision,
                 f4_value_as_double(value) * pow(10.0, state->scale));
        if (code == 'D') {
            char *exponent = strchr(buffer, 'E');
            if (exponent != NULL) {
                *exponent = 'D';
            }
        }
        break;
    case 'L':
        snprintf(buffer, sizeof(buffer), "%*c", width,
                 f4_value_as_integer(value) ? 'T' : 'F');
        break;
    case 'A':
        if (value->type != F4_T_STRING) {
            f4_machine_error("A FORMAT REQUIRES CHARACTER DATA");
        }
        length = (int)strlen(value->value.string);
        if (width <= 0) {
            fputs(value->value.string, state->file);
            return;
        }
        f4_put_spaces(state->file, width > length ? width - length : 0);
        fwrite(value->value.string, 1, (size_t)(width < length ? width : length),
               state->file);
        return;
    default:
        f4_machine_error("UNKNOWN OUTPUT FORMAT DESCRIPTOR");
        return;
    }
    fputs(buffer, state->file);
}

static void f4_write_sequence(
    const char *start, const char *end, F4WriteState *state) {
    const char *p = start;
    while (p < end && *p != '\0') {
        long lead = 0;
        int have_lead = 0;
        int repeat;
        int width = 0;
        int precision = 0;
        char code;
        while (p < end && (isspace((unsigned char)*p) || *p == ',')) {
            ++p;
        }
        while (p < end && isdigit((unsigned char)*p)) {
            have_lead = 1;
            lead = lead * 10 + (*p++ - '0');
        }
        if (p >= end) {
            break;
        }
        if (*p == '\'') {
            ++p;
            while (p < end && *p != '\'') {
                fputc(*p++, state->file);
            }
            if (p < end) {
                ++p;
            }
            continue;
        }
        code = (char)toupper((unsigned char)*p++);
        if (code == 'H') {
            int n = have_lead ? (int)lead : 1;
            while (n-- > 0 && p < end) {
                fputc(*p++, state->file);
            }
            continue;
        }
        if (code == 'X') {
            f4_put_spaces(state->file, have_lead ? (int)lead : 1);
            continue;
        }
        if (code == '/') {
            repeat = have_lead ? (int)lead : 1;
            while (repeat-- > 0) {
                fputc('\n', state->file);
            }
            continue;
        }
        if (code == 'P') {
            state->scale = have_lead ? (int)lead : 0;
            continue;
        }
        if (code == '(') {
            const char *group_end = f4_find_group_end(p);
            repeat = have_lead ? (int)lead : 1;
            while (repeat-- > 0) {
                f4_write_sequence(p, group_end, state);
            }
            p = group_end + 1;
            continue;
        }
        repeat = have_lead ? (int)lead : 1;
        while (p < end && isdigit((unsigned char)*p)) {
            width = width * 10 + (*p++ - '0');
        }
        if (p < end && *p == '.') {
            ++p;
            while (p < end && isdigit((unsigned char)*p)) {
                precision = precision * 10 + (*p++ - '0');
            }
        }
        while (repeat-- > 0) {
            f4_write_descriptor(code, width, precision, state);
        }
    }
}

static void f4_write_list(FILE *file, size_t count, const F4Value *values) {
    size_t i;
    for (i = 0; i < count; ++i) {
        if (i != 0) {
            fputc(' ', file);
        }
        switch (values[i].type) {
        case F4_T_INTEGER:
            fprintf(file, "%lld", (long long)values[i].value.integer);
            break;
        case F4_T_REAL:
            fprintf(file, "%.8G", values[i].value.real);
            break;
        case F4_T_DOUBLE:
            fprintf(file, "%.16G", values[i].value.double_precision);
            break;
        case F4_T_LOGICAL:
            fputc(values[i].value.logical ? 'T' : 'F', file);
            break;
        case F4_T_STRING:
            fputs(values[i].value.string, file);
            break;
        }
    }
    fputc('\n', file);
}

void f4_write(int unit, const char *format, size_t count, const F4Value *values) {
    FILE *file = f4_unit(unit, 1);
    F4WriteState state;
    const char *start;
    const char *end;
    if (format == NULL) {
        f4_write_list(file, count, values);
        return;
    }
    start = format;
    while (isspace((unsigned char)*start)) {
        ++start;
    }
    if (*start == '(') {
        ++start;
        end = f4_find_group_end(start);
    } else {
        end = start + strlen(start);
    }
    state.file = file;
    state.count = count;
    state.values = values;
    state.item = 0;
    state.scale = 0;
    do {
        size_t before = state.item;
        f4_write_sequence(start, end, &state);
        if (state.item == before) {
            break;
        }
        if (state.item < count) {
            fputc('\n', file);
        }
    } while (state.item < count);
    fputc('\n', file);
}

static void f4_assign_ref(F4Ref *ref, const char *field) {
    char *end;
    double value;
    while (isspace((unsigned char)*field)) {
        ++field;
    }
    if (ref->type == F4_T_LOGICAL) {
        *(F4Logical *)ref->address =
            (*field == 'T' || *field == 't' || strstr(field, ".TRUE.") != NULL);
        return;
    }
    errno = 0;
    value = strtod(field, &end);
    if (end == field || errno == ERANGE) {
        f4_machine_error("INVALID NUMERIC INPUT FIELD");
    }
    switch (ref->type) {
    case F4_T_INTEGER:
        *(F4Integer *)ref->address = f4_int(value);
        break;
    case F4_T_REAL:
        *(F4Real *)ref->address = f4_q(value);
        break;
    case F4_T_DOUBLE:
        *(F4Double *)ref->address = f4_dq(value);
        break;
    default:
        f4_machine_error("INVALID INPUT REFERENCE");
    }
}

static void f4_read_list(FILE *file, size_t count, F4Ref *values) {
    size_t i;
    char token[256];
    for (i = 0; i < count; ++i) {
        if (fscanf(file, "%255s", token) != 1) {
            f4_machine_error("END OF FILE ON INPUT");
        }
        f4_assign_ref(&values[i], token);
    }
}

static void f4_read_format(
    FILE *file, const char *format, size_t count, F4Ref *values) {
    char record[4096];
    const char *p = format;
    size_t offset = 0;
    size_t item = 0;
    if (fgets(record, sizeof(record), file) == NULL) {
        f4_machine_error("END OF FILE ON INPUT");
    }
    while (*p != '\0' && item < count) {
        int repeat = 0;
        int width = 0;
        int precision = 0;
        char code;
        while (isspace((unsigned char)*p) || *p == ',' || *p == '(' ||
               *p == ')') {
            ++p;
        }
        while (isdigit((unsigned char)*p)) {
            repeat = repeat * 10 + (*p++ - '0');
        }
        code = (char)toupper((unsigned char)*p++);
        if (code == 'X') {
            offset += (size_t)(repeat ? repeat : 1);
            continue;
        }
        if (code == 'P') {
            continue;
        }
        if (code == '/') {
            if (fgets(record, sizeof(record), file) == NULL) {
                f4_machine_error("END OF FILE ON INPUT");
            }
            offset = 0;
            continue;
        }
        if (code == 'H') {
            offset += (size_t)repeat;
            p += repeat;
            continue;
        }
        if (repeat == 0) {
            repeat = 1;
        }
        while (isdigit((unsigned char)*p)) {
            width = width * 10 + (*p++ - '0');
        }
        if (*p == '.') {
            ++p;
            while (isdigit((unsigned char)*p)) {
                precision = precision * 10 + (*p++ - '0');
            }
        }
        (void)precision;
        while (repeat-- > 0 && item < count) {
            char field[256];
            int n = width;
            if (n <= 0 || n >= (int)sizeof(field)) {
                f4_machine_error("INVALID INPUT FIELD WIDTH");
            }
            memcpy(field, record + offset, (size_t)n);
            field[n] = '\0';
            offset += (size_t)n;
            f4_assign_ref(&values[item++], field);
        }
    }
    if (item != count) {
        f4_machine_error("FORMAT EXHAUSTED BEFORE INPUT LIST");
    }
}

void f4_read(int unit, const char *format, size_t count, F4Ref *values) {
    FILE *file = f4_unit(unit, 0);
    if (format == NULL) {
        f4_read_list(file, count, values);
    } else {
        f4_read_format(file, format, count, values);
    }
}

#define F4_REAL_UNARY(name, fn) \
    F4Real f4_intr_##name(F4Real x) { return f4_q(fn(x)); }
#define F4_DOUBLE_UNARY(name, fn) \
    F4Double f4_intr_##name(F4Double x) { return f4_dq(fn(x)); }

F4_REAL_UNARY(abs, fabs)
F4_DOUBLE_UNARY(dabs, fabs)
F4_REAL_UNARY(sqrt, sqrt)
F4_DOUBLE_UNARY(dsqrt, sqrt)
F4_REAL_UNARY(exp, exp)
F4_DOUBLE_UNARY(dexp, exp)
F4_REAL_UNARY(alog, log)
F4_DOUBLE_UNARY(dlog, log)
F4_REAL_UNARY(alog10, log10)
F4_DOUBLE_UNARY(dlog10, log10)
F4_REAL_UNARY(sin, sin)
F4_DOUBLE_UNARY(dsin, sin)
F4_REAL_UNARY(cos, cos)
F4_DOUBLE_UNARY(dcos, cos)
F4_REAL_UNARY(tan, tan)
F4_REAL_UNARY(asin, asin)
F4_REAL_UNARY(acos, acos)
F4_REAL_UNARY(atan, atan)
F4_REAL_UNARY(sinh, sinh)
F4_REAL_UNARY(cosh, cosh)
F4_REAL_UNARY(tanh, tanh)

F4Integer f4_intr_iabs(F4Integer x) { return x < 0 ? f4_ineg(x) : x; }
F4Real f4_intr_atan2(F4Real y, F4Real x) { return f4_q(atan2(y, x)); }
F4Integer f4_intr_mod(F4Integer a, F4Integer b) { return f4_idiv(a, b), a % b; }
F4Real f4_intr_amod(F4Real a, F4Real b) {
    if (b == 0.0) f4_machine_error("AMOD DIVIDE CHECK");
    return f4_q(fmod(a, b));
}
F4Double f4_intr_dmod(F4Double a, F4Double b) {
    if (b == 0.0) f4_machine_error("DMOD DIVIDE CHECK");
    return f4_dq(fmod(a, b));
}
F4Real f4_intr_float(F4Integer x) { return f4_q((double)x); }
F4Real f4_intr_sngl(F4Double x) { return f4_q(x); }
F4Double f4_intr_dble(F4Real x) { return f4_dq(x); }
F4Integer f4_intr_ifix(F4Real x) { return f4_int(x); }
F4Integer f4_intr_idint(F4Double x) { return f4_int(x); }
F4Integer f4_intr_int(F4Real x) { return f4_int(x); }
F4Real f4_intr_sign(F4Real a, F4Real b) {
    return f4_q(copysign(fabs(a), b));
}
F4Integer f4_intr_isign(F4Integer a, F4Integer b) {
    F4Integer magnitude = a < 0 ? f4_ineg(a) : a;
    return b < 0 ? f4_ineg(magnitude) : magnitude;
}
F4Double f4_intr_dsign(F4Double a, F4Double b) {
    return f4_dq(copysign(fabs(a), b));
}
F4Real f4_intr_dim(F4Real a, F4Real b) {
    return a > b ? f4_sub(a, b) : 0.0;
}
F4Integer f4_intr_idim(F4Integer a, F4Integer b) {
    return a > b ? f4_isub(a, b) : 0;
}
F4Double f4_intr_ddim(F4Double a, F4Double b) {
    return a > b ? f4_dsub(a, b) : 0.0;
}

#define F4_MINMAX(name, type, op, convert) \
    type f4_intr_##name(type a, type b) { return convert(a op b ? a : b); }
#define F4_SAME(x) (x)

F4_MINMAX(max0, F4Integer, >, F4_SAME)
F4_MINMAX(max1, F4Real, >, f4_q)
F4_MINMAX(amax1, F4Real, >, f4_q)
F4_MINMAX(dmax1, F4Double, >, f4_dq)
F4_MINMAX(min0, F4Integer, <, F4_SAME)
F4_MINMAX(min1, F4Real, <, f4_q)
F4_MINMAX(amin1, F4Real, <, f4_q)
F4_MINMAX(dmin1, F4Double, <, f4_dq)
F4Integer f4_intr_amax0(F4Real a, F4Real b) {
    return f4_int(a > b ? a : b);
}
F4Integer f4_intr_amin0(F4Real a, F4Real b) {
    return f4_int(a < b ? a : b);
}
