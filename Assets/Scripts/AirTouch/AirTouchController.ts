import SIK from "SpectaclesInteractionKit.lspkg/SIK"
import {BaseHand} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/BaseHand"
import {HandType} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandType"
import {InteractionStateMachine} from "./InteractionStateMachine"
import {NetworkSender, PointerPacket} from "./NetworkSender"
import {ScreenCalibrationPoints, ScreenProjection} from "./ScreenProjection"

type CalibrationCorner = keyof ScreenCalibrationPoints

@component
export class AirTouchController extends BaseScriptComponent {
  @input
  @hint("Mac companion WebSocket URL. Use your Mac IP on device, for example ws://192.168.1.40:8765.")
  private websocketUrl: string = "ws://127.0.0.1:8765"

  @input
  @hint("Tracked hand used for AirTouch. Use right or left.")
  private handType: string = "right"

  @input
  @hint("Meters from calibrated plane considered a touch.")
  private touchThresholdMeters: number = 0.04

  @input
  @hint("Meters from calibrated plane considered hover range.")
  private hoverThresholdMeters: number = 0.12

  @input
  @hint("UV deadzone. Tiny movement below this amount is ignored.")
  private deadzone: number = 0.004

  @input
  @hint("UV smoothing while hovering.")
  private hoverSmoothing: number = 0.2

  @input
  @hint("UV smoothing while dragging.")
  private dragSmoothing: number = 0.35

  @input
  @hint("UV smoothing on the first click frame.")
  private clickSmoothing: number = 0.45

  @input
  @hint("Seconds between WebSocket reconnect attempts.")
  private reconnectDelaySeconds: number = 1.5

  @input
  @hint("Print calibration, projection, and connection status.")
  private debugLogging: boolean = true

  @input
  @hint("In Lens Studio editor, use preview touch/mouse events as fake pointer packets.")
  private enableEditorSimulator: boolean = true

  @input
  @hint("Pinch-drag in the hover band, away from the touch plane, sends desktop scroll wheel events.")
  private enableScrollGesture: boolean = true

  @input
  @hint("Scroll wheel units produced by one normalized UV unit of pinch-drag movement.")
  private scrollSensitivity: number = 900

  private hand!: BaseHand
  private network!: NetworkSender
  private projection = new ScreenProjection()
  private interaction = new InteractionStateMachine()
  private points: Partial<ScreenCalibrationPoints> = {}
  private cornerIndex = 0
  private previousU = 0
  private previousV = 0
  private hasSmoothedUv = false
  private editorSimulatorActive = false
  private scrollGestureActive = false
  private previousScrollU = 0
  private previousScrollV = 0

  private readonly corners: CalibrationCorner[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"]
  private readonly cornerLabels: string[] = ["Top Left", "Top Right", "Bottom Left", "Bottom Right"]

  onAwake(): void {
    this.editorSimulatorActive = this.enableEditorSimulator && global.deviceInfoSystem.isEditor()
    this.network = new NetworkSender(this.websocketUrl, this.reconnectDelaySeconds, this.debugLogging, (command) => {
      if (command === "recalibrate") {
        this.resetCalibration()
      }
    })

    if (this.editorSimulatorActive) {
      this.bindEditorSimulator()
    } else {
      this.hand = SIK.HandInputData.getHand(this.getConfiguredHandType())
      this.hand.onPinchDown.add(() => this.handlePinchDown())
    }

    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  private start(): void {
    if (this.editorSimulatorActive) {
      this.log("editor simulator active; drag in preview to send pointer packets")
    } else {
      this.resetCalibration()
    }
    this.network.connect()
  }

  private update(): void {
    this.network.update()

    if (this.editorSimulatorActive) {
      return
    }

    if (!this.projection.isCalibrated() || !this.hand.isTracked()) {
      return
    }

    const projected = this.projection.project(
      this.hand.indexTip.position,
      this.touchThresholdMeters,
      this.hoverThresholdMeters
    )
    const pinching = this.hand.isPinching()

    if (projected !== null && this.trySendScrollGesture(projected.u, projected.v, projected.distanceToPlane, projected.insideBounds, projected.nearPlane, projected.touchPlane, pinching)) {
      return
    }

    this.scrollGestureActive = false
    const state = this.interaction.update(projected, pinching)

    if (projected === null || !state.shouldSend) {
      return
    }

    const smoothing = state.phase === "down" ? this.clickSmoothing : pinching ? this.dragSmoothing : this.hoverSmoothing
    const smoothed = this.smooth(projected.u, projected.v, smoothing)

    const packet: PointerPacket = {
      type: "pointer",
      u: smoothed.u,
      v: smoothed.v,
      pinch: pinching,
      phase: state.phase,
      distanceToPlane: projected.distanceToPlane,
      timestamp: Math.floor(getTime() * 1000)
    }

    this.network.send(packet)

    if (this.debugLogging && state.phase !== "move") {
      print(
        "[AirTouch] " +
          state.phase +
          " u=" +
          packet.u.toFixed(3) +
          " v=" +
          packet.v.toFixed(3) +
          " d=" +
          packet.distanceToPlane.toFixed(3)
      )
    }
  }

  private trySendScrollGesture(
    u: number,
    v: number,
    distanceToPlane: number,
    insideBounds: boolean,
    nearPlane: boolean,
    touchPlane: boolean,
    pinching: boolean
  ): boolean {
    const shouldScroll = this.enableScrollGesture && pinching && insideBounds && nearPlane && !touchPlane

    if (!shouldScroll) {
      this.scrollGestureActive = false
      return false
    }

    if (!this.scrollGestureActive) {
      this.interaction.reset()
      this.previousScrollU = u
      this.previousScrollV = v
      this.scrollGestureActive = true
      this.log("scroll gesture started")
      return true
    }

    const deltaU = u - this.previousScrollU
    const deltaV = v - this.previousScrollV
    this.previousScrollU = u
    this.previousScrollV = v

    if (Math.abs(deltaU) < this.deadzone && Math.abs(deltaV) < this.deadzone) {
      return true
    }

    const packet: PointerPacket = {
      type: "pointer",
      u,
      v,
      pinch: true,
      phase: "scroll",
      distanceToPlane,
      scrollX: deltaU * this.scrollSensitivity,
      scrollY: -deltaV * this.scrollSensitivity,
      timestamp: Math.floor(getTime() * 1000)
    }

    this.network.send(packet)

    if (this.debugLogging) {
      this.log(
        "scroll u=" +
          packet.u.toFixed(3) +
          " v=" +
          packet.v.toFixed(3) +
          " sx=" +
          packet.scrollX.toFixed(1) +
          " sy=" +
          packet.scrollY.toFixed(1)
      )
    }

    return true
  }

  private bindEditorSimulator(): void {
    this.createEvent("TouchStartEvent").bind((eventData: TouchStartEvent) => {
      const position = eventData.getTouchPosition()
      this.sendEditorPointer(position, false, "hover")
      this.sendEditorPointer(position, true, "down")
    })

    this.createEvent("TouchMoveEvent").bind((eventData: TouchMoveEvent) => {
      this.sendEditorPointer(eventData.getTouchPosition(), true, "drag")
    })

    this.createEvent("TouchEndEvent").bind((eventData: TouchEndEvent) => {
      this.sendEditorPointer(eventData.getTouchPosition(), false, "up")
    })
  }

  private sendEditorPointer(position: vec2, pinch: boolean, phase: PointerPacket["phase"]): void {
    const packet: PointerPacket = {
      type: "pointer",
      u: Math.max(0, Math.min(1, position.x)),
      v: Math.max(0, Math.min(1, position.y)),
      pinch,
      phase,
      distanceToPlane: 0,
      timestamp: Math.floor(getTime() * 1000)
    }

    this.network.send(packet)

    if (this.debugLogging) {
      this.log("editor " + phase + " u=" + packet.u.toFixed(3) + " v=" + packet.v.toFixed(3))
    }
  }

  private handlePinchDown(): void {
    if (!this.hand.isTracked()) {
      return
    }

    if (this.projection.isCalibrated()) {
      return
    }

    const corner = this.corners[this.cornerIndex]
    this.points[corner] = this.hand.indexTip.position
    this.cornerIndex += 1
    this.log("saved " + this.cornerLabels[this.cornerIndex - 1])

    if (this.cornerIndex < this.corners.length) {
      this.log("pinch " + this.cornerLabels[this.cornerIndex])
      return
    }

    const completedPoints = this.points as ScreenCalibrationPoints
    if (this.projection.setCalibration(completedPoints)) {
      this.hasSmoothedUv = false
      this.interaction.reset()
      this.log("calibration complete")
    } else {
      this.log("calibration failed; pinch corners again")
      this.resetCalibration()
    }
  }

  private smooth(u: number, v: number, amount: number): {u: number; v: number} {
    if (!this.hasSmoothedUv) {
      this.previousU = u
      this.previousV = v
      this.hasSmoothedUv = true
      return {u, v}
    }

    const deltaU = Math.abs(u - this.previousU)
    const deltaV = Math.abs(v - this.previousV)
    if (deltaU < this.deadzone && deltaV < this.deadzone) {
      return {u: this.previousU, v: this.previousV}
    }

    this.previousU = lerp(this.previousU, u, amount)
    this.previousV = lerp(this.previousV, v, amount)
    return {u: this.previousU, v: this.previousV}
  }

  private resetCalibration(): void {
    this.points = {}
    this.cornerIndex = 0
    this.hasSmoothedUv = false
    this.projection.reset()
    this.interaction.reset()
    this.scrollGestureActive = false
    this.log("pinch " + this.cornerLabels[this.cornerIndex])
  }

  private log(message: string): void {
    if (this.debugLogging) {
      print("[AirTouch] " + message)
    }
  }

  private getConfiguredHandType(): HandType {
    return this.handType === "left" ? "left" : "right"
  }
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}
