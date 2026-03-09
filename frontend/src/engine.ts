import {
  abs as mathAbs,
  arg as mathArg,
  cbrt as mathCbrt,
  ceil as mathCeil,
  complex as mathComplex,
  conj as mathConj,
  evaluate,
  exp as mathExp,
  floor as mathFloor,
  im as mathIm,
  log as mathLn,
  log10 as mathLog10,
  log2 as mathLog2,
  pow as mathPow,
  re as mathRe,
  round as mathRound,
  sqrt as mathSqrt,
} from "mathjs";

export type AngleMode = "DEG" | "RAD";

export interface ComplexLike {
  re: number;
  im: number;
  toString(): string;
}

export type EngineValue = number | ComplexLike;

export interface EvalResult {
  value: EngineValue;
  formatted: string;
}

const SUPERSCRIPT_TO_NORMAL: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")",
};
const SUBSCRIPT_TO_NORMAL: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};
const SUPERSCRIPT_PATTERN = /([A-Za-z0-9_.\)])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+)/g;
const BASE_LITERAL_PATTERN = /\b([0-9A-Fa-f]+)([₀₁₂₃₄₅₆₇₈₉]+)/g;

export function evalExpression(
  expr: string,
  angleMode: AngleMode,
  xVal?: number,
  extraScope: Record<string, unknown> = {},
): EvalResult {
  const d = Math.PI / 180;

  const scope: Record<string, unknown> = {
    pi: Math.PI,
    e: Math.E,
    i: mathComplex(0, 1),
    phi: (1 + Math.sqrt(5)) / 2,
    tau: 2 * Math.PI,
    inf: Infinity,
    Infinity: Infinity,
    abs: mathAbs,
    ceil: mathCeil,
    floor: mathFloor,
    round: mathRound,
    sign: Math.sign,
    sqrt: mathSqrt,
    cbrt: mathCbrt,
    exp: mathExp,
    log: mathLog10,
    log10: mathLog10,
    log2: mathLog2,
    ln: mathLn,
    pow: mathPow,
    fact: factorial,
    nthroot: (x: number, n: number) => mathPow(x, 1 / n),
    min: Math.min,
    max: Math.max,
    hypot: Math.hypot,
    gcd: gcd,
    lcm: lcm,
    nCr: ncr,
    ncr: ncr,
    nPr: npr,
    npr: npr,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    re: (value: unknown) => Number(mathRe(value as never)),
    im: (value: unknown) => Number(mathIm(value as never)),
    conj: (value: unknown) => mathConj(value as never),
    arg: (value: unknown) => {
      const radians = Number(mathArg(value as never));
      return angleMode === "DEG" ? radians / d : radians;
    },
    rand: () => Math.random(),
    ...extraScope,
  };

  if (xVal !== undefined) scope.x = xVal;

  if (angleMode === "DEG") {
    scope.sin = (x: number) => Math.sin(x * d);
    scope.cos = (x: number) => Math.cos(x * d);
    scope.tan = (x: number) => Math.tan(x * d);
    scope.asin = (x: number) => Math.asin(x) / d;
    scope.acos = (x: number) => Math.acos(x) / d;
    scope.atan = (x: number) => Math.atan(x) / d;
    scope.atan2 = (y: number, x: number) => Math.atan2(y, x) / d;
    scope.sinh = Math.sinh;
    scope.cosh = Math.cosh;
    scope.tanh = Math.tanh;
  } else {
    scope.sin = Math.sin;
    scope.cos = Math.cos;
    scope.tan = Math.tan;
    scope.asin = Math.asin;
    scope.acos = Math.acos;
    scope.atan = Math.atan;
    scope.atan2 = Math.atan2;
    scope.sinh = Math.sinh;
    scope.cosh = Math.cosh;
    scope.tanh = Math.tanh;
  }

  const cleaned = preprocess(expr);
  const raw = evaluate(cleaned, scope);

  if (raw === null || raw === undefined) throw new Error("Sin resultado");

  if (isComplexLike(raw)) {
    const normalized = normalizeComplex(raw);
    if (Math.abs(normalized.im) < 1e-12) {
      return { value: normalized.re, formatted: formatResult(normalized.re) };
    }
    return { value: normalized, formatted: formatResult(normalized) };
  }

  const num = Number(raw);
  if (isNaN(num)) throw new Error("Resultado inválido");
  if (!isFinite(num)) throw new Error(num > 0 ? "∞" : "-∞");

  return { value: num, formatted: formatResult(num) };
}

function preprocess(expr: string): string {
  return replaceBaseLiterals(
    replaceSuperscriptPowers(
      normalizeLatexSyntax(expr)
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-")
        .replace(/π/g, "pi")
        .replace(/φ/g, "phi")
        .replace(/τ/g, "tau")
        .replace(/\bRe\(/g, "re(")
        .replace(/\bIm\(/g, "im(")
        .replace(/\bArg\(/g, "arg(")
        .replace(/\bConj\(/g, "conj(")
        .replace(/\brand\b(?!\s*\()/g, "rand()")
        // factorial: 5! → fact(5)
        .replace(/(\d+\.?\d*)!/g, "fact($1)")
        // implicit multiply: 2π → 2*pi, 3( → 3*(, )(→ )*(
        .replace(/(\d)(pi|e(?![a-z])|phi|tau)/g, "$1*$2")
        .replace(/(\d)\(/g, "$1*(")
        .replace(/\)\(/g, ")*(")
        .replace(/√\(/g, "sqrt(")
        .replace(/√(\d+\.?\d*)/g, "sqrt($1)")
    )
  );
}

function normalizeLatexSyntax(expr: string): string {
  let normalized = expr
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\pi/g, "pi")
    .replace(/\\tau/g, "tau")
    .replace(/\\phi/g, "phi")
    .replace(/\\Re\b/g, "re")
    .replace(/\\Im\b/g, "im")
    .replace(/\\operatorname\{([^}]+)\}/g, "$1");

  normalized = replaceLatexFrac(normalized);
  normalized = replaceLatexCommand(normalized, "\\sqrt", value => `sqrt(${normalizeLatexSyntax(value)})`);

  return normalized
    .replace(/\\sin\b/g, "sin")
    .replace(/\\cos\b/g, "cos")
    .replace(/\\tan\b/g, "tan")
    .replace(/\\asin\b/g, "asin")
    .replace(/\\acos\b/g, "acos")
    .replace(/\\atan\b/g, "atan")
    .replace(/\\sinh\b/g, "sinh")
    .replace(/\\cosh\b/g, "cosh")
    .replace(/\\tanh\b/g, "tanh")
    .replace(/\\ln\b/g, "ln")
    .replace(/\\log\b/g, "log")
    .replace(/\\exp\b/g, "exp")
    .replace(/[{}]/g, ch => (ch === "{" ? "(" : ")"));
}

function replaceLatexFrac(expr: string): string {
  let result = "";
  let index = 0;

  while (index < expr.length) {
    const cmdIndex = expr.indexOf("\\frac", index);
    if (cmdIndex === -1) {
      result += expr.slice(index);
      break;
    }

    result += expr.slice(index, cmdIndex);
    let cursor = cmdIndex + 5;
    while (expr[cursor] === " ") cursor++;

    const numerator = readLatexGroup(expr, cursor);
    if (!numerator) {
      result += "\\frac";
      index = cursor;
      continue;
    }

    cursor = numerator.nextIndex;
    while (expr[cursor] === " ") cursor++;

    const denominator = readLatexGroup(expr, cursor);
    if (!denominator) {
      result += "\\frac";
      index = numerator.nextIndex;
      continue;
    }

    result += `((${normalizeLatexSyntax(numerator.value)})/(${normalizeLatexSyntax(denominator.value)}))`;
    index = denominator.nextIndex;
  }

  return result;
}

function replaceLatexCommand(
  expr: string,
  command: string,
  mapGroup: (value: string) => string,
): string {
  let result = "";
  let index = 0;

  while (index < expr.length) {
    const cmdIndex = expr.indexOf(command, index);
    if (cmdIndex === -1) {
      result += expr.slice(index);
      break;
    }

    result += expr.slice(index, cmdIndex);
    let cursor = cmdIndex + command.length;
    while (expr[cursor] === " ") cursor++;

    const group = readLatexGroup(expr, cursor);
    if (!group) {
      result += command;
      index = cursor;
      continue;
    }

    result += mapGroup(group.value);
    index = group.nextIndex;
  }

  return result;
}

function readLatexGroup(expr: string, start: number): { value: string; nextIndex: number } | null {
  if (expr[start] !== "{") return null;

  let depth = 1;
  let index = start + 1;

  while (index < expr.length && depth > 0) {
    if (expr[index] === "{") depth++;
    else if (expr[index] === "}") depth--;
    index++;
  }

  if (depth !== 0) return null;

  return {
    value: expr.slice(start + 1, index - 1),
    nextIndex: index,
  };
}

function replaceSuperscriptPowers(expr: string): string {
  return expr.replace(SUPERSCRIPT_PATTERN, (_, base: string, superscript: string) => {
    return `${base}^(${decodeSuperscript(superscript)})`;
  });
}

function replaceBaseLiterals(expr: string): string {
  return expr.replace(BASE_LITERAL_PATTERN, (_, digits: string, baseSubscript: string) => {
    const base = Number(decodeSubscript(baseSubscript));
    if (!Number.isInteger(base) || base < 2 || base > 36) {
      throw new Error(`Base inválida: ${base}`);
    }
    const parsed = parseInt(digits, base);
    if (Number.isNaN(parsed)) {
      throw new Error(`Número inválido para base ${base}`);
    }
    return String(parsed);
  });
}

function decodeSuperscript(value: string): string {
  return value.split("").map(ch => SUPERSCRIPT_TO_NORMAL[ch] ?? ch).join("");
}

function decodeSubscript(value: string): string {
  return value.split("").map(ch => SUBSCRIPT_TO_NORMAL[ch] ?? ch).join("");
}

export function formatResult(value: EngineValue): string {
  if (typeof value === "number") {
    return formatRealNumber(value);
  }

  const complexValue = normalizeComplex(value);
  if (Math.abs(complexValue.im) < 1e-12) {
    return formatRealNumber(complexValue.re);
  }

  const re = Math.abs(complexValue.re) < 1e-12 ? 0 : complexValue.re;
  const im = Math.abs(complexValue.im) < 1e-12 ? 0 : complexValue.im;
  const sign = im < 0 ? "−" : "+";
  const rePart = re === 0 ? "" : `${formatRealNumber(re)} ${sign} `;
  const imPart = `${formatRealNumber(Math.abs(im))}i`;

  if (re === 0) {
    return im < 0 ? `−${imPart}` : imPart;
  }

  return `${rePart}${imPart}`;
}

function formatRealNumber(n: number): string {
  if (!isFinite(n)) return n > 0 ? "∞" : "-∞";
  if (isNaN(n)) return "NaN";

  const abs = Math.abs(n);

  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    return n
      .toExponential(8)
      .replace(/\.?0+(e)/, "$1")
      .replace("e+", "e");
  }

  const rounded = parseFloat(n.toPrecision(12));
  const str = rounded.toString();

  if (Number.isInteger(rounded) && abs < 1e15) {
    return rounded.toLocaleString("es-ES");
  }

  return str;
}

export function factorizeInteger(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error("Solo se pueden factorizar enteros");
  }
  if (!Number.isSafeInteger(n)) {
    throw new Error("Número demasiado grande para factorizar con precisión");
  }
  if (Math.abs(n) < 2) {
    return String(n);
  }

  const factors: number[] = [];
  let value = Math.abs(n);

  if (n < 0) {
    factors.push(-1);
  }

  while (value % 2 === 0) {
    factors.push(2);
    value /= 2;
  }

  for (let factor = 3; factor * factor <= value; factor += 2) {
    while (value % factor === 0) {
      factors.push(factor);
      value /= factor;
    }
  }

  if (value > 1) {
    factors.push(value);
  }

  return factors.join("×");
}

function normalizeComplex(value: ComplexLike): ComplexLike {
  const re = Math.abs(value.re) < 1e-12 ? 0 : value.re;
  const im = Math.abs(value.im) < 1e-12 ? 0 : value.im;
  return { ...value, re, im };
}

function isComplexLike(value: unknown): value is ComplexLike {
  return typeof value === "object" &&
    value !== null &&
    "re" in value &&
    "im" in value &&
    typeof (value as { re: unknown }).re === "number" &&
    typeof (value as { im: unknown }).im === "number";
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error("Factorial: entero no-negativo requerido");
  if (n > 170) throw new Error("Factorial demasiado grande");
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function ncr(n: number, r: number): number {
  n = Math.round(n); r = Math.round(r);
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  r = Math.min(r, n - r);
  let result = 1;
  for (let i = 0; i < r; i++) result = result * (n - i) / (i + 1);
  return Math.round(result);
}

function npr(n: number, r: number): number {
  n = Math.round(n); r = Math.round(r);
  if (r < 0 || r > n) return 0;
  let result = 1;
  for (let i = 0; i < r; i++) result *= (n - i);
  return result;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function lcm(a: number, b: number): number {
  return Math.abs(Math.round(a) * Math.round(b)) / gcd(a, b);
}
