# calculadora — Contexto para sesiones IA

> Parte de **Fenix Desktop**. App utilitaria Tauri v2 + Rust + TypeScript.

## Qué es
Calculadora moderna y potente. Básica, científica, conversiones de unidades, gráficos, CAS (álgebra simbólica). UI cuidada con la identidad visual Fenix Desktop.

## Stack
- Frontend: TypeScript + Vite + Bun (`frontend/`)
- Backend: Rust + Tauri v2 (`src-tauri/`)
- Puerto dev: 1422

## Arrancar en desarrollo
```bash
cd src-tauri
cargo tauri dev
```

## Estructura
```
calculadora/
├── frontend/
│   ├── src/
│   │   ├── main.ts       — entry point, router entre modos
│   │   ├── engine.ts     — evaluación matemática (mathjs)
│   │   ├── cas.ts        — álgebra simbólica (llama a Rust)
│   │   ├── converter.ts  — conversiones de unidades
│   │   ├── grapher.ts    — gráficos de funciones
│   │   └── style.css     — estilos, identidad Fenix
│   └── index.html
└── src-tauri/
    └── src/
        ├── lib.rs         — setup Tauri, registro de comandos
        ├── main.rs        — entry point binario
        ├── engine/        — lógica matemática Rust
        └── commands.rs    — comandos Tauri expuestos al frontend
```

## Integración Fenix Desktop
- **D-Bus**: expone un servicio para que Buscador pueda evaluar expresiones inline
  - Interface objetivo: `com.fenix.Calculadora`
  - Método: `Eval(expression: string) -> string`
- No aparece en dock (app de utilidad, se invoca desde Buscador o atajo)

## TODOs pendientes
- [ ] Implementar servidor D-Bus para integración con Buscador
- [ ] Aplicar design tokens Fenix cuando estén definidos
- [ ] Revisar y pulir UI

## Identidad visual
Ver `/proyectos/VISION.md` y el futuro `fenix-tokens/` para variables CSS compartidas.
Referencia: tema WhiteSur con backdrop-filter blur, bordes redondeados, transparencias.
