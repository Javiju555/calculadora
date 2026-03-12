/// Symbolic differentiation and basic expression simplification.
///
/// Produces a new AST representing the derivative d/d(var) of the input.
/// The result is then simplified (constant folding + algebraic identities)
/// and pretty-printed.

use super::ast::Expr;

// ── Differentiation ────────────────────────────────────────────────────────

pub fn differentiate(expr: &Expr, var: &str) -> Result<Expr, String> {
    let d = diff(expr, var)?;
    Ok(simplify(&d))
}

fn diff(e: &Expr, var: &str) -> Result<Expr, String> {
    use Expr::*;
    Ok(match e {
        Num(_) => Num(0.0),

        Var(name) => {
            if name == var { Num(1.0) } else { Num(0.0) }
        }

        Neg(inner) => Neg(Box::new(diff(inner, var)?)),

        Add(a, b) => Add(Box::new(diff(a, var)?), Box::new(diff(b, var)?)),
        Sub(a, b) => Sub(Box::new(diff(a, var)?), Box::new(diff(b, var)?)),

        // Product rule: (uv)' = u'v + uv'
        Mul(u, v) => {
            let du = diff(u, var)?;
            let dv = diff(v, var)?;
            Add(
                Box::new(Mul(Box::new(du), Box::new(*v.clone()))),
                Box::new(Mul(Box::new(*u.clone()), Box::new(dv))),
            )
        }

        // Quotient rule: (u/v)' = (u'v - uv') / v²
        Div(u, v) => {
            let du = diff(u, var)?;
            let dv = diff(v, var)?;
            Div(
                Box::new(Sub(
                    Box::new(Mul(Box::new(du), Box::new(*v.clone()))),
                    Box::new(Mul(Box::new(*u.clone()), Box::new(dv))),
                )),
                Box::new(Pow(Box::new(*v.clone()), Box::new(Num(2.0)))),
            )
        }

        // Power rule: general case (u^v)' = u^v * (v'*ln(u) + v*u'/u)
        Pow(u, v) => {
            // Special case: constant exponent  u^n → n*u^(n-1)*u'
            if let Num(n) = v.as_ref() {
                let n = *n;
                let du = diff(u, var)?;
                // n * u^(n-1) * u'
                Mul(
                    Box::new(Mul(
                        Box::new(Num(n)),
                        Box::new(Pow(Box::new(*u.clone()), Box::new(Num(n - 1.0)))),
                    )),
                    Box::new(du),
                )
            } else {
                // General: u^v * (v'*ln(u) + v*u'/u)
                let du = diff(u, var)?;
                let dv = diff(v, var)?;
                Mul(
                    Box::new(Pow(Box::new(*u.clone()), Box::new(*v.clone()))),
                    Box::new(Add(
                        Box::new(Mul(Box::new(dv), Box::new(Call("ln".into(), vec![*u.clone()])))),
                        Box::new(Mul(
                            Box::new(*v.clone()),
                            Box::new(Div(Box::new(du), Box::new(*u.clone()))),
                        )),
                    )),
                )
            }
        }

        Rem(_, _) => return Err("No se puede diferenciar módulo".to_string()),
        Factorial(_) => return Err("No se puede diferenciar factorial".to_string()),
        Matrix(_) => return Err("No se puede diferenciar una matriz".to_string()),

        Call(name, args) => diff_call(name, args, var)?,
    })
}

fn diff_call(name: &str, args: &[Expr], var: &str) -> Result<Expr, String> {
    use Expr::*;
    if args.is_empty() {
        return Err(format!("Función '{name}' sin argumentos"));
    }
    let u = &args[0];
    let du = diff(u, var)?;

    // Chain rule:  d/dx f(u) = f'(u) * u'
    let inner_deriv: Expr = match name {
        "sin" => Call("cos".into(), vec![u.clone()]),
        "cos" => Neg(Box::new(Call("sin".into(), vec![u.clone()]))),
        "tan" => Div(
            Box::new(Num(1.0)),
            Box::new(Pow(Box::new(Call("cos".into(), vec![u.clone()])), Box::new(Num(2.0)))),
        ),
        "asin" | "arcsin" => Div(
            Box::new(Num(1.0)),
            Box::new(Call(
                "sqrt".into(),
                vec![Sub(Box::new(Num(1.0)), Box::new(Pow(Box::new(u.clone()), Box::new(Num(2.0)))))],
            )),
        ),
        "acos" | "arccos" => Neg(Box::new(Div(
            Box::new(Num(1.0)),
            Box::new(Call(
                "sqrt".into(),
                vec![Sub(Box::new(Num(1.0)), Box::new(Pow(Box::new(u.clone()), Box::new(Num(2.0)))))],
            )),
        ))),
        "atan" | "arctan" => Div(
            Box::new(Num(1.0)),
            Box::new(Add(Box::new(Num(1.0)), Box::new(Pow(Box::new(u.clone()), Box::new(Num(2.0)))))),
        ),
        "sinh" => Call("cosh".into(), vec![u.clone()]),
        "cosh" => Call("sinh".into(), vec![u.clone()]),
        "tanh" => Sub(
            Box::new(Num(1.0)),
            Box::new(Pow(Box::new(Call("tanh".into(), vec![u.clone()])), Box::new(Num(2.0)))),
        ),
        "ln" | "log" if args.len() == 1 => Div(Box::new(Num(1.0)), Box::new(u.clone())),
        "log10" => Div(
            Box::new(Num(1.0)),
            Box::new(Mul(Box::new(u.clone()), Box::new(Call("ln".into(), vec![Num(10.0)])))),
        ),
        "log2" => Div(
            Box::new(Num(1.0)),
            Box::new(Mul(Box::new(u.clone()), Box::new(Call("ln".into(), vec![Num(2.0)])))),
        ),
        "exp" => Call("exp".into(), vec![u.clone()]),
        "sqrt" => Div(
            Box::new(Num(1.0)),
            Box::new(Mul(Box::new(Num(2.0)), Box::new(Call("sqrt".into(), vec![u.clone()])))),
        ),
        "abs" => Div(Box::new(u.clone()), Box::new(Call("abs".into(), vec![u.clone()]))),
        other => return Err(format!("No sé derivar '{other}'")),
    };

    Ok(Mul(Box::new(inner_deriv), Box::new(du)))
}

// ── Simplification ─────────────────────────────────────────────────────────

pub fn simplify(e: &Expr) -> Expr {
    use Expr::*;
    match e {
        // Already atomic
        Num(_) | Var(_) => e.clone(),

        Neg(inner) => {
            let s = simplify(inner);
            match s {
                Num(0.0) => Num(0.0),
                Num(n) => Num(-n),
                Neg(inner2) => *inner2,
                other => Neg(Box::new(other)),
            }
        }

        Add(a, b) => {
            let (a, b) = (simplify(a), simplify(b));
            match (&a, &b) {
                (Num(x), Num(y)) => Num(x + y),
                (Num(n), _) if *n == 0.0 => b,
                (_, Num(n)) if *n == 0.0 => a,
                (_, Neg(inner)) => simplify(&Sub(Box::new(a.clone()), inner.clone())),
                _ => Add(Box::new(a), Box::new(b)),
            }
        }

        Sub(a, b) => {
            let (a, b) = (simplify(a), simplify(b));
            match (&a, &b) {
                (Num(x), Num(y)) => Num(x - y),
                (_, Num(n)) if *n == 0.0 => a,
                (Num(n), _) if *n == 0.0 => Neg(Box::new(b)),
                _ if expr_eq(&a, &b) => Num(0.0),
                _ => Sub(Box::new(a), Box::new(b)),
            }
        }

        Mul(a, b) => {
            let (a, b) = (simplify(a), simplify(b));
            match (&a, &b) {
                (Num(x), Num(y)) => Num(x * y),
                (Num(n), _) if *n == 0.0 => Num(0.0),
                (_, Num(n)) if *n == 0.0 => Num(0.0),
                (Num(n), _) if *n == 1.0 => b,
                (_, Num(n)) if *n == 1.0 => a,
                (Num(n), _) if *n == -1.0 => Neg(Box::new(b)),
                (_, Num(n)) if *n == -1.0 => Neg(Box::new(a)),
                // x * x → x²
                _ if expr_eq(&a, &b) => Pow(Box::new(a), Box::new(Num(2.0))),
                _ => Mul(Box::new(a), Box::new(b)),
            }
        }

        Div(a, b) => {
            let (a, b) = (simplify(a), simplify(b));
            match (&a, &b) {
                (_, Num(n)) if *n == 1.0 => a,
                (Num(x), Num(y)) if *y != 0.0 => Num(x / y),
                (Num(n), _) if *n == 0.0 => Num(0.0),
                _ if expr_eq(&a, &b) => Num(1.0),
                _ => Div(Box::new(a), Box::new(b)),
            }
        }

        Pow(base, exp) => {
            let (base, exp) = (simplify(base), simplify(exp));
            match (&base, &exp) {
                (_, Num(n)) if *n == 0.0 => Num(1.0),
                (_, Num(n)) if *n == 1.0 => base,
                (Num(b), Num(e)) => Num(b.powf(*e)),
                _ => Pow(Box::new(base), Box::new(exp)),
            }
        }

        Rem(a, b) => {
            let (a, b) = (simplify(a), simplify(b));
            match (&a, &b) {
                (Num(x), Num(y)) if *y != 0.0 => Num(x % y),
                _ => Rem(Box::new(a), Box::new(b)),
            }
        }

        Factorial(inner) => {
            let s = simplify(inner);
            match s {
                Num(n) if n >= 0.0 && n.fract() == 0.0 => {
                    let r: f64 = (1..=(n as u64)).map(|k| k as f64).product();
                    Num(r)
                }
                other => Factorial(Box::new(other)),
            }
        }

        Matrix(rows) => {
            Matrix(rows.iter().map(|row| row.iter().map(simplify).collect()).collect())
        }

        Call(name, args) => {
            let simp_args: Vec<Expr> = args.iter().map(simplify).collect();
            // Try constant folding on well-known functions
            if simp_args.iter().all(|a| matches!(a, Num(_))) {
                match name.as_str() {
                    "sin" => {
                        if let Num(x) = simp_args[0] { return Num(x.sin()); }
                    }
                    "cos" => {
                        if let Num(x) = simp_args[0] { return Num(x.cos()); }
                    }
                    "ln" => {
                        if let Num(x) = simp_args[0] { if x > 0.0 { return Num(x.ln()); } }
                    }
                    "sqrt" => {
                        if let Num(x) = simp_args[0] { if x >= 0.0 { return Num(x.sqrt()); } }
                    }
                    _ => {}
                }
            }
            Call(name.clone(), simp_args)
        }
    }
}

/// Structural equality check (no commutativity/sorting)
fn expr_eq(a: &Expr, b: &Expr) -> bool {
    use Expr::*;
    match (a, b) {
        (Num(x), Num(y)) => (x - y).abs() < 1e-15,
        (Var(x), Var(y)) => x == y,
        (Neg(x), Neg(y)) => expr_eq(x, y),
        (Add(a1,b1), Add(a2,b2)) | (Mul(a1,b1), Mul(a2,b2)) |
        (Sub(a1,b1), Sub(a2,b2)) | (Div(a1,b1), Div(a2,b2)) |
        (Pow(a1,b1), Pow(a2,b2)) => expr_eq(a1, a2) && expr_eq(b1, b2),
        _ => false,
    }
}

// ── Pretty-printer ─────────────────────────────────────────────────────────

pub fn pretty_print(e: &Expr) -> String {
    use Expr::*;
    match e {
        Num(n) => {
            if n.fract() == 0.0 && n.abs() < 1e9 { format!("{}", *n as i64) }
            else { format!("{n}") }
        }
        Var(name) => name.clone(),
        Neg(inner) => format!("-({})", pretty_print(inner)),
        Add(a, b) => format!("({} + {})", pretty_print(a), pretty_print(b)),
        Sub(a, b) => format!("({} - {})", pretty_print(a), pretty_print(b)),
        Mul(a, b) => format!("({} * {})", pretty_print(a), pretty_print(b)),
        Div(a, b) => format!("({} / {})", pretty_print(a), pretty_print(b)),
        Pow(a, b) => format!("{}^{}", pretty_print(a), pretty_print(b)),
        Rem(a, b) => format!("({} % {})", pretty_print(a), pretty_print(b)),
        Factorial(inner) => format!("{}!", pretty_print(inner)),
        Call(name, args) => {
            let arg_strs: Vec<String> = args.iter().map(pretty_print).collect();
            format!("{}({})", name, arg_strs.join(", "))
        }
        Matrix(rows) => {
            let row_strs: Vec<String> = rows.iter()
                .map(|row| row.iter().map(pretty_print).collect::<Vec<_>>().join(", "))
                .collect();
            format!("[{}]", row_strs.join("; "))
        }
    }
}
