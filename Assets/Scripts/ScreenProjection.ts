import {isConvexScreenQuad, solveBilinearUv} from "./ScreenProjectionMath"
import type {Point2} from "./ScreenProjectionMath"

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

export type CalibrationQuality = {
  averageWidthMeters: number
  averageHeightMeters: number
  maxCornerPlaneErrorMeters: number
}

export class ScreenProjection {
  private planeCenter!: vec3
  private rightAxis!: vec3
  private downAxis!: vec3
  private screenNormal!: vec3
  private topLeft2d!: Point2
  private topRight2d!: Point2
  private bottomLeft2d!: Point2
  private bottomRight2d!: Point2
  private quality: CalibrationQuality | null = null
  private calibrated = false

  setCalibration(points: ScreenCalibrationPoints): boolean {
    const topEdge = points.topRight.sub(points.topLeft)
    const bottomEdge = points.bottomRight.sub(points.bottomLeft)
    const leftEdge = points.bottomLeft.sub(points.topLeft)
    const rightEdge = points.bottomRight.sub(points.topRight)
    const averageRight = topEdge.add(bottomEdge)
    const averageDown = leftEdge.add(rightEdge)
    const normal = averageRight.cross(averageDown)
    const averageWidth = (topEdge.length + bottomEdge.length) * 0.5
    const averageHeight = (leftEdge.length + rightEdge.length) * 0.5

    if (averageWidth <= 0.001 || averageHeight <= 0.001 || normal.length <= 0.000001) {
      this.reset()
      return false
    }

    this.planeCenter = points.topLeft.add(points.topRight).add(points.bottomLeft).add(points.bottomRight).uniformScale(0.25)
    this.rightAxis = averageRight.normalize()
    this.screenNormal = normal.normalize()
    this.downAxis = this.screenNormal.cross(this.rightAxis).normalize()
    this.topLeft2d = this.toPlanePoint(points.topLeft)
    this.topRight2d = this.toPlanePoint(points.topRight)
    this.bottomLeft2d = this.toPlanePoint(points.bottomLeft)
    this.bottomRight2d = this.toPlanePoint(points.bottomRight)

    if (!isConvexScreenQuad(this.topLeft2d, this.topRight2d, this.bottomLeft2d, this.bottomRight2d)) {
      this.reset()
      return false
    }

    const cornerUv = solveBilinearUv(
      this.bottomRight2d,
      this.topLeft2d,
      this.topRight2d,
      this.bottomLeft2d,
      this.bottomRight2d
    )
    if (cornerUv === null) {
      this.reset()
      return false
    }

    this.quality = {
      averageWidthMeters: averageWidth,
      averageHeightMeters: averageHeight,
      maxCornerPlaneErrorMeters: Math.max(
        Math.abs(points.topLeft.sub(this.planeCenter).dot(this.screenNormal)),
        Math.abs(points.topRight.sub(this.planeCenter).dot(this.screenNormal)),
        Math.abs(points.bottomLeft.sub(this.planeCenter).dot(this.screenNormal)),
        Math.abs(points.bottomRight.sub(this.planeCenter).dot(this.screenNormal))
      )
    }
    this.calibrated = true
    return true
  }

  reset(): void {
    this.calibrated = false
    this.quality = null
  }

  isCalibrated(): boolean {
    return this.calibrated
  }

  getCalibrationQuality(): CalibrationQuality | null {
    return this.quality
  }

  project(fingerPosition: vec3, touchThresholdMeters: number, hoverThresholdMeters: number): ScreenProjectionResult | null {
    if (!this.calibrated) {
      return null
    }

    const relative = fingerPosition.sub(this.planeCenter)
    const uv = solveBilinearUv(
      {x: relative.dot(this.rightAxis), y: relative.dot(this.downAxis)},
      this.topLeft2d,
      this.topRight2d,
      this.bottomLeft2d,
      this.bottomRight2d
    )
    if (uv === null) {
      return null
    }

    const rawU = uv.u
    const rawV = uv.v
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

  private toPlanePoint(point: vec3): Point2 {
    const relative = point.sub(this.planeCenter)
    return {x: relative.dot(this.rightAxis), y: relative.dot(this.downAxis)}
  }
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
