/// Numerical evaluator.  Works over Complex<f64> for full generality;
/// results that have negligible imaginary parts are returned as real.

use std::collections::HashMap;
use num_complex::Complex64;
use nalgebra::DMatrix;
use super::ast::{Expr, Stmt};

pub type Scope = HashMap<String, Value>;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum Value {
    Real(f64),
    Complex(Complex64),
    /// Unevaluated symbolic expression (stored as source string, to be extended later)
    Symbolic(String),
    /// Real matrix (row-major, nalgebra DMatrix)
    Matrix(DMatrix<f64>),
}

impl Value {
    pub fn to_complex(&self) -> Complex64 {
        match self {
            Value::Real(r) => Complex64::new(*r, 0.0),
            Value::Complex(c) => *c,
            Value::Symbolic(_) => Complex64::new(f64::NAN, 0.0),
            Value::Matrix(m) if m.nrows() == 1 && m.ncols() == 1 => Complex64::new(m[(0,0)], 0.0),
            Value::Matrix(_) => Complex64::new(f64::NAN, 0.0),
        }
    }

    pub fn simplify(c: Complex64) -> Value {
        if c.im.abs() < 1e-12 * (1.0 + c.re.abs()) {
            Value::Real(c.re)
        } else {
            Value::Complex(c)
        }
    }

    pub fn format(&self, _angle_mode: &str) -> String {
        match self {
            Value::Real(r) => format_real(*r),
            Value::Complex(c) => format_complex(*c),
            Value::Symbolic(s) => s.clone(),
            Value::Matrix(m) => format_matrix(m),
        }
    }
}

fn format_real(r: f64) -> String {
    if r.is_nan() { return "Error".to_string(); }
    if r.is_infinite() { return if r > 0.0 { "∞".to_string() } else { "-∞".to_string() }; }
    // Exact integers
    if r.fract() == 0.0 && r.abs() < 1e15 {
        return format!("{}", r as i64);
    }
    // Use significant figures formatting similar to the JS engine
    let s = format!("{:.12}", r);
    let trimmed = s.trim_end_matches('0').trim_end_matches('.');
    // Fallback to scientific notation for very large/small numbers
    if r.abs() >= 1e15 || (r.abs() < 1e-6 && r != 0.0) {
        return format!("{:e}", r);
    }
    trimmed.to_string()
}

fn format_complex(c: Complex64) -> String {
    let re = format_real(c.re);
    let im_abs = c.im.abs();
    if im_abs < 1e-12 { return re; }
    let im_str = if im_abs == 1.0 {
        String::new()
    } else {
        format_real(im_abs)
    };
    if c.re.abs() < 1e-12 {
        format!("{}{}i", if c.im < 0.0 { "-" } else { "" }, im_str)
    } else if c.im < 0.0 {
        format!("{} - {}i", re, im_str)
    } else {
        format!("{} + {}i", re, im_str)
    }
}

fn format_matrix(m: &DMatrix<f64>) -> String {
    let rows: Vec<String> = (0..m.nrows())
        .map(|r| {
            (0..m.ncols())
                .map(|c| format_real(m[(r, c)]))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .collect();
    format!("[{}]", rows.join("; "))
}

fn factorial(n: f64) -> f64 {
    if n < 0.0 || n.fract() != 0.0 { return f64::NAN; }
    let n = n as u64;
    if n > 170 { return f64::INFINITY; }
    (1..=n).map(|k| k as f64).product()
}

pub struct Evaluator<'a> {
    scope: &'a Scope,
    angle_mode: &'a str,   // "DEG" | "RAD"
}

impl<'a> Evaluator<'a> {
    pub fn new(scope: &'a Scope, angle_mode: &'a str) -> Self {
        Evaluator { scope, angle_mode }
    }

    fn to_radians(&self, x: f64) -> f64 {
        if self.angle_mode == "DEG" { x * std::f64::consts::PI / 180.0 } else { x }
    }

    fn from_radians(&self, x: f64) -> f64 {
        if self.angle_mode == "DEG" { x * 180.0 / std::f64::consts::PI } else { x }
    }

    pub fn eval(&self, expr: &Expr) -> Result<Value, String> {
        match expr {
            Expr::Num(n) => Ok(Value::Real(*n)),

            Expr::Var(name) => {
                // Built-in constants
                match name.as_str() {
                    "pi" | "PI" | "π" => return Ok(Value::Real(std::f64::consts::PI)),
                    "e" | "E" => return Ok(Value::Real(std::f64::consts::E)),
                    "tau" | "τ" => return Ok(Value::Real(std::f64::consts::TAU)),
                    "i" => return Ok(Value::Complex(Complex64::new(0.0, 1.0))),
                    "inf" | "Inf" | "∞" => return Ok(Value::Real(f64::INFINITY)),
                    "phi" | "φ" => return Ok(Value::Real((1.0 + 5.0_f64.sqrt()) / 2.0)),
                    "ans" | "Ans" => {
                        // Look up in scope
                    }
                    _ => {}
                }
                // User-defined variable
                self.scope
                    .get(name)
                    .cloned()
                    .ok_or_else(|| format!("Undefined variable '{name}'"))
            }

            Expr::Neg(inner) => {
                let v = self.eval(inner)?.to_complex();
                Ok(Value::simplify(-v))
            }

            Expr::Add(a, b) => {
                let (a, b) = (self.eval(a)?.to_complex(), self.eval(b)?.to_complex());
                Ok(Value::simplify(a + b))
            }
            Expr::Sub(a, b) => {
                let (a, b) = (self.eval(a)?.to_complex(), self.eval(b)?.to_complex());
                Ok(Value::simplify(a - b))
            }
            Expr::Mul(a, b) => {
                let (a, b) = (self.eval(a)?.to_complex(), self.eval(b)?.to_complex());
                Ok(Value::simplify(a * b))
            }
            Expr::Div(a, b) => {
                let (a, b) = (self.eval(a)?.to_complex(), self.eval(b)?.to_complex());
                if b.re == 0.0 && b.im == 0.0 {
                    return Err("División por cero".to_string());
                }
                Ok(Value::simplify(a / b))
            }
            Expr::Pow(base, exp) => {
                let (b, e) = (self.eval(base)?.to_complex(), self.eval(exp)?.to_complex());
                Ok(Value::simplify(b.powc(e)))
            }
            Expr::Rem(a, b) => {
                let (a, b) = (self.eval(a)?.to_complex(), self.eval(b)?.to_complex());
                if b.im.abs() > 1e-12 || a.im.abs() > 1e-12 {
                    return Err("Módulo no soporta complejos".to_string());
                }
                Ok(Value::Real(a.re % b.re))
            }

            Expr::Factorial(inner) => {
                let v = self.eval(inner)?;
                match v {
                    Value::Real(r) => Ok(Value::Real(factorial(r))),
                    _ => Err("Factorial requiere número real".to_string()),
                }
            }

            Expr::Matrix(rows) => {
                let nrows = rows.len();
                if nrows == 0 {
                    return Ok(Value::Matrix(DMatrix::zeros(0, 0)));
                }
                let ncols = rows[0].len();
                let mut data = Vec::with_capacity(nrows * ncols);
                for row in rows {
                    if row.len() != ncols {
                        return Err("Las filas de la matriz tienen longitudes distintas".to_string());
                    }
                    for elem in row {
                        match self.eval(elem)? {
                            Value::Real(r) => data.push(r),
                            Value::Complex(c) if c.im.abs() < 1e-12 => data.push(c.re),
                            Value::Matrix(_) => return Err("No se admiten matrices anidadas".to_string()),
                            _ => return Err("Los elementos de la matriz deben ser reales".to_string()),
                        }
                    }
                }
                Ok(Value::Matrix(DMatrix::from_row_slice(nrows, ncols, &data)))
            }

            Expr::Call(name, args) => self.call(name, args),
        }
    }

    fn eval_real(&self, expr: &Expr) -> Result<f64, String> {
        let v = self.eval(expr)?;
        match v {
            Value::Real(r) => Ok(r),
            Value::Complex(c) if c.im.abs() < 1e-12 => Ok(c.re),
            _ => Err(format!("Se esperaba número real")),
        }
    }

    fn call(&self, name: &str, args: &[Expr]) -> Result<Value, String> {
        let argc = args.len();
        macro_rules! arg1 {
            () => {{
                if argc != 1 { return Err(format!("{name}() requiere 1 argumento")); }
                self.eval(&args[0])?.to_complex()
            }};
        }
        macro_rules! arg2 {
            () => {{
                if argc != 2 { return Err(format!("{name}() requiere 2 argumentos")); }
                (self.eval(&args[0])?.to_complex(), self.eval(&args[1])?.to_complex())
            }};
        }

        // ── Matrix constructors & operations (return early with Value::Matrix) ──
        match name {
            "zeros" => {
                let (r, c) = match argc {
                    1 => { let n = self.eval_real(&args[0])? as usize; (n, n) }
                    2 => (self.eval_real(&args[0])? as usize, self.eval_real(&args[1])? as usize),
                    _ => return Err("zeros(n) o zeros(n, m)".to_string()),
                };
                return Ok(Value::Matrix(DMatrix::zeros(r, c)));
            }
            "ones" => {
                let (r, c) = match argc {
                    1 => { let n = self.eval_real(&args[0])? as usize; (n, n) }
                    2 => (self.eval_real(&args[0])? as usize, self.eval_real(&args[1])? as usize),
                    _ => return Err("ones(n) o ones(n, m)".to_string()),
                };
                return Ok(Value::Matrix(DMatrix::from_element(r, c, 1.0)));
            }
            "eye" => {
                if argc != 1 { return Err("eye(n)".to_string()); }
                let n = self.eval_real(&args[0])? as usize;
                return Ok(Value::Matrix(DMatrix::identity(n, n)));
            }
            "transpose" | "T" => {
                if argc != 1 { return Err(format!("{name}(A) requiere 1 argumento")); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => return Ok(Value::Matrix(m.transpose())),
                    _ => return Err(format!("{name}() requiere una matriz")),
                }
            }
            "inv" => {
                if argc != 1 { return Err("inv(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        if m.nrows() != m.ncols() {
                            return Err("inv() requiere matriz cuadrada".to_string());
                        }
                        match m.clone().try_inverse() {
                            Some(inv) => return Ok(Value::Matrix(inv)),
                            None => return Err("Matriz singular (no invertible)".to_string()),
                        }
                    }
                    _ => return Err("inv() requiere una matriz".to_string()),
                }
            }
            "det" => {
                if argc != 1 { return Err("det(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        if m.nrows() != m.ncols() {
                            return Err("det() requiere matriz cuadrada".to_string());
                        }
                        return Ok(Value::Real(m.determinant()));
                    }
                    _ => return Err("det() requiere una matriz".to_string()),
                }
            }
            "trace" => {
                if argc != 1 { return Err("trace(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        if m.nrows() != m.ncols() {
                            return Err("trace() requiere matriz cuadrada".to_string());
                        }
                        return Ok(Value::Real(m.trace()));
                    }
                    _ => return Err("trace() requiere una matriz".to_string()),
                }
            }
            "rank" => {
                if argc != 1 { return Err("rank(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        let svd = nalgebra::SVD::new(m, true, true);
                        let rank = svd.singular_values.iter().filter(|&&s| s > 1e-10).count();
                        return Ok(Value::Real(rank as f64));
                    }
                    _ => return Err("rank() requiere una matriz".to_string()),
                }
            }
            "norm" if argc == 1 => {
                // Scalar norm is handled below; matrix Frobenius norm:
                if let Ok(Value::Matrix(m)) = self.eval(&args[0]) {
                    return Ok(Value::Real(m.norm()));
                }
                // Fall through to scalar abs/norm
            }
            "size" => {
                if argc != 1 { return Err("size(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        let data = vec![m.nrows() as f64, m.ncols() as f64];
                        return Ok(Value::Matrix(DMatrix::from_row_slice(1, 2, &data)));
                    }
                    _ => return Err("size() requiere una matriz".to_string()),
                }
            }
            "rows" => {
                if argc != 1 { return Err("rows(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => return Ok(Value::Real(m.nrows() as f64)),
                    _ => return Err("rows() requiere una matriz".to_string()),
                }
            }
            "cols" => {
                if argc != 1 { return Err("cols(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => return Ok(Value::Real(m.ncols() as f64)),
                    _ => return Err("cols() requiere una matriz".to_string()),
                }
            }
            "dot" => {
                if argc != 2 { return Err("dot(u, v) requiere 2 argumentos".to_string()); }
                match (self.eval(&args[0])?, self.eval(&args[1])?) {
                    (Value::Matrix(a), Value::Matrix(b)) => {
                        let av: Vec<f64> = a.iter().cloned().collect();
                        let bv: Vec<f64> = b.iter().cloned().collect();
                        if av.len() != bv.len() {
                            return Err("dot(): los vectores deben tener la misma longitud".to_string());
                        }
                        let d: f64 = av.iter().zip(bv.iter()).map(|(x, y)| x * y).sum();
                        return Ok(Value::Real(d));
                    }
                    _ => return Err("dot() requiere dos vectores/matrices".to_string()),
                }
            }
            "cross" => {
                if argc != 2 { return Err("cross(u, v) requiere 2 argumentos".to_string()); }
                match (self.eval(&args[0])?, self.eval(&args[1])?) {
                    (Value::Matrix(a), Value::Matrix(b)) => {
                        let av: Vec<f64> = a.iter().cloned().collect();
                        let bv: Vec<f64> = b.iter().cloned().collect();
                        if av.len() != 3 || bv.len() != 3 {
                            return Err("cross() requiere vectores 3D".to_string());
                        }
                        let (ax, ay, az) = (av[0], av[1], av[2]);
                        let (bx, by, bz) = (bv[0], bv[1], bv[2]);
                        let data = vec![ay*bz - az*by, az*bx - ax*bz, ax*by - ay*bx];
                        return Ok(Value::Matrix(DMatrix::from_row_slice(1, 3, &data)));
                    }
                    _ => return Err("cross() requiere dos vectores 3D".to_string()),
                }
            }
            "eig" => {
                if argc != 1 { return Err("eig(A) requiere 1 argumento".to_string()); }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        if m.nrows() != m.ncols() {
                            return Err("eig() requiere matriz cuadrada".to_string());
                        }
                        // Only works reliably for symmetric matrices
                        let sym = nalgebra::SymmetricEigen::new(m);
                        let mut evals: Vec<f64> = sym.eigenvalues.iter().cloned().collect();
                        evals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                        return Ok(Value::Matrix(DMatrix::from_row_slice(1, evals.len(), &evals)));
                    }
                    _ => return Err("eig() requiere una matriz".to_string()),
                }
            }
            "linsolve" | "msolve" => {
                // linsolve(A, b) — solve Ax = b
                if argc != 2 { return Err(format!("{name}(A, b) requiere 2 argumentos")); }
                match (self.eval(&args[0])?, self.eval(&args[1])?) {
                    (Value::Matrix(a), Value::Matrix(b)) => {
                        let lu = a.lu();
                        match lu.solve(&b) {
                            Some(x) => return Ok(Value::Matrix(x)),
                            None => return Err("Sistema sin solución única (matriz singular)".to_string()),
                        }
                    }
                    _ => return Err(format!("{name}() requiere dos matrices")),
                }
            }
            "solve" => {
                // solve(f, x0=0) — find root of f(x)=0 via Newton-Raphson
                // solve(f, g, x0=0) — find intersection f(x)=g(x)
                if argc < 1 || argc > 3 {
                    return Err("solve(f, [x0=0]) — raíz de f(x)=0".to_string());
                }
                let (f_expr, x0) = if argc == 1 {
                    (&args[0], 0.0)
                } else if argc == 2 {
                    // If second arg evaluates to a pure number (no x), treat as x0; else treat as g(x)
                    let x0_val = self.eval_real(&args[1]).unwrap_or(f64::NAN);
                    if x0_val.is_finite() {
                        (&args[0], x0_val)
                    } else {
                        // solve(f, g) — treat as solve(f - g)
                        let scope_c: Scope = (*self.scope).clone();
                        let am = self.angle_mode;
                        let fa = &args[0];
                        let ga = &args[1];
                        let eval_fg2 = |x: f64| -> f64 {
                            let mut ls = scope_c.clone();
                            ls.insert("x".to_string(), Value::Real(x));
                            let ev = Evaluator { scope: &ls, angle_mode: am };
                            let fv = ev.eval(fa).ok().and_then(|v| if let Value::Real(r) = v { Some(r) } else { None }).unwrap_or(f64::NAN);
                            let gv = ev.eval(ga).ok().and_then(|v| if let Value::Real(r) = v { Some(r) } else { None }).unwrap_or(f64::NAN);
                            fv - gv
                        };
                        let root = newton_raphson(eval_fg2, 0.0, 200)?;
                        return Ok(Value::Real(root));
                    }
                } else {
                    // argc == 3: solve(f, g, x0)
                    let x0 = self.eval_real(&args[2])?;
                    let scope_c: Scope = (*self.scope).clone();
                    let am = self.angle_mode;
                    let fa = &args[0];
                    let ga = &args[1];
                    let eval_fg = |x: f64| -> f64 {
                        let mut ls = scope_c.clone();
                        ls.insert("x".to_string(), Value::Real(x));
                        let ev = Evaluator { scope: &ls, angle_mode: am };
                        let fv = ev.eval(fa).ok().and_then(|v| if let Value::Real(r) = v { Some(r) } else { None }).unwrap_or(f64::NAN);
                        let gv = ev.eval(ga).ok().and_then(|v| if let Value::Real(r) = v { Some(r) } else { None }).unwrap_or(f64::NAN);
                        fv - gv
                    };
                    let root = newton_raphson(eval_fg, x0, 200)?;
                    return Ok(Value::Real(root));
                };
                let scope_c: Scope = (*self.scope).clone();
                let angle_mode = self.angle_mode;
                let fe = f_expr;
                let eval_f = |x: f64| -> f64 {
                    let mut ls = scope_c.clone();
                    ls.insert("x".to_string(), Value::Real(x));
                    let ev = Evaluator { scope: &ls, angle_mode };
                    match ev.eval(fe) {
                        Ok(Value::Real(r)) => r,
                        Ok(Value::Complex(c)) if c.im.abs() < 1e-12 => c.re,
                        _ => f64::NAN,
                    }
                };
                let root = newton_raphson(eval_f, x0, 200)?;
                return Ok(Value::Real(root));
            }
            _ => {}
        }

        let result = match name {
            // Trig (honours angle mode)
            "sin" => {
                let x = arg1!();
                let xr = Complex64::new(self.to_radians(x.re), x.im);
                xr.sin()
            }
            "cos" => {
                let x = arg1!();
                let xr = Complex64::new(self.to_radians(x.re), x.im);
                xr.cos()
            }
            "tan" => {
                let x = arg1!();
                let xr = Complex64::new(self.to_radians(x.re), x.im);
                xr.tan()
            }
            "asin" | "arcsin" => {
                let x = arg1!();
                let r = x.asin();
                Complex64::new(self.from_radians(r.re), r.im)
            }
            "acos" | "arccos" => {
                let x = arg1!();
                let r = x.acos();
                Complex64::new(self.from_radians(r.re), r.im)
            }
            "atan" | "arctan" => {
                let x = arg1!();
                let r = x.atan();
                Complex64::new(self.from_radians(r.re), r.im)
            }
            "atan2" => {
                let (y, x) = arg2!();
                Complex64::new(self.from_radians(y.re.atan2(x.re)), 0.0)
            }
            // Hyperbolic
            "sinh" => arg1!().sinh(),
            "cosh" => arg1!().cosh(),
            "tanh" => arg1!().tanh(),
            "asinh" | "arcsinh" => arg1!().asinh(),
            "acosh" | "arccosh" => arg1!().acosh(),
            "atanh" | "arctanh" => arg1!().atanh(),
            // Exponential / log
            "sqrt" => {
                let x = arg1!();
                x.sqrt()
            }
            "cbrt" => {
                let x = self.eval_real(&args[0])?;
                Complex64::new(x.cbrt(), 0.0)
            }
            "exp" => arg1!().exp(),
            "ln" | "log" if argc == 1 => arg1!().ln(),
            "log" if argc == 2 => {
                let (x, base) = arg2!();
                x.ln() / base.ln()
            }
            "log2" => arg1!().ln() / Complex64::new(2.0_f64.ln(), 0.0),
            "log10" => arg1!().log10(),
            // Rounding
            "abs" => {
                let x = arg1!();
                Complex64::new(x.norm(), 0.0)
            }
            "floor" => {
                let x = self.eval_real(&args[0])?;
                Complex64::new(x.floor(), 0.0)
            }
            "ceil" => {
                let x = self.eval_real(&args[0])?;
                Complex64::new(x.ceil(), 0.0)
            }
            "round" => {
                let x = self.eval_real(&args[0])?;
                Complex64::new(x.round(), 0.0)
            }
            "trunc" => {
                let x = self.eval_real(&args[0])?;
                Complex64::new(x.trunc(), 0.0)
            }
            "sign" | "sgn" => {
                let x = self.eval_real(&args[0])?;
                Complex64::new(x.signum(), 0.0)
            }
            // Complex-specific
            "re" | "Re" => Complex64::new(arg1!().re, 0.0),
            "im" | "Im" => Complex64::new(arg1!().im, 0.0),
            "arg" | "Arg" => {
                let x = arg1!();
                Complex64::new(self.from_radians(x.arg()), 0.0)
            }
            "conj" => arg1!().conj(),
            "norm" | "modulus" => {
                let x = arg1!();
                Complex64::new(x.norm(), 0.0)
            }
            // Min / max
            "min" => {
                if argc < 1 { return Err("min() requiere al menos 1 arg".to_string()); }
                let mut mn = self.eval_real(&args[0])?;
                for a in &args[1..] { mn = mn.min(self.eval_real(a)?); }
                Complex64::new(mn, 0.0)
            }
            "max" => {
                if argc < 1 { return Err("max() requiere al menos 1 arg".to_string()); }
                let mut mx = self.eval_real(&args[0])?;
                for a in &args[1..] { mx = mx.max(self.eval_real(a)?); }
                Complex64::new(mx, 0.0)
            }
            // Combinatorics
            "gcd" => {
                let (a, b) = arg2!();
                let (a, b) = (a.re as i64, b.re as i64);
                Complex64::new(gcd(a.abs(), b.abs()) as f64, 0.0)
            }
            "lcm" => {
                let (a, b) = arg2!();
                let (ai, bi) = (a.re as i64, b.re as i64);
                Complex64::new(lcm(ai.abs(), bi.abs()) as f64, 0.0)
            }
            "nCr" | "comb" => {
                let (n, r) = arg2!();
                Complex64::new(n_choose_r(n.re as u64, r.re as u64), 0.0)
            }
            "nPr" | "perm" => {
                let (n, r) = arg2!();
                let (ni, ri) = (n.re as u64, r.re as u64);
                if ri > ni { return Ok(Value::Real(0.0)); }
                let v: f64 = ((ni - ri + 1)..=ni).map(|k| k as f64).product();
                Complex64::new(v, 0.0)
            }
            // Numerical integration  integrate(expr_str, var, a, b)  — handled separately via Tauri command
            // Random
            "rand" => {
                // Simple LCG — good enough for a calculator
                use std::time::SystemTime;
                let seed = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .map(|d| d.subsec_nanos())
                    .unwrap_or(12345);
                Complex64::new((seed as f64) / (u32::MAX as f64), 0.0)
            }
            // ── Statistics (variadic) ─────────────────────────────────────
            "mean" | "avg" => {
                if argc == 0 { return Err("mean() requiere al menos 1 argumento".to_string()); }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let vals = vals?;
                Complex64::new(vals.iter().sum::<f64>() / vals.len() as f64, 0.0)
            }
            "median" => {
                if argc == 0 { return Err("median() requiere al menos 1 argumento".to_string()); }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let mut vals = vals?;
                vals.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let n = vals.len();
                let m = if n % 2 == 0 { (vals[n/2-1] + vals[n/2]) / 2.0 } else { vals[n/2] };
                Complex64::new(m, 0.0)
            }
            "std" | "stdev" => {
                if argc < 2 { return Err("std() requiere al menos 2 argumentos".to_string()); }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let vals = vals?;
                let n = vals.len() as f64;
                let mean = vals.iter().sum::<f64>() / n;
                let var_ = vals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
                Complex64::new(var_.sqrt(), 0.0)
            }
            "var" | "variance" => {
                if argc < 2 { return Err("var() requiere al menos 2 argumentos".to_string()); }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let vals = vals?;
                let n = vals.len() as f64;
                let mean = vals.iter().sum::<f64>() / n;
                Complex64::new(vals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0), 0.0)
            }
            "sum" => {
                if argc == 0 { return Err("sum() requiere al menos 1 argumento".to_string()); }
                let mut s = Complex64::new(0.0, 0.0);
                for a in args { s += self.eval(a)?.to_complex(); }
                s
            }
            "prod" | "product" => {
                if argc == 0 { return Err("prod() requiere al menos 1 argumento".to_string()); }
                let mut p = Complex64::new(1.0, 0.0);
                for a in args { p *= self.eval(a)?.to_complex(); }
                p
            }
            "hypot" => {
                if argc < 2 { return Err("hypot() requiere al menos 2 argumentos".to_string()); }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let h = vals?.iter().map(|x| x * x).sum::<f64>().sqrt();
                Complex64::new(h, 0.0)
            }
            "clamp" => {
                if argc != 3 { return Err("clamp(x, min, max) requiere 3 argumentos".to_string()); }
                let (x, lo, hi) = (self.eval_real(&args[0])?, self.eval_real(&args[1])?, self.eval_real(&args[2])?);
                Complex64::new(x.clamp(lo, hi), 0.0)
            }
            "lerp" => {
                if argc != 3 { return Err("lerp(a, b, t) requiere 3 argumentos".to_string()); }
                let (a, b, t) = (self.eval_real(&args[0])?, self.eval_real(&args[1])?, self.eval_real(&args[2])?);
                Complex64::new(a + (b - a) * t, 0.0)
            }
            other => {
                // Check user-defined function in scope (store as Symbolic strings later)
                return Err(format!("Función desconocida: '{other}'"));
            }
        };

        Ok(Value::simplify(result))
    }
}

fn newton_raphson<F: Fn(f64) -> f64>(f: F, x0: f64, max_iter: usize) -> Result<f64, String> {
    let h = 1e-7;
    let tol = 1e-10;
    let mut x = if x0.is_finite() { x0 } else { 0.0 };
    for _ in 0..max_iter {
        let fx = f(x);
        if fx.abs() < tol { return Ok(x); }
        if !fx.is_finite() { break; }
        let dfx = (f(x + h) - f(x - h)) / (2.0 * h);
        if dfx.abs() < 1e-15 {
            // Derivative too small, try a nudge
            x += 0.1;
            continue;
        }
        let x_new = x - fx / dfx;
        if !x_new.is_finite() { break; }
        if (x_new - x).abs() < tol { return Ok(x_new); }
        x = x_new;
    }
    // Final check
    if f(x).abs() < 1e-6 { return Ok(x); }
    Err("solve(): no converge. Prueba con un valor inicial diferente (ej: solve(f, 1.0))".to_string())
}

fn gcd(a: i64, b: i64) -> i64 {
    if b == 0 { a } else { gcd(b, a % b) }
}

fn lcm(a: i64, b: i64) -> i64 {
    if a == 0 || b == 0 { 0 } else { a / gcd(a, b) * b }
}

fn n_choose_r(n: u64, r: u64) -> f64 {
    if r > n { return 0.0; }
    let r = r.min(n - r);
    let mut result = 1.0_f64;
    for i in 0..r {
        result *= (n - i) as f64;
        result /= (i + 1) as f64;
    }
    result
}

/// Execute a list of statements, mutating the scope, and return the last value.
pub fn exec_stmts(stmts: &[Stmt], scope: &mut Scope, angle_mode: &str) -> Result<Vec<(Option<String>, Value)>, String> {
    let mut results = Vec::new();
    for stmt in stmts {
        match stmt {
            Stmt::Expr(expr) => {
                let eval = Evaluator::new(scope, angle_mode);
                let val = eval.eval(expr)?;
                // Update "ans"
                scope.insert("ans".to_string(), val.clone());
                results.push((None, val));
            }
            Stmt::Assign(name, expr) => {
                let eval = Evaluator::new(scope, angle_mode);
                let val = eval.eval(expr)?;
                scope.insert(name.clone(), val.clone());
                results.push((Some(name.clone()), val));
            }
        }
    }
    Ok(results)
}

/// Evaluate a single expression string with the given scope and angle mode.
pub fn eval_str(src: &str, scope: &Scope, angle_mode: &str) -> Result<Value, String> {
    let expr = super::parser::parse_expr(src)?;
    let evaluator = Evaluator::new(scope, angle_mode);
    evaluator.eval(&expr)
}

/// Evaluate expression at a specific x value (for graphing).
pub fn eval_at_x(src: &str, x: f64, scope: &Scope, angle_mode: &str) -> Result<f64, String> {
    let expr = super::parser::parse_expr(src)?;
    let mut local_scope = scope.clone();
    local_scope.insert("x".to_string(), Value::Real(x));
    let evaluator = Evaluator::new(&local_scope, angle_mode);
    match evaluator.eval(&expr)? {
        Value::Real(r) => Ok(r),
        Value::Complex(c) if c.im.abs() < 1e-10 => Ok(c.re),
        _ => Ok(f64::NAN),
    }
}
