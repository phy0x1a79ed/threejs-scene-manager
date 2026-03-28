/**
 * Parse Plotly JSON trace data into Float32Array buffers for Three.js Points geometry.
 */

/**
 * Parse a hex color string (#rrggbb) to [r, g, b] in 0–1 range.
 */
export function parseHexColor(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

/**
 * Parse an HSL color string "hsl(h, s%, l%)" to [r, g, b] in 0–1 range.
 */
export function parseHslColor(hsl) {
  const m = hsl.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/)
  if (!m) return [0.5, 0.5, 0.5]
  const h = parseFloat(m[1]) / 360
  const s = parseFloat(m[2]) / 100
  const l = parseFloat(m[3]) / 100
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

/**
 * Parse a color value that could be hex (#rrggbb) or hsl(...).
 */
function parseColor(c) {
  if (typeof c === 'string') {
    if (c.startsWith('#')) return parseHexColor(c)
    if (c.startsWith('hsl')) return parseHslColor(c)
  }
  return [0.5, 0.5, 0.5]
}

/**
 * Parse Plotly JSON into positions and colors buffers.
 *
 * Handles two formats:
 *   - Multiple traces with a single marker.color string each (samples)
 *   - Single trace with marker.color as an array (features)
 *
 * @param {object} plotlyJson — { data: [...traces], layout: {...} }
 * @returns {{ positions: Float32Array, colors: Float32Array, count: number }}
 */
export function parsePlotlyTraces(plotlyJson) {
  const traces = plotlyJson.data
  // Count total points
  let total = 0
  for (const t of traces) total += t.x.length

  const positions = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)
  let offset = 0

  for (const trace of traces) {
    const n = trace.x.length
    const colorArr = trace.marker?.color
    const isColorArray = Array.isArray(colorArr)
    const singleColor = !isColorArray ? parseColor(colorArr) : null

    for (let i = 0; i < n; i++) {
      const idx = (offset + i) * 3
      positions[idx] = trace.x[i]
      positions[idx + 1] = trace.y[i]
      positions[idx + 2] = 0

      const [r, g, b] = isColorArray ? parseColor(colorArr[i]) : singleColor
      colors[idx] = r
      colors[idx + 1] = g
      colors[idx + 2] = b
    }
    offset += n
  }

  return { positions, colors, count: total }
}

/**
 * Normalize positions in-place to fit within [-extent/2, +extent/2] on x and y.
 * Preserves aspect ratio.
 *
 * @param {Float32Array} positions — xyz interleaved
 * @param {number} count — number of points
 * @param {number} extent — target bounding box size
 */
export function normalizePositions(positions, count, extent) {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const scale = extent / Math.max(rangeX, rangeY)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (positions[i * 3] - cx) * scale
    positions[i * 3 + 1] = (positions[i * 3 + 1] - cy) * scale
    // z stays 0
  }
}
