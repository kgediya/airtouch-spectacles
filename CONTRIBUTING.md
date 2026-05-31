# Contributing

Thanks for improving AirTouch.

## Development Setup

Install Python 3 and Node/TypeScript.

```bash
brew install node typescript
```

For macOS cursor injection:

```bash
python3 -m pip install --user -r mac-companion/requirements-macos.txt
```

## Checks

Before opening a PR or sharing changes:

```bash
tsc --project tsconfig.airtouch.json
PYTHONPYCACHEPREFIX=/tmp/airtouch_pycache python3 -m py_compile mac-companion/server.py mac-companion/mouse_controller.py mac-companion/fake_client.py
```

## Scope

Keep the MVP small:

- single pointer
- click and drag
- simple recalibration
- no app-specific shortcuts until the baseline interaction feels good

Prefer small, testable changes over broad rewrites.
