# Development

## Recent Extension Record

On 2026-07-16, AirTouch received a meaningful Lens and desktop reviewability extension developed with Codex powered by GPT-5.6.

Before this extension:

- the Lens collected four calibration corners but pointer projection derived its axes and dimensions from only top-left, top-right, and bottom-left
- reviewers needed Spectacles or manually authored packets to exercise the full desktop interaction sequence

The extension adds:

- a true four-corner quadrilateral projection with bilinear UV inversion
- rejection of degenerate, crossed, or concave calibration samples
- calibration fit diagnostics for screen size and corner-to-plane error
- a deterministic desktop demo client covering hover, click, drag, scroll, and safety release
- aligned macOS, Windows, Lens, architecture, and reviewer documentation

Codex was used to inspect the codebase, trace calibration and packet behavior across both runtimes, implement the solver and demo tooling, and run TypeScript/Python checks. GPT-5.6 supported the implementation reasoning and documentation pass. Product direction, hardware testing, and final acceptance remain with the project author.

## Prerequisites

Required:

```txt
Lens Studio
Python 3
Node.js
TypeScript compiler
```

macOS with Homebrew:

```bash
brew install node typescript
```

Windows:

```powershell
winget install OpenJS.NodeJS
npm install -g typescript
```

## Checks

Run TypeScript checks:

```bash
tsc --project tsconfig.airtouch.json
```

Run the four-corner projection regression test with Node.js 22.18 or newer:

```bash
node tests/ScreenProjectionMath.test.ts
```

Run Python syntax checks:

```bash
PYTHONPYCACHEPREFIX=/tmp/airtouch_pycache python3 -m py_compile desktop-companion/server.py desktop-companion/mouse_controller.py desktop-companion/fake_client.py desktop-companion/demo_client.py
```

Windows:

```powershell
py -m py_compile desktop-companion/server.py desktop-companion/mouse_controller.py desktop-companion/fake_client.py desktop-companion/demo_client.py
```

## Project Boundaries

Keep runtime code separated by platform:

```txt
Assets/Scripts/            Lens Studio / Spectacles code
desktop-companion/         desktop receiver and OS mouse injection
docs/                      user-facing setup and architecture docs
```

Avoid committing generated Lens Studio state:

```txt
Cache/
Workspaces/
PluginsUserPreferences/
*.lock
```

## Feature Notes

AirTouch currently favors WebSocket over BLE for transport because it is fast to iterate, works in Lens Studio editor testing, and is easy to debug with fake clients.

Plane touch mode is the default interaction model. Pinch remains useful for calibration and as a fallback click/drag input.

The calibration plane visual is generated in Lens with `MeshBuilder`, and the desktop companion performs adaptive pixel smoothing before injecting OS cursor events.
