from __future__ import annotations

import platform
import ctypes
from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class PointerPacket:
    u: float
    v: float
    pinch: bool
    phase: str
    distance_to_plane: float = 0.0
    scroll_x: float = 0.0
    scroll_y: float = 0.0


class MouseController:
    def __init__(self, dry_run: bool = False, invert_y: bool = False) -> None:
        self.dry_run = dry_run
        self.invert_y = invert_y
        self._mouse_down = False
        self._platform = platform.system().lower()
        self._quartz = None
        self._user32 = None

        if self.dry_run:
            return

        if self._platform == "darwin":
            try:
                import Quartz  # type: ignore

                self._quartz = Quartz
            except Exception as exc:
                print(f"Quartz/PyObjC unavailable ({exc}); running in dry-run mode.")
                self.dry_run = True
        elif self._platform == "windows":
            try:
                self._user32 = ctypes.windll.user32
                self._user32.SetProcessDPIAware()
            except Exception as exc:
                print(f"Windows User32 unavailable ({exc}); running in dry-run mode.")
                self.dry_run = True
        else:
            print(f"Unsupported desktop platform '{self._platform}'; running in dry-run mode.")
            self.dry_run = True

    def screen_size(self) -> Tuple[int, int]:
        if self._platform == "darwin" and self._quartz is not None:
            display_id = self._quartz.CGMainDisplayID()
            return (
                int(self._quartz.CGDisplayPixelsWide(display_id)),
                int(self._quartz.CGDisplayPixelsHigh(display_id)),
            )

        if self._platform == "windows" and self._user32 is not None:
            return (
                int(self._user32.GetSystemMetrics(0)),
                int(self._user32.GetSystemMetrics(1)),
            )

        if self.dry_run:
            return (1440, 900)

        return (1440, 900)

    def handle_pointer(self, packet: PointerPacket) -> None:
        u = _clamp01(packet.u)
        v = _clamp01(1.0 - packet.v if self.invert_y else packet.v)
        width, height = self.screen_size()
        point = (round(u * (width - 1)), round(v * (height - 1)))

        if packet.phase == "scroll":
            if self._mouse_down:
                self._mouse_up(point)
            self._move(point)
            self._scroll(packet.scroll_x, packet.scroll_y)
            return

        if packet.phase == "outOfBounds":
            if self._mouse_down:
                self._mouse_up(point)
            return

        if packet.phase == "down" or (packet.pinch and not self._mouse_down):
            self._move(point)
            self._mouse_down_at(point)
            return

        if packet.phase == "drag" or (packet.pinch and self._mouse_down):
            self._drag(point)
            return

        if packet.phase == "up" or (not packet.pinch and self._mouse_down):
            self._mouse_up(point)
            return

        self._move(point)

    def release_if_needed(self) -> None:
        if self._mouse_down:
            self._mouse_up(self._current_position())

    def _move(self, point: Tuple[int, int]) -> None:
        self._post("move", point)

    def _mouse_down_at(self, point: Tuple[int, int]) -> None:
        self._mouse_down = True
        self._post("down", point)

    def _drag(self, point: Tuple[int, int]) -> None:
        self._post("drag", point)

    def _mouse_up(self, point: Tuple[int, int]) -> None:
        self._mouse_down = False
        self._post("up", point)

    def _scroll(self, scroll_x: float, scroll_y: float) -> None:
        self._post_scroll(round(scroll_x), round(scroll_y))

    def _post(self, action: str, point: Tuple[int, int]) -> None:
        if self.dry_run:
            print(f"{action:>4} x={point[0]} y={point[1]}")
            return

        if self._platform == "darwin" and self._quartz is not None:
            self._post_macos(action, point)
            return

        if self._platform == "windows" and self._user32 is not None:
            self._post_windows(action, point)
            return

        print(f"{action:>4} x={point[0]} y={point[1]}")

    def _post_scroll(self, scroll_x: int, scroll_y: int) -> None:
        if self.dry_run:
            print(f"scroll x={scroll_x} y={scroll_y}")
            return

        if self._platform == "darwin" and self._quartz is not None:
            self._post_macos_scroll(scroll_x, scroll_y)
            return

        if self._platform == "windows" and self._user32 is not None:
            self._post_windows_scroll(scroll_x, scroll_y)
            return

        print(f"scroll x={scroll_x} y={scroll_y}")

    def _post_macos(self, action: str, point: Tuple[int, int]) -> None:
        q = self._quartz
        event_type = {
            "move": q.kCGEventMouseMoved,
            "down": q.kCGEventLeftMouseDown,
            "drag": q.kCGEventLeftMouseDragged,
            "up": q.kCGEventLeftMouseUp,
        }[action]
        event = q.CGEventCreateMouseEvent(None, event_type, point, q.kCGMouseButtonLeft)
        q.CGEventPost(q.kCGHIDEventTap, event)

    def _post_macos_scroll(self, scroll_x: int, scroll_y: int) -> None:
        q = self._quartz
        event = q.CGEventCreateScrollWheelEvent(None, q.kCGScrollEventUnitPixel, 2, int(scroll_y), int(scroll_x))
        q.CGEventPost(q.kCGHIDEventTap, event)

    def _post_windows(self, action: str, point: Tuple[int, int]) -> None:
        user32 = self._user32
        user32.SetCursorPos(int(point[0]), int(point[1]))

        if action == "down":
            user32.mouse_event(0x0002, 0, 0, 0, 0)
        elif action == "up":
            user32.mouse_event(0x0004, 0, 0, 0, 0)

    def _post_windows_scroll(self, scroll_x: int, scroll_y: int) -> None:
        user32 = self._user32
        if scroll_y != 0:
            user32.mouse_event(0x0800, 0, 0, int(scroll_y), 0)
        if scroll_x != 0:
            user32.mouse_event(0x01000, 0, 0, int(scroll_x), 0)

    def _current_position(self) -> Tuple[int, int]:
        if self._platform == "darwin" and self._quartz is not None:
            event = self._quartz.CGEventCreate(None)
            location = self._quartz.CGEventGetLocation(event)
            return (round(location.x), round(location.y))

        if self._platform == "windows" and self._user32 is not None:
            point = _WindowsPoint()
            self._user32.GetCursorPos(ctypes.byref(point))
            return (int(point.x), int(point.y))

        return (0, 0)


class _WindowsPoint(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))
