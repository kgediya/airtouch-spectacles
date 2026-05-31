# AirTouch Desktop Companion

The desktop companion receives AirTouch pointer packets over WebSocket and injects mouse movement, click, drag, and scroll events on the host OS.

Supported real cursor backends:

- macOS: Quartz through PyObjC
- Windows: User32 through Python `ctypes`

Linux is currently dry-run only.

## Run

From this directory:

```bash
cd mac-companion
```

Dry-run:

```bash
python3 server.py --dry-run
```

Real cursor:

```bash
python3 server.py
```

Windows:

```powershell
py server.py
```

Fake hand test:

```bash
python3 server.py --fake-hand
```

Fake hand loop:

```bash
python3 server.py --fake-hand --fake-hand-loop
```

Fake client tests:

```bash
python3 fake_client.py
python3 fake_client.py --drag
python3 fake_client.py --scroll
```

Windows can run the same commands with `py`:

```powershell
py fake_client.py --scroll
```

## Configuration

Defaults live in `config.json`:

```json
{
  "host": "0.0.0.0",
  "port": 8765,
  "dry_run": false,
  "release_on_out_of_bounds": true,
  "invert_y": false,
  "pointer_smoothing": {
    "enabled": true,
    "deadzone_pixels": 1.0,
    "hover_alpha_min": 0.48,
    "hover_alpha_max": 0.92,
    "drag_alpha_min": 0.58,
    "drag_alpha_max": 0.96,
    "click_snap_alpha": 1.0,
    "click_hold_pixels": 5,
    "speed_pixels_for_max_alpha": 45,
    "scroll_alpha": 0.55
  }
}
```

CLI flags override config values.

## Precision Tuning

The companion applies adaptive cursor smoothing after receiving Lens packets. Slow movement is smoothed more to reduce jitter; fast movement follows more responsively.

Useful settings in `config.json`:

```txt
deadzone_pixels              ignore tiny jitter below this many pixels
hover_alpha_min/max          smoothing range for normal pointer movement
drag_alpha_min/max           smoothing range while the mouse button is held
click_snap_alpha             how strongly mouse down snaps toward the latest packet
click_hold_pixels            movement allowed before a tap becomes a drag
speed_pixels_for_max_alpha   movement distance that reaches max responsiveness
```

For tiny UI targets, try:

```txt
deadzone_pixels = 1.0
click_snap_alpha = 1.0
click_hold_pixels = 4
drag_alpha_min = 0.65
```

For shakier tracking, try:

```txt
deadzone_pixels = 2.0
hover_alpha_min = 0.32
drag_alpha_min = 0.42
```

## Recalibration

While a Lens is connected, type:

```txt
r
```

Then press Enter. The companion sends:

```json
{"type":"command","command":"recalibrate"}
```

## macOS Permission

If real cursor events are ignored:

```txt
System Settings > Privacy & Security > Accessibility
```

Enable Terminal, Python, or your IDE.

Optional dependency:

```bash
python3 -m pip install --user -r requirements-macos.txt
```

## Windows Permission

No Python package is required for cursor events.

If Spectacles cannot connect:

- enable Experimental API mode in Lens Studio for WebSocket / `InternetModule` access
- allow Python through Windows Firewall
- confirm port `8765` is open
- verify desktop IP with `ipconfig`

If cursor events are ignored, try running the terminal as Administrator.
