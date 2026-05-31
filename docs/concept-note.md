# AirTouch MVP Concept

AirTouch turns a calibrated laptop display plane into normalized pointer input.

The Lens flow is:

1. Pinch top left, top right, bottom left, bottom right.
2. Build right/down axes and a screen normal from those four world points.
3. Build a MeshBuilder visual for the calibrated plane.
4. Optionally fine-tune the corners with manual handles.
5. Confirm calibration to enable streaming.
6. Project tracked fingertips into UV coordinates.
7. Smooth, predict, and deadzone UV values.
8. Send pointer packets over WebSocket.

The Lens can operate in plane touch mode: after four-corner calibration, fingertip collision with the calibrated screen plane sends click and drag packets without requiring pinch. The desktop companion receives packets, maps `u` and `v` to the main display, and posts platform mouse events for movement, clicks, drags, and optional scroll.

MVP packet:

```json
{
  "type": "pointer",
  "u": 0.42,
  "v": 0.66,
  "pinch": true,
  "phase": "drag",
  "scrollX": 0,
  "scrollY": 0,
  "distanceToPlane": 0.018,
  "timestamp": 123456789
}
```
