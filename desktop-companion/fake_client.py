from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import struct
import time
from typing import Dict


async def main() -> None:
    parser = argparse.ArgumentParser(description="Send fake AirTouch pointer packets.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--drag", action="store_true")
    parser.add_argument("--scroll", action="store_true")
    args = parser.parse_args()

    reader, writer = await asyncio.open_connection(args.host, args.port)
    await handshake(reader, writer, args.host, args.port)

    await send(writer, {"type": "pointer", "u": 0.5, "v": 0.5, "pinch": False, "phase": "hover"})
    await asyncio.sleep(0.4)

    if args.scroll:
        for index in range(24):
            await send(
                writer,
                {
                    "type": "pointer",
                    "u": 0.5,
                    "v": 0.55,
                    "pinch": True,
                    "phase": "scroll",
                    "scrollX": 0,
                    "scrollY": -32,
                },
            )
            await asyncio.sleep(1 / 60)
        for index in range(12):
            await send(
                writer,
                {
                    "type": "pointer",
                    "u": 0.5,
                    "v": 0.45,
                    "pinch": True,
                    "phase": "scroll",
                    "scrollX": 0,
                    "scrollY": 32,
                },
            )
            await asyncio.sleep(1 / 60)
    elif args.drag:
        await send(writer, {"type": "pointer", "u": 0.25, "v": 0.25, "pinch": True, "phase": "down"})
        for index in range(30):
            t = index / 29
            await send(
                writer,
                {"type": "pointer", "u": 0.25 + t * 0.5, "v": 0.25 + t * 0.5, "pinch": True, "phase": "drag"},
            )
            await asyncio.sleep(1 / 60)
        await send(writer, {"type": "pointer", "u": 0.75, "v": 0.75, "pinch": False, "phase": "up"})
    else:
        await send(writer, {"type": "pointer", "u": 0.5, "v": 0.5, "pinch": True, "phase": "down"})
        await asyncio.sleep(0.08)
        await send(writer, {"type": "pointer", "u": 0.5, "v": 0.5, "pinch": False, "phase": "up"})

    writer.close()
    await writer.wait_closed()


async def handshake(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, host: str, port: int) -> None:
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    request = (
        f"GET / HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    writer.write(request.encode("ascii"))
    await writer.drain()
    await reader.readuntil(b"\r\n\r\n")


async def send(writer: asyncio.StreamWriter, packet: Dict[str, object]) -> None:
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
