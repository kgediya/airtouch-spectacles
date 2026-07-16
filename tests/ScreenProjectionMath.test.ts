import {isConvexScreenQuad, solveBilinearUv} from "../Assets/Scripts/ScreenProjectionMath.ts"
import type {Point2} from "../Assets/Scripts/ScreenProjectionMath.ts"

const topLeft = {x: 0, y: 0}
const topRight = {x: 2, y: 0.1}
const bottomLeft = {x: -0.1, y: 1}
const bottomRight = {x: 2.25, y: 1.2}

assertUv(topLeft, 0, 0)
assertUv(topRight, 1, 0)
assertUv(bottomLeft, 0, 1)
assertUv(bottomRight, 1, 1)

const expectedU = 0.37
const expectedV = 0.62
assertUv(pointAt(expectedU, expectedV), expectedU, expectedV)

assert(isConvexScreenQuad(topLeft, topRight, bottomLeft, bottomRight), "expected skewed screen quad to be valid")
assert(!isConvexScreenQuad(topLeft, bottomRight, bottomLeft, topRight), "expected crossed screen quad to be rejected")

function assertUv(point: Point2, expectedU: number, expectedV: number): void {
  const uv = solveBilinearUv(point, topLeft, topRight, bottomLeft, bottomRight)
  assert(uv !== null, "expected bilinear solve to succeed")
  assertNear(uv.u, expectedU)
  assertNear(uv.v, expectedV)
}

function pointAt(u: number, v: number): Point2 {
  const warpX = topLeft.x - topRight.x - bottomLeft.x + bottomRight.x
  const warpY = topLeft.y - topRight.y - bottomLeft.y + bottomRight.y
  return {
    x: topLeft.x + (topRight.x - topLeft.x) * u + (bottomLeft.x - topLeft.x) * v + warpX * u * v,
    y: topLeft.y + (topRight.y - topLeft.y) * u + (bottomLeft.y - topLeft.y) * v + warpY * u * v
  }
}

function assertNear(actual: number, expected: number): void {
  assert(Math.abs(actual - expected) <= 1e-6, "expected " + actual + " to be near " + expected)
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}
