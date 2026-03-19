const PLOTLY_CDN = 'https://cdn.plot.ly/plotly-2.35.0.min.js'

let plotlyPromise = null
const figureCache = new Map()

/**
 * Lazy-load Plotly from CDN. Returns a cached promise.
 */
export function ensurePlotly() {
  if (plotlyPromise) return plotlyPromise
  plotlyPromise = new Promise((resolve, reject) => {
    if (window.Plotly) { resolve(window.Plotly); return }
    const script = document.createElement('script')
    script.src = PLOTLY_CDN
    script.onload = () => resolve(window.Plotly)
    script.onerror = () => reject(new Error('Failed to load Plotly'))
    document.head.appendChild(script)
  })
  return plotlyPromise
}

/**
 * Fetch and cache a figure JSON. Does NOT render.
 */
export async function preloadFigure(src) {
  if (figureCache.has(src)) return figureCache.get(src)
  const resp = await fetch(src)
  const json = await resp.json()
  figureCache.set(src, json)
  return json
}

/**
 * Preload multiple figure sources in parallel.
 */
export function preloadFigures(srcArray) {
  return Promise.all(srcArray.map(preloadFigure))
}

const darkLayout = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { color: '#ccc', family: 'system-ui' },
  xaxis: { gridcolor: '#333', zerolinecolor: '#555' },
  yaxis: { gridcolor: '#333', zerolinecolor: '#555' },
  margin: { t: 40, r: 20, b: 40, l: 50 },
}

/**
 * Render a figure into a DOM container.
 * @param {string} containerId — DOM element id
 * @param {{ src?: string, data?: Array, layout?: object }} figureSpec
 */
export async function loadFigure(containerId, figureSpec) {
  const Plotly = await ensurePlotly()
  const el = document.getElementById(containerId)
  if (!el) return

  let data, layout
  if (figureSpec.src) {
    const cached = await preloadFigure(figureSpec.src)
    data = cached.data
    layout = cached.layout || {}
  } else {
    data = figureSpec.data
    layout = figureSpec.layout || {}
  }

  const mergedLayout = { ...darkLayout, ...layout }
  await Plotly.newPlot(el, data, mergedLayout, { responsive: true, displayModeBar: false })
}

/**
 * Clear a rendered figure.
 */
export function clearFigure(containerId) {
  const el = document.getElementById(containerId)
  if (!el) return
  if (window.Plotly) window.Plotly.purge(el)
  el.innerHTML = ''
}

/**
 * Export a figure as SVG or PNG. Temporarily swaps to light theme.
 */
export async function exportFigure(containerId, format = 'svg', filename = 'figure') {
  const Plotly = await ensurePlotly()
  const el = document.getElementById(containerId)
  if (!el) return

  const lightLayout = {
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { color: '#222' },
    xaxis: { gridcolor: '#ddd', zerolinecolor: '#999' },
    yaxis: { gridcolor: '#ddd', zerolinecolor: '#999' },
  }

  // Swap to light theme
  await Plotly.relayout(el, lightLayout)

  const url = await Plotly.toImage(el, { format, width: 1200, height: 800 })
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${format}`
  a.click()

  // Restore dark theme
  await Plotly.relayout(el, darkLayout)
}
