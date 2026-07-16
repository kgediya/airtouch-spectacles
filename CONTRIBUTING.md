# Contributing

Thanks for improving AirTouch.

## Development Setup

Install Python 3 and Node/TypeScript.

macOS:

```bash
brew install node typescript
```

Windows:

```powershell
winget install OpenJS.NodeJS
npm install -g typescript
```

For macOS cursor injection:

```bash
python3 -m pip install --user -r desktop-companion/requirements-macos.txt
```

## Checks

Before opening a PR or sharing changes:

```bash
tsc --project tsconfig.airtouch.json
PYTHONPYCACHEPREFIX=/tmp/airtouch_pycache python3 -m py_compile desktop-companion/server.py desktop-companion/mouse_controller.py desktop-companion/fake_client.py desktop-companion/demo_client.py
```

Windows:

```powershell
tsc --project tsconfig.airtouch.json
py -m py_compile desktop-companion/server.py desktop-companion/mouse_controller.py desktop-companion/fake_client.py desktop-companion/demo_client.py
```

## Scope

Keep the MVP small:

- four-corner calibration
- plane touch click and drag
- two-finger scroll
- simple recalibration and confirm flow
- no app-specific shortcuts until the baseline interaction feels good

Prefer small, testable changes over broad rewrites.

## Documentation

Update docs when changing setup, protocol fields, Lens inputs, desktop config, gestures, or platform behavior. The main entry points are:

```txt
README.md
docs/lens-setup.md
docs/desktop-setup.md
docs/protocol.md
docs/architecture.md
docs/testing-checklist.md
```
