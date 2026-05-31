export type ScreenCalibrationPoints = {
  topLeft: vec3
  topRight: vec3
  bottomLeft: vec3
  bottomRight: vec3
}

export type ScreenProjectionResult = {
  rawU: number
  rawV: number
  u: number
  v: number
  distanceToPlane: number
  insideBounds: boolean
  nearPlane: boolean
  touchPlane: boolean
}

export class ScreenProjection {
  private topLeft!: vec3
  private rightAxis!: vec3
  private downAxis!: vec3
  private screenNormal!: vec3
  private screenWidth = 0
  private screenHeight = 0
  private calibrated = false

  setCalibration(points: ScreenCalibrationPoints): boolean {
    const rightVector = points.topRight.sub(points.topLeft)
    const downVector = points.bottomLeft.sub(points.topLeft)
    const width = rightVector.length
    const height = downVector.length

    if (width <= 0.001 || height <= 0.001) {
      this.calibrated = false
      return false
    }

    this.topLeft = points.topLeft
    this.rightAxis = rightVector.normalize()
    this.downAxis = downVector.normalize()
    this.screenNormal = this.rightAxis.cross(this.downAxis).normalize()
    this.screenWidth = width
    this.screenHeight = height
    this.calibrated = true
    return true
  }

  reset(): void {
    this.calibrated = false
  }

  isCalibrated(): boolean {
    return this.calibrated
  }

  project(fingerPosition: vec3, touchThresholdMeters: number, hoverThresholdMeters: number): ScreenProjectionResult | null {
    if (!this.calibrated) {
      return null
    }

    const relative = fingerPosition.sub(this.topLeft)
    const rawU = relative.dot(this.rightAxis) / this.screenWidth
    const rawV = relative.dot(this.downAxis) / this.screenHeight
    const distanceToPlane = relative.dot(this.screenNormal)
    const insideBounds = rawU >= 0 && rawU <= 1 && rawV >= 0 && rawV <= 1
    const absoluteDistance = Math.abs(distanceToPlane)

    return {
      rawU,
      rawV,
      u: clamp01(rawU),
      v: clamp01(rawV),
      distanceToPlane,
      insideBounds,
      nearPlane: absoluteDistance <= hoverThresholdMeters,
      touchPlane: absoluteDistance <= touchThresholdMeters
    }
  }
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
