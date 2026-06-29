# 2D Weather Sandbox

## Project Overview
A semi-realistic, real-time, two-dimensional interactive weather simulation built by Niels Daemen. It simulates atmospheric processes in Earth's troposphere, including cloud formation, precipitation (rain, snow, hail), fluid dynamics (pressure and velocity), and a flight simulator mode.

## Tech Stack
- **Frontend:** Pure HTML5 + JavaScript (ES6+), no framework
- **Graphics:** WebGL 2 with raw GLSL shaders for GPU-accelerated fluid dynamics and rendering
- **Web Workers:** Used for off-main-thread computations (lightning generation via `lightningGenerator.js`)
- **Build System:** None — static files served directly
- **Package Manager:** None — all dependencies bundled locally in `libraries/`

## Local Dependencies (in `libraries/`)
- `dat.gui.min.js` — Interactive control panels for simulation parameters
- `pako.min.js` — Gzip compression for save files (`.weathersandbox` format)
- `chart.js` + `chartjs-adapter-date-fns.js` — Meteorological sounding graphs

## Project Structure
```
/
├── index.html              # Entry point and UI layout
├── app.js                  # Main simulation logic (~6,700 lines)
├── lightningGenerator.js   # Web Worker for lightning bolt generation
├── libraries/              # Bundled third-party JS libraries
├── shaders/
│   ├── fragment/           # GLSL fragment shaders (advection, precipitation, etc.)
│   └── vertex/             # GLSL vertex shaders
├── resources/
│   ├── img/                # Textures and UI icons
│   └── sounds/             # Ambient audio files
├── saves/                  # Pre-made simulation state files (.weathersandbox)
└── docs/                   # Technical documentation and diagrams
```

## Development Server
The app is served as a static site using `npx serve` on port 5000.

**Workflow:** "Start application" — runs `npx serve . -p 5000 -l 5000`

## Deployment
Configured as a **static** deployment. The entire project root (`.`) is the public directory.
