# AirTouch MVP Concept

AirTouch turns a calibrated laptop display plane into normalized pointer input.

The Lens flow is:

1. Pinch top left, top right, bottom left, bottom right.
2. Build right/down axes and a screen normal from those four world points.
3. Project the tracked index fingertip into UV coordinates.
4. Smooth and deadzone UV values.
5. Send pointer packets over WebSocket.

The desktop companion receives packets, maps `u` and `v` to the main display, and posts platform mouse events for movement, clicks, drags, and scroll.

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
