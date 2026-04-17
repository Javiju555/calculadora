// chemistry.ts — Periodic table, molar mass, gas laws, pH calculations

export interface Element {
  z: number;
  sym: string;
  name: string;    // Spanish name
  mass: number;    // Standard atomic weight (u)
  period: number;
  group: number;   // 0 = lanthanide/actinide
  cat: string;     // Category
}

// Format: [Z, symbol, name_es, mass, period, group, category]
// Atomic masses from IUPAC 2021
const RAW: [number, string, string, number, number, number, string][] = [
  [1,"H","Hidrógeno",1.008,1,1,"nonmetal"],
  [2,"He","Helio",4.0026,1,18,"noble"],
  [3,"Li","Litio",6.941,2,1,"alkali"],
  [4,"Be","Berilio",9.0122,2,2,"alkaline"],
  [5,"B","Boro",10.811,2,13,"metalloid"],
  [6,"C","Carbono",12.011,2,14,"nonmetal"],
  [7,"N","Nitrógeno",14.007,2,15,"nonmetal"],
  [8,"O","Oxígeno",15.999,2,16,"nonmetal"],
  [9,"F","Flúor",18.998,2,17,"halogen"],
  [10,"Ne","Neón",20.180,2,18,"noble"],
  [11,"Na","Sodio",22.990,3,1,"alkali"],
  [12,"Mg","Magnesio",24.305,3,2,"alkaline"],
  [13,"Al","Aluminio",26.982,3,13,"post-transition"],
  [14,"Si","Silicio",28.086,3,14,"metalloid"],
  [15,"P","Fósforo",30.974,3,15,"nonmetal"],
  [16,"S","Azufre",32.065,3,16,"nonmetal"],
  [17,"Cl","Cloro",35.453,3,17,"halogen"],
  [18,"Ar","Argón",39.948,3,18,"noble"],
  [19,"K","Potasio",39.098,4,1,"alkali"],
  [20,"Ca","Calcio",40.078,4,2,"alkaline"],
  [21,"Sc","Escandio",44.956,4,3,"transition"],
  [22,"Ti","Titanio",47.867,4,4,"transition"],
  [23,"V","Vanadio",50.942,4,5,"transition"],
  [24,"Cr","Cromo",51.996,4,6,"transition"],
  [25,"Mn","Manganeso",54.938,4,7,"transition"],
  [26,"Fe","Hierro",55.845,4,8,"transition"],
  [27,"Co","Cobalto",58.933,4,9,"transition"],
  [28,"Ni","Níquel",58.693,4,10,"transition"],
  [29,"Cu","Cobre",63.546,4,11,"transition"],
  [30,"Zn","Zinc",65.38,4,12,"transition"],
  [31,"Ga","Galio",69.723,4,13,"post-transition"],
  [32,"Ge","Germanio",72.630,4,14,"metalloid"],
  [33,"As","Arsénico",74.922,4,15,"metalloid"],
  [34,"Se","Selenio",78.971,4,16,"nonmetal"],
  [35,"Br","Bromo",79.904,4,17,"halogen"],
  [36,"Kr","Kriptón",83.798,4,18,"noble"],
  [37,"Rb","Rubidio",85.468,5,1,"alkali"],
  [38,"Sr","Estroncio",87.62,5,2,"alkaline"],
  [39,"Y","Itrio",88.906,5,3,"transition"],
  [40,"Zr","Circonio",91.224,5,4,"transition"],
  [41,"Nb","Niobio",92.906,5,5,"transition"],
  [42,"Mo","Molibdeno",95.95,5,6,"transition"],
  [43,"Tc","Tecnecio",98,5,7,"transition"],
  [44,"Ru","Rutenio",101.07,5,8,"transition"],
  [45,"Rh","Rodio",102.906,5,9,"transition"],
  [46,"Pd","Paladio",106.42,5,10,"transition"],
  [47,"Ag","Plata",107.868,5,11,"transition"],
  [48,"Cd","Cadmio",112.414,5,12,"transition"],
  [49,"In","Indio",114.818,5,13,"post-transition"],
  [50,"Sn","Estaño",118.710,5,14,"post-transition"],
  [51,"Sb","Antimonio",121.760,5,15,"metalloid"],
  [52,"Te","Telurio",127.60,5,16,"metalloid"],
  [53,"I","Yodo",126.904,5,17,"halogen"],
  [54,"Xe","Xenón",131.293,5,18,"noble"],
  [55,"Cs","Cesio",132.905,6,1,"alkali"],
  [56,"Ba","Bario",137.327,6,2,"alkaline"],
  [57,"La","Lantano",138.905,6,0,"lanthanide"],
  [58,"Ce","Cerio",140.116,6,0,"lanthanide"],
  [59,"Pr","Praseodimio",140.908,6,0,"lanthanide"],
  [60,"Nd","Neodimio",144.242,6,0,"lanthanide"],
  [61,"Pm","Prometio",145,6,0,"lanthanide"],
  [62,"Sm","Samario",150.36,6,0,"lanthanide"],
  [63,"Eu","Europio",151.964,6,0,"lanthanide"],
  [64,"Gd","Gadolinio",157.25,6,0,"lanthanide"],
  [65,"Tb","Terbio",158.925,6,0,"lanthanide"],
  [66,"Dy","Disprosio",162.500,6,0,"lanthanide"],
  [67,"Ho","Holmio",164.930,6,0,"lanthanide"],
  [68,"Er","Erbio",167.259,6,0,"lanthanide"],
  [69,"Tm","Tulio",168.934,6,0,"lanthanide"],
  [70,"Yb","Iterbio",173.045,6,0,"lanthanide"],
  [71,"Lu","Lutecio",174.967,6,3,"lanthanide"],
  [72,"Hf","Hafnio",178.486,6,4,"transition"],
  [73,"Ta","Tántalo",180.948,6,5,"transition"],
  [74,"W","Wolframio",183.84,6,6,"transition"],
  [75,"Re","Renio",186.207,6,7,"transition"],
  [76,"Os","Osmio",190.23,6,8,"transition"],
  [77,"Ir","Iridio",192.217,6,9,"transition"],
  [78,"Pt","Platino",195.084,6,10,"transition"],
  [79,"Au","Oro",196.967,6,11,"transition"],
  [80,"Hg","Mercurio",200.592,6,12,"transition"],
  [81,"Tl","Talio",204.383,6,13,"post-transition"],
  [82,"Pb","Plomo",207.2,6,14,"post-transition"],
  [83,"Bi","Bismuto",208.980,6,15,"post-transition"],
  [84,"Po","Polonio",209,6,16,"metalloid"],
  [85,"At","Ástato",210,6,17,"halogen"],
  [86,"Rn","Radón",222,6,18,"noble"],
  [87,"Fr","Francio",223,7,1,"alkali"],
  [88,"Ra","Radio",226,7,2,"alkaline"],
  [89,"Ac","Actinio",227,7,0,"actinide"],
  [90,"Th","Torio",232.038,7,0,"actinide"],
  [91,"Pa","Protactinio",231.036,7,0,"actinide"],
  [92,"U","Uranio",238.029,7,0,"actinide"],
  [93,"Np","Neptunio",237,7,0,"actinide"],
  [94,"Pu","Plutonio",244,7,0,"actinide"],
  [95,"Am","Americio",243,7,0,"actinide"],
  [96,"Cm","Curio",247,7,0,"actinide"],
  [97,"Bk","Berkelio",247,7,0,"actinide"],
  [98,"Cf","Californio",251,7,0,"actinide"],
  [99,"Es","Einsteinio",252,7,0,"actinide"],
  [100,"Fm","Fermio",257,7,0,"actinide"],
  [101,"Md","Mendelevio",258,7,0,"actinide"],
  [102,"No","Nobelio",259,7,0,"actinide"],
  [103,"Lr","Lawrencio",266,7,3,"actinide"],
  [104,"Rf","Rutherfordio",267,7,4,"transition"],
  [105,"Db","Dubnio",270,7,5,"transition"],
  [106,"Sg","Seaborgio",271,7,6,"transition"],
  [107,"Bh","Bohrio",270,7,7,"transition"],
  [108,"Hs","Hassio",277,7,8,"transition"],
  [109,"Mt","Meitnerio",278,7,9,"transition"],
  [110,"Ds","Darmstadtio",281,7,10,"transition"],
  [111,"Rg","Roentgenio",282,7,11,"transition"],
  [112,"Cn","Copernicio",285,7,12,"transition"],
  [113,"Nh","Nihonio",286,7,13,"post-transition"],
  [114,"Fl","Flerovio",289,7,14,"post-transition"],
  [115,"Mc","Moscovio",290,7,15,"post-transition"],
  [116,"Lv","Livermorio",293,7,16,"post-transition"],
  [117,"Ts","Teneso",294,7,17,"halogen"],
  [118,"Og","Oganesón",294,7,18,"noble"],
];

export const ELEMENTS: Element[] = RAW.map(
  ([z, sym, name, mass, period, group, cat]) => ({ z, sym, name, mass, period, group, cat })
);

const BY_SYMBOL = new Map(ELEMENTS.map(e => [e.sym.toLowerCase(), e]));
const BY_Z = new Map(ELEMENTS.map(e => [e.z, e]));

export function findElement(query: string): Element | null {
  const q = query.trim();
  if (!q) return null;
  // By symbol (case-insensitive)
  const bySym = BY_SYMBOL.get(q.toLowerCase());
  if (bySym) return bySym;
  // By atomic number
  const n = parseInt(q);
  if (!isNaN(n) && n >= 1 && n <= 118) return BY_Z.get(n) ?? null;
  // By name (partial, case-insensitive)
  const ql = q.toLowerCase();
  return ELEMENTS.find(e => e.name.toLowerCase().startsWith(ql)) ??
         ELEMENTS.find(e => e.name.toLowerCase().includes(ql)) ?? null;
}

export const CAT_LABELS: Record<string, string> = {
  "alkali": "Metal alcalino",
  "alkaline": "Metal alcalinotérreo",
  "transition": "Metal de transición",
  "post-transition": "Metal post-transición",
  "metalloid": "Metaloide",
  "nonmetal": "No metal",
  "halogen": "Halógeno",
  "noble": "Gas noble",
  "lanthanide": "Lantánido",
  "actinide": "Actínido",
};

// ── Molar Mass ──────────────────────────────────────────────────────────────

export interface MolarMassBreakdown {
  sym: string;
  count: number;
  massPerAtom: number;
  totalMass: number;
}

export interface MolarMassResult {
  mass: number;
  breakdown: MolarMassBreakdown[];
  error?: string;
}

function parseFormulaHelper(formula: string, pos: number): [Record<string, number>, number] {
  const counts: Record<string, number> = {};
  let i = pos;

  while (i < formula.length) {
    const ch = formula[i];

    if (ch === '(') {
      const [subCounts, nextI] = parseFormulaHelper(formula, i + 1);
      i = nextI;
      if (i < formula.length && formula[i] === ')') i++;
      let numStr = '';
      while (i < formula.length && /\d/.test(formula[i])) numStr += formula[i++];
      const mult = numStr ? parseInt(numStr) : 1;
      for (const [sym, cnt] of Object.entries(subCounts)) {
        counts[sym] = (counts[sym] ?? 0) + cnt * mult;
      }
    } else if (ch === ')') {
      return [counts, i];
    } else if (/[A-Z]/.test(ch)) {
      let sym = ch;
      i++;
      while (i < formula.length && /[a-z]/.test(formula[i])) sym += formula[i++];
      let numStr = '';
      while (i < formula.length && /\d/.test(formula[i])) numStr += formula[i++];
      const cnt = numStr ? parseInt(numStr) : 1;
      counts[sym] = (counts[sym] ?? 0) + cnt;
    } else if (ch === '·' || ch === '•' || ch === '*' || ch === '.') {
      // Hydrate separator — treat remaining as another formula component
      i++;
    } else {
      i++; // skip unknown
    }
  }

  return [counts, i];
}

export function parseMolarMass(formula: string): MolarMassResult {
  const f = formula.trim();
  if (!f) return { mass: 0, breakdown: [] };

  try {
    const [counts] = parseFormulaHelper(f, 0);
    const breakdown: MolarMassBreakdown[] = [];
    let totalMass = 0;
    const unknownSyms: string[] = [];

    for (const [sym, count] of Object.entries(counts)) {
      const elem = BY_SYMBOL.get(sym.toLowerCase());
      if (!elem) { unknownSyms.push(sym); continue; }
      const totalForElem = elem.mass * count;
      totalMass += totalForElem;
      breakdown.push({ sym, count, massPerAtom: elem.mass, totalMass: totalForElem });
    }

    if (unknownSyms.length > 0) {
      return { mass: 0, breakdown: [], error: `Elemento desconocido: ${unknownSyms.join(', ')}` };
    }

    // Sort by atomic number
    breakdown.sort((a, b) => {
      const ea = BY_SYMBOL.get(a.sym.toLowerCase());
      const eb = BY_SYMBOL.get(b.sym.toLowerCase());
      return (ea?.z ?? 0) - (eb?.z ?? 0);
    });

    return { mass: totalMass, breakdown };
  } catch (e) {
    return { mass: 0, breakdown: [], error: `Fórmula inválida: ${String(e)}` };
  }
}

// ── Gas Law (PV = nRT) ──────────────────────────────────────────────────────

export const R_GAS = 8.314462618; // J/(mol·K) = Pa·m³/(mol·K)

export type GasVar = "P" | "V" | "n" | "T";

export interface GasState {
  P: number | null; // Pascals
  V: number | null; // m³
  n: number | null; // mol
  T: number | null; // Kelvin
}

export interface GasResult extends GasState {
  solvedVar?: GasVar;
  error?: string;
}

export function solveGasLaw(state: GasState): GasResult {
  const { P, V, n, T } = state;
  const nullCount = [P, V, n, T].filter(x => x === null).length;

  if (nullCount !== 1) {
    return { ...state, error: "Proporciona exactamente 3 variables (deja 1 en blanco)" };
  }

  const result: GasResult = { ...state };

  if (P === null) {
    const val = (n! * R_GAS * T!) / V!;
    if (!isFinite(val) || val <= 0) return { ...state, error: "Resultado no válido (verifica unidades)" };
    result.P = val;
    result.solvedVar = "P";
  } else if (V === null) {
    const val = (n! * R_GAS * T!) / P!;
    if (!isFinite(val) || val <= 0) return { ...state, error: "Resultado no válido (verifica unidades)" };
    result.V = val;
    result.solvedVar = "V";
  } else if (n === null) {
    const val = (P! * V!) / (R_GAS * T!);
    if (!isFinite(val) || val <= 0) return { ...state, error: "Resultado no válido (verifica unidades)" };
    result.n = val;
    result.solvedVar = "n";
  } else {
    const val = (P! * V!) / (n! * R_GAS);
    if (!isFinite(val) || val <= 0) return { ...state, error: "Resultado no válido (verifica unidades)" };
    result.T = val;
    result.solvedVar = "T";
  }

  return result;
}

/** Convert a gas pressure value to Pascals given unit */
export function toPascal(value: number, unit: string): number {
  switch (unit) {
    case "Pa":  return value;
    case "kPa": return value * 1e3;
    case "MPa": return value * 1e6;
    case "atm": return value * 101325;
    case "bar": return value * 1e5;
    case "mmHg":return value * 133.322;
    case "psi": return value * 6894.76;
    default: return value;
  }
}

export function fromPascal(value: number, unit: string): number {
  return value / toPascal(1, unit);
}

/** Convert a volume value to m³ */
export function toM3(value: number, unit: string): number {
  switch (unit) {
    case "m³": return value;
    case "L":  return value * 1e-3;
    case "mL": return value * 1e-6;
    case "cm³":return value * 1e-6;
    default: return value;
  }
}

export function fromM3(value: number, unit: string): number {
  return value / toM3(1, unit);
}

/** Convert temperature to Kelvin */
export function toKelvin(value: number, unit: string): number {
  switch (unit) {
    case "K":  return value;
    case "°C": return value + 273.15;
    case "°F": return (value - 32) * 5 / 9 + 273.15;
    default: return value;
  }
}

export function fromKelvin(value: number, unit: string): number {
  switch (unit) {
    case "K":  return value;
    case "°C": return value - 273.15;
    case "°F": return (value - 273.15) * 9 / 5 + 32;
    default: return value;
  }
}

// ── pH Calculations ─────────────────────────────────────────────────────────

/** pH from [H+] concentration in mol/L */
export function pHFromConc(hConc: number): number {
  return -Math.log10(hConc);
}

/** [H+] from pH */
export function concFromPH(ph: number): number {
  return Math.pow(10, -ph);
}

/** pOH from [OH-] concentration */
export function pOHFromConc(ohConc: number): number {
  return -Math.log10(ohConc);
}

/** Kw at 25°C */
export const KW = 1e-14;

/** pH of strong acid: pH = -log10(C) */
export function strongAcidPH(concentration: number): number {
  if (concentration <= 0) return NaN;
  return -Math.log10(concentration);
}

/** pH of strong base: pOH = -log10(C), pH = 14 - pOH */
export function strongBasePH(concentration: number): number {
  if (concentration <= 0) return NaN;
  const pOH = -Math.log10(concentration);
  return 14 - pOH;
}

/**
 * pH of weak acid. Uses quadratic formula: Ka = x²/(C-x)
 * x = [H+], C = initial concentration.
 */
export function weakAcidPH(ka: number, concentration: number): number {
  if (ka <= 0 || concentration <= 0) return NaN;
  // x² + Ka*x - Ka*C = 0
  const x = (-ka + Math.sqrt(ka * ka + 4 * ka * concentration)) / 2;
  return x > 0 ? -Math.log10(x) : NaN;
}

/**
 * pH of weak base. Uses Kb: pOH from Kb quadratic, then pH = 14 - pOH
 */
export function weakBasePH(kb: number, concentration: number): number {
  if (kb <= 0 || concentration <= 0) return NaN;
  const x = (-kb + Math.sqrt(kb * kb + 4 * kb * concentration)) / 2;
  const pOH = x > 0 ? -Math.log10(x) : NaN;
  return 14 - pOH;
}

/**
 * Henderson-Hasselbalch equation for buffer solutions
 * pH = pKa + log10([A-]/[HA])
 */
export function bufferPH(pKa: number, baseConc: number, acidConc: number): number {
  if (acidConc <= 0 || baseConc <= 0) return NaN;
  return pKa + Math.log10(baseConc / acidConc);
}

/** Format a number for chemistry display (significant figures) */
export function fmtChem(n: number, sigFigs = 4): string {
  if (!isFinite(n)) return n > 0 ? "∞" : isNaN(n) ? "—" : "-∞";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e6 || abs < 1e-3) {
    return n.toExponential(sigFigs - 1).replace(/\.?0+(e)/, "$1");
  }
  return parseFloat(n.toPrecision(sigFigs)).toString();
}
