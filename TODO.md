# Calculadora — Roadmap

## Fase 2 — Quick wins (próximo)

### Gráficos
- [x] Gráfica lateral en tiempo real con expresiones del modo científico
- [ ] Export PNG/SVG de gráficas (canvas.toDataURL)
- [ ] Marcar raíces/ceros visualmente (scan numérico de cambios de signo)
- [ ] Curvas paramétricas x(t), y(t)
- [ ] Curvas polares r(θ)
- [ ] Mostrar x/y en display prominente al hover (ya hay coordsEl, mejorar visibilidad)
- [ ] Área sombreada entre funciones (visual de integral)

### CAS / Ingeniería
- [ ] Estadística variádica: mean(1,2,3,4), std(...), median(...), sum(...) en Rust
- [ ] Soporte arrays/listas [1,2,3] en el parser
- [ ] Historial navegable con ↑↓ en textarea del REPL
- [ ] Copiar resultado al portapapeles (click en resultado)
- [ ] Output LaTeX: formatear resultado como \frac{}, \sqrt{}, etc.
- [ ] Autocompletado de funciones en el textarea CAS

### Matemáticas
- [ ] Solver numérico de ecuaciones (Newton-Raphson): solve(expr, x)
- [ ] Taylor series hasta orden N: taylor(expr, x, x0, n)
- [ ] Factorización polinomial numérica (raíces complejas)

## Fase 3 — Álgebra lineal y estadística

- [x] Matrices: sintaxis [1,2;3,4], operaciones det/inv/transpose
- [x] Resolver sistemas lineales Ax=b
- [x] Eigenvalores/vectores (nalgebra) — solo simétricas
- [x] SVD — svd(A) retorna valores singulares; QR — qr(A) retorna Q
- [x] Normas (1, 2, Frobenius, ∞)
- [ ] Distribuciones estadísticas: normal, binomial, t-Student
- [ ] Regresión lineal/polinomial

## Fase 4 — Avanzado

- [ ] Sistema de unidades físicas (propagación por cálculos)
- [ ] Gráfico 3D z=f(x,y) (WebGL canvas)
- [x] FFT / IFFT sobre arrays (rustfft)
- [x] Ventanas: Hann, Hamming, Blackman
- [x] Convolución discreta
- [x] ODE solver RK4: ode(f, t0, y0, tend [, n])
- [ ] PSD / espectro de potencia
- [ ] Filtros digitales (FIR/IIR básicos)
- [ ] Autocorrelación
- [ ] Modo Notebook: sesiones .calc guardables/compartibles
- [ ] Export PDF/LaTeX de sesión completa
- [ ] Step-by-step para derivadas e integrales

## Fase 5 — Plataforma / Distribución

- [ ] WASM target: mismo motor Rust en el browser
- [ ] calc-engine como crate independiente (lib pura sin Tauri)
- [ ] D-Bus daemon (zbus) para GNOME — org.calculadora.Engine
- [ ] IPC genérico (Unix socket) para otras plataformas
- [ ] Integración con Buscador (query al daemon en vez de motor propio)
- [ ] Web version (WASM + frontend Vite)

## Implementado

- [x] Modos: Básica, Científica, Conversiones, Gráficos, Ingeniería
- [x] Motor Rust propio: lexer → parser → AST → evaluador Complex<f64> → diferenciación simbólica
- [x] Tauri commands: calc_eval, cas_exec, cas_diff, calc_graph_data, cas_integrate, cas_vars/clear
- [x] Gráfica lateral en tiempo real (constantes → línea horizontal, funciones → curva)
- [x] Historial sidebar overlay
- [x] Resize por modo
- [x] Glassmorphism WhiteSur-Dark-blue-glass
- [x] Curvas implícitas (pendiente)
- [x] Pan + zoom con rueda y touch
- [x] Coordenadas en hover
