import { tr, getLocale } from "./i18n.ts";

export interface ConvUnit {
  id: string;
  name: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

export interface ConvCategory {
  id: string;
  name: string;
  units: ConvUnit[];
}

export const CATEGORIES: ConvCategory[] = [
  {
    id: "length",
    name: "Longitud",
    units: [
      { id: "km", name: "Kilómetro (km)", toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: "m", name: "Metro (m)", toBase: v => v, fromBase: v => v },
      { id: "cm", name: "Centímetro (cm)", toBase: v => v / 100, fromBase: v => v * 100 },
      { id: "mm", name: "Milímetro (mm)", toBase: v => v / 1000, fromBase: v => v * 1000 },
      { id: "um", name: "Micrómetro (μm)", toBase: v => v / 1e6, fromBase: v => v * 1e6 },
      { id: "nm", name: "Nanómetro (nm)", toBase: v => v / 1e9, fromBase: v => v * 1e9 },
      { id: "mi", name: "Milla (mi)", toBase: v => v * 1609.344, fromBase: v => v / 1609.344 },
      { id: "yd", name: "Yarda (yd)", toBase: v => v * 0.9144, fromBase: v => v / 0.9144 },
      { id: "ft", name: "Pie (ft)", toBase: v => v * 0.3048, fromBase: v => v / 0.3048 },
      { id: "in", name: "Pulgada (in)", toBase: v => v * 0.0254, fromBase: v => v / 0.0254 },
      { id: "nmi", name: "Milla náutica (nmi)", toBase: v => v * 1852, fromBase: v => v / 1852 },
      { id: "ly", name: "Año luz (ly)", toBase: v => v * 9.461e15, fromBase: v => v / 9.461e15 },
    ],
  },
  {
    id: "weight",
    name: "Masa",
    units: [
      { id: "t", name: "Tonelada (t)", toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: "kg", name: "Kilogramo (kg)", toBase: v => v, fromBase: v => v },
      { id: "g", name: "Gramo (g)", toBase: v => v / 1000, fromBase: v => v * 1000 },
      { id: "mg", name: "Miligramo (mg)", toBase: v => v / 1e6, fromBase: v => v * 1e6 },
      { id: "lb", name: "Libra (lb)", toBase: v => v * 0.453592, fromBase: v => v / 0.453592 },
      { id: "oz", name: "Onza (oz)", toBase: v => v * 0.0283495, fromBase: v => v / 0.0283495 },
      { id: "st", name: "Stone (st)", toBase: v => v * 6.35029, fromBase: v => v / 6.35029 },
    ],
  },
  {
    id: "temp",
    name: "Temperatura",
    units: [
      { id: "c", name: "Celsius (°C)", toBase: v => v, fromBase: v => v },
      { id: "f", name: "Fahrenheit (°F)", toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
      { id: "k", name: "Kelvin (K)", toBase: v => v - 273.15, fromBase: v => v + 273.15 },
      { id: "r", name: "Rankine (°R)", toBase: v => (v - 491.67) * 5 / 9, fromBase: v => v * 9 / 5 + 491.67 },
    ],
  },
  {
    id: "area",
    name: "Área",
    units: [
      { id: "km2", name: "Km² (km²)", toBase: v => v * 1e6, fromBase: v => v / 1e6 },
      { id: "ha", name: "Hectárea (ha)", toBase: v => v * 1e4, fromBase: v => v / 1e4 },
      { id: "m2", name: "Metro² (m²)", toBase: v => v, fromBase: v => v },
      { id: "cm2", name: "Cm² (cm²)", toBase: v => v * 1e-4, fromBase: v => v * 1e4 },
      { id: "mm2", name: "Mm² (mm²)", toBase: v => v * 1e-6, fromBase: v => v * 1e6 },
      { id: "ac", name: "Acre (ac)", toBase: v => v * 4046.86, fromBase: v => v / 4046.86 },
      { id: "ft2", name: "Pie² (ft²)", toBase: v => v * 0.092903, fromBase: v => v / 0.092903 },
      { id: "in2", name: "Pulg² (in²)", toBase: v => v * 6.4516e-4, fromBase: v => v / 6.4516e-4 },
    ],
  },
  {
    id: "volume",
    name: "Volumen",
    units: [
      { id: "m3", name: "Metro³ (m³)", toBase: v => v, fromBase: v => v },
      { id: "l", name: "Litro (L)", toBase: v => v / 1000, fromBase: v => v * 1000 },
      { id: "ml", name: "Mililitro (mL)", toBase: v => v / 1e6, fromBase: v => v * 1e6 },
      { id: "cm3", name: "Cm³ (cm³)", toBase: v => v / 1e6, fromBase: v => v * 1e6 },
      { id: "gal", name: "Galón US (gal)", toBase: v => v * 0.00378541, fromBase: v => v / 0.00378541 },
      { id: "fl_oz", name: "Oz líquida US", toBase: v => v * 2.95735e-5, fromBase: v => v / 2.95735e-5 },
      { id: "pt", name: "Pinta US (pt)", toBase: v => v * 4.73176e-4, fromBase: v => v / 4.73176e-4 },
      { id: "cup", name: "Taza US (cup)", toBase: v => v * 2.36588e-4, fromBase: v => v / 2.36588e-4 },
      { id: "tsp", name: "Cucharita (tsp)", toBase: v => v * 4.92892e-6, fromBase: v => v / 4.92892e-6 },
    ],
  },
  {
    id: "speed",
    name: "Velocidad",
    units: [
      { id: "ms", name: "m/s", toBase: v => v, fromBase: v => v },
      { id: "kmh", name: "km/h", toBase: v => v / 3.6, fromBase: v => v * 3.6 },
      { id: "mph", name: "mph (mi/h)", toBase: v => v * 0.44704, fromBase: v => v / 0.44704 },
      { id: "kt", name: "Nudo (kn)", toBase: v => v * 0.514444, fromBase: v => v / 0.514444 },
      { id: "mach", name: "Mach (≈343 m/s)", toBase: v => v * 343, fromBase: v => v / 343 },
      { id: "c", name: "Vel. luz (c)", toBase: v => v * 299792458, fromBase: v => v / 299792458 },
    ],
  },
  {
    id: "data",
    name: "Datos",
    units: [
      { id: "bit", name: "Bit (bit)", toBase: v => v / 8, fromBase: v => v * 8 },
      { id: "b", name: "Byte (B)", toBase: v => v, fromBase: v => v },
      { id: "kb", name: "Kilobyte (KB)", toBase: v => v * 1024, fromBase: v => v / 1024 },
      { id: "mb", name: "Megabyte (MB)", toBase: v => v * 1024 ** 2, fromBase: v => v / 1024 ** 2 },
      { id: "gb", name: "Gigabyte (GB)", toBase: v => v * 1024 ** 3, fromBase: v => v / 1024 ** 3 },
      { id: "tb", name: "Terabyte (TB)", toBase: v => v * 1024 ** 4, fromBase: v => v / 1024 ** 4 },
      { id: "pb", name: "Petabyte (PB)", toBase: v => v * 1024 ** 5, fromBase: v => v / 1024 ** 5 },
      { id: "kbit", name: "Kilobit (kbit)", toBase: v => v * 1000 / 8, fromBase: v => v * 8 / 1000 },
      { id: "mbit", name: "Megabit (Mbit)", toBase: v => v * 1e6 / 8, fromBase: v => v * 8 / 1e6 },
      { id: "gbit", name: "Gigabit (Gbit)", toBase: v => v * 1e9 / 8, fromBase: v => v * 8 / 1e9 },
    ],
  },
  {
    id: "time",
    name: "Tiempo",
    units: [
      { id: "ns", name: "Nanosegundo (ns)", toBase: v => v / 1e9, fromBase: v => v * 1e9 },
      { id: "us", name: "Microsegundo (μs)", toBase: v => v / 1e6, fromBase: v => v * 1e6 },
      { id: "ms", name: "Milisegundo (ms)", toBase: v => v / 1000, fromBase: v => v * 1000 },
      { id: "s", name: "Segundo (s)", toBase: v => v, fromBase: v => v },
      { id: "min", name: "Minuto (min)", toBase: v => v * 60, fromBase: v => v / 60 },
      { id: "h", name: "Hora (h)", toBase: v => v * 3600, fromBase: v => v / 3600 },
      { id: "d", name: "Día (d)", toBase: v => v * 86400, fromBase: v => v / 86400 },
      { id: "wk", name: "Semana (sem)", toBase: v => v * 604800, fromBase: v => v / 604800 },
      { id: "mo", name: "Mes (mes) ≈30d", toBase: v => v * 2592000, fromBase: v => v / 2592000 },
      { id: "yr", name: "Año (año)", toBase: v => v * 31557600, fromBase: v => v / 31557600 },
    ],
  },
  {
    id: "angle",
    name: "Ángulo",
    units: [
      { id: "deg", name: "Grado (°)", toBase: v => v * Math.PI / 180, fromBase: v => v * 180 / Math.PI },
      { id: "rad", name: "Radián (rad)", toBase: v => v, fromBase: v => v },
      { id: "grad", name: "Gon / Gradián (grad)", toBase: v => v * Math.PI / 200, fromBase: v => v * 200 / Math.PI },
      { id: "rev", name: "Revolución (rev)", toBase: v => v * 2 * Math.PI, fromBase: v => v / (2 * Math.PI) },
      { id: "arcmin", name: "Minuto de arco (')", toBase: v => v * Math.PI / 10800, fromBase: v => v * 10800 / Math.PI },
      { id: "arcsec", name: "Segundo de arco (\")", toBase: v => v * Math.PI / 648000, fromBase: v => v * 648000 / Math.PI },
    ],
  },
  {
    id: "pressure",
    name: "Presión",
    units: [
      { id: "pa", name: "Pascal (Pa)", toBase: v => v, fromBase: v => v },
      { id: "hpa", name: "Hectopascal (hPa)", toBase: v => v * 100, fromBase: v => v / 100 },
      { id: "kpa", name: "Kilopascal (kPa)", toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: "mpa", name: "Megapascal (MPa)", toBase: v => v * 1e6, fromBase: v => v / 1e6 },
      { id: "bar", name: "Bar", toBase: v => v * 100000, fromBase: v => v / 100000 },
      { id: "atm", name: "Atmósfera (atm)", toBase: v => v * 101325, fromBase: v => v / 101325 },
      { id: "psi", name: "PSI (lbf/in²)", toBase: v => v * 6894.76, fromBase: v => v / 6894.76 },
      { id: "mmhg", name: "mmHg (Torr)", toBase: v => v * 133.322, fromBase: v => v / 133.322 },
    ],
  },
  {
    id: "energy",
    name: "Energía",
    units: [
      { id: "j", name: "Joule (J)", toBase: v => v, fromBase: v => v },
      { id: "kj", name: "Kilojulio (kJ)", toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: "mj", name: "Megajulio (MJ)", toBase: v => v * 1e6, fromBase: v => v / 1e6 },
      { id: "cal", name: "Caloría (cal)", toBase: v => v * 4.184, fromBase: v => v / 4.184 },
      { id: "kcal", name: "Kilocaloría (kcal)", toBase: v => v * 4184, fromBase: v => v / 4184 },
      { id: "wh", name: "Vatio-hora (Wh)", toBase: v => v * 3600, fromBase: v => v / 3600 },
      { id: "kwh", name: "kWh", toBase: v => v * 3.6e6, fromBase: v => v / 3.6e6 },
      { id: "ev", name: "Electronvoltio (eV)", toBase: v => v * 1.60218e-19, fromBase: v => v / 1.60218e-19 },
      { id: "btu", name: "BTU", toBase: v => v * 1055.06, fromBase: v => v / 1055.06 },
    ],
  },
  {
    id: "force",
    name: "Fuerza",
    units: [
      { id: "n",   name: "Newton (N)",     toBase: v => v,          fromBase: v => v },
      { id: "kn",  name: "Kilonewton (kN)",toBase: v => v * 1e3,    fromBase: v => v / 1e3 },
      { id: "mn",  name: "Meganewton (MN)",toBase: v => v * 1e6,    fromBase: v => v / 1e6 },
      { id: "lbf", name: "Libra-fuerza (lbf)", toBase: v => v * 4.448222, fromBase: v => v / 4.448222 },
      { id: "kgf", name: "Kilogramo-fuerza (kgf)", toBase: v => v * 9.80665, fromBase: v => v / 9.80665 },
      { id: "dyn", name: "Dina (dyn)",     toBase: v => v * 1e-5,   fromBase: v => v * 1e5 },
      { id: "kip", name: "Kip (kip)",      toBase: v => v * 4448.222, fromBase: v => v / 4448.222 },
    ],
  },
  {
    id: "power",
    name: "Potencia",
    units: [
      { id: "w",    name: "Vatio (W)",      toBase: v => v,          fromBase: v => v },
      { id: "kw",   name: "Kilovatio (kW)", toBase: v => v * 1e3,    fromBase: v => v / 1e3 },
      { id: "mw",   name: "Megavatio (MW)", toBase: v => v * 1e6,    fromBase: v => v / 1e6 },
      { id: "hp_m", name: "CV (hp métrico)",toBase: v => v * 735.499, fromBase: v => v / 735.499 },
      { id: "hp",   name: "HP (mecánico)",  toBase: v => v * 745.700, fromBase: v => v / 745.700 },
      { id: "btuh", name: "BTU/h",          toBase: v => v * 0.29307, fromBase: v => v / 0.29307 },
      { id: "cals", name: "cal/s",          toBase: v => v * 4.184,   fromBase: v => v / 4.184 },
      { id: "ftlbs",name: "ft·lbf/s",       toBase: v => v * 1.35582, fromBase: v => v / 1.35582 },
    ],
  },
  {
    id: "frequency",
    name: "Frecuencia",
    units: [
      { id: "hz",  name: "Hercio (Hz)",    toBase: v => v,          fromBase: v => v },
      { id: "khz", name: "Kilohercio (kHz)",toBase: v => v * 1e3,   fromBase: v => v / 1e3 },
      { id: "mhz", name: "Megahercio (MHz)",toBase: v => v * 1e6,   fromBase: v => v / 1e6 },
      { id: "ghz", name: "Gigahercio (GHz)",toBase: v => v * 1e9,   fromBase: v => v / 1e9 },
      { id: "thz", name: "Terahercio (THz)",toBase: v => v * 1e12,  fromBase: v => v / 1e12 },
      { id: "rpm", name: "RPM (rev/min)",  toBase: v => v / 60,     fromBase: v => v * 60 },
      { id: "rps", name: "RPS (rev/s)",    toBase: v => v,          fromBase: v => v },
    ],
  },
  {
    id: "radioact",
    name: "Radiactividad",
    units: [
      { id: "bq",   name: "Becquerel (Bq)",   toBase: v => v,          fromBase: v => v },
      { id: "kbq",  name: "Kilobecquerel (kBq)", toBase: v => v * 1e3,  fromBase: v => v / 1e3 },
      { id: "mbq",  name: "Megabecquerel (MBq)", toBase: v => v * 1e6,  fromBase: v => v / 1e6 },
      { id: "gbq",  name: "Gigabecquerel (GBq)", toBase: v => v * 1e9,  fromBase: v => v / 1e9 },
      { id: "tbq",  name: "Terabecquerel (TBq)", toBase: v => v * 1e12, fromBase: v => v / 1e12 },
      { id: "ci",   name: "Curie (Ci)",     toBase: v => v * 3.7e10,    fromBase: v => v / 3.7e10 },
      { id: "mci",  name: "Milicurie (mCi)",toBase: v => v * 3.7e7,    fromBase: v => v / 3.7e7 },
      { id: "uci",  name: "Microcurie (μCi)",toBase: v => v * 3.7e4,   fromBase: v => v / 3.7e4 },
    ],
  },
  {
    id: "dose",
    name: "Dosis radiación",
    units: [
      { id: "gy",   name: "Gray (Gy)",      toBase: v => v,          fromBase: v => v },
      { id: "mgy",  name: "Miligray (mGy)", toBase: v => v * 1e-3,   fromBase: v => v * 1e3 },
      { id: "ugy",  name: "Microgray (μGy)",toBase: v => v * 1e-6,   fromBase: v => v * 1e6 },
      { id: "rad",  name: "Rad (rad)",      toBase: v => v * 0.01,   fromBase: v => v / 0.01 },
      { id: "sv",   name: "Sievert (Sv)",   toBase: v => v,          fromBase: v => v },
      { id: "msv",  name: "Milisievert (mSv)", toBase: v => v * 1e-3, fromBase: v => v * 1e3 },
      { id: "usv",  name: "Microsievert (μSv)", toBase: v => v * 1e-6, fromBase: v => v * 1e6 },
      { id: "rem",  name: "Rem (rem)",      toBase: v => v * 0.01,   fromBase: v => v / 0.01 },
    ],
  },
  {
    id: "molar",
    name: "Concentración molar",
    units: [
      { id: "M",    name: "Molar (mol/L)",  toBase: v => v,          fromBase: v => v },
      { id: "mM",   name: "Milimolar (mM)", toBase: v => v * 1e-3,   fromBase: v => v * 1e3 },
      { id: "uM",   name: "Micromolar (μM)",toBase: v => v * 1e-6,   fromBase: v => v * 1e6 },
      { id: "nM",   name: "Nanomolar (nM)", toBase: v => v * 1e-9,   fromBase: v => v * 1e9 },
      { id: "pM",   name: "Picomolar (pM)", toBase: v => v * 1e-12,  fromBase: v => v * 1e12 },
      { id: "molm3",name: "mol/m³ (SI)",    toBase: v => v * 1e-3,   fromBase: v => v * 1e3 },
    ],
  },
];

export function convert(value: number, fromId: string, toId: string, categoryId: string): number {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  if (!cat) throw new Error(tr("Categoría desconocida"));

  const from = cat.units.find(u => u.id === fromId);
  const to = cat.units.find(u => u.id === toId);
  if (!from || !to) throw new Error(tr("Unidad desconocida"));

  const base = from.toBase(value);
  return to.fromBase(base);
}

export function formatConvResult(n: number): string {
  if (!isFinite(n)) return n > 0 ? "∞" : "-∞";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
    return n.toExponential(6).replace(/\.?0+(e)/, "$1").replace("e+", "e");
  }
  if (Number.isInteger(n) && abs < 1e12) return n.toLocaleString(getLocale() === "en" ? "en-US" : "es-ES");
  return parseFloat(n.toPrecision(10)).toString();
}
