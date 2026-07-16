# Development

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
