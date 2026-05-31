# Lens Setup

## Add Controller

Open `AirTouch.esproj` in Lens Studio.

Enable Experimental API mode in Lens Studio before running the Lens. AirTouch uses `InternetModule` for WebSocket networking, and `ws://` connections may be blocked when Experimental APIs are disabled.

Attach this script to a scene object:

```txt
Assets/Scripts/AirTouch/AirTouchController.ts
```

Set:

```txt
websocketUrl = ws://DESKTOP_IP:8765
handType = right
debugLogging = true
```

For Lens Studio editor testing on the same machine:

```txt
websocketUrl = ws://127.0.0.1:8765
enableEditorSimulator = true
```

For Spectacles device testing:

```txt
websocketUrl = ws://192.168.x.x:8765
enableEditorSimulator = true or false
```

`enableEditorSimulator` is only active in the Lens Studio editor.

## Calibration

Pinch corners in order:

```txt
Top Left
Top Right
Bottom Left
Bottom Right
```

The Lens logs:

```txt
[AirTouch] pinch Top Left
[AirTouch] saved Top Left
[AirTouch] calibration complete
```

## Recalibration

In the desktop companion terminal, type:

```txt
r
```

Then press Enter.

## Tuning Inputs

Useful starting values:

```txt
touchThresholdMeters = 0.04
hoverThresholdMeters = 0.12
deadzone = 0.004
hoverSmoothing = 0.2
dragSmoothing = 0.35
clickSmoothing = 0.45
enableScrollGesture = true
scrollSensitivity = 900
```

Increase smoothing for steadier but slower movement. Decrease smoothing for faster but noisier movement.

## Gestures

After calibration:

```txt
finger inside screen bounds -> move cursor
pinch on the touch plane -> mouse down / drag
release pinch -> mouse up
pinch and drag slightly away from the touch plane -> scroll
```

The scroll gesture uses the hover band between `touchThresholdMeters` and `hoverThresholdMeters`, so normal near-screen pinch drags still behave like mouse drags.
