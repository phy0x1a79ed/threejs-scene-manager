/**
 * Easing functions: t ∈ [0,1] → [0,1]
 */

export function linear(t) { return t }

export function easeIn(t) { return t * t }

export function easeOut(t) { return t * (2 - t) }

export function easeInOut(t) {
  return t < 0.5
    ? 2 * t * t
    : -1 + (4 - 2 * t) * t
}

export function quinticInOut(t) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** Lookup by name string */
export const easings = { linear, easeIn, easeOut, easeInOut, quinticInOut }

/** Resolve an easing — accepts a function (passthrough) or a string key */
export function resolveEasing(easing) {
  if (typeof easing === 'function') return easing
  return easings[easing] || easeInOut
}
