import {ScreenProjectionResult} from "./ScreenProjection"

export type PointerPhase = "hover" | "down" | "move" | "drag" | "up" | "scroll" | "outOfBounds"

export type InteractionUpdate = {
  phase: PointerPhase
  shouldSend: boolean
}

export class InteractionStateMachine {
  private wasPinching = false
  private dragging = false
  private previousInside = false

  reset(): void {
    this.wasPinching = false
    this.dragging = false
    this.previousInside = false
  }

  update(projection: ScreenProjectionResult | null, pinching: boolean): InteractionUpdate {
    const insideBounds = projection !== null && projection.insideBounds

    if (!insideBounds) {
      const shouldRelease = this.dragging || this.wasPinching
      this.wasPinching = false
      this.dragging = false
      this.previousInside = false
      return {phase: "outOfBounds", shouldSend: shouldRelease}
    }

    let phase: PointerPhase

    if (pinching && !this.wasPinching) {
      phase = "down"
      this.dragging = true
    } else if (pinching && this.dragging) {
      phase = "drag"
    } else if (!pinching && this.wasPinching) {
      phase = "up"
      this.dragging = false
    } else {
      phase = this.previousInside ? "move" : "hover"
    }

    this.wasPinching = pinching
    this.previousInside = true

    return {phase, shouldSend: true}
  }
}
