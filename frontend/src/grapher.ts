import { evalExpression, type AngleMode } from "./engine.ts";

export interface GraphView {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface FnEntry {
  expr: string;
  color: string;
}

const FN_COLORS = ["#3858e8", "#e02858", "#18d880", "#9035d8", "#f0a030"];
const AXIS_COLOR = "rgba(150, 175, 220, 0.55)";
const GRID_COLOR = "rgba(88, 120, 172, 0.14)";
const LABEL_COLOR = "rgba(140, 168, 216, 0.55)";

export function createGrapher(
  canvas: HTMLCanvasElement,
  angleMode: () => AngleMode,
  coordsEl?: HTMLElement,
): {
  setFunctions: (fns: FnEntry[]) => void;
  redraw: () => void;
  resetView: () => void;
  destroy: () => void;
} {
  const ctx = canvas.getContext("2d")!;
  const container = canvas.parentElement ?? canvas;
  let view: GraphView = { xMin: -10, xMax: 10, yMin: -8, yMax: 8 };
  let functions: FnEntry[] = [];
  let cssWidth = 0;
  let cssHeight = 0;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let resizeRaf = 0;

  // Pinch state
  let pinchDist0 = 0;
  let pinchView0: GraphView | null = null;
  let pinchCx = 0;
  let pinchCy = 0;

  // ── Resize observer ─────────────────────────────
  const scheduleResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { fitCanvas(); redraw(); });
  };
  const resizeObs = new ResizeObserver(() => scheduleResize());
  resizeObs.observe(container);

  // ── Pan (pointer events) ─────────────────────────
  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const { w, h } = logicalSize();
    if (w <= 0 || h <= 0) return;
    const xRange = view.xMax - view.xMin;
    const yRange = view.yMax - view.yMin;
    view.xMin -= dx / w * xRange;
    view.xMax -= dx / w * xRange;
    view.yMin += dy / h * yRange;
    view.yMax += dy / h * yRange;
    redraw();
  };
  const stopDragging = () => { dragging = false; };

  // ── Wheel zoom (smooth for trackpad) ─────────────
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 30;
    else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 300;
    const factor = Math.pow(1.0018, delta);
    const rect = canvas.getBoundingClientRect();
    const cx = view.xMin + (e.clientX - rect.left) / rect.width * (view.xMax - view.xMin);
    const cy = view.yMin + (1 - (e.clientY - rect.top) / rect.height) * (view.yMax - view.yMin);
    view.xMin = cx + (view.xMin - cx) * factor;
    view.xMax = cx + (view.xMax - cx) * factor;
    view.yMin = cy + (view.yMin - cy) * factor;
    view.yMax = cy + (view.yMax - cy) * factor;
    redraw();
  };

  // ── Pinch-to-zoom (touch / trackpad gesture) ─────
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    dragging = false;
    const t0 = e.touches[0], t1 = e.touches[1];
    pinchDist0 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    pinchView0 = { ...view };
    const rect = canvas.getBoundingClientRect();
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;
    pinchCx = view.xMin + (midX - rect.left) / rect.width * (view.xMax - view.xMin);
    pinchCy = view.yMin + (1 - (midY - rect.top) / rect.height) * (view.yMax - view.yMin);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !pinchView0 || pinchDist0 === 0) return;
    e.preventDefault();
    const t0 = e.touches[0], t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const scale = pinchDist0 / dist;
    const xRange = (pinchView0.xMax - pinchView0.xMin) * scale;
    const yRange = (pinchView0.yMax - pinchView0.yMin) * scale;
    const px = (pinchCx - pinchView0.xMin) / (pinchView0.xMax - pinchView0.xMin);
    const py = (pinchCy - pinchView0.yMin) / (pinchView0.yMax - pinchView0.yMin);
    view.xMin = pinchCx - px * xRange;
    view.xMax = pinchCx + (1 - px) * xRange;
    view.yMin = pinchCy - py * yRange;
    view.yMax = pinchCy + (1 - py) * yRange;
    redraw();
  };
  const onTouchEnd = () => { pinchView0 = null; };

  // ── Hover coordinates ────────────────────────────
  const onMouseMove = (e: MouseEvent) => {
    if (!coordsEl) return;
    const rect = canvas.getBoundingClientRect();
    const gx = view.xMin + (e.clientX - rect.left) / rect.width * (view.xMax - view.xMin);
    const gy = view.yMin + (1 - (e.clientY - rect.top) / rect.height) * (view.yMax - view.yMin);
    coordsEl.textContent = `x = ${fmtCoord(gx)},  y = ${fmtCoord(gy)}`;
    coordsEl.style.display = "";
  };
  const onMouseLeave = () => {
    if (coordsEl) coordsEl.style.display = "none";
  };

  // ── Register all listeners ───────────────────────
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseleave", onMouseLeave);
  window.addEventListener("resize", scheduleResize);

  function fitCanvas() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    cssWidth = width;
    cssHeight = height;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function logicalSize() {
    if (cssWidth > 0 && cssHeight > 0) return { w: cssWidth, h: cssHeight };
    const rect = container.getBoundingClientRect();
    return { w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) };
  }

  function redraw() {
    const { w, h } = logicalSize();
    if (w <= 0 || h <= 0) return;
    ctx.clearRect(0, 0, w, h);
    const toX = (x: number) => (x - view.xMin) / (view.xMax - view.xMin) * w;
    const toY = (y: number) => h - (y - view.yMin) / (view.yMax - view.yMin) * h;
    drawGrid(ctx, w, h, view, toX, toY);
    drawAxes(ctx, w, h, view, toX, toY);
    functions.forEach(fn => {
      if (!fn.expr.trim()) return;
      plotFunction(ctx, w, h, fn.expr, fn.color, view, toX, toY, angleMode());
    });
  }

  function setFunctions(fns: FnEntry[]) {
    functions = fns.map((fn, i) => ({
      expr: fn.expr,
      color: fn.color || FN_COLORS[i % FN_COLORS.length],
    }));
    redraw();
  }

  function resetView() {
    view = { xMin: -10, xMax: 10, yMin: -8, yMax: 8 };
    redraw();
  }

  requestAnimationFrame(() => { fitCanvas(); redraw(); });

  function destroy() {
    cancelAnimationFrame(resizeRaf);
    resizeObs.disconnect();
    window.removeEventListener("resize", scheduleResize);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", stopDragging);
    canvas.removeEventListener("pointercancel", stopDragging);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseleave", onMouseLeave);
  }

  return { setFunctions, redraw, resetView, destroy };
}

function plotFunction(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  expr: string, color: string,
  view: GraphView,
  toX: (x: number) => number,
  toY: (y: number) => number,
  angleMode: AngleMode,
) {
  const steps = Math.max(w * 2, 800);
  const yRange = view.yMax - view.yMin;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  let penDown = false;
  let prevY: number | null = null;
  for (let s = 0; s <= steps; s++) {
    const x = view.xMin + (view.xMax - view.xMin) * s / steps;
    let y: number | null = null;
    try {
      const r = evalExpression(expr, angleMode, x);
      if (typeof r.value === "number") {
        y = r.value;
      } else if (Math.abs(r.value.im) < 1e-9) {
        y = r.value.re;
      }
      if (y !== null && !isFinite(y)) y = null;
    } catch { y = null; }
    if (y === null) { penDown = false; prevY = null; continue; }
    if (prevY !== null && Math.abs(y - prevY) > yRange * 1.5) penDown = false;
    prevY = y;
    const cx = toX(x);
    const cy = toY(y);
    if (!penDown) { ctx.moveTo(cx, cy); penDown = true; }
    else { ctx.lineTo(cx, cy); }
  }
  ctx.stroke();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  view: GraphView,
  toX: (x: number) => number,
  toY: (y: number) => number,
) {
  const xStep = niceStep((view.xMax - view.xMin) / 8);
  const yStep = niceStep((view.yMax - view.yMin) / 8);
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = "10px system-ui, sans-serif";
  const xStart = Math.ceil(view.xMin / xStep) * xStep;
  for (let x = xStart; x <= view.xMax + xStep * 0.01; x += xStep) {
    const cx = toX(x);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    if (Math.abs(x) > xStep * 0.01) {
      ctx.textAlign = "center";
      ctx.fillText(fmtLabel(x), cx, clamp(toY(0) + 14, 14, h - 4));
    }
  }
  const yStart = Math.ceil(view.yMin / yStep) * yStep;
  for (let y = yStart; y <= view.yMax + yStep * 0.01; y += yStep) {
    const cy = toY(y);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
    if (Math.abs(y) > yStep * 0.01) {
      ctx.textAlign = "right";
      ctx.fillText(fmtLabel(y), clamp(toX(0) - 4, 28, w - 4), cy + 3);
    }
  }
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  view: GraphView,
  toX: (x: number) => number,
  toY: (y: number) => number,
) {
  ctx.strokeStyle = AXIS_COLOR;
  ctx.lineWidth = 1.5;
  const axisY = clamp(toY(0), 0, h);
  ctx.beginPath(); ctx.moveTo(0, axisY); ctx.lineTo(w, axisY); ctx.stroke();
  const axisX = clamp(toX(0), 0, w);
  ctx.beginPath(); ctx.moveTo(axisX, 0); ctx.lineTo(axisX, h); ctx.stroke();
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("0", axisX - 4, axisY + 12);
}

function niceStep(rough: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / power;
  if (frac < 1.5) return power;
  if (frac < 3.5) return 2 * power;
  if (frac < 7.5) return 5 * power;
  return 10 * power;
}

function fmtLabel(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e4 || (abs < 0.01 && abs > 0)) return v.toExponential(0);
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(3).replace(/\.?0+$/, "");
}

function fmtCoord(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e4 || (abs < 0.001 && v !== 0)) return v.toExponential(2);
  return parseFloat(v.toPrecision(4)).toString();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
