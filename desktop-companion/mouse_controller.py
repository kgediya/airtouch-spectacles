from __future__ import annotations

import platform
import ctypes
from dataclasses import dataclass
from typing import Any, Dict, Tuple


@dataclass(frozen=True)
class PointerPacket:
    u: float
    v: float
    pinch: bool
    phase: str
    distance_to_plane: float = 0.0
    scroll_x: float = 0.0
    scroll_y: float = 0.0


@dataclass(frozen=True)
class PointerSmoothingConfig:
    enabled: bool = True
    deadzone_pixels: float = 1.0
    hover_alpha_min: float = 0.48
    hover_alpha_max: float = 0.92
    drag_alpha_min: float = 0.58
    drag_alpha_max: float = 0.96
    click_snap_alpha: float = 1.0
    click_hold_pixels: float = 5.0
    speed_pixels_for_max_alpha: float = 45.0
    scroll_alpha: float = 0.55

    @classmethod
    def from_config(cls, config: Dict[str, Any]) -> "PointerSmoothingConfig":
        smoothing = config.get("pointer_smoothing", {})
        if not isinstance(smoothing, dict):
            smoothing = {}

        return cls(
            enabled=bool(smoothing.get("enabled", cls.enabled)),
            deadzone_pixels=float(smoothing.get("deadzone_pixels", cls.deadzone_pixels)),
            hover_alpha_min=float(smoothing.get("hover_alpha_min", cls.hover_alpha_min)),
            hover_alpha_max=float(smoothing.get("hover_alpha_max", cls.hover_alpha_max)),
            drag_alpha_min=float(smoothing.get("drag_alpha_min", cls.drag_alpha_min)),
            drag_alpha_max=float(smoothing.get("drag_alpha_max", cls.drag_alpha_max)),
            click_snap_alpha=float(smoothing.get("click_snap_alpha", cls.click_snap_alpha)),
            click_hold_pixels=float(smoothing.get("click_hold_pixels", cls.click_hold_pixels)),
            speed_pixels_for_max_alpha=float(
                smoothing.get("speed_pixels_for_max_alpha", cls.speed_pixels_for_max_alpha)
            ),
            scroll_alpha=float(smoothing.get("scroll_alpha", cls.scroll_alpha)),
        )


class MouseController:
    def __init__(
        self,
        dry_run: bool = False,
        invert_y: bool = False,
        smoothing_config: PointerSmoothingConfig | None = None,
    ) -> None:
        self.dry_run = dry_run
        self.invert_y = invert_y
        self.smoothing = smoothing_config or PointerSmoothingConfig()
        self._mouse_down = False
        self._platform = platform.system().lower()
        self._quartz = None
        self._user32 = None
        self._filtered_point: Tuple[float, float] | None = None
        self._filtered_scroll: Tuple[float, float] = (0.0, 0.0)
        self._mouse_down_point: Tuple[int, int] | None = None
        self._drag_started = False

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
        raw_point = (u * (width - 1), v * (height - 1))

        if packet.phase == "scroll":
            point = self._filtered(raw_point, mode="hover")
            if self._mouse_down:
                self._mouse_up(point)
            self._move(point)
            self._scroll(packet.scroll_x, packet.scroll_y, smooth=True)
            return

        if packet.phase == "outOfBounds":
            if self._mouse_down:
                self._mouse_up(self._rounded_current_position())
            self._filtered_point = None
            return

        if packet.phase == "down" or (packet.pinch and not self._mouse_down):
            point = self._filtered(raw_point, mode="down")
            self._move(point)
            self._mouse_down_at(point)
            return

        if packet.phase == "drag" or (packet.pinch and self._mouse_down):
            point = self._filtered(raw_point, mode="drag")
            self._drag_started = self._drag_started or self._moved_from_mouse_down(point)
            self._drag(point)
            return

        if packet.phase == "up" or (not packet.pinch and self._mouse_down):
            point = self._filtered(raw_point, mode="drag")
            if not self._drag_started and self._mouse_down_point is not None:
                point = self._mouse_down_point
            self._mouse_up(point)
            return

        point = self._filtered(raw_point, mode="hover")
        self._move(point)

    def release_if_needed(self) -> None:
        if self._mouse_down:
            self._mouse_up(self._current_position())

    def _move(self, point: Tuple[int, int]) -> None:
        self._post("move", point)

    def _mouse_down_at(self, point: Tuple[int, int]) -> None:
        self._mouse_down = True
        self._mouse_down_point = point
        self._drag_started = False
        self._post("down", point)

    def _drag(self, point: Tuple[int, int]) -> None:
        self._post("drag", point)

    def _mouse_up(self, point: Tuple[int, int]) -> None:
        self._mouse_down = False
        self._mouse_down_point = None
        self._drag_started = False
        self._post("up", point)

    def _scroll(self, scroll_x: float, scroll_y: float, smooth: bool = False) -> None:
        if smooth and self.smoothing.enabled:
            previous_x, previous_y = self._filtered_scroll
            scroll_x = _lerp(previous_x, scroll_x, self.smoothing.scroll_alpha)
            scroll_y = _lerp(previous_y, scroll_y, self.smoothing.scroll_alpha)
            self._filtered_scroll = (scroll_x, scroll_y)
        self._post_scroll(round(scroll_x), round(scroll_y))

    def _filtered(self, raw_point: Tuple[float, float], mode: str) -> Tuple[int, int]:
        if not self.smoothing.enabled:
            self._filtered_point = raw_point
            return _round_point(raw_point)

        if self._filtered_point is None:
            self._filtered_point = raw_point
            return _round_point(raw_point)

        previous = self._filtered_point
        distance = _distance(previous, raw_point)

        if distance < self.smoothing.deadzone_pixels:
            return _round_point(previous)

        if mode == "down":
            alpha = self.smoothing.click_snap_alpha
        elif mode == "drag":
            alpha = self._adaptive_alpha(
                distance,
                self.smoothing.drag_alpha_min,
                self.smoothing.drag_alpha_max,
            )
        else:
            alpha = self._adaptive_alpha(
                distance,
                self.smoothing.hover_alpha_min,
                self.smoothing.hover_alpha_max,
            )

        filtered = (
            _lerp(previous[0], raw_point[0], alpha),
            _lerp(previous[1], raw_point[1], alpha),
        )
        self._filtered_point = filtered
        return _round_point(filtered)

    def _adaptive_alpha(self, distance: float, minimum: float, maximum: float) -> float:
        if self.smoothing.speed_pixels_for_max_alpha <= 0:
            return _clamp(maximum, 0.0, 1.0)

        speed_t = _clamp(distance / self.smoothing.speed_pixels_for_max_alpha, 0.0, 1.0)
        return _clamp(_lerp(minimum, maximum, speed_t), 0.0, 1.0)

    def _rounded_current_position(self) -> Tuple[int, int]:
        if self._filtered_point is not None:
            return _round_point(self._filtered_point)
        return self._current_position()

    def _moved_from_mouse_down(self, point: Tuple[int, int]) -> bool:
        if self._mouse_down_point is None:
            return False
        return _distance(self._mouse_down_point, point) >= self.smoothing.click_hold_pixels

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


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _lerp(start: float, end: float, alpha: float) -> float:
    return start + (end - start) * alpha


def _distance(start: Tuple[float, float], end: Tuple[float, float]) -> float:
    delta_x = end[0] - start[0]
    delta_y = end[1] - start[1]
    return (delta_x * delta_x + delta_y * delta_y) ** 0.5


def _round_point(point: Tuple[float, float]) -> Tuple[int, int]:
    return (round(point[0]), round(point[1]))
