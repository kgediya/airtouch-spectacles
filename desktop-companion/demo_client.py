from __future__ import annotations

import argparse
import asyncio
import base64
import json
import math
import os
import struct
import time
from typing import Dict, Iterable, Tuple


Packet = Dict[str, object]


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a reviewer-friendly AirTouch demo sequence without Spectacles."
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--fps", type=float, default=60.0)
    parser.add_argument("--pause", type=float, default=0.35)
    args = parser.parse_args()

    reader, writer = await asyncio.open_connection(args.host, args.port)
    await handshake(reader, writer, args.host, args.port)

    print("Connected to AirTouch desktop companion.")
    print("Running hover, click, drag, scroll, and out-of-bounds demo packets.")

    try:
        await run_demo(writer, fps=max(args.fps, 1.0), pause=max(args.pause, 0.0))
    finally:
        writer.close()
        await writer.wait_closed()

    print("Demo client complete.")


async def run_demo(writer: asyncio.StreamWriter, fps: float, pause: float) -> None:
    frame_delay = 1.0 / fps

    await label("1/5 hover: cursor traces the calibrated screen area")
    for packet in hover_path(frames=120):
        await send(writer, packet)
        await asyncio.sleep(frame_delay)
    await asyncio.sleep(pause)

    await label("2/5 click: plane-touch down/up at center")
    await click(writer, 0.5, 0.5, frame_delay)
    await asyncio.sleep(pause)

    await label("3/5 drag: hold touch while moving diagonally")
    await send(writer, pointer(0.22, 0.24, True, "down", 0.0))
    await asyncio.sleep(frame_delay * 4)
    for index in range(72):
        t = index / 71
        eased = ease_in_out(t)
        await send(writer, pointer(0.22 + eased * 0.56, 0.24 + eased * 0.42, True, "drag", 0.0))
        await asyncio.sleep(frame_delay)
    await send(writer, pointer(0.78, 0.66, False, "up", 0.08))
    await asyncio.sleep(pause)

    await label("4/5 scroll: two-finger style scroll packets")
    for value in [-38] * 36 + [34] * 24:
        await send(writer, scroll_packet(0.54, 0.56, value))
        await asyncio.sleep(frame_delay)
    await asyncio.sleep(pause)

    await label("5/5 safety: outOfBounds releases any active press")
    await send(writer, pointer(0.5, 0.5, True, "down", 0.0))
    await asyncio.sleep(frame_delay * 6)
    await send(writer, pointer(1.15, 0.5, True, "outOfBounds", 0.2))
    await asyncio.sleep(frame_delay * 6)
    await send(writer, pointer(0.5, 0.5, False, "hover", 0.08))


async def label(message: str) -> None:
    print(message)
    await asyncio.sleep(0.05)


async def click(writer: asyncio.StreamWriter, u: float, v: float, frame_delay: float) -> None:
    await send(writer, pointer(u, v, False, "hover", 0.08))
    await asyncio.sleep(frame_delay * 6)
    await send(writer, pointer(u, v, True, "down", 0.0))
    await asyncio.sleep(frame_delay * 5)
    await send(writer, pointer(u, v, False, "up", 0.08))


def hover_path(frames: int) -> Iterable[Packet]:
    for index in range(frames):
        t = index / max(frames - 1, 1)
        angle = t * math.tau
        radius = 0.28 + math.sin(t * math.tau * 2) * 0.04
        yield pointer(
            0.5 + math.cos(angle) * radius,
            0.5 + math.sin(angle) * radius * 0.68,
            False,
            "hover",
            0.09,
        )


def pointer(u: float, v: float, pinch: bool, phase: str, distance: float) -> Packet:
    return {
        "type": "pointer",
        "u": round(u, 4),
        "v": round(v, 4),
        "pinch": pinch,
        "phase": phase,
        "distanceToPlane": distance,
    }


def scroll_packet(u: float, v: float, scroll_y: float) -> Packet:
    packet = pointer(u, v, True, "scroll", 0.01)
    packet["scrollX"] = 0
    packet["scrollY"] = scroll_y
    return packet


def ease_in_out(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


async def handshake(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, host: str, port: int) -> None:
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    request = (
        f"GET / HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    writer.write(request.encode("ascii"))
    await writer.drain()
    await reader.readuntil(b"\r\n\r\n")


async def send(writer: asyncio.StreamWriter, packet: Packet) -> None:
    packet["timestamp"] = int(time.time() * 1000)
    payload = json.dumps(packet, separators=(",", ":")).encode("utf-8")
    writer.write(encode_client_frame(payload))
    await writer.drain()


def encode_client_frame(payload: bytes) -> bytes:
    mask = os.urandom(4)
    length = len(payload)
    header = bytearray([0x81])
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.extend([0x80 | 126])
        header.extend(struct.pack(">H", length))
    else:
        header.extend([0x80 | 127])
        header.extend(struct.pack(">Q", length))

    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return bytes(header) + mask + masked


if __name__ == "__main__":
    asyncio.run(main())
