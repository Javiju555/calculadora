use super::ast::{Expr, Stmt};
use nalgebra::DMatrix;
use num_complex::Complex64;
/// Numerical evaluator.  Works over Complex<f64> for full generality;
/// results that have negligible imaginary parts are returned as real.
use std::collections::HashMap;

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
            Value::Matrix(m) if m.nrows() == 1 && m.ncols() == 1 => Complex64::new(m[(0, 0)], 0.0),
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
    if r.is_nan() {
        return "Error".to_string();
    }
    if r.is_infinite() {
        return if r > 0.0 {
            "∞".to_string()
        } else {
            "-∞".to_string()
        };
    }
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
    if im_abs < 1e-12 {
        return re;
    }
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
    if n < 0.0 || n.fract() != 0.0 {
        return f64::NAN;
    }
    let n = n as u64;
    if n > 170 {
        return f64::INFINITY;
    }
    (1..=n).map(|k| k as f64).product()
}

pub struct Evaluator<'a> {
    scope: &'a Scope,
    angle_mode: &'a str, // "DEG" | "RAD"
}

impl<'a> Evaluator<'a> {
    pub fn new(scope: &'a Scope, angle_mode: &'a str) -> Self {
        Evaluator { scope, angle_mode }
    }

    fn to_radians(&self, x: f64) -> f64 {
        if self.angle_mode == "DEG" {
            x * std::f64::consts::PI / 180.0
        } else {
            x
        }
    }

    fn from_radians(&self, x: f64) -> f64 {
        if self.angle_mode == "DEG" {
            x * 180.0 / std::f64::consts::PI
        } else {
            x
        }
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
                    // Physical constants
                    "c" | "speed_of_light" => return Ok(Value::Real(299792458.0)),
                    "h" | "planck" => return Ok(Value::Real(6.62607015e-34)),
                    "hbar" | "reduced_planck" => return Ok(Value::Real(1.054571817e-34)),
                    "G" | "gravitational" => return Ok(Value::Real(6.67430e-11)),
                    "g" | "standard_gravity" => return Ok(Value::Real(9.80665)),
                    "e_charge" | "electron_charge" => return Ok(Value::Real(1.602176634e-19)),
                    "me" | "electron_mass" => return Ok(Value::Real(9.1093837015e-31)),
                    "mp" | "proton_mass" => return Ok(Value::Real(1.67262192369e-27)),
                    "mn" | "neutron_mass" => return Ok(Value::Real(1.67492749804e-27)),
                    "Na" | "avogadro" => return Ok(Value::Real(6.02214076e23)),
                    "k" | "boltzmann" => return Ok(Value::Real(1.380649e-23)),
                    "R" | "gas_constant" => return Ok(Value::Real(8.314462618)),
                    "sigma" | "stefan_boltzmann" => return Ok(Value::Real(5.670374419e-8)),
                    "epsilon0" | "vacuum_permittivity" => return Ok(Value::Real(8.8541878128e-12)),
                    "mu0" | "vacuum_permeability" => return Ok(Value::Real(1.25663706212e-6)),
                    "alpha" | "fine_structure" => return Ok(Value::Real(7.2973525693e-3)),
                    "phi0" | "magnetic_flux_quantum" => return Ok(Value::Real(2.067833848e-15)),
                    "Ry" | "rydberg" => return Ok(Value::Real(10973731.568160)),
                    "a0" | "bohr_radius" => return Ok(Value::Real(5.29177210903e-11)),
                    "Eh" | "hartree" => return Ok(Value::Real(4.3597447222071e-18)),
                    "muB" | "bohr_magneton" => return Ok(Value::Real(9.2740100783e-24)),
                    // Chemistry constants
                    "Fa" | "faraday" => return Ok(Value::Real(96485.33212)),
                    "Vm" | "molar_volume" => return Ok(Value::Real(0.022413969545)),
                    "atm_pa" | "atm" => return Ok(Value::Real(101325.0)),
                    // Engineering
                    "rpm2rad" => return Ok(Value::Real(std::f64::consts::PI / 30.0)),
                    "rad2rpm" => return Ok(Value::Real(30.0 / std::f64::consts::PI)),
                    "deg2rad" => return Ok(Value::Real(std::f64::consts::PI / 180.0)),
                    "rad2deg" => return Ok(Value::Real(180.0 / std::f64::consts::PI)),
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
                        return Err(
                            "Las filas de la matriz tienen longitudes distintas".to_string()
                        );
                    }
                    for elem in row {
                        match self.eval(elem)? {
                            Value::Real(r) => data.push(r),
                            Value::Complex(c) if c.im.abs() < 1e-12 => data.push(c.re),
                            Value::Matrix(_) => {
                                return Err("No se admiten matrices anidadas".to_string())
                            }
                            _ => {
                                return Err(
                                    "Los elementos de la matriz deben ser reales".to_string()
                                )
                            }
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
                if argc != 1 {
                    return Err(format!("{name}() requiere 1 argumento"));
                }
                self.eval(&args[0])?.to_complex()
            }};
        }
        macro_rules! arg2 {
            () => {{
                if argc != 2 {
                    return Err(format!("{name}() requiere 2 argumentos"));
                }
                (
                    self.eval(&args[0])?.to_complex(),
                    self.eval(&args[1])?.to_complex(),
                )
            }};
        }

        // ── Matrix constructors & operations (return early with Value::Matrix) ──
        match name {
            "zeros" => {
                let (r, c) = match argc {
                    1 => {
                        let n = self.eval_real(&args[0])? as usize;
                        (n, n)
                    }
                    2 => (
                        self.eval_real(&args[0])? as usize,
                        self.eval_real(&args[1])? as usize,
                    ),
                    _ => return Err("zeros(n) o zeros(n, m)".to_string()),
                };
                return Ok(Value::Matrix(DMatrix::zeros(r, c)));
            }
            "ones" => {
                let (r, c) = match argc {
                    1 => {
                        let n = self.eval_real(&args[0])? as usize;
                        (n, n)
                    }
                    2 => (
                        self.eval_real(&args[0])? as usize,
                        self.eval_real(&args[1])? as usize,
                    ),
                    _ => return Err("ones(n) o ones(n, m)".to_string()),
                };
                return Ok(Value::Matrix(DMatrix::from_element(r, c, 1.0)));
            }
            "eye" => {
                if argc != 1 {
                    return Err("eye(n)".to_string());
                }
                let n = self.eval_real(&args[0])? as usize;
                return Ok(Value::Matrix(DMatrix::identity(n, n)));
            }
            "transpose" | "T" => {
                if argc != 1 {
                    return Err(format!("{name}(A) requiere 1 argumento"));
                }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => return Ok(Value::Matrix(m.transpose())),
                    _ => return Err(format!("{name}() requiere una matriz")),
                }
            }
            "inv" => {
                if argc != 1 {
                    return Err("inv(A) requiere 1 argumento".to_string());
                }
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
                if argc != 1 {
                    return Err("det(A) requiere 1 argumento".to_string());
                }
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
                if argc != 1 {
                    return Err("trace(A) requiere 1 argumento".to_string());
                }
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
                if argc != 1 {
                    return Err("rank(A) requiere 1 argumento".to_string());
                }
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
                if argc != 1 {
                    return Err("size(A) requiere 1 argumento".to_string());
                }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        let data = vec![m.nrows() as f64, m.ncols() as f64];
                        return Ok(Value::Matrix(DMatrix::from_row_slice(1, 2, &data)));
                    }
                    _ => return Err("size() requiere una matriz".to_string()),
                }
            }
            "rows" => {
                if argc != 1 {
                    return Err("rows(A) requiere 1 argumento".to_string());
                }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => return Ok(Value::Real(m.nrows() as f64)),
                    _ => return Err("rows() requiere una matriz".to_string()),
                }
            }
            "cols" => {
                if argc != 1 {
                    return Err("cols(A) requiere 1 argumento".to_string());
                }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => return Ok(Value::Real(m.ncols() as f64)),
                    _ => return Err("cols() requiere una matriz".to_string()),
                }
            }
            "dot" => {
                if argc != 2 {
                    return Err("dot(u, v) requiere 2 argumentos".to_string());
                }
                match (self.eval(&args[0])?, self.eval(&args[1])?) {
                    (Value::Matrix(a), Value::Matrix(b)) => {
                        let av: Vec<f64> = a.iter().cloned().collect();
                        let bv: Vec<f64> = b.iter().cloned().collect();
                        if av.len() != bv.len() {
                            return Err(
                                "dot(): los vectores deben tener la misma longitud".to_string()
                            );
                        }
                        let d: f64 = av.iter().zip(bv.iter()).map(|(x, y)| x * y).sum();
                        return Ok(Value::Real(d));
                    }
                    _ => return Err("dot() requiere dos vectores/matrices".to_string()),
                }
            }
            "cross" => {
                if argc != 2 {
                    return Err("cross(u, v) requiere 2 argumentos".to_string());
                }
                match (self.eval(&args[0])?, self.eval(&args[1])?) {
                    (Value::Matrix(a), Value::Matrix(b)) => {
                        let av: Vec<f64> = a.iter().cloned().collect();
                        let bv: Vec<f64> = b.iter().cloned().collect();
                        if av.len() != 3 || bv.len() != 3 {
                            return Err("cross() requiere vectores 3D".to_string());
                        }
                        let (ax, ay, az) = (av[0], av[1], av[2]);
                        let (bx, by, bz) = (bv[0], bv[1], bv[2]);
                        let data = vec![ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
                        return Ok(Value::Matrix(DMatrix::from_row_slice(1, 3, &data)));
                    }
                    _ => return Err("cross() requiere dos vectores 3D".to_string()),
                }
            }
            "eig" => {
                if argc != 1 {
                    return Err("eig(A) requiere 1 argumento".to_string());
                }
                match self.eval(&args[0])? {
                    Value::Matrix(m) => {
                        if m.nrows() != m.ncols() {
                            return Err("eig() requiere matriz cuadrada".to_string());
                        }
                        // Only works reliably for symmetric matrices
                        let sym = nalgebra::SymmetricEigen::new(m);
                        let mut evals: Vec<f64> = sym.eigenvalues.iter().cloned().collect();
                        evals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                        return Ok(Value::Matrix(DMatrix::from_row_slice(
                            1,
                            evals.len(),
                            &evals,
                        )));
                    }
                    _ => return Err("eig() requiere una matriz".to_string()),
                }
            }
            "linsolve" | "msolve" => {
                // linsolve(A, b) — solve Ax = b
                if argc != 2 {
                    return Err(format!("{name}(A, b) requiere 2 argumentos"));
                }
                match (self.eval(&args[0])?, self.eval(&args[1])?) {
                    (Value::Matrix(a), Value::Matrix(b)) => {
                        let lu = a.lu();
                        match lu.solve(&b) {
                            Some(x) => return Ok(Value::Matrix(x)),
                            None => {
                                return Err(
                                    "Sistema sin solución única (matriz singular)".to_string()
                                )
                            }
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
                            let ev = Evaluator {
                                scope: &ls,
                                angle_mode: am,
                            };
                            let fv = ev
                                .eval(fa)
                                .ok()
                                .and_then(|v| {
                                    if let Value::Real(r) = v {
                                        Some(r)
                                    } else {
                                        None
                                    }
                                })
                                .unwrap_or(f64::NAN);
                            let gv = ev
                                .eval(ga)
                                .ok()
                                .and_then(|v| {
                                    if let Value::Real(r) = v {
                                        Some(r)
                                    } else {
                                        None
                                    }
                                })
                                .unwrap_or(f64::NAN);
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
                        let ev = Evaluator {
                            scope: &ls,
                            angle_mode: am,
                        };
                        let fv = ev
                            .eval(fa)
                            .ok()
                            .and_then(|v| {
                                if let Value::Real(r) = v {
                                    Some(r)
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(f64::NAN);
                        let gv = ev
                            .eval(ga)
                            .ok()
                            .and_then(|v| {
                                if let Value::Real(r) = v {
                                    Some(r)
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(f64::NAN);
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
                    let ev = Evaluator {
                        scope: &ls,
                        angle_mode,
                    };
                    match ev.eval(fe) {
                        Ok(Value::Real(r)) => r,
                        Ok(Value::Complex(c)) if c.im.abs() < 1e-12 => c.re,
                        _ => f64::NAN,
                    }
                };
                let root = newton_raphson(eval_f, x0, 200)?;
                return Ok(Value::Real(root));
            }
            "taylor" | "maclaurin" => {
                // taylor(f, a, n, x) — nth-order Taylor polynomial of f around a, evaluated at x
                // maclaurin(f, n, x) — same with a = 0
                let (f_expr, a, n, x_val) = if name == "maclaurin" {
                    if argc != 3 {
                        return Err("maclaurin(f, n, x): requiere 3 argumentos".to_string());
                    }
                    let a = 0.0;
                    let n = self.eval_real(&args[1])? as usize;
                    let x_val = self.eval_real(&args[2])?;
                    (&args[0], a, n, x_val)
                } else {
                    if argc != 4 {
                        return Err("taylor(f, a, n, x): requiere 4 argumentos\n  f = expresión en x, a = centro, n = orden, x = punto de evaluación".to_string());
                    }
                    let a = self.eval_real(&args[1])?;
                    let n = self.eval_real(&args[2])? as usize;
                    let x_val = self.eval_real(&args[3])?;
                    (&args[0], a, n, x_val)
                };
                if n > 20 {
                    return Err("taylor: orden máximo 20".to_string());
                }
                let scope_c = (*self.scope).clone();
                let angle_mode = self.angle_mode;
                let f_expr = f_expr;
                let eval_f = move |t: f64| -> f64 {
                    let mut ls = scope_c.clone();
                    ls.insert("x".to_string(), Value::Real(t));
                    let ev = Evaluator { scope: &ls, angle_mode };
                    match ev.eval(f_expr) {
                        Ok(Value::Real(r)) => r,
                        Ok(Value::Complex(c)) if c.im.abs() < 1e-12 => c.re,
                        _ => f64::NAN,
                    }
                };
                // Compute Taylor polynomial: P(x) = Σ_{k=0}^{n} f^(k)(a)/k! · (x-a)^k
                let mut result = 0.0_f64;
                let mut factorial_k = 1.0_f64;
                let mut power = 1.0_f64; // (x - a)^k
                let dx = x_val - a;
                for k in 0..=n {
                    if k > 0 { factorial_k *= k as f64; }
                    let dk = numerical_derivative(&eval_f, a, k);
                    result += dk / factorial_k * power;
                    power *= dx;
                }
                return Ok(Value::Real(result));
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
                if argc < 1 {
                    return Err("min() requiere al menos 1 arg".to_string());
                }
                let mut mn = self.eval_real(&args[0])?;
                for a in &args[1..] {
                    mn = mn.min(self.eval_real(a)?);
                }
                Complex64::new(mn, 0.0)
            }
            "max" => {
                if argc < 1 {
                    return Err("max() requiere al menos 1 arg".to_string());
                }
                let mut mx = self.eval_real(&args[0])?;
                for a in &args[1..] {
                    mx = mx.max(self.eval_real(a)?);
                }
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
                if ri > ni {
                    return Ok(Value::Real(0.0));
                }
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
                if argc == 0 {
                    return Err("mean() requiere al menos 1 argumento".to_string());
                }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let vals = vals?;
                Complex64::new(vals.iter().sum::<f64>() / vals.len() as f64, 0.0)
            }
            "median" => {
                if argc == 0 {
                    return Err("median() requiere al menos 1 argumento".to_string());
                }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let mut vals = vals?;
                vals.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let n = vals.len();
                let m = if n % 2 == 0 {
                    (vals[n / 2 - 1] + vals[n / 2]) / 2.0
                } else {
                    vals[n / 2]
                };
                Complex64::new(m, 0.0)
            }
            "std" | "stdev" => {
                if argc < 2 {
                    return Err("std() requiere al menos 2 argumentos".to_string());
                }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let vals = vals?;
                let n = vals.len() as f64;
                let mean = vals.iter().sum::<f64>() / n;
                let var_ = vals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
                Complex64::new(var_.sqrt(), 0.0)
            }
            "var" | "variance" => {
                if argc < 2 {
                    return Err("var() requiere al menos 2 argumentos".to_string());
                }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let vals = vals?;
                let n = vals.len() as f64;
                let mean = vals.iter().sum::<f64>() / n;
                Complex64::new(
                    vals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0),
                    0.0,
                )
            }
            "sum" => {
                if argc == 0 {
                    return Err("sum() requiere al menos 1 argumento".to_string());
                }
                let mut s = Complex64::new(0.0, 0.0);
                for a in args {
                    s += self.eval(a)?.to_complex();
                }
                s
            }
            "prod" | "product" => {
                if argc == 0 {
                    return Err("prod() requiere al menos 1 argumento".to_string());
                }
                let mut p = Complex64::new(1.0, 0.0);
                for a in args {
                    p *= self.eval(a)?.to_complex();
                }
                p
            }
            "hypot" => {
                if argc < 2 {
                    return Err("hypot() requiere al menos 2 argumentos".to_string());
                }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let h = vals?.iter().map(|x| x * x).sum::<f64>().sqrt();
                Complex64::new(h, 0.0)
            }
            "clamp" => {
                if argc != 3 {
                    return Err("clamp(x, min, max) requiere 3 argumentos".to_string());
                }
                let (x, lo, hi) = (
                    self.eval_real(&args[0])?,
                    self.eval_real(&args[1])?,
                    self.eval_real(&args[2])?,
                );
                Complex64::new(x.clamp(lo, hi), 0.0)
            }
            "lerp" => {
                if argc != 3 {
                    return Err("lerp(a, b, t) requiere 3 argumentos".to_string());
                }
                let (a, b, t) = (
                    self.eval_real(&args[0])?,
                    self.eval_real(&args[1])?,
                    self.eval_real(&args[2])?,
                );
                Complex64::new(a + (b - a) * t, 0.0)
            }
            // ── Special functions ────────────────────────────────────────────
            "gamma" | "Γ" => {
                if argc != 1 {
                    return Err("gamma(x) requiere 1 argumento".to_string());
                }
                let x = arg1!();
                Complex64::new(gamma(x.re), 0.0)
            }
            "lngamma" | "lgamma" => {
                if argc != 1 {
                    return Err("lngamma(x) requiere 1 argumento".to_string());
                }
                let x = arg1!();
                Complex64::new(lngamma(x.re), 0.0)
            }
            "beta" | "β" => {
                if argc != 2 {
                    return Err("beta(a, b) requiere 2 argumentos".to_string());
                }
                let (a, b) = arg2!();
                Complex64::new(beta(a.re, b.re), 0.0)
            }
            "erf" => {
                if argc != 1 {
                    return Err("erf(x) requiere 1 argumento".to_string());
                }
                let x = arg1!();
                Complex64::new(erf(x.re), 0.0)
            }
            "erfc" => {
                if argc != 1 {
                    return Err("erfc(x) requiere 1 argumento".to_string());
                }
                let x = arg1!();
                Complex64::new(erfc(x.re), 0.0)
            }
            "w" | "lambertw" | "LambertW" => {
                if argc != 1 && argc != 2 {
                    return Err("w(x) o w(x, branch) requiere 1-2 argumentos".to_string());
                }
                let x = self.eval_real(&args[0])?;
                let branch = if argc == 2 {
                    self.eval_real(&args[1])? as i32
                } else {
                    0
                };
                Complex64::new(lambert_w(x, branch)?, 0.0)
            }
            "besselj" => {
                if argc != 2 {
                    return Err("besselj(n, x) requiere 2 argumentos".to_string());
                }
                let (n, x) = arg2!();
                Complex64::new(bessel_j(n.re as i32, x.re), 0.0)
            }
            "bessely" => {
                if argc != 2 {
                    return Err("bessely(n, x) requiere 2 argumentos".to_string());
                }
                let (n, x) = arg2!();
                Complex64::new(bessel_y(n.re as i32, x.re), 0.0)
            }
            "factorial" | "fact" => {
                if argc != 1 {
                    return Err("factorial(n) requiere 1 argumento".to_string());
                }
                let x = arg1!();
                Complex64::new(factorial(x.re), 0.0)
            }
            "double_factorial" | "factorial2" => {
                if argc != 1 {
                    return Err("factorial2(n) requiere 1 argumento".to_string());
                }
                let x = arg1!();
                Complex64::new(double_factorial(x.re), 0.0)
            }
            "binom" | "binomial" => {
                if argc != 2 {
                    return Err("binom(n, k) requiere 2 argumentos".to_string());
                }
                let (n, k) = arg2!();
                Complex64::new(binomial_coeff(n.re as u64, k.re as u64), 0.0)
            }
            // ── Normal distribution ───────────────────────────────────────
            "normpdf" | "npdf" => {
                if argc < 1 || argc > 3 {
                    return Err("normpdf(x, mu=0, sigma=1)".to_string());
                }
                let x = self.eval_real(&args[0])?;
                let mu = if argc >= 2 { self.eval_real(&args[1])? } else { 0.0 };
                let sigma = if argc >= 3 { self.eval_real(&args[2])? } else { 1.0 };
                if sigma <= 0.0 { return Err("normpdf: sigma debe ser > 0".to_string()); }
                let z = (x - mu) / sigma;
                let v = (-0.5 * z * z).exp() / (sigma * (2.0 * std::f64::consts::PI).sqrt());
                Complex64::new(v, 0.0)
            }
            "normcdf" | "ncdf" => {
                if argc < 1 || argc > 3 {
                    return Err("normcdf(x, mu=0, sigma=1)".to_string());
                }
                let x = self.eval_real(&args[0])?;
                let mu = if argc >= 2 { self.eval_real(&args[1])? } else { 0.0 };
                let sigma = if argc >= 3 { self.eval_real(&args[2])? } else { 1.0 };
                if sigma <= 0.0 { return Err("normcdf: sigma debe ser > 0".to_string()); }
                let z = (x - mu) / (sigma * 2.0_f64.sqrt());
                Complex64::new(0.5 * (1.0 + erf(z)), 0.0)
            }
            "norminv" | "qnorm" | "normppf" => {
                if argc < 1 || argc > 3 {
                    return Err("norminv(p, mu=0, sigma=1)".to_string());
                }
                let p = self.eval_real(&args[0])?;
                let mu = if argc >= 2 { self.eval_real(&args[1])? } else { 0.0 };
                let sigma = if argc >= 3 { self.eval_real(&args[2])? } else { 1.0 };
                Complex64::new(mu + sigma * normal_quantile(p), 0.0)
            }
            // ── Discrete distributions ────────────────────────────────────
            "poissonpmf" | "poisson_pmf" => {
                if argc != 2 {
                    return Err("poissonpmf(k, lambda)".to_string());
                }
                let k = self.eval_real(&args[0])?.round() as i64;
                let lambda = self.eval_real(&args[1])?;
                if k < 0 || lambda < 0.0 { return Ok(Value::Real(0.0)); }
                let v = (-lambda).exp() * lambda.powi(k as i32) / factorial(k as f64);
                Complex64::new(v, 0.0)
            }
            "binompmf" | "binom_pmf" => {
                if argc != 3 {
                    return Err("binompmf(k, n, p)".to_string());
                }
                let k = self.eval_real(&args[0])?.round() as u64;
                let n = self.eval_real(&args[1])?.round() as u64;
                let p = self.eval_real(&args[2])?;
                if k > n { return Ok(Value::Real(0.0)); }
                let coef = binomial_coeff(n, k);
                let v = coef * p.powi(k as i32) * (1.0 - p).powi((n - k) as i32);
                Complex64::new(v, 0.0)
            }
            // ── Decibel functions ─────────────────────────────────────────
            "db" | "todB" | "dB" => {
                if argc != 1 { return Err("db(x) — ratio potencia a dB".to_string()); }
                let x = self.eval_real(&args[0])?;
                if x <= 0.0 { return Err("db(): x debe ser > 0".to_string()); }
                Complex64::new(10.0 * x.log10(), 0.0)
            }
            "from_db" | "from_dB" | "inv_dB" => {
                if argc != 1 { return Err("from_db(dB)".to_string()); }
                let x = self.eval_real(&args[0])?;
                Complex64::new(10.0_f64.powf(x / 10.0), 0.0)
            }
            "dbm" => {
                if argc != 1 { return Err("dbm(watts)".to_string()); }
                let w = self.eval_real(&args[0])?;
                if w <= 0.0 { return Err("dbm(): potencia debe ser > 0".to_string()); }
                Complex64::new(10.0 * (w * 1000.0).log10(), 0.0)
            }
            "from_dbm" | "mw_dbm" => {
                if argc != 1 { return Err("from_dbm(dBm)".to_string()); }
                let x = self.eval_real(&args[0])?;
                Complex64::new(10.0_f64.powf(x / 10.0) / 1000.0, 0.0)
            }
            // ── Math utilities ────────────────────────────────────────────
            "nthroot" => {
                if argc != 2 { return Err("nthroot(n, x)".to_string()); }
                let n = self.eval_real(&args[0])?;
                let x = self.eval_real(&args[1])?;
                if n == 0.0 { return Err("nthroot: n ≠ 0".to_string()); }
                Complex64::new(x.signum() * x.abs().powf(1.0 / n), 0.0)
            }
            "sinc" => {
                if argc != 1 { return Err("sinc(x)".to_string()); }
                let x = self.eval_real(&args[0])?;
                Complex64::new(if x.abs() < 1e-14 { 1.0 } else { x.sin() / x }, 0.0)
            }
            "isprime" => {
                if argc != 1 { return Err("isprime(n)".to_string()); }
                let n = self.eval_real(&args[0])?.round() as i64;
                Complex64::new(if is_prime(n.unsigned_abs()) && n >= 2 { 1.0 } else { 0.0 }, 0.0)
            }
            "parallel" => {
                // Electrical parallel resistance: 1/R = 1/R1 + 1/R2 + ...
                if argc < 2 { return Err("parallel(R1, R2, ...) — resistencia paralela".to_string()); }
                let sum: f64 = args.iter()
                    .map(|a| self.eval_real(a).map(|r| 1.0 / r))
                    .collect::<Result<Vec<f64>, _>>()?
                    .iter().sum();
                if sum == 0.0 { return Err("parallel: división por cero".to_string()); }
                Complex64::new(1.0 / sum, 0.0)
            }
            "rms" => {
                // Root mean square
                if argc == 0 { return Err("rms() requiere al menos 1 argumento".to_string()); }
                let vals: Result<Vec<f64>, _> = args.iter().map(|a| self.eval_real(a)).collect();
                let vals = vals?;
                let rms = (vals.iter().map(|x| x * x).sum::<f64>() / vals.len() as f64).sqrt();
                Complex64::new(rms, 0.0)
            }
            other => {
                // Check user-defined function in scope (store as Symbolic strings later)
                return Err(format!("Función desconocida: '{other}'"));
            }
        };

        Ok(Value::simplify(result))
    }
}

/// Compute the k-th derivative of f at point a using the central-difference binomial formula.
///
/// f^(k)(a) ≈ (1/h^k) · Σ_{j=0}^{k} (-1)^(k-j) · C(k,j) · f(a + (j - k/2)·h)
///
/// h must be LARGE enough to avoid catastrophic cancellation for high k.
/// For k=6, h=0.1 → h^6=1e-6, cancellation ~1e-15/1e-6 ≈ 1e-9 relative error. Good.
/// For k=1, h=0.1 → relative error ~eps/h^2 ≈ 1e-14. Also good.
fn numerical_derivative<F: Fn(f64) -> f64>(f: &F, a: f64, k: usize) -> f64 {
    if k == 0 {
        return f(a);
    }
    // h grows slightly with k to keep h^k large enough vs machine epsilon.
    // For k≤12: h=0.1*(1+√|a|), for k>12: h=0.3*(1+√|a|).
    let scale = 1.0 + a.abs().sqrt();
    let h = if k <= 12 { 0.1 * scale } else { 0.3 * scale };
    let mut result = 0.0_f64;
    let mut binom = 1.0_f64;
    for j in 0..=k {
        let sign = if (k - j) % 2 == 0 { 1.0 } else { -1.0 };
        let xj = a + (j as f64 - 0.5 * k as f64) * h;
        result += sign * binom * f(xj);
        if j < k {
            binom *= (k - j) as f64 / (j + 1) as f64;
        }
    }
    result / h.powi(k as i32)
}

fn newton_raphson<F: Fn(f64) -> f64>(f: F, x0: f64, max_iter: usize) -> Result<f64, String> {
    let h = 1e-7;
    let tol = 1e-10;
    let mut x = if x0.is_finite() { x0 } else { 0.0 };
    for _ in 0..max_iter {
        let fx = f(x);
        if fx.abs() < tol {
            return Ok(x);
        }
        if !fx.is_finite() {
            break;
        }
        let dfx = (f(x + h) - f(x - h)) / (2.0 * h);
        if dfx.abs() < 1e-15 {
            // Derivative too small, try a nudge
            x += 0.1;
            continue;
        }
        let x_new = x - fx / dfx;
        if !x_new.is_finite() {
            break;
        }
        if (x_new - x).abs() < tol {
            return Ok(x_new);
        }
        x = x_new;
    }
    // Final check
    if f(x).abs() < 1e-6 {
        return Ok(x);
    }
    Err(
        "solve(): no converge. Prueba con un valor inicial diferente (ej: solve(f, 1.0))"
            .to_string(),
    )
}

fn gcd(a: i64, b: i64) -> i64 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

fn lcm(a: i64, b: i64) -> i64 {
    if a == 0 || b == 0 {
        0
    } else {
        a / gcd(a, b) * b
    }
}

fn n_choose_r(n: u64, r: u64) -> f64 {
    if r > n {
        return 0.0;
    }
    let r = r.min(n - r);
    let mut result = 1.0_f64;
    for i in 0..r {
        result *= (n - i) as f64;
        result /= (i + 1) as f64;
    }
    result
}

// ── Special Functions ──────────────────────────────────────────────────────────

fn gamma(x: f64) -> f64 {
    if x <= 0.0 && x.fract() == 0.0 {
        return f64::INFINITY;
    }
    if x < 0.5 {
        let pi = std::f64::consts::PI;
        pi / ((pi * x).sin() * gamma(1.0 - x))
    } else {
        // Lanczos approximation, g=7, 9-term (Spouge/Wikipedia).
        // All 9 coefficients c0..c8 must be included.
        let xm1 = x - 1.0; // y = z - 1
        let c0 = 0.99999999999980993;
        let c1 = 676.5203681218851;
        let c2 = -1259.1392167224028;
        let c3 = 771.32342877765313;
        let c4 = -176.61502916214059;
        let c5 = 12.507343278686905;
        let c6 = -0.13857109526572012;
        let c7 = 9.9843695780195716e-6;
        let c8 = 1.5056327351493116e-7;
        let sum_val = c0
            + c1 / (xm1 + 1.0)
            + c2 / (xm1 + 2.0)
            + c3 / (xm1 + 3.0)
            + c4 / (xm1 + 4.0)
            + c5 / (xm1 + 5.0)
            + c6 / (xm1 + 6.0)
            + c7 / (xm1 + 7.0)
            + c8 / (xm1 + 8.0);
        let t = xm1 + 7.5; // g=7, so t = y + g + 0.5
        let sqrt_2pi = (2.0 * std::f64::consts::PI).sqrt();
        sqrt_2pi * t.powf(xm1 + 0.5) * (-t).exp() * sum_val
    }
}

fn lngamma(x: f64) -> f64 {
    if x <= 0.0 && x.fract() == 0.0 {
        return f64::INFINITY;
    }
    if x < 0.5 {
        let pi = std::f64::consts::PI;
        return (pi / ((pi * x).sin())).ln() - lngamma(1.0 - x);
    }
    // Lanczos, same g=7 coefficients as gamma().
    // y = x - 1, so Γ(x) = Γ(y+1).
    // ln Γ(z) = 0.5·ln(2π) + (y+0.5)·ln(t) - t + ln(A(y))
    // where y = z-1, t = y + g + 0.5 = x + 6.5  (g=7).
    let y = x - 1.0;
    let t = y + 7.5; // g=7: t = y + g + 0.5
    let ser = 0.99999999999980993
        + 676.5203681218851    / (y + 1.0)
        - 1259.1392167224028   / (y + 2.0)
        + 771.32342877765313   / (y + 3.0)
        - 176.61502916214059   / (y + 4.0)
        + 12.507343278686905   / (y + 5.0)
        - 0.13857109526572012  / (y + 6.0)
        + 9.9843695780195716e-6 / (y + 7.0)
        + 1.5056327351493116e-7 / (y + 8.0);
    let ln_sqrt_2pi = 0.9189385332046727; // 0.5 * ln(2π)
    ln_sqrt_2pi + (y + 0.5) * t.ln() - t + ser.ln()
}

fn beta(a: f64, b: f64) -> f64 {
    (gamma(a) * gamma(b)) / gamma(a + b)
}

fn erf(x: f64) -> f64 {
    // A&S 7.1.26 / Numerical Recipes:
    //   erfc(x) = t · exp(-x² + poly(t)),  t = 1/(1 + 0.5·|x|)
    // poly(t) = p0 + p1·t + p2·t² + ... + p9·t⁹   (p0 is a constant, NOT multiplied by x²)
    if x == 0.0 {
        return 0.0;
    }
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let ax = x.abs();
    if ax >= 6.0 {
        return sign;
    }
    let t = 1.0 / (1.0 + 0.5 * ax);
    let poly = -1.26551223
        + t * (1.00002368
        + t * (0.37409196
        + t * (0.09678418
        + t * (-0.18628806
        + t * (0.27886807
        + t * (-1.13520398
        + t * (1.48851587
        + t * (-0.82215223
        + t * 0.17087277))))))));
    // erfc(x) = t · exp(poly - x²),  so erf(x) = 1 - erfc(|x|)
    let erfc_x = t * (poly - ax * ax).exp();
    sign * (1.0 - erfc_x)
}

fn erfc(x: f64) -> f64 {
    1.0 - erf(x)
}

fn lambert_w(x: f64, branch: i32) -> Result<f64, String> {
    let e_inv = 1.0 / std::f64::consts::E;
    if branch == 0 {
        if x < -e_inv {
            return Err("w(x): valor fuera de dominio para W0".to_string());
        }
        if x == 0.0 {
            return Ok(0.0);
        }
        if (x + e_inv).abs() < 1e-15 {
            return Ok(-1.0);
        }
        let w = if x < 0.0 && x > -e_inv {
            let p = (2.0 * std::f64::consts::E * x + 2.0).sqrt();
            -1.0 - p + (2.0 / 3.0) * p * p - (11.0 / 36.0) * p * p * p
        } else if x < 3.0 {
            x.ln()
        } else {
            x.ln() - x.ln().ln()
        };
        let mut w = w;
        for _ in 0..20 {
            let ew = w.exp();
            let diff = w * ew - x;
            if diff.abs() < 1e-15 {
                break;
            }
            w -= diff / (ew * (w + 1.0));
        }
        Ok(w)
    } else if branch == -1 {
        if x > 0.0 || x < -e_inv {
            return Err("w(x, -1): x debe estar en [-1/e, 0)".to_string());
        }
        if (x + e_inv).abs() < 1e-15 {
            return Ok(-1.0);
        }
        let p = (-2.0 * (x * std::f64::consts::E + 1.0)).sqrt();
        let mut w = -1.0 - p - (2.0 / 3.0) * p + (11.0 / 36.0) * p * p;
        for _ in 0..20 {
            let ew = w.exp();
            let diff = w * ew - x;
            if diff.abs() < 1e-15 {
                break;
            }
            w -= diff / (ew * (w + 1.0));
        }
        Ok(w)
    } else {
        Err(format!(
            "w(x, branch): branch debe ser 0 o -1, got {}",
            branch
        ))
    }
}

fn bessel_j0(x: f64) -> f64 {
    let ax = x.abs();
    if ax == 0.0 {
        return 1.0;
    }
    if ax < 8.0 {
        // Rational polynomial approximation (NR §6.5): degree-5 numerator, degree-5 denominator.
        // p6=1.0 was a spurious extra term — the reference has 6 coefficients, not 7.
        let y = x * x;
        let p0 = 57568490574.0_f64;
        let p1 = -13362590354.0;
        let p2 = 651619640.7;
        let p3 = -11214424.18;
        let p4 = 77392.33017;
        let p5 = -184.9052456; // leading coefficient
        let q0 = 57568490411.0_f64;
        let q1 = 1029532985.0;
        let q2 = 9494680.718;
        let q3 = 59272.64853;
        let q4 = 267.8532712;
        let q5 = 1.0;
        let p = ((((p5 * y + p4) * y + p3) * y + p2) * y + p1) * y + p0;
        let q = ((((q5 * y + q4) * y + q3) * y + q2) * y + q1) * y + q0;
        p / q
    } else {
        // Asymptotic expansion: J0(x) ≈ sqrt(2/πx)·[P0·cos(x-π/4) - Q0·sin(x-π/4)]
        // xx = x - π/4 is the phase; z = 8/x; y = z² (used in the polynomial corrections).
        // The trig functions must be evaluated at xx, NOT at y.
        let z = 8.0 / ax;
        let y = z * z;
        let xx = ax - 0.785398164; // ax - π/4
        let p0 = 1.0_f64;
        let p1 = -0.1098628627e-2;
        let p2 = 0.2734510407e-4;
        let p3 = -0.2073370639e-5;
        let p4 = 0.2093887211e-6;
        let q0 = -0.1562499995e-1;
        let q1 = 0.1430488765e-3;
        let q2 = -0.6911147651e-5;
        let q3 = 0.7621095161e-6;
        let q4 = -0.934935152e-7;
        let p = (((p4 * y + p3) * y + p2) * y + p1) * y + p0;
        let q = (((q4 * y + q3) * y + q2) * y + q1) * y + q0;
        (0.636619772 / ax).sqrt() * (xx.cos() * p - z * xx.sin() * q)
    }
}

fn bessel_j1(x: f64) -> f64 {
    let ax = x.abs();
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    if ax < 8.0 {
        // NR §6.5: degree-5 rational polynomial, J1(x) = x * num(y) / den(y), y = x²
        // Signs on a3 and a5 were wrong in the original; a6 was a spurious extra term.
        let y = x * x;
        let a0 = 72362614232.0_f64;
        let a1 = -7895059235.0;
        let a2 = 242396853.1;
        let a3 = -2972611.439;
        let a4 = 15704.48260;
        let a5 = -30.3602086;
        let b0 = 144725228442.0_f64;
        let b1 = 2300535178.0;
        let b2 = 18583304.74;
        let b3 = 99447.43394;
        let b4 = 376.9991397;
        let b5 = 1.0;
        let a = ((((a5 * y + a4) * y + a3) * y + a2) * y + a1) * y + a0;
        let b = ((((b5 * y + b4) * y + b3) * y + b2) * y + b1) * y + b0;
        sign * x * a / b
    } else {
        let z = 8.0 / ax;
        let y = z * z;
        let xx = ax - 2.356194491;
        let p0 = 1.0_f64;
        let p1 = 0.183105e-2;
        let p2 = -0.3516396496e-4;
        let p3 = 0.2457520174e-5;
        let p4 = -0.240337019e-6;
        let q0 = 0.04687499995;
        let q1 = -0.2002690873e-3;
        let q2 = 0.8449199096e-5;
        let q3 = -0.88228987e-6;
        let q4 = 0.105787413e-6;
        let p = (((p4 * y + p3) * y + p2) * y + p1) * y + p0;
        let q = (((q4 * y + q3) * y + q2) * y + q1) * y + q0 ;
        let result = (0.636619772 / ax).sqrt() * (xx.cos() * p - z * xx.sin() * q);
        sign * result
    }
}

fn bessel_j(n: i32, x: f64) -> f64 {
    let n = n.abs() as usize;
    if n == 0 { return bessel_j0(x); }
    if n == 1 { return bessel_j1(x); }
    if x == 0.0 { return 0.0; }

    // Miller's backward recurrence starting from order m >> n.
    // We normalize using the known J0(x) from our accurate bessel_j0().
    // At each step j (going from m-1 down to 0):
    //   b_{j} = 2*(j+1)/x * b_{j+1} - b_{j+2}
    // After j==n the current bj holds the unnormalized b_n.
    // After j==0 the current bj holds the unnormalized b_0 ≡ J0 reference.
    let ax = x.abs();
    let m = 2 * (n + (ax as usize).max(15)) + 10;
    let mut bjp = 0.0_f64; // b_{j+2}
    let mut bj  = 1.0_f64; // b_{j+1}  (arbitrary start)
    let mut bjn = 0.0_f64; // captured at j == n
    let mut bj0 = 0.0_f64; // captured at j == 0  (≡ unnormalized J0)

    for j in (0..m).rev() {
        let bjm = 2.0 * (j + 1) as f64 / x * bj - bjp;
        bjp = bj;
        bj  = bjm;
        // Rescale to prevent floating-point overflow/underflow during the sweep
        if bj.abs() > 1e150 {
            bj  *= 1e-150;
            bjp *= 1e-150;
            bjn *= 1e-150;
            bj0 *= 1e-150;
        }
        // Capture the value at the requested order and at order 0
        if j == n { bjn = bj; }
        if j == 0 { bj0 = bj; }
    }

    if bj0.abs() < 1e-300 { return 0.0; }
    // Normalize so that the unnormalized J0 matches the known-good J0(x)
    bjn * bessel_j0(x) / bj0
}

fn bessel_y0(x: f64) -> f64 {
    // Cephes j0.c coefficients (used by SciPy). Accurate to ~1e-15.
    if x <= 5.0 {
        // Y0(x) = polevl(x², YP, 7) / p1evl(x², YQ, 7) + (2/π)·ln(x)·J0(x)
        // where polevl(z,a,n) = a[0]*z^n + ... + a[n]  and  p1evl prepends implicit 1.
        let z = x * x;
        // YP: 8 coefficients (degree 7), evaluated via Horner in z
        let yp = ((((((( 1.55924361307847716443e4_f64
            * z - 1.46639295903971606143e7)
            * z + 5.43526477051876500544e9)
            * z - 9.82136065717911316429e11)
            * z + 8.75906394395366999549e13)
            * z - 3.46628303384729719441e15)
            * z + 4.42733268572569800351e16)
            * z - 1.84950800436986690637e16);
        // YQ: implicit leading 1, then 7 explicit coefficients (degree 7)
        let yq = (((((( z
            + 1.04128353664259848412e3)
            * z + 6.26107330437134956842e5)
            * z + 2.68919633393814121987e8)
            * z + 8.64002487103935000337e10)
            * z + 2.02979612750105546709e13)
            * z + 3.17157752842975028269e15)
            * z + 2.50596256172653059228e17;
        yp / yq + 0.636619772 * x.ln() * bessel_j0(x)
    } else {
        // Asymptotic: Y0(x) ≈ sqrt(2/πx)·[P0·sin(x-π/4) + Q0·cos(x-π/4)]
        let z = 8.0 / x;
        let y = z * z;
        let xx = x - 0.785398164; // x - π/4
        let p = (((( 0.2093887211e-6 * y - 0.2073370639e-5) * y + 0.2734510407e-4) * y - 0.1098628627e-2) * y + 1.0);
        let q = (((-0.934935152e-7 * y + 0.7621095161e-6) * y - 0.6911147651e-5) * y + 0.1430488765e-3) * y - 0.1562499995e-1;
        (0.636619772 / x).sqrt() * (xx.sin() * p + z * xx.cos() * q)
    }
}

fn bessel_y1(x: f64) -> f64 {
    // Cephes j1.c coefficients (used by SciPy). Accurate to ~1e-15.
    if x <= 5.0 {
        // Y1(x) = x·polevl(x², YP, 5) / p1evl(x², YQ, 8) + (2/π)·(J1(x)·ln(x) - 1/x)
        let z = x * x;
        // YP: 6 coefficients (degree 5)
        let yp = (((( 1.26320474790178026440e9_f64
            * z - 6.47355876379160291031e11)
            * z + 1.14509511541823727877e14)
            * z - 8.12770255501325109621e15)
            * z + 2.02439475713594898196e17)
            * z - 7.78877196265950026825e17;
        // YQ: implicit leading 1, then 8 explicit coefficients (degree 8)
        let yq = ((((((( z
            + 5.94301592346128195359e2)
            * z + 1.61174538508025372494e5)
            * z + 2.57866567748242287823e7)
            * z + 2.31171260501843076499e9)
            * z + 1.17151928629956830932e11)
            * z + 3.79805041012952290910e13)
            * z + 9.38472218587395656651e15)
            * z + 2.52070205858023719784e17;
        x * yp / yq + 0.636619772 * (bessel_j1(x) * x.ln() - 1.0 / x)
    } else {
        // Asymptotic: Y1(x) ≈ sqrt(2/πx)·[P1·sin(x-3π/4) + Q1·cos(x-3π/4)]
        let z = 8.0 / x;
        let y = z * z;
        let xx = x - 2.356194491; // x - 3π/4
        let p = (((-0.240337019e-6 * y + 0.2457520174e-5) * y - 0.3516396496e-4) * y + 0.183105e-2) * y + 1.0;
        let q = (((0.105787413e-6 * y - 0.88228987e-6) * y + 0.8449199096e-5) * y - 0.2002690873e-3) * y + 0.04687499995;
        (0.636619772 / x).sqrt() * (xx.sin() * p + z * xx.cos() * q)
    }
}

fn bessel_y(n: i32, x: f64) -> f64 {
    let n = n.abs() as usize;
    if n == 0 {
        return bessel_y0(x);
    }
    if n == 1 {
        return bessel_y1(x);
    }
    (bessel_j(n as i32, x) * bessel_y1(x) - bessel_j((n - 1) as i32, x) * bessel_y0(x)) * 2.0 / x
}

fn double_factorial(x: f64) -> f64 {
    if x.fract() != 0.0 {
        return f64::NAN;
    }
    let n = x as i64;
    if n < 0 {
        if n == -1 || n == -3 {
            return 1.0;
        }
        return f64::NAN;
    }
    let mut result = 1.0;
    let mut k = n;
    while k > 1 {
        result *= k as f64;
        k -= 2;
    }
    result
}

/// Inverse normal CDF (Peter Acklam's rational approximation — max error 1.15e-9)
fn normal_quantile(p: f64) -> f64 {
    if p <= 0.0 { return f64::NEG_INFINITY; }
    if p >= 1.0 { return f64::INFINITY; }

    let a = [
        -3.969683028665376e1_f64,  2.209460984245205e2,
        -2.759285104469687e2,      1.383577518672690e2,
        -3.066479806614716e1,      2.506628277459239,
    ];
    let b = [
        -5.447609879822406e1_f64, 1.615858368580409e2,
        -1.556989798598866e2,     6.680131188771972e1,
        -1.328068155288572e1,
    ];
    let c = [
        -7.784894002430293e-3_f64, -3.223964580411365e-1,
        -2.400758277161838,        -2.549732539343734,
         4.374664141464968,         2.938163982698783,
    ];
    let d = [
        7.784695709041462e-3_f64, 3.224671290700398e-1,
        2.445134137142996,        3.754408661907416,
    ];

    let p_lo = 0.02425_f64;
    let p_hi = 1.0 - p_lo;

    if p < p_lo {
        let q = (-2.0 * p.ln()).sqrt();
        (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
        ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0)
    } else if p <= p_hi {
        let q = p - 0.5;
        let r = q * q;
        (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
        (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1.0)
    } else {
        let q = (-2.0 * (1.0 - p).ln()).sqrt();
        -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
         ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0)
    }
}

fn is_prime(n: u64) -> bool {
    if n < 2 { return false; }
    if n == 2 || n == 3 { return true; }
    if n % 2 == 0 || n % 3 == 0 { return false; }
    let mut i = 5u64;
    while i * i <= n {
        if n % i == 0 || n % (i + 2) == 0 { return false; }
        i += 6;
    }
    true
}

fn binomial_coeff(n: u64, k: u64) -> f64 {
    if k > n {
        return 0.0;
    }
    if k == 0 || k == n {
        return 1.0;
    }
    let k = k.min(n - k);
    (1..=k).fold(1.0_f64, |acc, i| acc * (n - k + i) as f64 / i as f64)
}

/// Execute a list of statements, mutating the scope, and return the last value.
pub fn exec_stmts(
    stmts: &[Stmt],
    scope: &mut Scope,
    angle_mode: &str,
) -> Result<Vec<(Option<String>, Value)>, String> {
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
// Paste at end of eval.rs temporarily to test, then remove
#[cfg(test)]
mod special_fn_tests {
    use super::*;

    fn rel_err(got: f64, expected: f64) -> f64 {
        ((got - expected) / expected).abs()
    }

    #[test]
    fn test_gamma() {
        // Γ(1) = 1, Γ(0.5) = √π, Γ(5) = 24, Γ(1.5) = √π/2
        assert!(rel_err(gamma(1.0), 1.0) < 1e-12, "gamma(1)={}", gamma(1.0));
        assert!(rel_err(gamma(0.5), std::f64::consts::PI.sqrt()) < 1e-12, "gamma(0.5)={}", gamma(0.5));
        assert!(rel_err(gamma(5.0), 24.0) < 1e-12, "gamma(5)={}", gamma(5.0));
        assert!(rel_err(gamma(1.5), std::f64::consts::PI.sqrt() / 2.0) < 1e-12, "gamma(1.5)={}", gamma(1.5));
    }

    #[test]
    fn test_lngamma() {
        // ln Γ(1)=0, ln Γ(5)=ln(24)
        assert!(lngamma(1.0).abs() < 1e-12, "lngamma(1)={}", lngamma(1.0));
        assert!(rel_err(lngamma(5.0), 24.0_f64.ln()) < 1e-12, "lngamma(5)={}", lngamma(5.0));
        // cross-check with gamma
        for x in [0.5_f64, 1.0, 2.0, 5.0, 10.0, 20.0] {
            let diff = (lngamma(x) - gamma(x).ln()).abs();
            assert!(diff < 1e-10, "lngamma({x}) vs ln(gamma({x})): diff={diff}");
        }
    }

    #[test]
    fn test_erf() {
        // erf(0)=0, erf(∞)=1, erf(1)≈0.8427007929, erf(-1)=-erf(1)
        assert!(erf(0.0).abs() < 1e-15, "erf(0)={}", erf(0.0));
        assert!(rel_err(erf(1.0), 0.8427007929497148) < 1e-8, "erf(1)={}", erf(1.0));
        assert!(rel_err(erf(-1.0), -0.8427007929497148) < 1e-8, "erf(-1)={}", erf(-1.0));
        assert!(rel_err(erf(3.0), 0.9999779095030014) < 1e-7, "erf(3)={}", erf(3.0));
    }

    #[test]
    fn test_bessel_j0() {
        // J0(0)=1, J0(2.4048)≈0, J0(2)≈0.22389
        assert!(rel_err(bessel_j0(0.0), 1.0) < 1e-10, "J0(0)={}", bessel_j0(0.0));
        assert!(bessel_j0(2.4048255576957727).abs() < 1e-5, "J0(first zero)={}", bessel_j0(2.4048255576957727));
        assert!(rel_err(bessel_j0(2.0), 0.2238907791412357) < 1e-6, "J0(2)={}", bessel_j0(2.0)); // NR deg-5 poly ≈1e-7 accuracy
        // Large x
        assert!(rel_err(bessel_j0(10.0), -0.24593576445134832) < 1e-8, "J0(10)={}", bessel_j0(10.0));
    }

    #[test]
    fn test_bessel_j1() {
        assert!(bessel_j1(0.0).abs() < 1e-15, "J1(0)={}", bessel_j1(0.0));
        assert!(rel_err(bessel_j1(1.0), 0.44005058574493355) < 1e-8, "J1(1)={}", bessel_j1(1.0));
        assert!(rel_err(bessel_j1(10.0), 0.04347274616886144) < 1e-7, "J1(10)={}", bessel_j1(10.0));
    }

    #[test]
    fn test_bessel_jn() {
        // J2(1)≈0.11490348, J3(3)≈0.30906272
        assert!(rel_err(bessel_j(2, 1.0), 0.11490348493190048) < 1e-6, "J2(1)={}", bessel_j(2, 1.0));
        assert!(rel_err(bessel_j(3, 3.0), 0.30906272225525164) < 1e-6, "J3(3)={}", bessel_j(3, 3.0));
    }

    #[test]
    fn test_bessel_y0() {
        // Y0(1)≈0.08825696, Y0(2)≈0.10703243, Y0(5)≈-0.30851763
        assert!(rel_err(bessel_y0(1.0), 0.08825696421567695) < 1e-7, "Y0(1)={}", bessel_y0(1.0));
        assert!(rel_err(bessel_y0(2.0), 0.1070324315409375) < 1e-7, "Y0(2)={}", bessel_y0(2.0));
        assert!(rel_err(bessel_y0(5.0), -0.3085176252490338) < 1e-7, "Y0(5)={}", bessel_y0(5.0));
        // Large x
        assert!(rel_err(bessel_y0(10.0), 0.05567116728359490) < 1e-7, "Y0(10)={}", bessel_y0(10.0));
    }

    #[test]
    fn test_bessel_y1() {
        // Y1(1)≈-0.78121282, Y1(2)≈-0.10703243, Y1(5)≈0.14786314
        assert!(rel_err(bessel_y1(1.0), -0.7812128213002888) < 1e-7, "Y1(1)={}", bessel_y1(1.0));
        assert!(rel_err(bessel_y1(2.0), -0.10703243154093754) < 1e-7, "Y1(2)={}", bessel_y1(2.0));
        assert!(rel_err(bessel_y1(5.0), 0.14786314339122693) < 1e-7, "Y1(5)={}", bessel_y1(5.0));
        assert!(rel_err(bessel_y1(10.0), 0.24901542420695388) < 1e-7, "Y1(10)={}", bessel_y1(10.0));
    }

    #[test]
    fn test_numerical_derivative() {
        // sin'(x) = cos(x): at x=1, expected cos(1)≈0.5403023
        let dk = numerical_derivative(&f64::sin, 1.0, 1);
        assert!(rel_err(dk, 1.0_f64.cos()) < 1e-6, "sin'(1)={dk}");
        // sin''(x) = -sin(x): at x=1, expected -sin(1)≈-0.8414710
        let dk2 = numerical_derivative(&f64::sin, 1.0, 2);
        assert!(rel_err(dk2, -1.0_f64.sin()) < 1e-4, "sin''(1)={dk2}");
        // exp'(x) = exp(x): at x=0.5, expected exp(0.5)
        let dexp = numerical_derivative(&f64::exp, 0.5, 1);
        assert!(rel_err(dexp, 0.5_f64.exp()) < 1e-6, "exp'(0.5)={dexp}");
    }

    #[test]
    fn test_taylor_polynomial() {
        // Taylor of sin(x) around 0 up to order 5, evaluated at x=0.5
        // sin(0.5) ≈ 0.4794255386 (exact)
        // P5(0.5) = 0.5 - 0.5³/6 + 0.5⁵/120 ≈ 0.47942708...
        let scope = Scope::new();
        let ev = Evaluator { scope: &scope, angle_mode: "rad" };
        use super::super::parser::parse_expr;
        let expr = parse_expr("taylor(sin(x), 0, 5, 0.5)").unwrap();
        match ev.eval(&expr) {
            Ok(Value::Real(r)) => {
                // P5(0.5) should be within 1e-4 of sin(0.5)
                assert!((r - 0.5_f64.sin()).abs() < 1e-4, "taylor sin(x) at 0.5 = {r}");
            }
            other => panic!("expected Real, got {:?}", other),
        }
        // Maclaurin of cos(x) order 6 at x=1: cos(1)≈0.5403023
        let expr2 = parse_expr("maclaurin(cos(x), 6, 1)").unwrap();
        match ev.eval(&expr2) {
            Ok(Value::Real(r)) => {
                assert!((r - 1.0_f64.cos()).abs() < 1e-4, "maclaurin cos(x) at 1 = {r}");
            }
            other => panic!("expected Real, got {:?}", other),
        }
    }
}
