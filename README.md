# calculadora

Modern calculator for daily use. Built with Tauri, Rust and TypeScript.

It covers the usual basics, scientific mode, unit conversions, graphing, a small CAS workflow and some engineering / chemistry helpers. It is part of the wider Fenix ecosystem, but the app is usable on its own as a desktop utility.

## Status

- Desktop app used daily
- Works on Linux and Windows through Tauri
- Rust math engine validated with unit tests
- D-Bus integration with the launcher is planned, not finished yet

## Features

- Basic and scientific calculator
- Unit conversions
- Function graphing
- Persistent CAS session
- Symbolic differentiation
- Numerical integration
- Chemistry helpers
- Local history sidebar

## Stack

- Frontend: Vite + TypeScript + Bun
- Backend: Tauri v2 + Rust

## Build

Requirements:

- Rust toolchain
- Bun
- Tauri prerequisites for your platform

Development:

```bash
cd src-tauri
cargo tauri dev
```

Release build:

```bash
cd src-tauri
cargo tauri build
```

Rust tests:

```bash
cd src-tauri
cargo test
```

## Notes

- On Linux, the Tauri hooks also support Bun installed at `$HOME/.bun/bin/bun`.
- The frontend still ships as a single fairly large bundle. That is not blocking daily use, but it can be optimized later.

## License

[AGPL-3.0-only](LICENSE)
