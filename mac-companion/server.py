from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import math
import os
import socket
import struct
import sys
import threading
from pathlib import Path
from platform import system
from typing import Any, Dict, Optional, Set

from mouse_controller import MouseController, PointerPacket, PointerSmoothingConfig


GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CLIENTS: Set[asyncio.StreamWriter] = set()


async def main() -> None:
    parser = argparse.ArgumentParser(description="AirTouch desktop companion WebSocket server")
    parser.add_argument("--config", default=str(Path(__file__).with_name("config.json")))
    parser.add_argument("--host")
    parser.add_argument("--port", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fake-hand", action="store_true", help="Generate fake pointer packets without Spectacles.")
    parser.add_argument("--fake-hand-loop", action="store_true", help="Repeat fake-hand motion until stopped.")
    args = parser.parse_args()

    config = load_config(args.config)
    host = args.host or config.get("host", "0.0.0.0")
    port = args.port or int(config.get("port", 8765))
    dry_run = bool(args.dry_run or config.get("dry_run", False))

    mouse = MouseController(
        dry_run=dry_run,
        invert_y=bool(config.get("invert_y", False)),
        smoothing_config=PointerSmoothingConfig.from_config(config),
    )

    server = await asyncio.start_server(
        lambda reader, writer: handle_client(reader, writer, mouse, bool(config.get("release_on_out_of_bounds", True))),
        host,
        port,
    )

    addresses = ", ".join(str(sock.getsockname()) for sock in server.sockets or [])
    print(f"AirTouch desktop companion listening on {addresses}")
    print_permission_hint(dry_run)
    setup_command_reader()

    if args.fake_hand:
        asyncio.create_task(simulate_fake_hand(mouse, loop=args.fake_hand_loop))

    async with server:
        await server.serve_forever()


def load_config(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def print_permission_hint(dry_run: bool) -> None:
    if dry_run:
        print("Dry run is active; cursor events will be printed instead of posted.")
        return

    current_platform = system().lower()
    if current_platform == "darwin":
        print("macOS: grant Accessibility permission to Terminal/Python if cursor events are ignored.")
    elif current_platform == "windows":
        print("Windows: if cursor events are ignored, run the terminal normally first, then try Administrator if needed.")
    else:
        print("This platform is not supported for real cursor injection; dry-run mode may be used.")


async def handle_client(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    mouse: MouseController,
    release_on_out_of_bounds: bool,
) -> None:
    peer = writer.get_extra_info("peername")
    try:
        await handshake(reader, writer)
        enable_low_latency_socket(writer)
        CLIENTS.add(writer)
        print(f"client connected: {peer}")

        while True:
            message = await read_frame(reader, writer)
            if message is None:
                break
            handle_message(message, mouse, release_on_out_of_bounds)
    except asyncio.IncompleteReadError:
        pass
    except Exception as exc:
        print(f"client error {peer}: {exc}")
    finally:
        mouse.release_if_needed()
        CLIENTS.discard(writer)
        writer.close()
        await writer.wait_closed()
        print(f"client disconnected: {peer}")


async def handshake(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    request = await reader.readuntil(b"\r\n\r\n")
    headers: Dict[str, str] = {}
    for line in request.decode("utf-8", errors="ignore").split("\r\n")[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()

    websocket_key = headers.get("sec-websocket-key")
    if websocket_key is None:
        raise ValueError("missing Sec-WebSocket-Key")

    accept = base64.b64encode(hashlib.sha1((websocket_key + GUID).encode("ascii")).digest()).decode("ascii")
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    )
    writer.write(response.encode("ascii"))
    await writer.drain()


def enable_low_latency_socket(writer: asyncio.StreamWriter) -> None:
    sock = writer.get_extra_info("socket")
    if sock is None:
        return

    try:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except OSError:
        pass


async def read_frame(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> Optional[str]:
    header = await reader.readexactly(2)
    first, second = header[0], header[1]
    opcode = first & 0x0F
    masked = (second & 0x80) != 0
    payload_length = second & 0x7F

    if payload_length == 126:
        payload_length = struct.unpack(">H", await reader.readexactly(2))[0]
    elif payload_length == 127:
        payload_length = struct.unpack(">Q", await reader.readexactly(8))[0]

    mask = await reader.readexactly(4) if masked else b""
    payload = await reader.readexactly(payload_length)
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))

    if opcode == 0x8:
        return None
    if opcode == 0x9:
        await write_frame(writer, payload, opcode=0xA)
        return ""
    if opcode != 0x1:
        return ""
    return payload.decode("utf-8")


async def write_frame(writer: asyncio.StreamWriter, payload: bytes, opcode: int = 0x1) -> None:
    writer.write(bytes([0x80 | opcode]))
    length = len(payload)
    if length < 126:
        writer.write(bytes([length]))
    elif length < 65536:
        writer.write(bytes([126]) + struct.pack(">H", length))
    else:
        writer.write(bytes([127]) + struct.pack(">Q", length))
    writer.write(payload)
    await writer.drain()


def setup_command_reader() -> None:
    if not sys.stdin.isatty():
        return

    print("Type 'r' then Enter to ask connected Lens clients to recalibrate.")
    loop = asyncio.get_running_loop()

    try:
        loop.add_reader(sys.stdin, lambda: asyncio.create_task(handle_command(sys.stdin.readline())))
    except (AttributeError, NotImplementedError):
        threading.Thread(target=read_commands_from_thread, args=(loop,), daemon=True).start()


def read_commands_from_thread(loop: asyncio.AbstractEventLoop) -> None:
    while True:
        command = sys.stdin.readline()
        if command == "":
            return
        loop.call_soon_threadsafe(lambda value=command: asyncio.create_task(handle_command(value)))


async def handle_command(command: str) -> None:
    if command.strip().lower() in {"r", "recalibrate"}:
        await broadcast({"type": "command", "command": "recalibrate"})
        print("sent recalibrate command")


async def broadcast(packet: Dict[str, str]) -> None:
    payload = json.dumps(packet, separators=(",", ":")).encode("utf-8")
    stale_clients: Set[asyncio.StreamWriter] = set()
    for writer in CLIENTS:
        try:
            await write_frame(writer, payload)
        except Exception:
            stale_clients.add(writer)
    CLIENTS.difference_update(stale_clients)


async def simulate_fake_hand(mouse: MouseController, loop: bool = False) -> None:
    print("fake hand simulation started")

    while True:
        await fake_hover_circle(mouse)
        await fake_drag_diagonal(mouse)
        await fake_scroll(mouse)
        await fake_click_points(mouse)

        if not loop:
            print("fake hand simulation complete")
            return

        await asyncio.sleep(0.4)


async def fake_hover_circle(mouse: MouseController) -> None:
    for index in range(90):
        angle = (index / 90) * math.tau
        packet = PointerPacket(
            u=0.5 + math.cos(angle) * 0.22,
            v=0.5 + math.sin(angle) * 0.22,
            pinch=False,
            phase="move",
        )
        mouse.handle_pointer(packet)
        await asyncio.sleep(1 / 60)


async def fake_drag_diagonal(mouse: MouseController) -> None:
    mouse.handle_pointer(PointerPacket(u=0.25, v=0.25, pinch=True, phase="down"))
    await asyncio.sleep(0.08)

    for index in range(45):
        t = index / 44
        mouse.handle_pointer(
            PointerPacket(
                u=0.25 + t * 0.5,
                v=0.25 + t * 0.5,
                pinch=True,
                phase="drag",
            )
        )
        await asyncio.sleep(1 / 60)

    mouse.handle_pointer(PointerPacket(u=0.75, v=0.75, pinch=False, phase="up"))
    await asyncio.sleep(0.25)


async def fake_scroll(mouse: MouseController) -> None:
    mouse.handle_pointer(PointerPacket(u=0.5, v=0.65, pinch=True, phase="scroll", scroll_y=-80))
    await asyncio.sleep(0.08)

    for index in range(20):
        mouse.handle_pointer(PointerPacket(u=0.5, v=0.65, pinch=True, phase="scroll", scroll_y=-28))
        await asyncio.sleep(1 / 60)

    for index in range(12):
        mouse.handle_pointer(PointerPacket(u=0.5, v=0.45, pinch=True, phase="scroll", scroll_y=28))
        await asyncio.sleep(1 / 60)

    await asyncio.sleep(0.25)


async def fake_click_points(mouse: MouseController) -> None:
    for u, v in [(0.5, 0.5), (0.2, 0.8), (0.8, 0.2)]:
        mouse.handle_pointer(PointerPacket(u=u, v=v, pinch=False, phase="hover"))
        await asyncio.sleep(0.12)
        mouse.handle_pointer(PointerPacket(u=u, v=v, pinch=True, phase="down"))
        await asyncio.sleep(0.08)
        mouse.handle_pointer(PointerPacket(u=u, v=v, pinch=False, phase="up"))
        await asyncio.sleep(0.18)


def handle_message(message: str, mouse: MouseController, release_on_out_of_bounds: bool) -> None:
    if not message:
        return

    data = json.loads(message)
    if data.get("type") != "pointer":
        return

    phase = str(data.get("phase", "hover"))
    if phase == "outOfBounds" and not release_on_out_of_bounds:
        return

    mouse.handle_pointer(
        PointerPacket(
            u=float(data.get("u", 0.0)),
            v=float(data.get("v", 0.0)),
            pinch=bool(data.get("pinch", False)),
            phase=phase,
            distance_to_plane=float(data.get("distanceToPlane", 0.0)),
            scroll_x=float(data.get("scrollX", 0.0)),
            scroll_y=float(data.get("scrollY", 0.0)),
        )
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nAirTouch companion stopped.")
