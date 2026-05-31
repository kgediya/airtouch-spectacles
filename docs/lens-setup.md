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
touchReleaseThresholdMeters = 0.065
hoverThresholdMeters = 0.12
deadzone = 0.002
hoverSmoothing = 0.5
dragSmoothing = 0.68
clickSmoothing = 0.9
predictionSeconds = 0.05
maxPredictionUv = 0.025
enableTwoFingerScroll = true
twoFingerScrollRequiresPlaneTouch = true
twoFingerScrollSensitivity = 1100
twoFingerMinSeparationUv = 0.025
twoFingerMaxSeparationUv = 0.22
twoFingerMaxPlaneDeltaMeters = 0.12
enableScrollGesture = false
scrollSensitivity = 900
enablePlaneTouchMode = true
enableFingertipVisuals = true
autoCreateFingertipVisuals = true
fingertipHoverScale = 0.012
fingertipTouchScale = 0.02
fingertipScrollScale = 0.016
```

Increase smoothing for steadier but slower movement. Decrease smoothing for faster but noisier movement.

`predictionSeconds` offsets some smoothing latency by lightly projecting the current UV velocity forward. Keep `maxPredictionUv` small so prediction cannot jump far during hand-tracking spikes.

The desktop companion also applies adaptive pixel smoothing. Tune `mac-companion/config.json` if the pointer is steady in Lens logs but still feels jittery on the desktop.

## Gestures

After calibration:

```txt
finger inside screen bounds -> move cursor
touch calibrated screen plane -> mouse down
hold touch + move -> drag
lift away from plane -> mouse up
pinch inside screen bounds -> optional mouse down / drag fallback
index + middle fingertips move together -> scroll
optional legacy mode: enableScrollGesture, then pinch and drag in the hover band -> scroll
```

Plane touch mode is on by default. It uses `touchThresholdMeters` to start touch and `touchReleaseThresholdMeters` to release touch, which gives the virtual screen a little thickness and avoids rapid down/up chatter.

Two-finger scroll uses the midpoint between index and middle fingertips. Keep both fingers projected inside the calibrated screen, with a small natural gap between them.

Away-pinch click/drag is the default. Legacy pinch-scroll uses the same physical pinch-drag motion, so leave `enableScrollGesture` off while testing click and drag from a distance.

## Fingertip Feedback

Fingertip visuals are enabled by default.

```txt
yellow -> hover / projected inside screen
green  -> touch or click active
blue   -> two-finger scroll active
```

If `indexFingertipVisual` and `middleFingertipVisual` are empty, AirTouch creates simple default markers at runtime. For a nicer look, assign small sphere or ring SceneObjects to those fields; the script will move, scale, enable, and recolor them automatically when possible.
