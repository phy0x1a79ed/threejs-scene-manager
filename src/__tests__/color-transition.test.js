import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { createColorTransition } from '../color-transition.js'

function makeGeometry(count = 4) {
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geo
}

function makeColors(count, r, g, b) {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    arr[i * 3] = r
    arr[i * 3 + 1] = g
    arr[i * 3 + 2] = b
  }
  return arr
}

describe('createColorTransition', () => {
  it('sets prevColor and currentColor attributes on geometry', () => {
    const geo = makeGeometry(4)
    const colors = makeColors(4, 1, 0, 0)
    createColorTransition(geo, colors)

    expect(geo.attributes.prevColor).toBeDefined()
    expect(geo.attributes.currentColor).toBeDefined()
    expect(geo.attributes.prevColor.count).toBe(4)
    expect(geo.attributes.currentColor.count).toBe(4)
  })

  it('initializes both attributes with the initial colors', () => {
    const geo = makeGeometry(2)
    const colors = makeColors(2, 0.5, 0.6, 0.7)
    createColorTransition(geo, colors)

    const prev = geo.attributes.prevColor.array
    const curr = geo.attributes.currentColor.array
    for (let i = 0; i < colors.length; i++) {
      expect(prev[i]).toBeCloseTo(colors[i])
      expect(curr[i]).toBeCloseTo(colors[i])
    }
  })

  it('returns material, setColors, update, dispose, uniforms', () => {
    const geo = makeGeometry(2)
    const colors = makeColors(2, 1, 0, 0)
    const result = createColorTransition(geo, colors)

    expect(result.material).toBeInstanceOf(THREE.ShaderMaterial)
    expect(typeof result.setColors).toBe('function')
    expect(typeof result.update).toBe('function')
    expect(typeof result.dispose).toBe('function')
    expect(result.uniforms.uBlend).toBeDefined()
  })
})

describe('setColors', () => {
  it('copies current to prev and sets new current colors', () => {
    const geo = makeGeometry(2)
    const initial = makeColors(2, 1, 0, 0)
    const { setColors } = createColorTransition(geo, initial)

    const newColors = makeColors(2, 0, 1, 0)
    setColors(newColors)

    const prev = geo.attributes.prevColor.array
    const curr = geo.attributes.currentColor.array

    // prev should be old current (initial red)
    expect(prev[0]).toBeCloseTo(1)
    expect(prev[1]).toBeCloseTo(0)
    expect(prev[2]).toBeCloseTo(0)

    // current should be new green
    expect(curr[0]).toBeCloseTo(0)
    expect(curr[1]).toBeCloseTo(1)
    expect(curr[2]).toBeCloseTo(0)
  })

  it('resets blend to 0', () => {
    const geo = makeGeometry(2)
    const initial = makeColors(2, 1, 0, 0)
    const { setColors, uniforms } = createColorTransition(geo, initial)

    expect(uniforms.uBlend.value).toBe(1.0)
    setColors(makeColors(2, 0, 0, 1))
    expect(uniforms.uBlend.value).toBe(0.0)
  })
})

describe('update', () => {
  it('lerps blend toward 1.0', () => {
    const geo = makeGeometry(2)
    const { setColors, update, uniforms } = createColorTransition(geo, makeColors(2, 1, 0, 0))

    setColors(makeColors(2, 0, 1, 0))
    expect(uniforms.uBlend.value).toBe(0.0)

    update(0.5)
    expect(uniforms.uBlend.value).toBeGreaterThan(0)
    expect(uniforms.uBlend.value).toBeLessThan(1)
  })

  it('snaps to 1.0 when above 0.999', () => {
    const geo = makeGeometry(2)
    const { setColors, update, uniforms } = createColorTransition(geo, makeColors(2, 1, 0, 0))

    setColors(makeColors(2, 0, 1, 0))

    // Run enough updates to converge
    for (let i = 0; i < 500; i++) update(0.5)
    expect(uniforms.uBlend.value).toBe(1.0)
  })

  it('does nothing when blend is already 1.0', () => {
    const geo = makeGeometry(2)
    const { update, uniforms } = createColorTransition(geo, makeColors(2, 1, 0, 0))

    expect(uniforms.uBlend.value).toBe(1.0)
    update()
    expect(uniforms.uBlend.value).toBe(1.0)
  })
})

describe('dispose', () => {
  it('disposes the material', () => {
    const geo = makeGeometry(2)
    const { material, dispose } = createColorTransition(geo, makeColors(2, 1, 0, 0))
    const spy = vi.spyOn(material, 'dispose')
    dispose()
    expect(spy).toHaveBeenCalledOnce()
  })
})
