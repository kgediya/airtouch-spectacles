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
pinch            true while pinch is held
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
  "pinch": true,
  "phase": "scroll",
  "scrollX": 0,
  "scrollY": -64,
  "distanceToPlane": 0.08,
  "timestamp": 123456900
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
hover        pointer is inside screen area, no pinch
down         pinch started
move         pointer moved without pinch
drag         pinch held while moving
up           pinch released
scroll       wheel input, usually from two-finger index/middle movement
outOfBounds  pointer left calibrated bounds; desktop releases mouse if needed
```
