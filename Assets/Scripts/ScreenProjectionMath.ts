export type Point2 = {
  x: number
  y: number
}

export type UvPoint = {
  u: number
  v: number
}

/** Inverts a four-corner bilinear surface with a small Newton solve. */
export function solveBilinearUv(
  point: Point2,
  topLeft: Point2,
  topRight: Point2,
  bottomLeft: Point2,
  bottomRight: Point2
): UvPoint | null {
  const horizontal = subtract(topRight, topLeft)
  const vertical = subtract(bottomLeft, topLeft)
  const warp = {
    x: topLeft.x - topRight.x - bottomLeft.x + bottomRight.x,
    y: topLeft.y - topRight.y - bottomLeft.y + bottomRight.y
  }
  const relative = subtract(point, topLeft)
  const affineDeterminant = cross(horizontal, vertical)

  if (Math.abs(affineDeterminant) <= 1e-8) {
    return null
  }

  let u = cross(relative, vertical) / affineDeterminant
  let v = cross(horizontal, relative) / affineDeterminant

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const errorX = topLeft.x + horizontal.x * u + vertical.x * v + warp.x * u * v - point.x
    const errorY = topLeft.y + horizontal.y * u + vertical.y * v + warp.y * u * v - point.y
    const derivativeU = {x: horizontal.x + warp.x * v, y: horizontal.y + warp.y * v}
    const derivativeV = {x: vertical.x + warp.x * u, y: vertical.y + warp.y * u}
    const determinant = cross(derivativeU, derivativeV)

    if (Math.abs(determinant) <= 1e-8) {
      return null
    }

    const deltaU = (errorX * derivativeV.y - errorY * derivativeV.x) / determinant
    const deltaV = (derivativeU.x * errorY - derivativeU.y * errorX) / determinant
    u -= deltaU
    v -= deltaV

    if (Math.abs(deltaU) + Math.abs(deltaV) <= 1e-6) {
      break
    }
  }

  return isFinite(u) && isFinite(v) ? {u, v} : null
}

export function isConvexScreenQuad(topLeft: Point2, topRight: Point2, bottomLeft: Point2, bottomRight: Point2): boolean {
  const corners = [topLeft, topRight, bottomRight, bottomLeft]
  let winding = 0

  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index]
    const next = corners[(index + 1) % corners.length]
    const afterNext = corners[(index + 2) % corners.length]
    const turn = cross(subtract(next, current), subtract(afterNext, next))

    if (Math.abs(turn) <= 1e-8) {
      return false
    }

    const direction = turn > 0 ? 1 : -1
    if (winding !== 0 && direction !== winding) {
      return false
    }
    winding = direction
  }

  return true
}

function subtract(a: Point2, b: Point2): Point2 {
  return {x: a.x - b.x, y: a.y - b.y}
}

function cross(a: Point2, b: Point2): number {
  return a.x * b.y - a.y * b.x
}
