import "./style.css";
import {
  evalExpression,
  factorizeInteger,
  formatResult,
  type AngleMode,
  type EngineValue,
} from "./engine.ts";
import { CATEGORIES, convert, formatConvResult } from "./converter.ts";
import { createGrapher, type FnEntry } from "./grapher.ts";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

// ── Types ──────────────────────────────────────────────────────────────
type Mode = "basic" | "scientific" | "conversions" | "graph";
type NumberMode = "normal" | "sup" | "sub";

interface HistoryEntry {
  expr: string;
  result: string;
}

interface CalcState {
  mode: Mode;
  angleMode: AngleMode;
  numberMode: NumberMode;
  input: string;
  history: HistoryEntry[];
  lastAns: EngineValue;
  freshResult: boolean;
}

// ── State ──────────────────────────────────────────────────────────────
const state: CalcState = {
  mode: "basic",
  angleMode: "DEG",
  numberMode: "normal",
  input: "",
  history: [],
  lastAns: 0,
  freshResult: false,
};

// Undo / redo stacks for calc input
const inputUndoStack: string[] = [];
const inputRedoStack: string[] = [];

function pushUndo(prev: string): void {
  inputUndoStack.push(prev);
  inputRedoStack.length = 0;
}

function getExprInput(): HTMLInputElement | null {
  return document.getElementById("disp-expr") as HTMLInputElement | null;
}

// Insert text at cursor position (or replace selection), respecting freshResult
function insertAtCursor(text: string): void {
  const el = getExprInput();
  const start = el ? (el.selectionStart ?? el.value.length) : state.input.length;
  const end = el ? (el.selectionEnd ?? start) : start;
  state.input = state.input.slice(0, start) + text + state.input.slice(end);
  updateDisplay(undefined, undefined, start + text.length);
}

// Conversion state
let convCatId = "length";
let convFromId = "m";
let convToId = "km";
let convFromVal = "";
let convToVal = "";

// Graph state
const GRAPH_PALETTE = ["#3858e8", "#e02858", "#18d880", "#f0a030", "#9035d8", "#18b8c8"];
let graphFunctions: FnEntry[] = [
  { expr: "", color: "#3858e8" },
  { expr: "", color: "#e02858" },
];
let grapherInstance: ReturnType<typeof createGrapher> | null = null;
let sideGrapherInstance: ReturnType<typeof createGrapher> | null = null;
let historyOpen = false;
let sidePanelOpen = false;

const HISTORY_PANEL_WIDTH = 300;
const SIDE_PANEL_WIDTH = 360;
const WINDOW_SIZES: Record<Mode, [number, number]> = {
  basic: [440, 660],
  scientific: [700, 820],
  conversions: [440, 660],
  graph: [980, 760],
};

// Disable context menu (no reload/inspect in production)
window.addEventListener("contextmenu", e => e.preventDefault());

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};
const SUBSCRIPT_DIGITS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
};

// ── DOM refs ───────────────────────────────────────────────────────────
const appEl = document.querySelector<HTMLDivElement>("#app")!;

// ── Boot ───────────────────────────────────────────────────────────────
buildShell();
setMode("basic");

// ── Shell (titlebar + tabs) ────────────────────────────────────────────
function buildShell(): void {
  appEl.innerHTML = `
    <div class="titlebar">
      <div class="titlebar-drag" data-tauri-drag-region>
        <div class="titlebar-icon">∑</div>
        <span class="titlebar-title">Calculadora</span>
      </div>
      <div class="titlebar-controls">
        <button class="titlebar-btn" id="side-panel-toggle" title="Gráfica lateral">◫</button>
        <button class="titlebar-btn" id="history-toggle" title="Historial">⌛</button>
        <button class="titlebar-btn minimize" title="Minimizar">─</button>
        <button class="titlebar-btn close" title="Cerrar">✕</button>
      </div>
    </div>
    <div class="mode-tabs">
      ${(["basic", "scientific", "conversions", "graph"] as Mode[]).map(m => `
        <button class="mode-tab" data-mode="${m}">${tabLabel(m)}</button>
      `).join("")}
    </div>
    <div class="app-container">
      <div class="app-main">
        <div id="content"></div>
      </div>
      <div class="history-sidebar" id="history-sidebar">
        <div class="history-sidebar-header">
          <span class="history-sidebar-title">Historial</span>
          <button class="history-sidebar-clear" id="history-sidebar-clear">Limpiar</button>
          <button class="history-sidebar-close" id="history-sidebar-close">✕</button>
        </div>
        <div class="history-sidebar-list" id="history-sidebar-list"></div>
      </div>
      <div class="side-panel" id="side-panel">
        <div class="side-panel-header">
          <span class="side-panel-title">Gráfica</span>
          <button class="side-panel-goto" id="side-panel-goto">→ editar</button>
          <button class="side-panel-close" id="side-panel-close">✕</button>
        </div>
        <div class="side-graph-canvas-wrap">
          <canvas class="side-graph-canvas" id="side-graph-canvas"></canvas>
          <div class="graph-coords" id="side-graph-coords"></div>
        </div>
        <div class="side-panel-fn-list" id="side-panel-fn-list"></div>
        <div class="side-panel-controls">
          <button class="graph-ctrl-btn" id="side-graph-reset">Centrar</button>
        </div>
      </div>
    </div>
  `;

  const win = getCurrentWindow();
  appEl.querySelector(".minimize")!.addEventListener("click", () => void win.minimize());
  appEl.querySelector(".close")!.addEventListener("click", () => void win.close());
  appEl.querySelector("#side-panel-toggle")!.addEventListener("click", toggleSidePanel);
  appEl.querySelector("#side-panel-close")!.addEventListener("click", () => {
    sidePanelOpen = false;
    updateSidePanel();
    resizeForCurrentMode();
  });
  appEl.querySelector("#side-panel-goto")!.addEventListener("click", () => {
    setMode("graph");
  });
  appEl.querySelector("#side-graph-reset")!.addEventListener("click", () => {
    sideGrapherInstance?.resetView();
  });
  appEl.querySelector("#history-toggle")!.addEventListener("click", toggleHistory);
  appEl.querySelector("#history-sidebar-close")!.addEventListener("click", () => {
    historyOpen = false;
    updateHistoryDrawer();
    resizeForCurrentMode();
  });
  appEl.querySelector("#history-sidebar-clear")!.addEventListener("click", () => {
    state.history = [];
    updateHistoryDrawer();
    updateDisplay();
  });

  appEl.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode as Mode));
  });
}

function toggleHistory(): void {
  historyOpen = !historyOpen;
  updateHistoryDrawer();
  resizeForCurrentMode();
}

function updateHistoryDrawer(): void {
  const sidebar = document.getElementById("history-sidebar");
  const list = document.getElementById("history-sidebar-list");
  const toggleBtn = document.getElementById("history-toggle");
  if (!sidebar || !list) return;

  sidebar.classList.toggle("open", historyOpen);
  toggleBtn?.classList.toggle("is-active", historyOpen);

  if (!historyOpen) return;

  if (state.history.length === 0) {
    list.innerHTML = `<div class="history-sidebar-empty">Sin historial</div>`;
    return;
  }

  list.innerHTML = [...state.history].reverse().map((h, i) => {
    const idx = state.history.length - 1 - i;
    return `
      <div class="history-sidebar-entry" data-idx="${idx}">
        <div class="hse-expr">${h.expr}</div>
        <div class="hse-result">${h.result}</div>
        <div class="hse-actions">
          <button class="hse-use" data-idx="${idx}" title="Usar resultado">← usar</button>
          <button class="hse-graph" data-idx="${idx}" title="Enviar a gráfica">→ 📈</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll<HTMLButtonElement>(".hse-use").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.history[Number(btn.dataset.idx)];
      if (entry) recallHistoryEntry(entry);
    });
  });
  list.querySelectorAll<HTMLButtonElement>(".hse-graph").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const entry = state.history[Number(btn.dataset.idx)];
      if (entry) sendExprToGraph(entry.expr.replace(/ =$/, ""));
    });
  });
  list.querySelectorAll<HTMLElement>(".history-sidebar-entry").forEach(el => {
    el.addEventListener("click", () => {
      const entry = state.history[Number(el.dataset.idx)];
      if (entry) recallHistoryEntry(entry);
    });
  });
}

function recallHistoryEntry(entry: HistoryEntry): void {
  if (state.mode !== "basic" && state.mode !== "scientific") setMode("basic");
  pushUndo(state.input);
  state.input = entry.result;
  state.freshResult = false;
  state.numberMode = "normal";
  updateDisplay();
}

function sendExprToGraph(expr: string): void {
  graphFunctions[0].expr = expr;

  if (state.mode !== "graph" && !isSidePanelAvailable()) {
    setMode("graph");
    requestAnimationFrame(() => {
      const input = document.getElementById("graph-fn-0") as HTMLInputElement | null;
      if (input) input.value = expr;
      grapherInstance?.setFunctions(graphFunctions);
    });
    return;
  }

  // If not in graph tab, use the side panel
  if (state.mode !== "graph") {
    if (!sidePanelOpen) {
      sidePanelOpen = true;
      updateSidePanel();
      resizeForCurrentMode();
    } else {
      sideGrapherInstance?.setFunctions(graphFunctions);
      updateSidePanelFns();
    }
    return;
  }
  // In graph tab, update directly
  requestAnimationFrame(() => {
    const input = document.getElementById("graph-fn-0") as HTMLInputElement | null;
    if (input) input.value = expr;
    grapherInstance?.setFunctions(graphFunctions);
  });
}

function toggleSidePanel(): void {
  if (!isSidePanelAvailable()) return;
  sidePanelOpen = !sidePanelOpen;
  updateSidePanel();
  resizeForCurrentMode();
}

function isSidePanelAvailable(mode: Mode = state.mode): boolean {
  return mode === "basic" || mode === "scientific";
}

function updateShellControls(): void {
  const sideToggle = document.getElementById("side-panel-toggle") as HTMLButtonElement | null;
  const available = isSidePanelAvailable();
  if (!sideToggle) return;

  sideToggle.disabled = !available;
  sideToggle.classList.toggle("is-disabled", !available);
  if (!available) {
    sideToggle.classList.remove("is-active");
  }
  sideToggle.title = available ? "Gráfica lateral" : "Gráfica lateral no disponible en este modo";
}

function resizeForCurrentMode(): void {
  const [baseWidth, baseHeight] = WINDOW_SIZES[state.mode];
  const width =
    baseWidth +
    (historyOpen ? HISTORY_PANEL_WIDTH : 0) +
    (sidePanelOpen && isSidePanelAvailable() ? SIDE_PANEL_WIDTH : 0);
  void getCurrentWindow().setSize(new LogicalSize(width, baseHeight));
}

function updateSidePanel(): void {
  const panel = document.getElementById("side-panel");
  const toggleBtn = document.getElementById("side-panel-toggle");
  if (!panel) return;

  panel.classList.toggle("open", sidePanelOpen);
  toggleBtn?.classList.toggle("is-active", sidePanelOpen);

  if (!sidePanelOpen) {
    if (sideGrapherInstance) {
      sideGrapherInstance.destroy();
      sideGrapherInstance = null;
    }
    return;
  }

  requestAnimationFrame(() => {
    const canvas = document.getElementById("side-graph-canvas") as HTMLCanvasElement | null;
    const coordsEl = document.getElementById("side-graph-coords") as HTMLElement | null;
    if (!canvas) return;
    if (!sideGrapherInstance) {
      sideGrapherInstance = createGrapher(canvas, () => state.angleMode, coordsEl ?? undefined);
    }
    sideGrapherInstance.setFunctions(graphFunctions);
    updateSidePanelFns();
  });
}

function updateSidePanelFns(): void {
  const list = document.getElementById("side-panel-fn-list");
  if (!list) return;
  const active = graphFunctions.filter(fn => fn.expr.trim());
  if (active.length === 0) {
    list.innerHTML = `<span class="side-fn-empty">Sin funciones</span>`;
    return;
  }
  list.innerHTML = active.map(fn => `
    <div class="side-fn-chip">
      <div class="side-fn-dot" style="background:${fn.color}"></div>
      <span>${fn.expr}</span>
    </div>
  `).join("");
}

function tabLabel(m: Mode): string {
  return { basic: "Básica", scientific: "Científica", conversions: "Conversiones", graph: "Gráficos" }[m];
}

function content(): HTMLElement {
  return document.getElementById("content")!;
}

// ── Mode switching ─────────────────────────────────────────────────────
function setMode(m: Mode): void {
  if (grapherInstance) {
    grapherInstance.destroy();
    grapherInstance = null;
  }

  state.mode = m;

  if (!isSidePanelAvailable(m) && sidePanelOpen) {
    sidePanelOpen = false;
    document.getElementById("side-panel")?.classList.remove("open");
    document.getElementById("side-panel-toggle")?.classList.remove("is-active");
    if (sideGrapherInstance) { sideGrapherInstance.destroy(); sideGrapherInstance = null; }
  }

  updateShellControls();

  appEl.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === m);
  });

  const c = content();
  c.innerHTML = "";

  if (m === "basic") {
    c.appendChild(buildCalcLayout(false));
    updateDisplay();
    initKeyboard();
    resizeForCurrentMode();
  } else if (m === "scientific") {
    c.appendChild(buildCalcLayout(true));
    updateDisplay();
    initKeyboard();
    resizeForCurrentMode();
  } else if (m === "conversions") {
    c.appendChild(buildConvLayout());
    renderConvCategories();
    updateConv();
    resizeForCurrentMode();
  } else {
    c.appendChild(buildGraphLayout());
    resizeForCurrentMode();
  }
}

// ── Calculator layout ──────────────────────────────────────────────────
function buildCalcLayout(sci: boolean): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `calc-layout${sci ? " scientific-layout" : ""}`;

  // Display
  const disp = document.createElement("div");
  disp.className = "display";
  disp.innerHTML = `
    <div class="display-badges">
      ${sci ? `<div class="angle-badge" id="angle-badge">${state.angleMode}</div>` : `<div></div>`}
      <div class="number-badge" id="number-badge"></div>
    </div>
    <div class="calc-history" id="calc-history"></div>
    <div class="display-current">
      <input type="text" class="display-expr" id="disp-expr" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off">
      <div class="display-result" id="disp-result">0</div>
    </div>
  `;
  if (sci) {
    disp.querySelector("#angle-badge")?.addEventListener("click", () => handleAction("_angle"));
  }
  wrap.appendChild(disp);

  // Buttons
  const area = document.createElement("div");
  area.className = "btn-area";

  if (sci) {
    area.appendChild(buildSciStrip());
    buildSciRows().forEach(row => area.appendChild(row));
    const sep = document.createElement("div");
    sep.className = "sci-separator";
    area.appendChild(sep);
  }

  area.appendChild(buildUtilityRow());
  buildNumRows().forEach(row => area.appendChild(row));
  wrap.appendChild(area);

  return wrap;
}

type BtnDef = { label: string; action: string; cls?: string };

function buildSciRows(): HTMLElement[] {
  const rows: BtnDef[][] = [
    [
      { label: "sin", action: "sin(", cls: "btn-sci" },
      { label: "cos", action: "cos(", cls: "btn-sci" },
      { label: "tan", action: "tan(", cls: "btn-sci" },
      { label: "log", action: "log(", cls: "btn-sci" },
      { label: "ln", action: "ln(", cls: "btn-sci" },
    ],
    [
      { label: "sin⁻¹", action: "asin(", cls: "btn-sci" },
      { label: "cos⁻¹", action: "acos(", cls: "btn-sci" },
      { label: "tan⁻¹", action: "atan(", cls: "btn-sci" },
      { label: "log₂", action: "log2(", cls: "btn-sci" },
      { label: "atanh", action: "atanh(", cls: "btn-sci" },
    ],
    [
      { label: "sinh", action: "sinh(", cls: "btn-sci" },
      { label: "cosh", action: "cosh(", cls: "btn-sci" },
      { label: "tanh", action: "tanh(", cls: "btn-sci" },
      { label: "asinh", action: "asinh(", cls: "btn-sci" },
      { label: "acosh", action: "acosh(", cls: "btn-sci" },
    ],
    [
      { label: "eˣ", action: "exp(", cls: "btn-sci" },
      { label: "nCr", action: "nCr(", cls: "btn-sci" },
      { label: "nPr", action: "nPr(", cls: "btn-sci" },
      { label: "round", action: "round(", cls: "btn-sci" },
      { label: "Ans", action: "_ans", cls: "btn-sci" },
    ],
    [
      { label: "x²", action: "^2", cls: "btn-sci" },
      { label: "xʸ", action: "^(", cls: "btn-sci" },
      { label: "n!", action: "!", cls: "btn-sci" },
      { label: "π", action: "π", cls: "btn-const" },
      { label: "e", action: "e", cls: "btn-const" },
    ],
  ];

  return rows.map(row => {
    const el = document.createElement("div");
    el.className = "btn-row cols-5";
    row.forEach(def => el.appendChild(makeBtnEl(def)));
    return el;
  });
}

function buildSciStrip(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "sci-strip";

  const defs: BtnDef[] = [
    { label: "1/x", action: "1/(", cls: "btn-chip" },
    { label: "√", action: "sqrt(", cls: "btn-chip" },
    { label: "Re", action: "re(", cls: "btn-chip" },
    { label: "Im", action: "im(", cls: "btn-chip" },
    { label: "Arg", action: "arg(", cls: "btn-chip" },
    { label: "conj", action: "conj(", cls: "btn-chip" },
    { label: "|x|", action: "abs(", cls: "btn-chip" },
    { label: "⌊x⌋", action: "floor(", cls: "btn-chip" },
    { label: "⌈x⌉", action: "ceil(", cls: "btn-chip" },
    { label: "rand", action: "rand", cls: "btn-chip" },
    { label: "a×b", action: "_factorize", cls: "btn-chip" },
    { label: "i", action: "i", cls: "btn-chip" },
  ];

  defs.forEach(def => wrap.appendChild(makeBtnEl(def)));
  return wrap;
}

function buildUtilityRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "btn-row cols-5 compact-row";

  [
    { label: "C", action: "C", cls: "btn-special" },
    { label: "↑n", action: "_sup", cls: "btn-special btn-arrowmode" },
    { label: "↓n", action: "_sub", cls: "btn-special btn-arrowmode" },
    { label: "mod", action: "%", cls: "btn-special" },
    { label: "⌫", action: "back", cls: "btn-special" },
  ].forEach(def => row.appendChild(makeBtnEl(def)));

  return row;
}

function buildNumRows(): HTMLElement[] {
  const rows: BtnDef[][] = [
    [
      { label: "(", action: "(", cls: "btn-special" },
      { label: ")", action: ")", cls: "btn-special" },
      { label: "%", action: "%", cls: "btn-special" },
      { label: "÷", action: "÷", cls: "btn-op" },
    ],
    [
      { label: "7", action: "7", cls: "btn-num" },
      { label: "8", action: "8", cls: "btn-num" },
      { label: "9", action: "9", cls: "btn-num" },
      { label: "×", action: "×", cls: "btn-op" },
    ],
    [
      { label: "4", action: "4", cls: "btn-num" },
      { label: "5", action: "5", cls: "btn-num" },
      { label: "6", action: "6", cls: "btn-num" },
      { label: "−", action: "−", cls: "btn-op" },
    ],
    [
      { label: "1", action: "1", cls: "btn-num" },
      { label: "2", action: "2", cls: "btn-num" },
      { label: "3", action: "3", cls: "btn-num" },
      { label: "+", action: "+", cls: "btn-op" },
    ],
    [
      { label: "±", action: "negate", cls: "btn-special" },
      { label: "0", action: "0", cls: "btn-num" },
      { label: ".", action: ".", cls: "btn-num" },
      { label: "=", action: "=", cls: "btn-eq" },
    ],
  ];

  return rows.map(row => {
    const el = document.createElement("div");
    el.className = "btn-row cols-4";
    row.forEach(def => el.appendChild(makeBtnEl(def)));
    return el;
  });
}

function makeBtnEl(def: BtnDef): HTMLElement {
  const btn = document.createElement("button");
  btn.className = `btn ${def.cls ?? ""}`;
  btn.dataset.action = def.action;
  btn.textContent = def.label;
  btn.addEventListener("click", () => {
    handleAction(def.action);
    // Return focus to expression input to maintain cursor position
    requestAnimationFrame(() => getExprInput()?.focus({ preventScroll: true }));
  });
  return btn;
}

function setNumberMode(mode: NumberMode): void {
  state.numberMode = state.numberMode === mode ? "normal" : mode;
  updateDisplay();
}

function applyNumberMode(action: string): string {
  if (state.numberMode === "normal" || !/^\d$/.test(action)) {
    if (state.numberMode !== "normal" && !/^\d$/.test(action)) {
      state.numberMode = "normal";
    }
    return action;
  }

  return state.numberMode === "sup"
    ? SUPERSCRIPT_DIGITS[action]
    : SUBSCRIPT_DIGITS[action];
}

function appendToInput(text: string): void {
  pushUndo(state.input);
  if (state.freshResult) {
    state.input = text === "." ? "0." : text;
    state.freshResult = false;
    updateDisplay(undefined, undefined, state.input.length);
  } else {
    insertAtCursor(text);
  }
}

// ── Calc actions ───────────────────────────────────────────────────────
function handleAction(action: string): void {
  if (action === "_sup") {
    setNumberMode("sup");
    return;
  }

  if (action === "_sub") {
    setNumberMode("sub");
    return;
  }

  action = applyNumberMode(action);

  // Angle toggle
  if (action === "_angle") {
    state.angleMode = state.angleMode === "DEG" ? "RAD" : "DEG";
    if (state.mode === "scientific") setMode("scientific");
    return;
  }

  if (action === "_factorize") {
    if (!state.input.trim()) return;
    try {
      const res = evalExpression(state.input, state.angleMode, undefined, { _: state.lastAns });
      if (typeof res.value !== "number") throw new Error("Solo se pueden factorizar enteros reales");
      const factored = factorizeInteger(res.value);
      pushUndo(state.input);
      state.input = factored;
      state.freshResult = false;
      state.numberMode = "normal";
      updateDisplay(undefined, undefined, state.input.length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      updateDisplay(undefined, msg);
    }
    return;
  }

  // Paste last answer
  if (action === "_ans") {
    pushUndo(state.input);
    if (state.freshResult) state.freshResult = false;
    insertAtCursor(formatResult(state.lastAns));
    return;
  }

  // Clear all
  if (action === "C") {
    pushUndo(state.input);
    state.input = "";
    state.freshResult = false;
    state.numberMode = "normal";
    updateDisplay(undefined, undefined, 0);
    return;
  }

  // Backspace
  if (action === "back") {
    if (state.freshResult) {
      pushUndo(state.input);
      state.freshResult = false;
      state.input = "";
      updateDisplay(undefined, undefined, 0);
    } else {
      const el = getExprInput();
      const pos = el ? (el.selectionStart ?? state.input.length) : state.input.length;
      const selEnd = el ? (el.selectionEnd ?? pos) : pos;
      pushUndo(state.input);
      if (pos !== selEnd) {
        // Delete selection
        state.input = state.input.slice(0, pos) + state.input.slice(selEnd);
        updateDisplay(undefined, undefined, pos);
      } else if (pos > 0) {
        state.input = state.input.slice(0, pos - 1) + state.input.slice(pos);
        updateDisplay(undefined, undefined, pos - 1);
      }
    }
    return;
  }

  // Equals
  if (action === "=" || action === "_eq_clear") {
    if (!state.input.trim()) return;
    try {
      const open = (state.input.match(/\(/g) ?? []).length - (state.input.match(/\)/g) ?? []).length;
      const expr = state.input + ")".repeat(Math.max(0, open));
      const res = evalExpression(expr, state.angleMode, undefined, { _: state.lastAns });
      state.history.push({ expr: expr + " =", result: res.formatted });
      if (state.history.length > 50) state.history.shift();
      state.lastAns = res.value;
      pushUndo(state.input);
      if (action === "_eq_clear") {
        // Shift+Enter: commit to history and start fresh
        state.input = "";
        state.freshResult = false;
        state.numberMode = "normal";
        updateDisplay(undefined, undefined, 0);
      } else {
        state.input = formatResult(res.value);
        state.freshResult = true;
        state.numberMode = "normal";
        updateDisplay(res.formatted, undefined, state.input.length);
      }
      updateHistoryDrawer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      updateDisplay(undefined, msg);
    }
    return;
  }

  // Negate
  if (action === "negate") {
    if (!state.input) return;
    pushUndo(state.input);
    if (state.input.startsWith("-")) {
      state.input = state.input.slice(1);
    } else {
      state.input = "-" + state.input;
    }
    updateDisplay(undefined, undefined, state.input.length);
    return;
  }

  // Modulo %
  if (action === "%") {
    pushUndo(state.input);
    if (state.freshResult) state.freshResult = false;
    insertAtCursor(" % ");
    return;
  }

  // Operators + power
  const operators = ["÷", "×", "−", "+", "^(", "^2"];
  if (operators.includes(action)) {
    pushUndo(state.input);
    if (state.freshResult) {
      state.input = formatResult(state.lastAns);
      state.freshResult = false;
    }
    if (action === "^2") {
      insertAtCursor("^2");
    } else if (action === "^(") {
      insertAtCursor("^(");
    } else {
      insertAtCursor(` ${action} `);
    }
    return;
  }

  // 1/x — wrap current input
  if (action === "1/(") {
    pushUndo(state.input);
    if (state.freshResult) {
      state.input = `1/(${formatResult(state.lastAns)})`;
      state.freshResult = false;
    } else if (state.input.trim()) {
      state.input = `1/(${state.input})`;
    } else {
      state.input = "1/(";
    }
    updateDisplay(undefined, undefined, state.input.length);
    return;
  }

  // Functions: insert at cursor with opening paren
  const funcs = [
    "sin(", "cos(", "tan(", "asin(", "acos(", "atan(",
    "sinh(", "cosh(", "tanh(", "asinh(", "acosh(", "atanh(",
    "sqrt(", "cbrt(", "log(", "ln(", "log2(", "exp(",
    "abs(", "ceil(", "floor(", "round(", "nCr(", "nPr(",
    "re(", "im(", "arg(", "conj(",
  ];
  if (funcs.includes(action)) {
    pushUndo(state.input);
    if (state.freshResult) {
      state.input = "";
      state.freshResult = false;
    }
    insertAtCursor(action);
    return;
  }

  if (action === "rand") {
    appendToInput("rand");
    return;
  }

  // Factorial suffix
  if (action === "!") {
    pushUndo(state.input);
    insertAtCursor("!");
    return;
  }

  // Default: digits, dot, parens, constants
  const digits = [
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    ".", "(", ")", "π", "e", "i", "τ", "φ",
    "⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹",
    "₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉",
  ];
  if (digits.includes(action)) {
    pushUndo(state.input);
    if (state.freshResult) {
      state.input = action === "." ? "0." : action;
      state.freshResult = false;
      updateDisplay(undefined, undefined, state.input.length);
    } else {
      insertAtCursor(action);
    }
    return;
  }
}

// ── Display update ─────────────────────────────────────────────────────
// moveCursorTo: explicit cursor position; undefined = preserve existing cursor
function updateDisplay(forcedResult?: string, errorMsg?: string, moveCursorTo?: number): void {
  const histEl = document.getElementById("calc-history");
  const exprEl = document.getElementById("disp-expr") as HTMLInputElement | null;
  const resEl = document.getElementById("disp-result");
  const badgeEl = document.getElementById("angle-badge");
  const numberBadgeEl = document.getElementById("number-badge");
  if (!exprEl || !resEl) return;

  // Angle badge in scientific mode
  if (badgeEl) badgeEl.textContent = state.angleMode;
  if (numberBadgeEl) {
    const label = state.numberMode === "sup" ? "↑n" : state.numberMode === "sub" ? "↓n" : "";
    numberBadgeEl.textContent = label;
    numberBadgeEl.classList.toggle("is-active", label.length > 0);
  }

  document.querySelectorAll<HTMLButtonElement>(".btn-arrowmode").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.action === `_${state.numberMode}`);
  });

  // History list
  if (histEl) {
    histEl.innerHTML = state.history.map((h, i) => `
      <div class="history-entry" data-idx="${i}">
        <span class="he-expr">${h.expr}</span>
        <span class="he-result">${h.result}</span>
      </div>
    `).join("");
    // Click to recall result
    histEl.querySelectorAll<HTMLElement>(".history-entry").forEach(el => {
      el.addEventListener("click", () => {
        const idx = Number(el.dataset.idx);
        const entry = state.history[idx];
        if (entry) {
          pushUndo(state.input);
          state.input = entry.result;
          state.freshResult = false;
          state.numberMode = "normal";
          updateDisplay();
        }
      });
    });
    // Auto-scroll to bottom
    histEl.scrollTop = histEl.scrollHeight;
  }

  if (errorMsg) {
    exprEl.textContent = state.input;
    resEl.textContent = errorMsg;
    resEl.className = "display-result is-error";
    return;
  }

  // Sync expression input value, preserving cursor unless explicitly moved
  if (exprEl.value !== state.input) {
    const savedSel = moveCursorTo ?? Math.min(exprEl.selectionStart ?? state.input.length, state.input.length);
    exprEl.value = state.input;
    exprEl.setSelectionRange(savedSel, savedSel);
  } else if (moveCursorTo !== undefined) {
    exprEl.setSelectionRange(moveCursorTo, moveCursorTo);
  }

  resEl.className = "display-result";

  if (state.freshResult && forcedResult) {
    resEl.textContent = forcedResult;
    adjustResultFontSize(resEl, forcedResult);
    return;
  }

  if (!state.input.trim()) {
    resEl.textContent = "0";
    return;
  }

  // Live preview
  try {
    const open = (state.input.match(/\(/g) ?? []).length - (state.input.match(/\)/g) ?? []).length;
    const expr = state.input + ")".repeat(Math.max(0, open));
    const res = evalExpression(expr, state.angleMode, undefined, { _: state.lastAns });
    resEl.textContent = res.formatted;
    adjustResultFontSize(resEl, res.formatted);
  } catch {
    resEl.textContent = "";
  }
}

function adjustResultFontSize(el: HTMLElement, text: string): void {
  el.classList.remove("size-md", "size-sm", "size-xs");
  const len = text.replace(/\s/g, "").length;
  if (len > 22) el.classList.add("size-xs");
  else if (len > 16) el.classList.add("size-sm");
  else if (len > 11) el.classList.add("size-md");
}

// ── Keyboard handler ───────────────────────────────────────────────────
function initKeyboard(): void {
  document.removeEventListener("keydown", onKey);
  document.addEventListener("keydown", onKey);
  bindExprInput();
}

// Bind the expression input element to handle keyboard input directly
function bindExprInput(): void {
  const el = getExprInput();
  if (!el) return;

  el.value = state.input;

  // Auto-focus expression input
  requestAnimationFrame(() => {
    el.focus({ preventScroll: true });
    el.setSelectionRange(state.input.length, state.input.length);
  });

  // When user focuses the input, disable freshResult so they can edit freely
  el.addEventListener("focus", () => {
    if (state.freshResult) state.freshResult = false;
  });

  // Sync direct keyboard typing to state and update live preview
  el.addEventListener("input", () => {
    state.input = el.value;
    state.freshResult = false;
    // Update only the live preview (don't touch el.value/cursor)
    const resEl = document.getElementById("disp-result");
    if (!resEl) return;
    resEl.className = "display-result";
    if (!state.input.trim()) { resEl.textContent = "0"; return; }
    try {
      const open = (state.input.match(/\(/g) ?? []).length - (state.input.match(/\)/g) ?? []).length;
      const expr = state.input + ")".repeat(Math.max(0, open));
      const res = evalExpression(expr, state.angleMode, undefined, { _: state.lastAns });
      resEl.textContent = res.formatted;
      adjustResultFontSize(resEl, res.formatted);
    } catch { resEl.textContent = ""; }
  });

  // Handle special keys on the expression input
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    // Let arrow keys, Home, End work natively for cursor movement
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;

    // Undo
    if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      const prev = inputUndoStack.pop();
      if (prev !== undefined) {
        inputRedoStack.push(state.input);
        state.input = prev;
        state.freshResult = false;
        el.value = state.input;
        el.setSelectionRange(state.input.length, state.input.length);
        el.dispatchEvent(new Event("input"));
      }
      return;
    }
    // Redo
    if ((e.key === "z" && e.shiftKey && (e.ctrlKey || e.metaKey)) ||
        (e.key === "y" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      const next = inputRedoStack.pop();
      if (next !== undefined) {
        inputUndoStack.push(state.input);
        state.input = next;
        state.freshResult = false;
        el.value = state.input;
        el.setSelectionRange(state.input.length, state.input.length);
        el.dispatchEvent(new Event("input"));
      }
      return;
    }

    // Ctrl+digit → superscript
    if ((e.ctrlKey || e.metaKey) && /^\d$/.test(e.key)) {
      e.preventDefault();
      pushUndo(state.input);
      insertAtCursor(SUPERSCRIPT_DIGITS[e.key]);
      return;
    }
    // Alt+digit → subscript
    if (e.altKey && /^\d$/.test(e.key)) {
      e.preventDefault();
      pushUndo(state.input);
      insertAtCursor(SUBSCRIPT_DIGITS[e.key]);
      return;
    }

    // Ctrl shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const shortcuts: Record<string, string> = {
        e: "×10",
        f: "_factorize",
        i: "1/(",
        p: "π",
        r: "sqrt(",
        t: "τ",
      };
      const s = shortcuts[e.key.toLowerCase()];
      if (s) {
        e.preventDefault();
        if (s === "×10") {
          pushUndo(state.input);
          insertAtCursor("×10");
          state.numberMode = "sup";
          updateDisplay();
        } else {
          handleAction(s);
        }
        return;
      }
    }

    // Shift+Enter → calculate and clear
    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); handleAction("_eq_clear"); return; }
    // Enter → calculate
    if (e.key === "Enter") { e.preventDefault(); handleAction("="); return; }
    // Escape → clear
    if (e.key === "Escape") { e.preventDefault(); handleAction("C"); return; }

    // Dead key ^ → ^(
    const deadKey = getDeadKeyAction(e);
    if (deadKey) { e.preventDefault(); pushUndo(state.input); insertAtCursor(deadKey); return; }

    // Character remapping: * → ×, / → ÷
    if (!e.ctrlKey && !e.metaKey) {
      const remap: Record<string, string> = { "*": "×", "/": "÷" };
      if (remap[e.key]) {
        e.preventDefault();
        pushUndo(state.input);
        insertAtCursor(` ${remap[e.key]} `);
        return;
      }
      // - → − with spaces after values, bare − otherwise
      if (e.key === "-") {
        e.preventDefault();
        pushUndo(state.input);
        const pos = el.selectionStart ?? el.value.length;
        const prevChar = pos > 0 ? el.value[pos - 1] : "";
        insertAtCursor(/[\d)π]/.test(prevChar) ? " − " : "−");
        return;
      }
    }

    // freshResult + digit: start fresh
    if (state.freshResult && e.key.length === 1 && /\d/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      pushUndo(state.input);
      state.input = e.key;
      state.freshResult = false;
      el.value = state.input;
      el.setSelectionRange(1, 1);
      el.dispatchEvent(new Event("input"));
      return;
    }
    // freshResult + other printable: just clear the flag and let char go through
    if (state.freshResult && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      state.freshResult = false;
    }

    // All other keys: let browser handle natively (oninput will sync state)
  });
}

function onKey(e: KeyboardEvent): void {
  if (state.mode !== "basic" && state.mode !== "scientific") return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  // Undo / redo
  if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (e.shiftKey) {
      // Redo
      const next = inputRedoStack.pop();
      if (next !== undefined) {
        inputUndoStack.push(state.input);
        state.input = next;
        state.freshResult = false;
        updateDisplay(undefined, undefined, state.input.length);
      }
    } else {
      // Undo
      const prev = inputUndoStack.pop();
      if (prev !== undefined) {
        inputRedoStack.push(state.input);
        state.input = prev;
        state.freshResult = false;
        updateDisplay(undefined, undefined, state.input.length);
      }
    }
    return;
  }

  if (e.key === "y" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const next = inputRedoStack.pop();
    if (next !== undefined) {
      inputUndoStack.push(state.input);
      state.input = next;
      state.freshResult = false;
      updateDisplay(undefined, undefined, state.input.length);
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && /^\d$/.test(e.key)) {
    e.preventDefault();
    handleAction(SUPERSCRIPT_DIGITS[e.key]);
    return;
  }

  if (e.altKey && /^\d$/.test(e.key)) {
    e.preventDefault();
    handleAction(SUBSCRIPT_DIGITS[e.key]);
    return;
  }

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
    const shortcuts: Record<string, string> = {
      e: "_scientific_notation",
      f: "_factorize",
      i: "1/(",
      p: "π",
      r: "sqrt(",
      t: "τ",
    };
    const shortcut = shortcuts[e.key.toLowerCase()];
    if (shortcut) {
      e.preventDefault();
      if (shortcut === "_scientific_notation") {
        appendToInput("×10");
        state.numberMode = "sup";
        updateDisplay();
      } else {
        handleAction(shortcut);
      }
      return;
    }
  }

  // Shift+Enter: calculate and clear for fresh start
  if (e.key === "Enter" && e.shiftKey) {
    e.preventDefault();
    handleAction("_eq_clear");
    return;
  }

  const map: Record<string, string> = {
    "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
    "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
    ".": ".", ",": ".", // comma as decimal sep
    "+": "+", "-": "−", "*": "×", "/": "÷",
    "(": "(", ")": ")",
    "Enter": "=", "=": "=",
    "Backspace": "back",
    "Delete": "C",
    "Escape": "C",
    "%": "%",
    "^": "^(",   // handles Spanish keyboard circumflex
    "²": "^2",
    "³": "^3",
    "i": "i",
    "I": "i",
    "τ": "τ",
    "φ": "φ",
  };

  const action =
    getDeadKeyAction(e) ??
    map[e.key];
  if (action) {
    e.preventDefault();
    handleAction(action);
    return;
  }

  if (state.mode === "scientific" && e.key.length === 1 && /[a-z_]/i.test(e.key) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    appendToInput(e.key);
  }
}

// ── Conversions helpers ────────────────────────────────────────────────
function smartStep(val: number): number {
  if (val === 0) return 1;
  const abs = Math.abs(val);
  const mag = Math.pow(10, Math.floor(Math.log10(abs)) - 1);
  return mag >= 1 ? Math.max(1, mag) : mag;
}

function getDeadKeyAction(e: KeyboardEvent): string | null {
  if (e.key === "Dead" && ["BracketLeft", "IntlRo", "Backquote"].includes(e.code)) {
    return "^(";
  }
  if (e.key === "[" && e.code === "BracketLeft") {
    return "^(";
  }
  if (e.key === "Unidentified" && e.code === "BracketLeft") {
    return "^(";
  }
  return null;
}

function getMathTextInsert(e: KeyboardEvent): string | null {
  if (e.key === "²") return "^2";
  if (e.key === "³") return "^3";
  if (e.key === "^") return "^";
  if (
    (e.key === "Dead" || e.key === "Unidentified" || e.key === "[") &&
    ["BracketLeft", "IntlRo", "Backquote"].includes(e.code)
  ) {
    return "^";
  }
  return null;
}

function insertTextAtCursor(input: HTMLInputElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.setRangeText(text, start, end, "end");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function bindMathTextInput(input: HTMLInputElement): void {
  input.addEventListener("keydown", e => {
    const insert = getMathTextInsert(e);
    if (!insert) return;
    e.preventDefault();
    insertTextAtCursor(input, insert);
  });
}

function getCursorStep(raw: string, caret: number | null): number | null {
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) return 1;
  if (/e/i.test(normalized)) return null;
  if (!/^[+\-]?\d*\.?\d*$/.test(normalized)) return null;

  const signOffset = normalized.startsWith("+") || normalized.startsWith("-") ? 1 : 0;
  const unsigned = normalized.slice(signOffset);
  if (!/\d/.test(unsigned)) return 1;

  const clampedCaret = Math.max(0, Math.min((caret ?? raw.length) - signOffset, unsigned.length));
  const digitIndex = nearestDigitIndex(unsigned, clampedCaret);
  if (digitIndex === null) return 1;

  const decimalIndex = unsigned.indexOf(".");
  if (decimalIndex === -1) {
    return Math.pow(10, unsigned.length - digitIndex - 1);
  }

  return digitIndex < decimalIndex
    ? Math.pow(10, decimalIndex - digitIndex - 1)
    : Math.pow(10, -(digitIndex - decimalIndex));
}

function nearestDigitIndex(value: string, caret: number): number | null {
  let left = caret - 1;
  let right = caret;

  while (left >= 0 || right < value.length) {
    if (right < value.length && /\d/.test(value[right])) return right;
    if (left >= 0 && /\d/.test(value[left])) return left;
    right++;
    left--;
  }

  return null;
}

function getStepPrecision(step: number): number {
  if (step >= 1) return 0;
  const match = step.toExponential().match(/e-(\d+)/);
  return match ? Math.min(12, Number(match[1])) : 0;
}

function formatEditableNumber(value: number, step: number): string {
  const decimals = getStepPrecision(Math.abs(step));
  return parseFloat(value.toFixed(decimals)).toString();
}

// ── Conversions layout ─────────────────────────────────────────────────
function buildConvLayout(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "conv-wrapper";

  wrap.innerHTML = `
    <div class="conv-categories" id="conv-cats"></div>
    <div class="conv-body">
      <div class="conv-field">
        <div class="conv-input-wrap">
          <input class="conv-input" id="conv-from-input" type="text" inputmode="decimal" placeholder="0" autocomplete="off" />
          <select class="conv-unit-select" id="conv-from-unit"></select>
        </div>
      </div>
      <div class="conv-arrow">⇅</div>
      <div class="conv-field">
        <div class="conv-input-wrap">
          <input class="conv-input" id="conv-to-input" type="text" inputmode="decimal" placeholder="0" autocomplete="off" style="-webkit-user-select:text;user-select:text;" readonly />
          <select class="conv-unit-select" id="conv-to-unit"></select>
        </div>
      </div>
      <div class="conv-formula" id="conv-formula"></div>
    </div>
  `;

  requestAnimationFrame(() => {
    const fromInput = document.getElementById("conv-from-input") as HTMLInputElement | null;

    // Arrow up/down: increment/decrement; other keys: numeric only
    fromInput?.addEventListener("keydown", e => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const rawValue = fromInput.value;
        const val = parseFloat(rawValue.replace(",", ".")) || 0;
        const caret = fromInput.selectionStart;
        const step = getCursorStep(rawValue, caret) ?? smartStep(val);
        const next = e.key === "ArrowUp" ? val + step : val - step;
        const nextStr = formatEditableNumber(next, step);
        convFromVal = nextStr;
        fromInput.value = nextStr;
        computeConv("from");
        requestAnimationFrame(() => {
          const safeCaret = Math.min(caret ?? nextStr.length, fromInput.value.length);
          fromInput.setSelectionRange(safeCaret, safeCaret);
        });
        return;
      }
      const allowed = /^[0-9eE.,+\-]$/.test(e.key) ||
        ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(e.key) ||
        e.ctrlKey || e.metaKey;
      if (!allowed) e.preventDefault();
    });

    fromInput?.addEventListener("input", e => {
      convFromVal = (e.target as HTMLInputElement).value;
      computeConv("from");
    });

    document.getElementById("conv-from-unit")?.addEventListener("change", e => {
      convFromId = (e.target as HTMLSelectElement).value;
      computeConv("from");
    });

    document.getElementById("conv-to-unit")?.addEventListener("change", e => {
      convToId = (e.target as HTMLSelectElement).value;
      computeConv("from");
    });

    wrap.querySelector(".conv-arrow")?.addEventListener("click", () => {
      [convFromId, convToId] = [convToId, convFromId];
      [convFromVal, convToVal] = [convToVal, convFromVal];
      updateConv();
      computeConv("from");
    });
  });

  return wrap;
}

function renderConvCategories(): void {
  const el = document.getElementById("conv-cats");
  if (!el) return;

  el.innerHTML = CATEGORIES.map(cat => `
    <button class="conv-cat-btn ${cat.id === convCatId ? "active" : ""}" data-cat="${cat.id}">
      ${cat.name}
    </button>
  `).join("");

  el.querySelectorAll<HTMLButtonElement>(".conv-cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      convCatId = btn.dataset.cat!;
      const cat = CATEGORIES.find(c => c.id === convCatId)!;
      convFromId = cat.units[0].id;
      convToId = cat.units[1]?.id ?? cat.units[0].id;
      convFromVal = "";
      convToVal = "";
      renderConvCategories();
      updateConv();
    });
  });
}

function updateConv(): void {
  const cat = CATEGORIES.find(c => c.id === convCatId)!;

  const fromSel = document.getElementById("conv-from-unit") as HTMLSelectElement | null;
  const toSel = document.getElementById("conv-to-unit") as HTMLSelectElement | null;
  const fromInput = document.getElementById("conv-from-input") as HTMLInputElement | null;
  const toInput = document.getElementById("conv-to-input") as HTMLInputElement | null;
  if (!fromSel || !toSel || !fromInput || !toInput) return;

  fromSel.innerHTML = cat.units.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
  toSel.innerHTML = cat.units.map(u => `<option value="${u.id}">${u.name}</option>`).join("");

  fromSel.value = convFromId;
  toSel.value = convToId;
  fromInput.value = convFromVal;
  toInput.value = convToVal;
}

function computeConv(direction: "from" | "to"): void {
  const toInput = document.getElementById("conv-to-input") as HTMLInputElement | null;
  const fromInput = document.getElementById("conv-from-input") as HTMLInputElement | null;
  const formulaEl = document.getElementById("conv-formula");
  if (!toInput || !fromInput) return;

  try {
    if (direction === "from") {
      const val = parseFloat(convFromVal);
      if (isNaN(val)) {
        convToVal = "";
        toInput.value = "";
        if (formulaEl) formulaEl.textContent = "";
        return;
      }
      const result = convert(val, convFromId, convToId, convCatId);
      convToVal = formatConvResult(result);
      toInput.value = convToVal;

      const cat = CATEGORIES.find(c => c.id === convCatId)!;
      const fromName = cat.units.find(u => u.id === convFromId)?.name ?? convFromId;
      const toName = cat.units.find(u => u.id === convToId)?.name ?? convToId;
      if (formulaEl) formulaEl.textContent = `${val} ${fromName} = ${convToVal} ${toName}`;
    }
  } catch (err) {
    if (formulaEl) formulaEl.textContent = err instanceof Error ? err.message : "Error";
  }
}

// ── Graph layout ───────────────────────────────────────────────────────
function buildGraphLayout(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "graph-wrapper graph-wide";

  wrap.innerHTML = `
    <div class="graph-canvas-wrap" id="graph-canvas-wrap">
      <canvas class="graph-canvas" id="graph-canvas"></canvas>
      <div class="graph-coords" id="graph-coords"></div>
      <div class="graph-hint">Arrastra · Rueda para zoom</div>
    </div>
    <div class="graph-side-col">
      <div class="graph-fns" id="graph-fns"></div>
      <button class="graph-add-btn" id="graph-add">+ Añadir</button>
      <div class="graph-controls" style="margin-top:auto">
        <button class="graph-ctrl-btn" id="graph-reset">Centrar</button>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const canvas = document.getElementById("graph-canvas") as HTMLCanvasElement | null;
    const coordsEl = document.getElementById("graph-coords") as HTMLElement | null;
    if (!canvas) return;

    grapherInstance = createGrapher(canvas, () => state.angleMode, coordsEl ?? undefined);
    renderGraphFns();

    document.getElementById("graph-add")?.addEventListener("click", () => {
      if (graphFunctions.length >= 6) return;
      graphFunctions.push({ expr: "", color: GRAPH_PALETTE[graphFunctions.length % GRAPH_PALETTE.length] });
      renderGraphFns();
    });

    document.getElementById("graph-reset")?.addEventListener("click", () => {
      grapherInstance?.resetView();
    });
  });

  return wrap;
}

function renderGraphFns(): void {
  const container = document.getElementById("graph-fns");
  if (!container) return;

  container.innerHTML = graphFunctions.map((fn, i) => `
    <div class="graph-fn-row" data-idx="${i}">
      <button class="graph-color-dot" style="background:${fn.color}" title="Cambiar color" data-idx="${i}"></button>
      <input class="graph-fn-input" id="graph-fn-${i}"
        placeholder="${i === 0 ? "sin(x)" : i === 1 ? "x^2/10" : "cos(x/2)"}"
        value="${fn.expr}"
        autocomplete="off" spellcheck="false" />
      ${graphFunctions.length > 1 ? `<button class="graph-fn-remove" data-idx="${i}" title="Eliminar">×</button>` : ""}
    </div>
  `).join("");

  // Wire inputs
  graphFunctions.forEach((_, i) => {
    const input = document.getElementById(`graph-fn-${i}`) as HTMLInputElement | null;
    if (!input) return;
    bindMathTextInput(input);
    input.addEventListener("input", () => {
      graphFunctions[i].expr = input.value;
      grapherInstance?.setFunctions(graphFunctions);
    });
  });

  // Wire color dots — click cycles through palette
  container.querySelectorAll<HTMLButtonElement>(".graph-color-dot").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.idx);
      const curIdx = GRAPH_PALETTE.indexOf(graphFunctions[i].color);
      graphFunctions[i].color = GRAPH_PALETTE[(curIdx + 1) % GRAPH_PALETTE.length];
      btn.style.background = graphFunctions[i].color;
      grapherInstance?.setFunctions(graphFunctions);
    });
  });

  // Wire remove buttons
  container.querySelectorAll<HTMLButtonElement>(".graph-fn-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.idx);
      graphFunctions.splice(i, 1);
      renderGraphFns();
      grapherInstance?.setFunctions(graphFunctions);
    });
  });

  grapherInstance?.setFunctions(graphFunctions);

  // Hide add button if max reached
  const addBtn = document.getElementById("graph-add");
  if (addBtn) addBtn.style.display = graphFunctions.length >= 6 ? "none" : "";
}
