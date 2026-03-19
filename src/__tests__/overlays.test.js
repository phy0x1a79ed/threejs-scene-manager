import { describe, it, expect, beforeEach, vi } from 'vitest'

let addOverlay, updateOverlay, removeOverlay, initOverlays

beforeEach(async () => {
  vi.resetModules()
  document.body.innerHTML = '<div id="overlays"></div>'
  const mod = await import('../overlays.js')
  addOverlay = mod.addOverlay
  updateOverlay = mod.updateOverlay
  removeOverlay = mod.removeOverlay
  initOverlays = mod.initOverlays
})

describe('addOverlay', () => {
  it('creates an element with the given id', () => {
    addOverlay('test-overlay', {}, 'hello')
    const el = document.getElementById('test-overlay')
    expect(el).not.toBeNull()
    expect(el.id).toBe('test-overlay')
  })

  it('sets content as innerHTML', () => {
    addOverlay('test-overlay', {}, '<b>bold</b>')
    const el = document.getElementById('test-overlay')
    expect(el.innerHTML).toBe('<b>bold</b>')
  })

  it('applies styles including absolute position', () => {
    addOverlay('test-overlay', { top: '10px', color: 'red' })
    const el = document.getElementById('test-overlay')
    expect(el.style.position).toBe('absolute')
    expect(el.style.top).toBe('10px')
    expect(el.style.color).toBe('red')
  })

  it('appends element to #overlays container', () => {
    addOverlay('test-overlay', {})
    const container = document.getElementById('overlays')
    expect(container.children.length).toBe(1)
    expect(container.children[0].id).toBe('test-overlay')
  })

  it('defaults content to empty string', () => {
    addOverlay('test-overlay', {})
    const el = document.getElementById('test-overlay')
    expect(el.innerHTML).toBe('')
  })
})

describe('updateOverlay', () => {
  it('updates innerHTML of an existing element', () => {
    addOverlay('test-overlay', {}, 'old')
    updateOverlay('test-overlay', 'new')
    expect(document.getElementById('test-overlay').innerHTML).toBe('new')
  })

  it('does nothing if element does not exist', () => {
    expect(() => updateOverlay('nonexistent', 'content')).not.toThrow()
  })
})

describe('removeOverlay', () => {
  it('removes element from DOM', () => {
    addOverlay('test-overlay', {})
    expect(document.getElementById('test-overlay')).not.toBeNull()
    removeOverlay('test-overlay')
    expect(document.getElementById('test-overlay')).toBeNull()
  })

  it('does nothing if element does not exist', () => {
    expect(() => removeOverlay('nonexistent')).not.toThrow()
  })
})

describe('initOverlays', () => {
  it('creates title and subtitle overlays', () => {
    initOverlays()
    expect(document.getElementById('title')).not.toBeNull()
    expect(document.getElementById('subtitle')).not.toBeNull()
  })

  it('sets title content', () => {
    initOverlays()
    expect(document.getElementById('title').innerHTML).toBe('Three.js Presentation')
  })

  it('sets subtitle to empty string', () => {
    initOverlays()
    expect(document.getElementById('subtitle').innerHTML).toBe('')
  })
})
