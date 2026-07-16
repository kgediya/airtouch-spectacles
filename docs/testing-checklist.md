# Testing Checklist

## Automated Checks

```bash
npx tsc --project tsconfig.airtouch.json
node tests/ScreenProjectionMath.test.ts
```

## Desktop Only

Start dry-run:

```bash
cd desktop-companion
python3 server.py --dry-run
```

Run fake client:

```bash
python3 fake_client.py
python3 fake_client.py --drag
python3 fake_client.py --scroll
python3 demo_client.py
```

Windows:

```powershell
py fake_client.py
py fake_client.py --drag
py fake_client.py --scroll
py demo_client.py
```

Expected demo client coverage:

```txt
hover path emits move events
center touch emits down/up
diagonal hold emits drag
scroll packets emit wheel events
outOfBounds releases active press
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
[AirTouch] calibration fit width=...m height=...m planeError=...m
```

Verify each sampled corner after confirmation:

```txt
top left     -> rawU approximately 0, rawV approximately 0
top right    -> rawU approximately 1, rawV approximately 0
bottom left  -> rawU approximately 0, rawV approximately 1
bottom right -> rawU approximately 1, rawV approximately 1
```

Cross two corner samples or place two samples nearly on top of one another and verify that calibration is rejected and restarts.

Expected Lens scene:

```txt
calibration plane visual appears
corner handles appear if cornerHandlePrefab is assigned
confirm button appears if a ConfirmButton SceneObject exists
```

Confirm:

```txt
pinch / activate ConfirmButton
or call AirTouchController.confirmAirTouch
```

Move finger, touch the plane, and test two-finger scroll.

Expected companion output:

```txt
move/down/drag/up/scroll
```

Two-finger scroll test:

```txt
touch index and middle fingertips to the calibrated plane and move them together
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
pinch/click fallback still presses
index + middle fingertips moving together scroll
optional: enableScrollGesture makes hover-band pinch drag scroll
release stops drag
```

Fingertip marker rendering is not part of the current acceptance checklist; the controller has placeholder settings, but active marker updates are disabled.
