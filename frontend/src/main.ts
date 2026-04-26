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
import { casExec, casDiff, casIntegrate, casClear, casVars, type StmtResult } from "./cas.ts";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import {
  findElement, parseMolarMass, solveGasLaw,
  toPascal, fromPascal, toM3, fromM3, toKelvin, fromKelvin,
  strongAcidPH, strongBasePH, weakAcidPH, weakBasePH, bufferPH,
  pHFromConc, concFromPH, fmtChem, CAT_LABELS,
  type GasState,
} from "./chemistry.ts";

// ── Types ──────────────────────────────────────────────────────────────
type Mode = "basic" | "scientific" | "conversions" | "graph" | "engineering" | "quimica";
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

const SIDE_PANEL_WIDTH = 380;
const WINDOW_SIZES: Record<Mode, [number, number]> = {
  basic: [480, 720],
  scientific: [860, 800],
  conversions: [480, 720],
  graph: [980, 740],
  engineering: [980, 820],
  quimica: [560, 840],
};

// Disable context menu (no reload/inspect in production)
window.addEventListener("contextmenu", e => e.preventDefault());

function blockBrowserZoom(): void {
  if (document.documentElement.dataset.zoomGuardInstalled === "1") return;
  document.documentElement.dataset.zoomGuardInstalled = "1";

  const preventIfCancelable = (event: Event): void => {
    if (event.cancelable) event.preventDefault();
  };

  window.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return;
    preventIfCancelable(event);
  }, { passive: false, capture: true });

  const gestureHandler = preventIfCancelable as EventListener;
  ["gesturestart", "gesturechange", "gestureend"].forEach(type => {
    document.addEventListener(type, gestureHandler, { passive: false, capture: true });
  });

  document.documentElement.style.touchAction = "pan-x pan-y";
  if (document.body) document.body.style.touchAction = "pan-x pan-y";
}

blockBrowserZoom();

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
      ${(["basic", "scientific", "conversions", "graph", "engineering", "quimica"] as Mode[]).map(m => `
        <button class="mode-tab" data-mode="${m}">${tabLabel(m)}</button>
      `).join("")}
    </div>
    <div class="app-container">
      <div class="app-main">
        <div id="content"></div>
        <div class="history-sidebar" id="history-sidebar">
          <div class="history-sidebar-header">
            <span class="history-sidebar-title">Historial</span>
            <button class="history-sidebar-clear" id="history-sidebar-clear">Limpiar</button>
            <button class="history-sidebar-close" id="history-sidebar-close">✕</button>
          </div>
          <div class="history-sidebar-list" id="history-sidebar-list"></div>
        </div>
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
        
        <!-- Oscilloscope text inputs -->
        <div class="side-panel-osc" id="side-osc">
          <div class="osc-row">
            <span class="osc-label">X =</span>
            <input type="text" id="osc-in-x" class="osc-input" placeholder="..." autocomplete="off">
          </div>
          <div class="osc-row">
            <span class="osc-label">Y =</span>
            <input type="text" id="osc-in-y" class="osc-input" placeholder="..." autocomplete="off">
          </div>
        </div>

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
  return mode === "basic" || mode === "scientific" || mode === "engineering";
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
  const width = baseWidth + (sidePanelOpen && isSidePanelAvailable() ? SIDE_PANEL_WIDTH : 0);
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

  // Wait for CSS transition to give the canvas real dimensions
  const initOrUpdate = () => {
    const canvas = document.getElementById("side-graph-canvas") as HTMLCanvasElement | null;
    const coordsEl = document.getElementById("side-graph-coords") as HTMLElement | null;
    if (!canvas) return;
    if (!sideGrapherInstance) {
      sideGrapherInstance = createGrapher(canvas, () => state.angleMode, coordsEl ?? undefined);
      initOscilloscopeInputs();
    }
    syncSideGraph();
  };

  if (sideGrapherInstance) {
    initOrUpdate();
  } else {
    // First open: wait for transition to give canvas dimensions
    requestAnimationFrame(() => requestAnimationFrame(initOrUpdate));
  }
}

/** Sync the current calculator expression to the side panel graph */
function syncSideGraph(): void {
  if (!sidePanelOpen || !sideGrapherInstance) return;

  const expr = state.input.trim();
  if (!expr) {
    graphFunctions[0].expr = "";
  } else {
    // Auto-close parens and trim trailing operators
    const open = (expr.match(/\(/g) ?? []).length - (expr.match(/\)/g) ?? []).length;
    let balanced = expr + ")".repeat(Math.max(0, open));
    if (/[+−×÷^]$/.test(balanced.trim())) {
      balanced = balanced.trim().slice(0, -1);
    }

    if (balanced.includes("x")) {
      // Function of x → graph it directly
      graphFunctions[0].expr = balanced;
    } else {
      // Constant expression → graph as y = result (horizontal line)
      try {
        const res = evalExpression(balanced, state.angleMode, undefined, { _: state.lastAns });
        const val = typeof res.value === "number" ? res.value : (res.value as any).re;
        if (Number.isFinite(val)) {
          graphFunctions[0].expr = String(val);
        } else {
          graphFunctions[0].expr = "";
        }
      } catch {
        graphFunctions[0].expr = "";
      }
    }
  }
  sideGrapherInstance.setFunctions(graphFunctions);
  updateSidePanelFns();
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

function initOscilloscopeInputs(): void {
  const xIn = document.getElementById("osc-in-x") as HTMLInputElement | null;
  const yIn = document.getElementById("osc-in-y") as HTMLInputElement | null;
  if (!xIn || !yIn) return;

  const fn = () => graphFunctions[0]?.expr.trim() || "";

  xIn.addEventListener("input", () => {
    if (!fn()) { yIn.value = ""; return; }
    try {
      // Evaluate X as an expression first in case they typed "pi/2"
      const xValRes = evalExpression(xIn.value, state.angleMode);
      if (typeof xValRes.value !== "number" && Math.abs((xValRes.value as any).im) > 1e-9) return;
      const xNum = typeof xValRes.value === "number" ? xValRes.value : (xValRes.value as any).re;
      
      const r = evalExpression(fn(), state.angleMode, xNum);
      if (typeof r.value === "number") {
        yIn.value = parseFloat(r.value.toPrecision(6)).toString();
      } else if (Math.abs((r.value as any).im) < 1e-9) {
        yIn.value = parseFloat((r.value as any).re.toPrecision(6)).toString();
      } else {
        yIn.value = "Complex";
      }
    } catch {
      yIn.value = "Error";
    }
  });

  yIn.addEventListener("input", () => {
    if (!fn()) { xIn.value = ""; return; }
    try {
      const yValRes = evalExpression(yIn.value, state.angleMode);
      if (typeof yValRes.value !== "number" && Math.abs((yValRes.value as any).im) > 1e-9) return;
      const yNum = typeof yValRes.value === "number" ? yValRes.value : (yValRes.value as any).re;
      
      // Super basic root finding for exact textual fallback: Newton's method or binary search
      // Since evaluating inverses analytically is hard, we just do a binary search in current view
      let minX = -100;
      let maxX = 100;
      if (sideGrapherInstance) {
        // use view bounds roughly
        // (If we exposed `view` from grapher we could be more precise, but -100 to 100 is ok for simple cases)
      }
      
      let bestX = 0;
      let bestDiff = Infinity;
      // Simple scan to find a close root (rough inverse)
      for (let x = -50; x <= 50; x += 0.05) {
         try {
           const r = evalExpression(fn(), state.angleMode, x);
           const vy = typeof r.value === "number" ? r.value : (r.value as any).re;
           const diff = Math.abs(vy - yNum);
           if (diff < bestDiff) { bestDiff = diff; bestX = x; }
         } catch {}
      }
      if (bestDiff < 0.5) {
         // refine
         let step = 0.01;
         let searchX = bestX - 0.1;
         for (let x = searchX; x <= bestX + 0.1; x += step) {
           try {
             const r = evalExpression(fn(), state.angleMode, x);
             const vy = typeof r.value === "number" ? r.value : (r.value as any).re;
             const diff = Math.abs(vy - yNum);
             if (diff < bestDiff) { bestDiff = diff; bestX = x; }
           } catch {}
         }
         xIn.value = "~" + parseFloat(bestX.toPrecision(4)).toString();
      } else {
         xIn.value = "No encontrado";
      }

    } catch {
      xIn.value = "Error";
    }
  });
}

function tabLabel(m: Mode): string {
  return {
    basic: "Básica",
    scientific: "Científica",
    conversions: "Conversiones",
    graph: "Gráficos",
    engineering: "Ingeniería",
    quimica: "Química",
  }[m];
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
    c.appendChild(buildScientificLayout());
    updateDisplay();
    initKeyboard();
    resizeForCurrentMode();
  } else if (m === "conversions") {
    c.appendChild(buildConvLayout());
    renderConvCategories();
    updateConv();
    resizeForCurrentMode();
  } else if (m === "engineering") {
    c.appendChild(buildEngineeringLayout());
    resizeForCurrentMode();
  } else if (m === "quimica") {
    c.appendChild(buildChemistryLayout());
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

// ── Scientific unified layout ──────────────────────────────────────────
// One flat 9-column grid: 5 sci cols + 4 numpad cols, all buttons same size.
function buildScientificLayout(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "calc-layout scientific-layout";

  // Display
  const disp = document.createElement("div");
  disp.className = "display";
  disp.innerHTML = `
    <div class="display-badges">
      <div class="angle-badge" id="angle-badge">${state.angleMode}</div>
      <div class="number-badge" id="number-badge"></div>
    </div>
    <div class="calc-history" id="calc-history"></div>
    <div class="display-current">
      <input type="text" class="display-expr" id="disp-expr" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off">
      <div class="display-result" id="disp-result">0</div>
    </div>
  `;
  disp.querySelector("#angle-badge")?.addEventListener("click", () => handleAction("_angle"));
  wrap.appendChild(disp);

  // Chip strip for secondary functions (scrollable, compact)
  const area = document.createElement("div");
  area.className = "btn-area";
  area.appendChild(buildSciStrip());

  // Unified 9-column grid rows: [5 sci | 4 numpad]
  const unifiedRows: BtnDef[][] = [
    // Row 0: clear/back + top operators
    [
      { label: "C",     action: "C",       cls: "btn-special" },
      { label: "√",     action: "sqrt(",   cls: "btn-sci" },
      { label: "n!",    action: "!",       cls: "btn-sci" },
      { label: "|x|",   action: "abs(",    cls: "btn-sci" },
      { label: "⌫",     action: "back",    cls: "btn-special" },
      { label: "(",     action: "(",       cls: "btn-special" },
      { label: ")",     action: ")",       cls: "btn-special" },
      { label: "mod",   action: "%",       cls: "btn-special" },
      { label: "÷",     action: "÷",       cls: "btn-op" },
    ],
    // Row 1
    [
      { label: "sin",   action: "sin(",    cls: "btn-sci" },
      { label: "cos",   action: "cos(",    cls: "btn-sci" },
      { label: "tan",   action: "tan(",    cls: "btn-sci" },
      { label: "log",   action: "log(",    cls: "btn-sci" },
      { label: "ln",    action: "ln(",     cls: "btn-sci" },
      { label: "7",     action: "7",       cls: "btn-num" },
      { label: "8",     action: "8",       cls: "btn-num" },
      { label: "9",     action: "9",       cls: "btn-num" },
      { label: "×",     action: "×",       cls: "btn-op" },
    ],
    // Row 2
    [
      { label: "sin⁻¹", action: "asin(",   cls: "btn-sci" },
      { label: "cos⁻¹", action: "acos(",   cls: "btn-sci" },
      { label: "tan⁻¹", action: "atan(",   cls: "btn-sci" },
      { label: "log₂",  action: "log2(",   cls: "btn-sci" },
      { label: "eˣ",    action: "exp(",    cls: "btn-sci" },
      { label: "4",     action: "4",       cls: "btn-num" },
      { label: "5",     action: "5",       cls: "btn-num" },
      { label: "6",     action: "6",       cls: "btn-num" },
      { label: "−",     action: "−",       cls: "btn-op" },
    ],
    // Row 3
    [
      { label: "sinh",  action: "sinh(",   cls: "btn-sci" },
      { label: "cosh",  action: "cosh(",   cls: "btn-sci" },
      { label: "tanh",  action: "tanh(",   cls: "btn-sci" },
      { label: "x²",    action: "^2",      cls: "btn-sci" },
      { label: "xʸ",    action: "^(",      cls: "btn-sci" },
      { label: "1",     action: "1",       cls: "btn-num" },
      { label: "2",     action: "2",       cls: "btn-num" },
      { label: "3",     action: "3",       cls: "btn-num" },
      { label: "+",     action: "+",       cls: "btn-op" },
    ],
    // Row 4
    [
      { label: "nCr",   action: "nCr(",    cls: "btn-sci" },
      { label: "Ans",   action: "_ans",    cls: "btn-sci" },
      { label: "1/x",   action: "1/(",     cls: "btn-sci" },
      { label: "π",     action: "π",       cls: "btn-const" },
      { label: "e",     action: "e",       cls: "btn-const" },
      { label: "±",     action: "negate",  cls: "btn-special" },
      { label: "0",     action: "0",       cls: "btn-num" },
      { label: ".",     action: ".",       cls: "btn-num" },
      { label: "=",     action: "=",       cls: "btn-eq" },
    ],
  ];

  unifiedRows.forEach(rowDefs => {
    const row = document.createElement("div");
    row.className = "btn-row cols-9";
    rowDefs.forEach(def => row.appendChild(makeBtnEl(def)));
    area.appendChild(row);
  });

  wrap.appendChild(area);
  return wrap;
}

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
    if (state.input === "") {
      // Clear visual history registers, but keep permanent history
      const histEl = document.getElementById("calc-history");
      if (histEl) histEl.innerHTML = "";
    } else {
      pushUndo(state.input);
      state.input = "";
      state.freshResult = false;
      state.numberMode = "normal";
      updateDisplay(undefined, undefined, 0);
    }
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
    syncSideGraph();
    return;
  }

  // Live preview and real-time graph
  try {
    const open = (state.input.match(/\(/g) ?? []).length - (state.input.match(/\)/g) ?? []).length;
    let expr = state.input + ")".repeat(Math.max(0, open));

    // Auto-complete simple trailing operators for graphing smoothness
    if (/[+−×÷^]$/.test(expr.trim())) {
      expr = expr.trim().slice(0, -1);
    }

    if (expr.includes("x")) {
      resEl.textContent = "ƒ(x)";
    } else {
      const res = evalExpression(expr, state.angleMode, undefined, { _: state.lastAns });
      resEl.textContent = res.formatted;
      adjustResultFontSize(resEl, res.formatted);
    }
  } catch {
    resEl.textContent = "";
  }
  syncSideGraph();
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
    if (!state.input.trim()) {
      resEl.textContent = "0";
      syncSideGraph();
      return;
    }

    try {
      const open = (state.input.match(/\(/g) ?? []).length - (state.input.match(/\)/g) ?? []).length;
      let expr = state.input + ")".repeat(Math.max(0, open));
      if (/[+−×÷^]$/.test(expr.trim())) {
        expr = expr.trim().slice(0, -1);
      }

      if (expr.includes("x")) {
        resEl.textContent = "ƒ(x)";
      } else {
        const res = evalExpression(expr, state.angleMode, undefined, { _: state.lastAns });
        resEl.textContent = res.formatted;
        adjustResultFontSize(resEl, res.formatted);
      }
    } catch { resEl.textContent = ""; }
    syncSideGraph();
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

// ── Engineering / CAS layout ───────────────────────────────────────────
function buildEngineeringLayout(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "eng-layout";

  wrap.innerHTML = `
    <div class="eng-sidebar">
      <div class="eng-sidebar-header">
        <span class="eng-sidebar-title" id="eng-sidebar-title">Variables</span>
        <button class="eng-btn-small" id="eng-help-btn" title="Referencia de funciones">?</button>
        <button class="eng-btn-small" id="eng-clear-vars" title="Limpiar variables">✕</button>
      </div>
      <div class="eng-vars-list" id="eng-vars-list">
        <span class="eng-empty-hint">Sin variables definidas</span>
      </div>
      <div class="eng-help-panel" id="eng-help-panel">
        <div class="eng-help-section">
          <div class="eng-help-cat">Sintaxis</div>
          <div class="eng-help-row"><code>a = expr</code> asignar var</div>
          <div class="eng-help-row"><code>ans</code> último resultado</div>
          <div class="eng-help-row"><code>Shift+Enter</code> ejecutar</div>
          <div class="eng-help-row"><code>↑ ↓</code> historial REPL</div>
          <div class="eng-help-row"><code>Ctrl+click</code> copiar resultado</div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Constantes</div>
          <div class="eng-help-row"><code>pi</code> π ≈ 3.14159</div>
          <div class="eng-help-row"><code>e</code> ≈ 2.71828</div>
          <div class="eng-help-row"><code>i</code> unidad imaginaria</div>
          <div class="eng-help-row"><code>phi</code> φ (áureo)</div>
          <div class="eng-help-row"><code>tau</code> τ = 2π</div>
          <div class="eng-help-row"><code>inf</code> ∞</div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Trigonometría</div>
          <div class="eng-help-row"><code>sin cos tan</code></div>
          <div class="eng-help-row"><code>asin acos atan</code></div>
          <div class="eng-help-row"><code>atan2(y, x)</code></div>
          <div class="eng-help-row"><code>sinh cosh tanh</code></div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Log / Exp</div>
          <div class="eng-help-row"><code>sqrt(x)</code> raíz cuadrada</div>
          <div class="eng-help-row"><code>cbrt(x)</code> raíz cúbica</div>
          <div class="eng-help-row"><code>exp(x)</code> eˣ</div>
          <div class="eng-help-row"><code>ln(x)</code> log natural</div>
          <div class="eng-help-row"><code>log(x, b)</code> log base b</div>
          <div class="eng-help-row"><code>log2 log10</code></div>
          <div class="eng-help-row"><code>abs floor ceil round</code></div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Estadísticas</div>
          <div class="eng-help-row"><code>mean(a,b,...)</code></div>
          <div class="eng-help-row"><code>median(a,b,...)</code></div>
          <div class="eng-help-row"><code>std(a,b,...)</code></div>
          <div class="eng-help-row"><code>var(a,b,...)</code></div>
          <div class="eng-help-row"><code>sum prod min max</code></div>
          <div class="eng-help-row"><code>hypot(a,b,...)</code></div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Combinatoria</div>
          <div class="eng-help-row"><code>n!</code> factorial</div>
          <div class="eng-help-row"><code>nCr(n,r)</code> combinaciones</div>
          <div class="eng-help-row"><code>nPr(n,r)</code> permutaciones</div>
          <div class="eng-help-row"><code>gcd(a,b)</code> <code>lcm(a,b)</code></div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Complejos</div>
          <div class="eng-help-row"><code>re(z) im(z)</code></div>
          <div class="eng-help-row"><code>arg(z)</code> argumento</div>
          <div class="eng-help-row"><code>conj(z)</code> conjugado</div>
          <div class="eng-help-row"><code>norm(z)</code> módulo</div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Matrices</div>
          <div class="eng-help-row"><code>[1,2; 3,4]</code> literal</div>
          <div class="eng-help-row"><code>eye(n)</code> identidad n×n</div>
          <div class="eng-help-row"><code>zeros(n,m)</code> ceros</div>
          <div class="eng-help-row"><code>ones(n,m)</code> unos</div>
          <div class="eng-help-row"><code>det(A)</code> determinante</div>
          <div class="eng-help-row"><code>inv(A)</code> inversa</div>
          <div class="eng-help-row"><code>transpose(A)</code></div>
          <div class="eng-help-row"><code>trace(A)</code> traza</div>
          <div class="eng-help-row"><code>rank(A)</code> rango</div>
          <div class="eng-help-row"><code>norm(A)</code> norma Frobenius</div>
          <div class="eng-help-row"><code>eig(A)</code> eigenvalores*</div>
          <div class="eng-help-row"><code>linsolve(A,b)</code> Ax=b</div>
          <div class="eng-help-row"><code>dot(u,v)</code> producto escalar</div>
          <div class="eng-help-row"><code>cross(u,v)</code> producto vectorial</div>
          <div class="eng-help-row"><code>size(A) rows(A) cols(A)</code></div>
          <div class="eng-help-note">* solo matrices simétricas</div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Solver</div>
          <div class="eng-help-row"><code>solve(f)</code> raíz de f(x)=0</div>
          <div class="eng-help-row"><code>solve(f, x0)</code> cerca de x0</div>
          <div class="eng-help-row"><code>solve(f, g)</code> intersección</div>
          <div class="eng-help-row"><code>solve(f, g, x0)</code></div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">CAS (botones)</div>
          <div class="eng-help-row"><code>d/dx</code> derivar selección</div>
          <div class="eng-help-row"><code>∫dx</code> integrar selección</div>
          <div class="eng-help-row"><code>simplify</code> simplificar</div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Distribuciones</div>
          <div class="eng-help-row"><code>normpdf(x, μ, σ)</code> PDF normal</div>
          <div class="eng-help-row"><code>normcdf(x, μ, σ)</code> CDF normal</div>
          <div class="eng-help-row"><code>norminv(p, μ, σ)</code> cuantil normal</div>
          <div class="eng-help-row"><code>poissonpmf(k, λ)</code> PMF Poisson</div>
          <div class="eng-help-row"><code>binompmf(k, n, p)</code> PMF binomial</div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Electrónica / RF</div>
          <div class="eng-help-row"><code>db(x)</code> ratio → dB</div>
          <div class="eng-help-row"><code>from_db(dB)</code> dB → ratio</div>
          <div class="eng-help-row"><code>dbm(W)</code> vatios → dBm</div>
          <div class="eng-help-row"><code>from_dbm(dBm)</code> dBm → W</div>
          <div class="eng-help-row"><code>parallel(R1,R2,...)</code> R paralelas</div>
          <div class="eng-help-row"><code>rms(a,b,...)</code> valor eficaz</div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Constantes físicas/quím.</div>
          <div class="eng-help-row"><code>c</code> vel. luz (m/s)</div>
          <div class="eng-help-row"><code>h</code> Planck (J·s)</div>
          <div class="eng-help-row"><code>hbar</code> ℏ reducida</div>
          <div class="eng-help-row"><code>k</code> Boltzmann (J/K)</div>
          <div class="eng-help-row"><code>Na</code> Avogadro (mol⁻¹)</div>
          <div class="eng-help-row"><code>R</code> gas ideal (J/mol·K)</div>
          <div class="eng-help-row"><code>G</code> gravitacional</div>
          <div class="eng-help-row"><code>g</code> gravedad estándar</div>
          <div class="eng-help-row"><code>Fa</code> Faraday (C/mol)</div>
          <div class="eng-help-row"><code>Vm</code> vol. molar STP (m³/mol)</div>
          <div class="eng-help-row"><code>atm</code> 1 atm en Pa</div>
          <div class="eng-help-row"><code>epsilon0 mu0</code> vacío</div>
          <div class="eng-help-row"><code>me mp mn</code> masas part.</div>
          <div class="eng-help-row"><code>e_charge</code> carga electrón</div>
          <div class="eng-help-row"><code>sigma</code> Stefan-Boltzmann</div>
          <div class="eng-help-row"><code>alpha</code> estructura fina</div>
          <div class="eng-help-row"><code>a0</code> radio de Bohr</div>
          <div class="eng-help-row"><code>deg2rad rad2deg</code></div>
        </div>
        <div class="eng-help-section">
          <div class="eng-help-cat">Funciones esp. / Utilidades</div>
          <div class="eng-help-row"><code>gamma(x)</code> Γ función</div>
          <div class="eng-help-row"><code>erf(x) erfc(x)</code></div>
          <div class="eng-help-row"><code>beta(a,b)</code></div>
          <div class="eng-help-row"><code>besselj(n,x)</code> Bessel J</div>
          <div class="eng-help-row"><code>bessely(n,x)</code> Bessel Y</div>
          <div class="eng-help-row"><code>taylor(f,a,n,x)</code> serie Taylor</div>
          <div class="eng-help-row"><code>maclaurin(f,n,x)</code> en a=0</div>
          <div class="eng-help-row"><code>w(x)</code> Lambert W</div>
          <div class="eng-help-row"><code>sinc(x)</code> sin(x)/x</div>
          <div class="eng-help-row"><code>nthroot(n, x)</code> raíz n-ésima</div>
          <div class="eng-help-row"><code>isprime(n)</code> ¿es primo?</div>
          <div class="eng-help-row"><code>clamp(x, min, max)</code></div>
          <div class="eng-help-row"><code>lerp(a, b, t)</code></div>
          <div class="eng-help-row"><code>sign(x)</code></div>
          <div class="eng-help-row"><code>rand()</code> aleatorio [0,1)</div>
        </div>
      </div>
      <div class="eng-sidebar-ops">
        <span class="eng-ops-label">Operaciones</span>
        <div class="eng-ops-grid">
          <button class="eng-op-btn" data-op="diff" title="Derivar respecto a x">d/dx</button>
          <button class="eng-op-btn" data-op="integrate" title="Integrar respecto a x">∫dx</button>
          <button class="eng-op-btn" data-op="simplify" title="Simplificar expresión">simplify</button>
          <button class="eng-op-btn" data-op="factor" title="Factorizar">factor</button>
        </div>
        <div class="eng-angle-row">
          <span class="eng-ops-label">Ángulos</span>
          <div class="eng-ops-grid">
            <button class="eng-op-btn eng-angle-btn ${state.angleMode === "DEG" ? "active" : ""}" data-angle="DEG">DEG</button>
            <button class="eng-op-btn eng-angle-btn ${state.angleMode === "RAD" ? "active" : ""}" data-angle="RAD">RAD</button>
          </div>
        </div>
      </div>
    </div>
    <div class="eng-main">
      <div class="eng-output" id="eng-output"></div>
      <div class="eng-input-wrap">
        <textarea class="eng-input" id="eng-input" rows="3"
          placeholder="Escribe expresiones o asignaciones:&#10;a = 5&#10;b = sqrt(3)&#10;a^2 + b&#10;sin(pi/4)"
          spellcheck="false" autocorrect="off" autocapitalize="off"></textarea>
        <div class="eng-input-actions">
          <button class="eng-run-btn" id="eng-run">▶ Ejecutar</button>
          <button class="eng-btn-small" id="eng-clear-output" title="Limpiar salida">Limpiar</button>
        </div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const textarea = wrap.querySelector<HTMLTextAreaElement>("#eng-input")!;
    const output = wrap.querySelector<HTMLDivElement>("#eng-output")!;
    const varsList = wrap.querySelector<HTMLDivElement>("#eng-vars-list")!;
    const helpPanel = wrap.querySelector<HTMLDivElement>("#eng-help-panel")!;
    const helpBtn = wrap.querySelector<HTMLButtonElement>("#eng-help-btn")!;
    const sidebarTitle = wrap.querySelector<HTMLSpanElement>("#eng-sidebar-title")!;

    // Help panel toggle
    helpBtn.addEventListener("click", () => {
      const showing = helpPanel.classList.toggle("visible");
      varsList.style.display = showing ? "none" : "";
      sidebarTitle.textContent = showing ? "Referencia" : "Variables";
      helpBtn.classList.toggle("active", showing);
    });

    async function refreshVars() {
      try {
        const vars = await casVars();
        const entries = Object.entries(vars).filter(([k]) => k !== "ans");
        if (entries.length === 0) {
          varsList.innerHTML = `<span class="eng-empty-hint">Sin variables definidas</span>`;
        } else {
          varsList.innerHTML = entries.map(([name, val]) =>
            `<div class="eng-var-entry">
              <span class="eng-var-name">${escapeHtml(name)}</span>
              <span class="eng-var-eq">=</span>
              <span class="eng-var-val">${escapeHtml(val)}</span>
            </div>`
          ).join("");
        }
      } catch {}
    }

    // History navigation
    const cmdHistory: string[] = [];
    let histIdx = -1;

    async function runProgram(input: string) {
      if (input.trim()) {
        cmdHistory.unshift(input);
        if (cmdHistory.length > 50) cmdHistory.pop();
      }
      histIdx = -1;
      if (!input.trim()) return;
      const block = document.createElement("div");
      block.className = "eng-block";

      // Input display
      const inputDiv = document.createElement("div");
      inputDiv.className = "eng-block-input";
      inputDiv.textContent = input;
      block.appendChild(inputDiv);

      try {
        const results = await casExec(input);
        for (const r of results) {
          const row = document.createElement("div");
          row.className = "eng-block-result";
          const isMatrix = r.value.startsWith('[') && r.value.includes(';');
          if (isMatrix) row.classList.add("has-matrix");
          if (r.name) {
            row.innerHTML = `<span class="eng-res-name">${escapeHtml(r.name)}</span><span class="eng-res-eq">=</span><span class="eng-res-val">${renderEngValue(r.value)}</span>`;
          } else {
            row.innerHTML = `<span class="eng-res-arrow">→</span><span class="eng-res-val">${renderEngValue(r.value)}</span>`;
          }
          // Click: copy to input; Ctrl+click: copy to clipboard
          row.addEventListener("click", (e) => {
            if (e.ctrlKey || e.metaKey) {
              navigator.clipboard?.writeText(r.value);
              row.classList.add("copied");
              setTimeout(() => row.classList.remove("copied"), 600);
            } else {
              textarea.value = r.value;
              textarea.focus();
            }
          });
          row.title = "Click → pegar en entrada   Ctrl+Click → copiar";
          block.appendChild(row);
        }
      } catch (err: any) {
        const errDiv = document.createElement("div");
        errDiv.className = "eng-block-error";
        errDiv.textContent = "Error: " + (err?.message ?? String(err));
        block.appendChild(errDiv);
      }

      output.appendChild(block);
      output.scrollTop = output.scrollHeight;
      await refreshVars();
    }

    // Run button
    wrap.querySelector("#eng-run")!.addEventListener("click", async () => {
      const input = textarea.value;
      await runProgram(input);
      textarea.value = "";
      textarea.focus();
    });

    // Shift+Enter runs, Enter is newline
    textarea.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        const input = textarea.value;
        await runProgram(input);
        textarea.value = "";
        return;
      }
      // ↑↓ history navigation (only on single-line or when at start/end)
      if (e.key === "ArrowUp" && !e.shiftKey && cmdHistory.length > 0) {
        const lines = textarea.value.split("\n");
        const cursorAtStart = textarea.selectionStart === 0;
        if (lines.length === 1 || cursorAtStart) {
          e.preventDefault();
          histIdx = Math.min(histIdx + 1, cmdHistory.length - 1);
          textarea.value = cmdHistory[histIdx] ?? "";
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      } else if (e.key === "ArrowDown" && !e.shiftKey && histIdx >= 0) {
        const lines = textarea.value.split("\n");
        const cursorAtEnd = textarea.selectionStart === textarea.value.length;
        if (lines.length === 1 || cursorAtEnd) {
          e.preventDefault();
          histIdx--;
          textarea.value = histIdx >= 0 ? (cmdHistory[histIdx] ?? "") : "";
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      }
    });

    // Clear output
    wrap.querySelector("#eng-clear-output")!.addEventListener("click", () => {
      output.innerHTML = "";
    });

    // Clear variables
    wrap.querySelector("#eng-clear-vars")!.addEventListener("click", async () => {
      await casClear();
      await refreshVars();
    });

    // Operations toolbar
    wrap.querySelectorAll<HTMLButtonElement>(".eng-op-btn[data-op]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const op = btn.dataset.op!;
        const sel = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
          || textarea.value.trim();
        if (!sel) return;

        let cmd = "";
        if (op === "diff") cmd = `diff(${sel}, x)`;
        else if (op === "integrate") {
          cmd = `integrate(${sel}, x, -10, 10)`;
        } else if (op === "simplify") cmd = `simplify(${sel})`;
        else if (op === "factor") cmd = `factor(${sel})`;

        if (op === "diff") {
          try {
            const result = await casDiff(sel, "x");
            const block = document.createElement("div");
            block.className = "eng-block";
            block.innerHTML = `
              <div class="eng-block-input">d/dx(${escapeHtml(sel)})</div>
              <div class="eng-block-result"><span class="eng-res-arrow">→</span><span class="eng-res-val">${escapeHtml(result)}</span></div>
            `;
            block.querySelector(".eng-block-result")!.addEventListener("click", () => {
              textarea.value = result;
              textarea.focus();
            });
            output.appendChild(block);
            output.scrollTop = output.scrollHeight;
          } catch (err: any) {
            const block = document.createElement("div");
            block.className = "eng-block";
            block.innerHTML = `<div class="eng-block-error">Error: ${escapeHtml(String(err?.message ?? err))}</div>`;
            output.appendChild(block);
            output.scrollTop = output.scrollHeight;
          }
        } else if (op === "integrate") {
          // Show a dialog-like inline form for limits
          textarea.value = `integrate(${sel}, x, 0, 1)`;
          textarea.focus();
        }
      });
    });

    // Angle mode buttons
    wrap.querySelectorAll<HTMLButtonElement>(".eng-angle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const angle = btn.dataset.angle as "DEG" | "RAD";
        state.angleMode = angle;
        wrap.querySelectorAll(".eng-angle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    // Initial var refresh
    refreshVars();
    textarea.focus();
  });

  return wrap;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render a CAS result value as HTML.
 *  Matrix strings like "[1, 2; 3, 4]" become a grid table.
 *  Everything else is plain escaped text.
 */
function renderEngValue(val: string): string {
  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return escapeHtml(val);
    const rows = inner.split(';').map(r => r.trim().split(',').map(c => c.trim()));
    const ncols = rows[0]?.length ?? 0;
    // Only render as table if it looks like a proper matrix (≥2 elements)
    if ((rows.length > 1 || ncols > 1) && rows.every(r => r.length === ncols && r.every(c => c.length > 0))) {
      const rowsHtml = rows.map(row =>
        `<div class="eng-matrix-row">${row.map(c => `<span class="eng-matrix-cell">${escapeHtml(c)}</span>`).join('')}</div>`
      ).join('');
      return `<div class="eng-matrix">${rowsHtml}</div>`;
    }
  }
  return escapeHtml(val);
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
        <button class="graph-ctrl-btn" id="graph-export" title="Exportar PNG">↓ PNG</button>
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

    document.getElementById("graph-export")?.addEventListener("click", () => {
      grapherInstance?.exportPng();
    });
  });

  return wrap;
}

// ── Chemistry layout ───────────────────────────────────────────────────
function buildChemistryLayout(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "chem-layout";

  wrap.innerHTML = `
    <div class="chem-scroll">

      <!-- ── Molar Mass ── -->
      <div class="chem-card">
        <div class="chem-card-title">⚗ Masa Molar</div>
        <div class="chem-row">
          <input class="chem-input" id="chem-mm-formula" placeholder="H2O, C6H12O6, (NH4)2SO4…" autocomplete="off" spellcheck="false" />
          <button class="chem-btn" id="chem-mm-calc">Calcular</button>
        </div>
        <div class="chem-result chem-mm-result" id="chem-mm-result"></div>
        <div class="chem-breakdown" id="chem-mm-breakdown"></div>
      </div>

      <!-- ── Gas Law ── -->
      <div class="chem-card">
        <div class="chem-card-title">🔵 Ley del Gas Ideal · PV = nRT</div>
        <div class="chem-gas-grid">
          <div class="chem-gas-field">
            <label class="chem-label">P (Presión)</label>
            <div class="chem-gas-row">
              <input class="chem-input chem-gas-input" id="gas-P" placeholder="—" type="number" min="0" />
              <select class="chem-select" id="gas-P-unit">
                <option>Pa</option><option>kPa</option><option>MPa</option>
                <option selected>atm</option><option>bar</option>
                <option>mmHg</option><option>psi</option>
              </select>
            </div>
          </div>
          <div class="chem-gas-field">
            <label class="chem-label">V (Volumen)</label>
            <div class="chem-gas-row">
              <input class="chem-input chem-gas-input" id="gas-V" placeholder="—" type="number" min="0" />
              <select class="chem-select" id="gas-V-unit">
                <option>m³</option><option selected>L</option>
                <option>mL</option><option>cm³</option>
              </select>
            </div>
          </div>
          <div class="chem-gas-field">
            <label class="chem-label">n (Moles)</label>
            <div class="chem-gas-row">
              <input class="chem-input chem-gas-input" id="gas-n" placeholder="—" type="number" min="0" />
              <span class="chem-unit-label">mol</span>
            </div>
          </div>
          <div class="chem-gas-field">
            <label class="chem-label">T (Temperatura)</label>
            <div class="chem-gas-row">
              <input class="chem-input chem-gas-input" id="gas-T" placeholder="—" type="number" />
              <select class="chem-select" id="gas-T-unit">
                <option>K</option><option selected>°C</option><option>°F</option>
              </select>
            </div>
          </div>
        </div>
        <div class="chem-gas-hint">Deja un campo en blanco para calcularlo</div>
        <button class="chem-btn chem-btn-wide" id="gas-calc">Resolver</button>
        <div class="chem-result" id="gas-result"></div>
      </div>

      <!-- ── Element Lookup ── -->
      <div class="chem-card">
        <div class="chem-card-title">🔬 Elemento Químico</div>
        <div class="chem-row">
          <input class="chem-input" id="chem-elem-search" placeholder="Símbolo (Fe), nombre (Hierro) o número (26)…" autocomplete="off" />
          <button class="chem-btn" id="chem-elem-btn">Buscar</button>
        </div>
        <div id="chem-elem-result"></div>
      </div>

      <!-- ── pH Calculator ── -->
      <div class="chem-card">
        <div class="chem-card-title">🧪 Calculadora de pH</div>
        <div class="chem-ph-tabs">
          <button class="chem-ph-tab active" data-tab="strong">Ácido/base fuerte</button>
          <button class="chem-ph-tab" data-tab="weak">Ácido/base débil</button>
          <button class="chem-ph-tab" data-tab="buffer">Buffer (H-H)</button>
          <button class="chem-ph-tab" data-tab="conv">Conversión</button>
        </div>

        <div class="chem-ph-panel" id="ph-panel-strong">
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">Tipo:</label>
            <select class="chem-select" id="ph-strong-type" style="flex:1">
              <option value="acid">Ácido fuerte</option>
              <option value="base">Base fuerte</option>
            </select>
          </div>
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">Concentración (mol/L):</label>
            <input class="chem-input" id="ph-strong-conc" type="number" placeholder="0.1" min="0" style="flex:1" />
          </div>
          <button class="chem-btn chem-btn-wide" id="ph-strong-calc">Calcular pH</button>
          <div class="chem-result" id="ph-strong-result"></div>
        </div>

        <div class="chem-ph-panel" id="ph-panel-weak" style="display:none">
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">Tipo:</label>
            <select class="chem-select" id="ph-weak-type" style="flex:1">
              <option value="acid">Ácido débil</option>
              <option value="base">Base débil</option>
            </select>
          </div>
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">Ka o Kb:</label>
            <input class="chem-input" id="ph-weak-k" type="number" placeholder="1.8e-5" min="0" style="flex:1" />
          </div>
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">Concentración (mol/L):</label>
            <input class="chem-input" id="ph-weak-conc" type="number" placeholder="0.1" min="0" style="flex:1" />
          </div>
          <button class="chem-btn chem-btn-wide" id="ph-weak-calc">Calcular pH</button>
          <div class="chem-result" id="ph-weak-result"></div>
        </div>

        <div class="chem-ph-panel" id="ph-panel-buffer" style="display:none">
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">pKa:</label>
            <input class="chem-input" id="ph-buf-pka" type="number" placeholder="4.74" style="flex:1" />
          </div>
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">[A⁻] base conjugada:</label>
            <input class="chem-input" id="ph-buf-base" type="number" placeholder="0.1" min="0" style="flex:1" />
          </div>
          <div class="chem-row">
            <label class="chem-label" style="min-width:140px">[HA] ácido:</label>
            <input class="chem-input" id="ph-buf-acid" type="number" placeholder="0.1" min="0" style="flex:1" />
          </div>
          <button class="chem-btn chem-btn-wide" id="ph-buf-calc">Calcular pH buffer</button>
          <div class="chem-result" id="ph-buf-result"></div>
        </div>

        <div class="chem-ph-panel" id="ph-panel-conv" style="display:none">
          <div class="chem-row">
            <label class="chem-label" style="min-width:80px">pH:</label>
            <input class="chem-input" id="ph-conv-ph" type="number" placeholder="7" style="flex:1" />
            <button class="chem-btn" id="ph-from-ph">→ [H⁺]</button>
          </div>
          <div class="chem-row">
            <label class="chem-label" style="min-width:80px">[H⁺] mol/L:</label>
            <input class="chem-input" id="ph-conv-conc" type="number" placeholder="1e-7" min="0" style="flex:1" />
            <button class="chem-btn" id="ph-from-conc">→ pH</button>
          </div>
          <div class="chem-result" id="ph-conv-result"></div>
        </div>
      </div>

    </div>
  `;

  requestAnimationFrame(() => {
    // ── Molar Mass logic ──────────────────────────────────────
    const mmInput = wrap.querySelector<HTMLInputElement>("#chem-mm-formula")!;
    const mmResult = wrap.querySelector<HTMLElement>("#chem-mm-result")!;
    const mmBreakdown = wrap.querySelector<HTMLElement>("#chem-mm-breakdown")!;

    function calcMolarMass() {
      const formula = mmInput.value.trim();
      if (!formula) { mmResult.textContent = ""; mmBreakdown.innerHTML = ""; return; }
      const res = parseMolarMass(formula);
      if (res.error) {
        mmResult.innerHTML = `<span class="chem-err">${escapeHtml(res.error)}</span>`;
        mmBreakdown.innerHTML = "";
        return;
      }
      mmResult.innerHTML = `<span class="chem-big">${fmtChem(res.mass, 6)}</span> <span class="chem-unit">g/mol</span>`;
      mmBreakdown.innerHTML = `
        <table class="chem-table">
          <thead><tr><th>Elemento</th><th>N</th><th>Masa atómica</th><th>Contribución</th><th>%</th></tr></thead>
          <tbody>
            ${res.breakdown.map(b => `
              <tr>
                <td><strong>${escapeHtml(b.sym)}</strong></td>
                <td>${b.count}</td>
                <td>${fmtChem(b.massPerAtom, 6)} u</td>
                <td>${fmtChem(b.totalMass, 6)} u</td>
                <td>${(b.totalMass / res.mass * 100).toFixed(2)}%</td>
              </tr>`).join("")}
          </tbody>
        </table>`;
    }

    wrap.querySelector("#chem-mm-calc")!.addEventListener("click", calcMolarMass);
    mmInput.addEventListener("keydown", e => { if (e.key === "Enter") calcMolarMass(); });

    // ── Gas Law logic ─────────────────────────────────────────
    const gasResult = wrap.querySelector<HTMLElement>("#gas-result")!;

    wrap.querySelector("#gas-calc")!.addEventListener("click", () => {
      const pStr = (wrap.querySelector<HTMLInputElement>("#gas-P")!).value.trim();
      const vStr = (wrap.querySelector<HTMLInputElement>("#gas-V")!).value.trim();
      const nStr = (wrap.querySelector<HTMLInputElement>("#gas-n")!).value.trim();
      const tStr = (wrap.querySelector<HTMLInputElement>("#gas-T")!).value.trim();
      const pUnit = (wrap.querySelector<HTMLSelectElement>("#gas-P-unit")!).value;
      const vUnit = (wrap.querySelector<HTMLSelectElement>("#gas-V-unit")!).value;
      const tUnit = (wrap.querySelector<HTMLSelectElement>("#gas-T-unit")!).value;

      const state: GasState = {
        P: pStr ? toPascal(parseFloat(pStr), pUnit) : null,
        V: vStr ? toM3(parseFloat(vStr), vUnit) : null,
        n: nStr ? parseFloat(nStr) : null,
        T: tStr ? toKelvin(parseFloat(tStr), tUnit) : null,
      };

      const res = solveGasLaw(state);
      if (res.error) {
        gasResult.innerHTML = `<span class="chem-err">${escapeHtml(res.error)}</span>`;
        return;
      }

      const formatGasVal = (varName: "P"|"V"|"n"|"T") => {
        const val = res[varName]!;
        const isSolved = res.solvedVar === varName;
        switch (varName) {
          case "P": return `${isSolved ? "→ " : ""}<strong>P</strong> = ${fmtChem(fromPascal(val, pUnit))} ${pUnit} <span class="chem-dim">(${fmtChem(val)} Pa)</span>`;
          case "V": return `${isSolved ? "→ " : ""}<strong>V</strong> = ${fmtChem(fromM3(val, vUnit))} ${vUnit} <span class="chem-dim">(${fmtChem(val)} m³)</span>`;
          case "n": return `${isSolved ? "→ " : ""}<strong>n</strong> = ${fmtChem(val)} mol`;
          case "T": return `${isSolved ? "→ " : ""}<strong>T</strong> = ${fmtChem(fromKelvin(val, tUnit))} ${tUnit} <span class="chem-dim">(${fmtChem(val)} K)</span>`;
        }
      };

      gasResult.innerHTML = `
        <div class="chem-gas-result-grid">
          <div class="${res.solvedVar === "P" ? "chem-solved" : ""}">${formatGasVal("P")}</div>
          <div class="${res.solvedVar === "V" ? "chem-solved" : ""}">${formatGasVal("V")}</div>
          <div class="${res.solvedVar === "n" ? "chem-solved" : ""}">${formatGasVal("n")}</div>
          <div class="${res.solvedVar === "T" ? "chem-solved" : ""}">${formatGasVal("T")}</div>
        </div>`;

      // Fill solved value back into input
      if (res.solvedVar === "P") {
        (wrap.querySelector<HTMLInputElement>("#gas-P")!).value = String(parseFloat(fmtChem(fromPascal(res.P!, pUnit))));
      } else if (res.solvedVar === "V") {
        (wrap.querySelector<HTMLInputElement>("#gas-V")!).value = String(parseFloat(fmtChem(fromM3(res.V!, vUnit))));
      } else if (res.solvedVar === "n") {
        (wrap.querySelector<HTMLInputElement>("#gas-n")!).value = String(parseFloat(fmtChem(res.n!)));
      } else if (res.solvedVar === "T") {
        (wrap.querySelector<HTMLInputElement>("#gas-T")!).value = String(parseFloat(fmtChem(fromKelvin(res.T!, tUnit))));
      }
    });

    // ── Element Lookup logic ──────────────────────────────────
    const elemSearch = wrap.querySelector<HTMLInputElement>("#chem-elem-search")!;
    const elemResult = wrap.querySelector<HTMLElement>("#chem-elem-result")!;

    function lookupElement() {
      const q = elemSearch.value.trim();
      if (!q) { elemResult.innerHTML = ""; return; }
      const elem = findElement(q);
      if (!elem) {
        elemResult.innerHTML = `<div class="chem-err">Elemento no encontrado: "${escapeHtml(q)}"</div>`;
        return;
      }
      const catLabel = CAT_LABELS[elem.cat] ?? elem.cat;
      const catClass = `cat-${elem.cat}`;
      elemResult.innerHTML = `
        <div class="chem-elem-card">
          <div class="chem-elem-badge ${catClass}">
            <div class="chem-elem-z">${elem.z}</div>
            <div class="chem-elem-sym">${escapeHtml(elem.sym)}</div>
          </div>
          <div class="chem-elem-info">
            <div class="chem-elem-name">${escapeHtml(elem.name)}</div>
            <div class="chem-elem-detail">Masa atómica: <strong>${fmtChem(elem.mass, 6)} u</strong> (g/mol)</div>
            <div class="chem-elem-detail">Período: ${elem.period}${elem.group > 0 ? `  · Grupo: ${elem.group}` : ""}</div>
            <div class="chem-elem-detail">Categoría: ${catLabel}</div>
            <div class="chem-elem-detail chem-dim">1 mol = ${fmtChem(elem.mass, 6)} g</div>
          </div>
        </div>`;
    }

    wrap.querySelector("#chem-elem-btn")!.addEventListener("click", lookupElement);
    elemSearch.addEventListener("keydown", e => { if (e.key === "Enter") lookupElement(); });

    // ── pH tabs ────────────────────────────────────────────────
    const phPanels: Record<string, HTMLElement> = {
      strong: wrap.querySelector("#ph-panel-strong")!,
      weak:   wrap.querySelector("#ph-panel-weak")!,
      buffer: wrap.querySelector("#ph-panel-buffer")!,
      conv:   wrap.querySelector("#ph-panel-conv")!,
    };

    wrap.querySelectorAll<HTMLButtonElement>(".chem-ph-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        wrap.querySelectorAll(".chem-ph-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const panel = tab.dataset.tab!;
        Object.values(phPanels).forEach(p => (p.style.display = "none"));
        phPanels[panel].style.display = "";
      });
    });

    // Strong acid/base
    wrap.querySelector("#ph-strong-calc")!.addEventListener("click", () => {
      const c = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-strong-conc")!).value);
      const type = (wrap.querySelector<HTMLSelectElement>("#ph-strong-type")!).value;
      const res = wrap.querySelector<HTMLElement>("#ph-strong-result")!;
      if (isNaN(c) || c <= 0) { res.innerHTML = `<span class="chem-err">Concentración inválida</span>`; return; }
      const ph = type === "acid" ? strongAcidPH(c) : strongBasePH(c);
      const poh = 14 - ph;
      res.innerHTML = renderPhResult(ph, poh);
    });

    // Weak acid/base
    wrap.querySelector("#ph-weak-calc")!.addEventListener("click", () => {
      const k = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-weak-k")!).value);
      const c = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-weak-conc")!).value);
      const type = (wrap.querySelector<HTMLSelectElement>("#ph-weak-type")!).value;
      const res = wrap.querySelector<HTMLElement>("#ph-weak-result")!;
      if (isNaN(k) || k <= 0 || isNaN(c) || c <= 0) { res.innerHTML = `<span class="chem-err">Valores inválidos</span>`; return; }
      const ph = type === "acid" ? weakAcidPH(k, c) : weakBasePH(k, c);
      const poh = 14 - ph;
      res.innerHTML = isNaN(ph)
        ? `<span class="chem-err">Error en cálculo (verifica Ka/Kb y concentración)</span>`
        : renderPhResult(ph, poh);
    });

    // Buffer (Henderson-Hasselbalch)
    wrap.querySelector("#ph-buf-calc")!.addEventListener("click", () => {
      const pka = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-buf-pka")!).value);
      const base = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-buf-base")!).value);
      const acid = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-buf-acid")!).value);
      const res = wrap.querySelector<HTMLElement>("#ph-buf-result")!;
      if (isNaN(pka) || isNaN(base) || isNaN(acid) || acid <= 0 || base <= 0) {
        res.innerHTML = `<span class="chem-err">Valores inválidos</span>`; return;
      }
      const ph = bufferPH(pka, base, acid);
      res.innerHTML = `
        ${renderPhResult(ph, 14 - ph)}
        <div class="chem-dim" style="margin-top:4px">Henderson-Hasselbalch: pH = pKa + log([A⁻]/[HA])</div>`;
    });

    // Conversion tab
    wrap.querySelector("#ph-from-ph")!.addEventListener("click", () => {
      const ph = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-conv-ph")!).value);
      const res = wrap.querySelector<HTMLElement>("#ph-conv-result")!;
      if (isNaN(ph)) { res.innerHTML = `<span class="chem-err">pH inválido</span>`; return; }
      const conc = concFromPH(ph);
      res.innerHTML = `[H⁺] = <strong>${fmtChem(conc)}</strong> mol/L   (pOH = ${fmtChem(14 - ph)})`;
      (wrap.querySelector<HTMLInputElement>("#ph-conv-conc")!).value = fmtChem(conc);
    });

    wrap.querySelector("#ph-from-conc")!.addEventListener("click", () => {
      const conc = parseFloat((wrap.querySelector<HTMLInputElement>("#ph-conv-conc")!).value);
      const res = wrap.querySelector<HTMLElement>("#ph-conv-result")!;
      if (isNaN(conc) || conc <= 0) { res.innerHTML = `<span class="chem-err">Concentración inválida</span>`; return; }
      const ph = pHFromConc(conc);
      res.innerHTML = `pH = <strong>${fmtChem(ph, 4)}</strong>   (pOH = ${fmtChem(14 - ph)})`;
      (wrap.querySelector<HTMLInputElement>("#ph-conv-ph")!).value = fmtChem(ph);
    });
  });

  return wrap;
}

function renderPhResult(ph: number, poh: number): string {
  const phColor = ph < 7 ? "#e05050" : ph > 7 ? "#3484e2" : "#18b050";
  const label = ph < 7 ? "Ácido" : ph > 7 ? "Básico" : "Neutro";
  const hConc = concFromPH(ph);
  const ohConc = concFromPH(poh);
  return `
    <div class="chem-ph-display">
      <div class="chem-ph-value" style="color:${phColor}">pH = ${fmtChem(ph, 4)}</div>
      <div class="chem-ph-meta">
        <span class="chem-ph-label" style="color:${phColor}">${label}</span>
        <span>pOH = ${fmtChem(poh, 4)}</span>
        <span>[H⁺] = ${fmtChem(hConc)} mol/L</span>
        <span>[OH⁻] = ${fmtChem(ohConc)} mol/L</span>
      </div>
    </div>`;
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
      <button class="graph-polar-btn ${fn.polar ? 'active' : ''}" data-idx="${i}" title="${fn.polar ? 'Modo polar (r=f(θ)) — click para cartesiano' : 'Modo cartesiano (y=f(x)) — click para polar'}">θ</button>
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

  // Wire polar toggle buttons
  container.querySelectorAll<HTMLButtonElement>(".graph-polar-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.idx);
      graphFunctions[i].polar = !graphFunctions[i].polar;
      btn.classList.toggle("active", graphFunctions[i].polar ?? false);
      btn.title = graphFunctions[i].polar
        ? "Modo polar (r=f(θ)) — click para cartesiano"
        : "Modo cartesiano (y=f(x)) — click para polar";
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
