#ifndef F4RUNTIME_H
#define F4RUNTIME_H

#include <stdint.h>
#include <stddef.h>

typedef int64_t F4Integer;
typedef double F4Real;
typedef double F4Double;
typedef int F4Logical;

enum {
    F4_T_INTEGER = 1,
    F4_T_REAL = 2,
    F4_T_DOUBLE = 3,
    F4_T_LOGICAL = 4,
    F4_T_STRING = 5
};

typedef struct {
    int type;
    union {
        F4Integer integer;
        F4Real real;
        F4Double double_precision;
        F4Logical logical;
        const char *string;
    } value;
} F4Value;

typedef struct {
    int type;
    void *address;
} F4Ref;

typedef struct {
    size_t count;
    size_t capacity;
    F4Value *items;
} F4ValueList;

typedef struct {
    size_t count;
    size_t capacity;
    F4Ref *items;
} F4RefList;

void f4_runtime_init(int argc, char **argv);
void f4_runtime_finish(void);
void f4_stop(int code);
void f4_pause(void);
void f4_machine_error(const char *message);

F4Real f4_q(double value);
F4Double f4_dq(double value);
F4Integer f4_int(double value);
F4Integer f4_iadd(F4Integer a, F4Integer b);
F4Integer f4_isub(F4Integer a, F4Integer b);
F4Integer f4_imul(F4Integer a, F4Integer b);
F4Integer f4_idiv(F4Integer a, F4Integer b);
F4Integer f4_ipow(F4Integer a, F4Integer b);
F4Integer f4_ineg(F4Integer a);
F4Real f4_add(F4Real a, F4Real b);
F4Real f4_sub(F4Real a, F4Real b);
F4Real f4_mul(F4Real a, F4Real b);
F4Real f4_div(F4Real a, F4Real b);
F4Real f4_pow(F4Real a, F4Real b);
F4Real f4_neg(F4Real a);
F4Double f4_dadd(F4Double a, F4Double b);
F4Double f4_dsub(F4Double a, F4Double b);
F4Double f4_dmul(F4Double a, F4Double b);
F4Double f4_ddiv(F4Double a, F4Double b);
F4Double f4_dpow(F4Double a, F4Double b);
F4Double f4_dneg(F4Double a);
size_t f4_subscript(F4Integer index, F4Integer extent);

F4Value f4_value_integer(F4Integer value);
F4Value f4_value_real(F4Real value);
F4Value f4_value_double(F4Double value);
F4Value f4_value_logical(F4Logical value);
F4Value f4_value_string(const char *value);
F4Ref f4_ref_integer(F4Integer *value);
F4Ref f4_ref_real(F4Real *value);
F4Ref f4_ref_double(F4Double *value);
F4Ref f4_ref_logical(F4Logical *value);
F4ValueList f4_value_list(void);
void f4_value_list_add(F4ValueList *list, F4Value value);
void f4_value_list_free(F4ValueList *list);
F4RefList f4_ref_list(void);
void f4_ref_list_add(F4RefList *list, F4Ref value);
void f4_ref_list_free(F4RefList *list);
void f4_write(int unit, const char *format, size_t count, const F4Value *values);
void f4_read(int unit, const char *format, size_t count, F4Ref *values);

F4Real f4_intr_abs(F4Real x);
F4Integer f4_intr_iabs(F4Integer x);
F4Double f4_intr_dabs(F4Double x);
F4Real f4_intr_sqrt(F4Real x);
F4Double f4_intr_dsqrt(F4Double x);
F4Real f4_intr_exp(F4Real x);
F4Double f4_intr_dexp(F4Double x);
F4Real f4_intr_alog(F4Real x);
F4Double f4_intr_dlog(F4Double x);
F4Real f4_intr_alog10(F4Real x);
F4Double f4_intr_dlog10(F4Double x);
F4Real f4_intr_sin(F4Real x);
F4Double f4_intr_dsin(F4Double x);
F4Real f4_intr_cos(F4Real x);
F4Double f4_intr_dcos(F4Double x);
F4Real f4_intr_tan(F4Real x);
F4Real f4_intr_asin(F4Real x);
F4Real f4_intr_acos(F4Real x);
F4Real f4_intr_atan(F4Real x);
F4Real f4_intr_atan2(F4Real y, F4Real x);
F4Real f4_intr_sinh(F4Real x);
F4Real f4_intr_cosh(F4Real x);
F4Real f4_intr_tanh(F4Real x);
F4Integer f4_intr_mod(F4Integer a, F4Integer b);
F4Real f4_intr_amod(F4Real a, F4Real b);
F4Double f4_intr_dmod(F4Double a, F4Double b);
F4Real f4_intr_float(F4Integer x);
F4Real f4_intr_sngl(F4Double x);
F4Double f4_intr_dble(F4Real x);
F4Integer f4_intr_ifix(F4Real x);
F4Integer f4_intr_idint(F4Double x);
F4Integer f4_intr_int(F4Real x);
F4Real f4_intr_sign(F4Real a, F4Real b);
F4Integer f4_intr_isign(F4Integer a, F4Integer b);
F4Double f4_intr_dsign(F4Double a, F4Double b);
F4Real f4_intr_dim(F4Real a, F4Real b);
F4Integer f4_intr_idim(F4Integer a, F4Integer b);
F4Double f4_intr_ddim(F4Double a, F4Double b);
F4Integer f4_intr_max0(F4Integer a, F4Integer b);
F4Integer f4_intr_max1(F4Real a, F4Real b);
F4Real f4_intr_amax0(F4Integer a, F4Integer b);
F4Real f4_intr_amax1(F4Real a, F4Real b);
F4Double f4_intr_dmax1(F4Double a, F4Double b);
F4Integer f4_intr_min0(F4Integer a, F4Integer b);
F4Integer f4_intr_min1(F4Real a, F4Real b);
F4Real f4_intr_amin0(F4Integer a, F4Integer b);
F4Real f4_intr_amin1(F4Real a, F4Real b);
F4Double f4_intr_dmin1(F4Double a, F4Double b);

#endif
