# Protocol

AirTouch uses JSON text frames over WebSocket.

## Pointer Packet

Sent from Lens to desktop:

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

Fields:

```txt
type             always "pointer"
u                normalized horizontal position, 0 left to 1 right
v                normalized vertical position, 0 top to 1 bottom
pinch            true when desktop should treat the packet as pressed; may be pinch or plane touch
phase            hover, down, move, drag, up, scroll, outOfBounds
scrollX          optional horizontal scroll delta, used by phase scroll
scrollY          optional vertical scroll delta, used by phase scroll
distanceToPlane  signed meters from calibrated screen plane
timestamp        Lens timestamp in milliseconds
```

Scroll packet:

```json
{
  "type": "pointer",
  "u": 0.52,
  "v": 0.43,
  "pinch": false,
  "phase": "scroll",
  "scrollX": 0,
  "scrollY": -64,
  "distanceToPlane": 0.08,
  "timestamp": 123456900
}
```

Plane-touch down packet:

```json
{
  "type": "pointer",
  "u": 0.52,
  "v": 0.43,
  "pinch": true,
  "phase": "down",
  "distanceToPlane": 0.018,
  "timestamp": 123456910
}
```

## Command Packet

Sent from desktop to Lens:

```json
{
  "type": "command",
  "command": "recalibrate"
}
```

Supported commands:

```txt
recalibrate
```

## Pointer Phases

```txt
hover        pointer is inside screen area, not pressed
down         press started, from plane touch or pinch fallback
move         pointer moved without press
drag         press held while moving
up           press released
scroll       wheel input, usually from two-finger index/middle movement
outOfBounds  pointer left calibrated bounds; desktop releases mouse if needed
```

The protocol intentionally does not distinguish physical pinch from plane touch. Both become the same desktop press state so the companion can stay platform-focused.
