# Calculadora — Visión a largo plazo

> Herramienta de cálculo de escritorio seria, que hable lenguaje humano en el modo
> avanzado y cubra la mayoría de necesidades de un ingeniero/estudiante sin abrir
> MATLAB, Julia ni Wolfram Alpha.

---

## Filosofía de diseño

- **Todo el motor pesado en Rust.** A partir de logaritmos ya sale a cuenta el IPC.
  Sumas y UI básica pueden quedar en frontend; álgebra, cálculo, funciones especiales,
  estadística, álgebra lineal → Rust.
- **El lexer/parser como contrato claro.** Espacios libres, superíndices Unicode,
  identificadores con acentos, multiplicación implícita. Un `help` en la propia app
  explica las reglas.
- **Sin reinventar la rueda cuando hay crates buenos.** Ver sección de crates abajo.
- **Modos generales + especialistas en dropdown.** La barra de modos no crece
  indefinidamente; las especialidades (electrónica, electromagnetismo, señales, etc.)
  viven bajo un selector "Especialista" junto a Ingeniería.

---

## Arquitectura de modos (objetivo)

```
Básica | Científica | Conversiones | Gráficos | Ingeniería | Química | Especialista ▾
                                                                      ├ Electrónica / EM
                                                                      ├ Señales / DSP
                                                                      ├ Mecánica / Fluidos
                                                                      └ Estadística avanzada
```

---

## Crates Rust objetivo

### Matemáticas generales
| Crate | Para qué |
|-------|----------|
| `nalgebra` | Matrices, eigenvalores, SVD, solve Ax=b, normas |
| `ndarray` | Arrays N-dim tipo numpy; base para FFT sobre señales |
| `statrs` | gamma, beta, erf, erfc, distribuciones (Normal, Poisson, χ², t, F, Binomial...) → **reemplaza nuestras implementaciones manuales** |
| `rustfft` | FFT/IFFT sobre arrays complejos |
| `roots` | Raíces de polinomios y ecuaciones no lineales (bisección, Newton, Brent) |
| `peroxide` | ODE solvers (RK4, RK45 adaptativo), interpolación, regresión |
| `approx` | Comparación con tolerancia (ya en tests) |

### Funciones especiales
| Crate | Para qué |
|-------|----------|
| `statrs` | gamma, beta, erf, erfc, digamma, regularized incomplete gamma/beta |
| `special` | Bessel J/Y/I/K, Airy Ai/Bi, Legendre, Hermite, hipergeométricas → **reemplaza nuestro bessel manual** |
| `rgsl` o bindings GSL | Alternativa si `special` no cubre algo (requiere GSL instalado) |

### Álgebra simbólica / CAS
| Crate | Para qué |
|-------|----------|
| Motor propio actual | Suficiente para v1-v2 |
| `symoxide` (futuro) | Si se quiere CAS simbólico real en Rust puro |

### Frontend / JS
| Lib | Para qué |
|-----|----------|
| `mathjs` (actual) | Simplify/factor simbólico en frontend, puede reducirse |
| `Chart.js` / canvas propio | Gráficas (grapher.ts ya es custom, mantener) |

---

## Funciones a cubrir por dominio

### Análisis / Cálculo
- [x] Derivada simbólica (`diff`)
- [x] Integración numérica (`integrate`)
- [x] Series de Taylor / Maclaurin (`taylor`, `maclaurin`)
- [ ] Derivada n-ésima simbólica
- [ ] Integración simbólica (requiere CAS más potente)
- [ ] Límites numéricos `lim(f, x, a)`
- [ ] ODE: `ode(f, x0, y0, xend)` con RK45 + plot automático
- [ ] Transformada de Laplace (tablas + manipulación simbólica)
- [ ] Transformada Z (tablas)

### Álgebra lineal
- [ ] Matrices `[1,2;3,4]` como tipo de dato
- [ ] det, inv, transpose, rank, trace
- [ ] Solve `Ax=b`
- [ ] Eigenvalores / eigenvectores
- [ ] SVD, QR, LU
- [ ] Normas (1, 2, Frobenius, ∞)
- [ ] `nalgebra` como backend

### Funciones especiales
- [x] gamma, lngamma, beta, erf, erfc
- [x] Bessel J0, J1, Jn, Y0, Y1, Yn (manual NR — reemplazar por `special`)
- [ ] Bessel modificadas I0, I1, In, K0, K1, Kn
- [ ] Airy Ai(x), Bi(x)
- [ ] Polinomios de Legendre Pn(x), Pnm(x) (asociados)
- [ ] Polinomios de Hermite Hn(x)
- [ ] Polinomios de Chebyshev Tn(x), Un(x)
- [ ] Polinomios de Laguerre
- [ ] Función zeta de Riemann ζ(s)
- [ ] Función de Dawson
- [x] Fresnel S(x), C(x) — `fresnel_s`, `fresnel_c`
- [ ] Funciones hipergeométricas 2F1
- [x] Lambert W — `w(x)`
- [ ] `special` crate para Bessel I/K de orden alto, Airy

### Estadística
- [x] Descriptiva: `mean`/`avg`, `stdev`, `median`, `variance`, `min`, `max`, `sum`, `product`, `rms`
- [ ] Descriptiva: `percentile`, `mode`, `skewness`, `kurtosis`
- [x] Distribuciones continuas (PDF/CDF/PPF): Normal, t, χ², F, Exponencial, Beta, Gamma, LogNormal, Weibull, Cauchy
- [x] Distribuciones discretas (PMF/CDF): Binomial, Poisson
- [x] Funciones especiales estadísticas: `digamma`, `polygamma`, `erfinv`, `gammainc`, `betainc`, `betaincinv`
- [ ] Tests: z-test, t-test, chi-cuadrado (función de decisión)
- [ ] Regresión lineal `linreg([x...], [y...])` → pendiente, intercepto, R²
- [ ] Correlación de Pearson
- [x] `statrs` integrado como backend

### Combinatoria y Teoría de números (actualización)
- [x] `fibonacci(n)`, `catalan(n)`
- [x] `gcd`, `lcm`, `isprime`, `nCr`/`binom`, `nPr`/`perm`, `factorial`, `factorial2`

### Electrónica y Electromagnetismo
*(pestaña Especialista → Electrónica/EM)*
- [x] `parallel(R1, R2, ...)` — resistencia en paralelo
- [x] `dB`, `from_dB`, `dBm`, `from_dBm` — conversión decibeles
- [ ] Resistencias en serie
- [ ] Divisor de tensión / corriente
- [ ] Ley de Ohm (resolver V, I, R dado dos)
- [ ] Potencia: P = VI = I²R = V²/R
- [ ] Reactancia: XL = 2πfL, XC = 1/(2πfC)
- [ ] Impedancia RLC serie/paralelo
- [ ] Frecuencia de resonancia
- [ ] Factor de calidad Q
- [ ] Circuitos RC/RL/RLC: respuesta transitoria
- [ ] Trifásica: potencia activa P, reactiva Q, aparente S, factor de potencia
- [ ] Transformadores: relación de transformación, pérdidas
- [ ] dB ↔ lineal (tensión y potencia)
- [ ] Ley de Faraday: fem = -N·dΦ/dt
- [ ] Ley de Ampère / Biot-Savart simplificado
- [ ] Campo magnético en bobinas, toroide, solenoide
- [ ] Energía almacenada en L y C
- [ ] Constantes: μ0, ε0, c, η0 (impedancia del vacío)

### Señales y DSP
*(pestaña Especialista → Señales/DSP)*
- [ ] FFT / IFFT sobre arrays (`rustfft`)
- [ ] Ventanas: Hann, Hamming, Blackman, Kaiser
- [ ] PSD (densidad espectral de potencia)
- [ ] Filtros básicos: paso bajo/alto/banda (coeficientes)
- [ ] Frecuencia de Nyquist, aliasing
- [ ] Convolución discreta
- [ ] Autocorrelación / correlación cruzada
- [ ] Requiere arrays como tipo de dato de primera clase

### Mecánica y Fluidos
*(pestaña Especialista → Mecánica/Fluidos)*
- [ ] Cinemática: MRUA, tiro parabólico
- [ ] Dinámica: F=ma, trabajo, energía, potencia mecánica
- [ ] Número de Reynolds Re = ρvL/μ
- [ ] Ecuación de Bernoulli
- [ ] Caudal Q = Av
- [ ] Pérdidas Darcy-Weisbach
- [ ] Resistencia de materiales básica (estrés, deformación, módulo de Young)

### Química
*(pestaña ya existente — ampliar)*
- [x] Masa molar y balanceo básico
- [ ] Termodinámica: ΔG, ΔH, ΔS, ecuación de Van't Hoff
- [ ] Equilibrio ácido-base: pH, pOH, pKa
- [ ] Cinética: ley de velocidad, Arrhenius
- [ ] Gas ideal: PV = nRT
- [ ] Gas de Van der Waals: (P + an²/V²)(V - nb) = nRT
- [ ] Estequiometría: reactivo limitante, rendimiento
- [ ] Concentraciones: M, m, % masa, ppm

### Combinatoria y Teoría de números
- [x] Factorial `n!`
- [ ] `nCr(n, k)`, `nPr(n, k)` (ya hay nCr, verificar)
- [ ] `gcd(a,b)`, `lcm(a,b)`
- [ ] `isprime(n)` (ya implementado)
- [ ] Criba de Eratóstenes `primes(n)`
- [ ] `fibonacci(n)`, `catalan(n)`
- [ ] Números de Bernoulli, Stirling

---

## Arquitectura del engine (objetivo)

```
lexer.rs   — Unicode completo, superíndices, operadores matemáticos
parser.rs  — AST, multiplicación implícita, asignación, listas []
eval.rs    — Evaluador Complex<f64> + dispatch a Rust puro o crates
             ├ funciones escalares (statrs, special, math puro)
             ├ funciones sobre listas/vectores (nalgebra, ndarray)
             └ funciones numéricas (peroxide: ODE, integración, raíces)
diff.rs    — Diferenciación simbólica (ampliar)
cas.rs     — REPL multi-línea, variables, scope
```

**Tipos de valor objetivo:**
```rust
enum Value {
    Real(f64),
    Complex(Complex64),
    Vector(Vec<f64>),          // [1,2,3]
    Matrix(DMatrix<f64>),      // nalgebra
    Bool(bool),
    Str(String),
}
```

---

## Frontend — refactor main.ts

main.ts tiene ~2100 líneas. Dividir en:

```
frontend/src/
  main.ts              — bootstrap, estado global, router de modos
  ui/
    layout.ts          — titlebar, resize, side panel
    display.ts         — updateDisplay, historial
    buttons.ts         — makeBtnEl, handleAction
  modes/
    basic.ts
    scientific.ts
    engineering.ts
    chemistry.ts
    graph.ts
    conversions.ts
    specialists/
      electronics.ts
      signals.ts
      mechanics.ts
  engine/
    cas.ts             — ya existe, mantener
    normalizer.ts      — preprocessing de input (ya en lexer Rust, quizás en frontend también)
```

---

## Sistema de ayuda

- `?` en cada modo: panel con sintaxis, funciones disponibles, ejemplos
- `help(funcion)` en el REPL de Ingeniería: descripción + ejemplo
- CONTEXT.md actualizado para sesiones IA
- README.md público para la web

---

## Lexer — reglas actuales documentadas

| Input | Resultado |
|-------|-----------|
| `2+2`, `2 + 2` | ✓ espacios libres |
| `2x` | `2 * x` (multiplicación implícita) |
| `2pi` | `2 * pi` |
| `sqrt(30)` | ✓ función |
| `sqrt30` | variable `sqrt30` (error si no definida) |
| `radio²` | `radio^2` (superíndice normalizado) |
| `área` | identificador válido (Unicode) |
| `×`, `÷`, `−`, `·` | operadores normalizados |
| `π`, `τ`, `°` | constantes/conversión normalizadas |
| `⁰`..`⁹` | `^0`..`^9` normalizados |

---

## Hoja de ruta condensada

| Fase | Qué | Crates nuevos |
|------|-----|---------------|
| **v2** | Separar main.ts · Pestaña Electrónica/EM · `statrs` (distribuciones + reemplazar erf/gamma manual) · Estadística básica sobre listas | `statrs` |
| **v3** | Álgebra lineal completa · `nalgebra` · Tipos Vector/Matrix en engine · Más funciones especiales con `special` | `nalgebra`, `special` |
| **v4** | FFT/DSP · ODE solver + plot · `ndarray` + `rustfft` + `peroxide` · Señales como especialista | `rustfft`, `ndarray`, `peroxide` |
| **v5** | WASM target · Motor como crate independiente · Modo Notebook | — |
