use crate::engine::{eval_at_x, eval_str, exec_stmts, Scope, Value};
use crate::engine::{differentiate, pretty_print};
use crate::engine::parser::{parse_expr, parse_program};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

// ── Shared CAS session state ────────────────────────────────────────────────

pub struct CasSession {
    scope: Mutex<Scope>,
    angle_mode: Mutex<String>,
}

impl Default for CasSession {
    fn default() -> Self {
        CasSession {
            scope: Mutex::new(HashMap::new()),
            angle_mode: Mutex::new("DEG".to_string()),
        }
    }
}

// ── Response types ──────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct EvalResult {
    pub ok: bool,
    pub value: String,
    pub error: Option<String>,
    /// true if the result is a function of x (symbolic expression kept)
    pub is_function: bool,
}

#[derive(Serialize)]
pub struct StmtResult {
    pub name: Option<String>,    // Some if assignment  a = ...
    pub value: String,
    pub is_function: bool,
}

#[derive(Serialize)]
pub struct GraphData {
    pub ok: bool,
    pub points: Vec<[f64; 2]>,  // [[x, y], ...]
    pub error: Option<String>,
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// Fast single-expression evaluation (no session state, for calculator modes).
#[tauri::command]
pub fn calc_eval(
    expr: String,
    angle_mode: String,
) -> EvalResult {
    let scope = HashMap::new();
    match eval_str(&expr, &scope, &angle_mode) {
        Ok(v) => EvalResult {
            ok: true,
            value: v.format(&angle_mode),
            error: None,
            is_function: false,
        },
        Err(e) => EvalResult { ok: false, value: String::new(), error: Some(e), is_function: false },
    }
}

/// CAS REPL: evaluate a (possibly multi-statement) program with persistent session.
#[tauri::command]
pub fn cas_exec(
    program: String,
    session: State<CasSession>,
) -> Result<Vec<StmtResult>, String> {
    let stmts = parse_program(&program)?;
    let angle_mode = session.angle_mode.lock().unwrap().clone();
    let mut scope = session.scope.lock().unwrap();

    let results = exec_stmts(&stmts, &mut scope, &angle_mode)?;
    Ok(results
        .into_iter()
        .map(|(name, val)| StmtResult {
            is_function: matches!(val, Value::Symbolic(_)),
            value: val.format(&angle_mode),
            name,
        })
        .collect())
}

/// Clear CAS session variables.
#[tauri::command]
pub fn cas_clear(session: State<CasSession>) {
    session.scope.lock().unwrap().clear();
}

/// Get all defined variables in the session.
#[tauri::command]
pub fn cas_vars(session: State<CasSession>) -> HashMap<String, String> {
    let scope = session.scope.lock().unwrap();
    let angle_mode = session.angle_mode.lock().unwrap().clone();
    scope
        .iter()
        .map(|(k, v)| (k.clone(), v.format(&angle_mode)))
        .collect()
}

/// Set angle mode for the CAS session.
#[tauri::command]
pub fn cas_set_angle_mode(mode: String, session: State<CasSession>) {
    *session.angle_mode.lock().unwrap() = mode;
}

/// Symbolic differentiation.
#[tauri::command]
pub fn cas_diff(expr: String, var: String) -> Result<String, String> {
    let ast = parse_expr(&expr)?;
    let deriv = differentiate(&ast, &var)?;
    Ok(pretty_print(&deriv))
}

/// Generate graph data points for a function of x.
/// Returns Vec<[x, y]> for the given x range with n points.
#[tauri::command]
pub fn calc_graph_data(
    expr: String,
    x_min: f64,
    x_max: f64,
    n: usize,
    angle_mode: String,
    session: State<CasSession>,
) -> GraphData {
    if n < 2 || x_min >= x_max {
        return GraphData { ok: false, points: vec![], error: Some("Rango inválido".to_string()) };
    }
    let scope = session.scope.lock().unwrap().clone();
    let step = (x_max - x_min) / (n - 1) as f64;
    let mut points = Vec::with_capacity(n);

    for i in 0..n {
        let x = x_min + i as f64 * step;
        match eval_at_x(&expr, x, &scope, &angle_mode) {
            Ok(y) => {
                // Only include finite points
                if y.is_finite() {
                    points.push([x, y]);
                }
            }
            Err(_) => {} // skip errors silently
        }
    }

    GraphData { ok: true, points, error: None }
}

/// Numerical integration via adaptive Simpson's rule (Rust-side, very fast).
#[tauri::command]
pub fn cas_integrate(
    expr: String,
    var: String,
    a: f64,
    b: f64,
    angle_mode: String,
    session: State<CasSession>,
) -> Result<f64, String> {
    if var != "x" {
        return Err("Por ahora solo integración respecto a x".to_string());
    }
    let scope = session.scope.lock().unwrap().clone();
    let f = |x: f64| eval_at_x(&expr, x, &scope, &angle_mode).unwrap_or(f64::NAN);
    Ok(simpsons(f, a, b, 10000))
}

fn simpsons<F: Fn(f64) -> f64>(f: F, a: f64, b: f64, n: usize) -> f64 {
    let n = if n % 2 == 0 { n } else { n + 1 };
    let h = (b - a) / n as f64;
    let mut sum = f(a) + f(b);
    for i in 1..n {
        let x = a + i as f64 * h;
        sum += if i % 2 == 0 { 2.0 * f(x) } else { 4.0 * f(x) };
    }
    h * sum / 3.0
}

