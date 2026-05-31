# Testing Checklist

## Desktop Only

Start dry-run:

```bash
cd mac-companion
python3 server.py --dry-run
```

Run fake client:

```bash
python3 fake_client.py
python3 fake_client.py --drag
python3 fake_client.py --scroll
```

Windows:

```powershell
py fake_client.py
py fake_client.py --drag
py fake_client.py --scroll
```

Expected output:

```txt
move x=...
down x=...
drag x=...
scroll x=...
up x=...
```

Run fake hand:

```bash
python3 server.py --dry-run --fake-hand
```

Windows:

```powershell
py server.py --dry-run --fake-hand
```

## Lens Studio Editor

Start companion:

```bash
python3 server.py --dry-run
```

Set Lens:

```txt
websocketUrl = ws://127.0.0.1:8765
enableEditorSimulator = true
```

Make sure Lens Studio Experimental API mode is enabled so WebSocket networking is allowed.

Press and drag in preview.

Expected companion output:

```txt
client connected: ...
move x=...
down x=...
drag x=...
up x=...
```

## Spectacles Device

Start companion:

```bash
python3 server.py --dry-run
```

Set Lens:

```txt
websocketUrl = ws://DESKTOP_IP:8765
```

Make sure Lens Studio Experimental API mode is enabled so WebSocket networking is allowed.

Run on Spectacles.

Expected companion output:

```txt
client connected: ...
```

Calibrate:

```txt
Top Left -> Top Right -> Bottom Left -> Bottom Right
```

Expected Lens log:

```txt
[AirTouch] calibration complete
```

Move finger and pinch.

Expected companion output:

```txt
move/down/drag/up/scroll
```

Scroll test:

```txt
pinch and drag while your fingertip is slightly away from the screen plane, inside the hover band
```

## Real Cursor

Stop dry-run and run:

```bash
python3 server.py
```

Repeat Lens Studio editor or Spectacles tests.

Expected:

```txt
cursor moves
touching the calibrated plane clicks
holding touch and moving drags
lifting away releases
index fingertip visual turns green while touching/clicking
two fingertip visuals turn blue while scrolling
pinch/click fallback still presses
index + middle fingertips moving together scroll
optional: enableScrollGesture makes hover-band pinch drag scroll
release stops drag
```
