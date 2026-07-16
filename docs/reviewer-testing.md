# Reviewer Testing

AirTouch is primarily a Spectacles Lens, but the desktop companion can be tested without Spectacles. This is useful for reviewers, contributors, and quick smoke tests.

The no-hardware path validates:

- WebSocket handshake and packet ingestion
- normalized `u` / `v` pointer mapping
- hover movement
- click down/up
- drag
- scroll packets
- out-of-bounds release behavior

## Desktop Demo Client

Terminal 1:

```bash
cd desktop-companion
python3 server.py --dry-run
```

Terminal 2:

```bash
cd desktop-companion
python3 demo_client.py
```

Expected dry-run output:

```txt
move x=...
down x=...
drag x=...
scroll x=...
up x=...
```

To move the real cursor, run the server without `--dry-run`.

macOS may require Accessibility permission for Terminal, Python, or the IDE. Windows may require allowing Python through Windows Firewall.

## Full Spectacles Test Path

1. Start the desktop companion:

```bash
cd desktop-companion
python3 server.py
```

2. Open `AirTouch.esproj` in Lens Studio.
3. Enable Experimental API mode for WebSocket support.
4. Set `websocketUrl` to `ws://DESKTOP_IP:8765`.
5. Calibrate four screen corners in order: top left, top right, bottom left, bottom right.
6. Confirm calibration.
7. Touch the calibrated plane to move, click, drag, and scroll.

## Development Notes

AirTouch as a whole, including its original Lens and desktop companion implementation, was developed with Codex as an implementation partner. For the recent Lens accuracy and reviewability extension, Codex powered by GPT-5.6 helped inspect the Lens and desktop code, identify and replace the three-corner projection behavior with a true four-corner bilinear mapping, add the deterministic desktop demo client, update setup documentation, and run TypeScript/Python validation checks.

Product and engineering decisions remained explicit:

- keep Spectacles as the primary experience
- add a no-hardware review path without weakening the spatial-touch concept
- keep the packet protocol simple JSON over WebSocket
- support both macOS and Windows desktop input backends
