/**
 * CAS (Computer Algebra System) — Tauri backend bridge.
 *
 * All heavy computation runs in Rust via tauri invoke().
 * This module exposes typed wrappers.
 */
import { invoke } from "@tauri-apps/api/core";

export interface EvalResult {
  ok: boolean;
  value: string;
  error?: string;
  is_function: boolean;
}

export interface StmtResult {
  name?: string;   // defined for assignments  a = expr
  value: string;
  is_function: boolean;
}

export interface GraphData {
  ok: boolean;
  points: [number, number][];
  error?: string;
}

/** Fast single-expression evaluation (no session). */
export async function calcEval(expr: string, angleMode: string): Promise<EvalResult> {
  return invoke<EvalResult>("calc_eval", { expr, angleMode });
}

/** CAS REPL: run a (multi-line) program, returns per-statement results. */
export async function casExec(program: string): Promise<StmtResult[]> {
  return invoke<StmtResult[]>("cas_exec", { program });
}

/** Clear all session variables. */
export async function casClear(): Promise<void> {
  return invoke("cas_clear");
}

/** Get all defined variables as name → formatted-value map. */
export async function casVars(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("cas_vars");
}

/** Set the angle mode for the CAS session. */
export async function casSetAngleMode(mode: "DEG" | "RAD"): Promise<void> {
  return invoke("cas_set_angle_mode", { mode });
}

/** Symbolic differentiation: returns pretty-printed derivative string. */
export async function casDiff(expr: string, variable = "x"): Promise<string> {
  return invoke<string>("cas_diff", { expr, var: variable });
}

/** Compute graph data points from Rust (much faster for heavy functions). */
export async function calcGraphData(
  expr: string,
  xMin: number,
  xMax: number,
  n = 600,
  angleMode = "DEG",
): Promise<GraphData> {
  return invoke<GraphData>("calc_graph_data", { expr, xMin, xMax, n, angleMode });
}

/** Numerical integration ∫_a^b expr d(var) */
export async function casIntegrate(
  expr: string,
  variable: string,
  a: number,
  b: number,
  angleMode = "DEG",
): Promise<number> {
  return invoke<number>("cas_integrate", { expr, var: variable, a, b, angleMode });
}
