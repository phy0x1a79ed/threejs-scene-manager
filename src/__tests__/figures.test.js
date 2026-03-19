import { describe, it, expect, beforeEach, vi } from 'vitest'

// figures.js has module-level state (plotlyPromise, figureCache), so we
// re-import a fresh copy for each test file run via dynamic import + vi.resetModules.

let ensurePlotly, preloadFigure, loadFigure, clearFigure, exportFigure

beforeEach(async () => {
  vi.resetModules()
  document.body.innerHTML = '<div id="fig1"></div>'

  // Clean up any prior Plotly stub
  delete window.Plotly

  // Reset global fetch
  vi.restoreAllMocks()

  const mod = await import('../figures.js')
  ensurePlotly = mod.ensurePlotly
  preloadFigure = mod.preloadFigure
  loadFigure = mod.loadFigure
  clearFigure = mod.clearFigure
  exportFigure = mod.exportFigure
})

describe('ensurePlotly', () => {
  it('resolves immediately if window.Plotly already exists', async () => {
    const fakePlotly = { newPlot: vi.fn() }
    window.Plotly = fakePlotly
    const result = await ensurePlotly()
    expect(result).toBe(fakePlotly)
  })

  it('creates a script tag when Plotly is not loaded', () => {
    // Don't await — just call to trigger script creation
    ensurePlotly()
    const scripts = document.querySelectorAll('script')
    const plotlyScript = Array.from(scripts).find(s => s.src.includes('plotly'))
    expect(plotlyScript).toBeDefined()
  })

  it('returns the same promise on subsequent calls', () => {
    window.Plotly = { newPlot: vi.fn() }
    const p1 = ensurePlotly()
    const p2 = ensurePlotly()
    expect(p1).toBe(p2)
  })
})

describe('preloadFigure', () => {
  it('fetches JSON and returns it', async () => {
    const figData = { data: [{ x: [1], y: [2] }], layout: {} }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () => Promise.resolve(figData),
    })

    const result = await preloadFigure('/test.json')
    expect(fetch).toHaveBeenCalledWith('/test.json')
    expect(result).toEqual(figData)
  })

  it('returns cached result on second call', async () => {
    const figData = { data: [], layout: {} }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () => Promise.resolve(figData),
    })

    await preloadFigure('/cached.json')
    await preloadFigure('/cached.json')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('loadFigure', () => {
  it('renders with direct data', async () => {
    const fakePlotly = {
      newPlot: vi.fn().mockResolvedValue(undefined),
    }
    window.Plotly = fakePlotly

    await loadFigure('fig1', { data: [{ x: [1] }], layout: { title: 'Test' } })
    expect(fakePlotly.newPlot).toHaveBeenCalledOnce()

    const [el, data, layout, config] = fakePlotly.newPlot.mock.calls[0]
    expect(el.id).toBe('fig1')
    expect(data).toEqual([{ x: [1] }])
    expect(layout.title).toBe('Test')
    // Dark layout merged
    expect(layout.paper_bgcolor).toBe('rgba(0,0,0,0)')
    expect(config.responsive).toBe(true)
  })

  it('renders with src (fetches and caches)', async () => {
    const figData = { data: [{ y: [5] }], layout: { title: 'From src' } }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () => Promise.resolve(figData),
    })
    const fakePlotly = {
      newPlot: vi.fn().mockResolvedValue(undefined),
    }
    window.Plotly = fakePlotly

    await loadFigure('fig1', { src: '/chart.json' })
    expect(fetch).toHaveBeenCalledWith('/chart.json')
    expect(fakePlotly.newPlot).toHaveBeenCalledOnce()
  })

  it('does nothing if container element missing', async () => {
    window.Plotly = { newPlot: vi.fn() }
    await loadFigure('nonexistent', { data: [] })
    expect(window.Plotly.newPlot).not.toHaveBeenCalled()
  })
})

describe('clearFigure', () => {
  it('calls Plotly.purge and clears innerHTML', () => {
    const el = document.getElementById('fig1')
    el.innerHTML = '<svg>chart</svg>'
    window.Plotly = { purge: vi.fn() }

    clearFigure('fig1')
    expect(window.Plotly.purge).toHaveBeenCalledWith(el)
    expect(el.innerHTML).toBe('')
  })

  it('does nothing if element does not exist', () => {
    window.Plotly = { purge: vi.fn() }
    expect(() => clearFigure('nonexistent')).not.toThrow()
    expect(window.Plotly.purge).not.toHaveBeenCalled()
  })

  it('clears innerHTML even without Plotly loaded', () => {
    const el = document.getElementById('fig1')
    el.innerHTML = 'stuff'
    // window.Plotly is undefined
    clearFigure('fig1')
    expect(el.innerHTML).toBe('')
  })
})

describe('exportFigure', () => {
  it('swaps to light theme, exports, and restores dark theme', async () => {
    const fakePlotly = {
      relayout: vi.fn().mockResolvedValue(undefined),
      toImage: vi.fn().mockResolvedValue('data:image/svg+xml;base64,abc'),
    }
    window.Plotly = fakePlotly

    // Mock link click
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return { set href(v) {}, set download(v) {}, click: clickSpy }
      }
      return document._createElement
        ? document._createElement(tag)
        : Object.getPrototypeOf(document).createElement.call(document, tag)
    })

    await exportFigure('fig1', 'svg', 'my-chart')

    // relayout called twice: light theme then dark theme
    expect(fakePlotly.relayout).toHaveBeenCalledTimes(2)
    const lightCall = fakePlotly.relayout.mock.calls[0][1]
    expect(lightCall.paper_bgcolor).toBe('#ffffff')

    const darkCall = fakePlotly.relayout.mock.calls[1][1]
    expect(darkCall.paper_bgcolor).toBe('rgba(0,0,0,0)')

    expect(fakePlotly.toImage).toHaveBeenCalledOnce()
  })
})
