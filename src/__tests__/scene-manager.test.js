import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { createSceneManager } from '../scene-manager.js'

function makeControls() {
  return { target: new THREE.Vector3() }
}

function makeCamera() {
  return new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
}

function makeScene(overrides = {}) {
  return { name: 'test', ...overrides }
}

let controls, camera

beforeEach(() => {
  document.body.innerHTML = '<div id="overlays"></div><div id="nav"></div>'
  controls = makeControls()
  camera = makeCamera()
  camera.position.set(0, 0, 10)
})

describe('navigation', () => {
  it('goTo sets currentIndex and currentScene', () => {
    const scenes = [makeScene({ name: 'a' }), makeScene({ name: 'b' })]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    expect(mgr.currentIndex).toBe(0)
    expect(mgr.currentScene.name).toBe('a')
  })

  it('goTo clamps to valid range', () => {
    const scenes = [makeScene(), makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    mgr.goTo(100)
    expect(mgr.currentIndex).toBe(1)
    mgr.goTo(-5)
    expect(mgr.currentIndex).toBe(0)
  })

  it('goTo is no-op when already at the index', () => {
    const onEnter = vi.fn()
    const scenes = [makeScene({ onEnter })]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    expect(onEnter).toHaveBeenCalledOnce()
    mgr.goTo(0)
    expect(onEnter).toHaveBeenCalledOnce() // not called again
  })

  it('next and prev move index correctly', () => {
    const scenes = [makeScene({ name: 'a' }), makeScene({ name: 'b' }), makeScene({ name: 'c' })]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    mgr.next()
    expect(mgr.currentIndex).toBe(1)
    mgr.next()
    expect(mgr.currentIndex).toBe(2)
    mgr.prev()
    expect(mgr.currentIndex).toBe(1)
  })

  it('next is no-op at last scene', () => {
    const scenes = [makeScene(), makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(1)
    mgr.next()
    expect(mgr.currentIndex).toBe(1)
  })

  it('prev is no-op at first scene', () => {
    const scenes = [makeScene(), makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    mgr.prev()
    expect(mgr.currentIndex).toBe(0)
  })
})

describe('callbacks', () => {
  it('calls onEnter with prev scene and manager', () => {
    const onEnter = vi.fn()
    const s0 = makeScene({ name: 's0' })
    const s1 = makeScene({ name: 's1', onEnter })
    const mgr = createSceneManager({ scenes: [s0, s1], controls, camera })
    mgr.goTo(0)
    mgr.goTo(1)
    expect(onEnter).toHaveBeenCalledWith(s0, mgr)
  })

  it('calls onLeave with next scene and manager', () => {
    const onLeave = vi.fn()
    const s0 = makeScene({ name: 's0', onLeave })
    const s1 = makeScene({ name: 's1' })
    const mgr = createSceneManager({ scenes: [s0, s1], controls, camera })
    mgr.goTo(0)
    mgr.goTo(1)
    expect(onLeave).toHaveBeenCalledWith(s1, mgr)
  })

  it('first goTo passes null as prev scene to onEnter', () => {
    const onEnter = vi.fn()
    const scenes = [makeScene({ onEnter })]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    expect(onEnter).toHaveBeenCalledWith(null, mgr)
  })
})

describe('panels', () => {
  it('shows panels listed in scene and hides others', () => {
    document.body.innerHTML += '<div id="panelA" style="display:none"></div><div id="panelB" style="display:none"></div>'
    const s0 = makeScene({ showPanels: ['panelA'] })
    const s1 = makeScene({ showPanels: ['panelB'] })
    const mgr = createSceneManager({ scenes: [s0, s1], controls, camera })

    mgr.goTo(0)
    expect(document.getElementById('panelA').style.display).toBe('block')

    mgr.goTo(1)
    expect(document.getElementById('panelB').style.display).toBe('block')
  })
})

describe('overlays', () => {
  it('updates overlay text on scene change', () => {
    document.body.innerHTML += '<div id="subtitle"></div>'
    const scenes = [makeScene({ overlays: { subtitle: 'Scene One' } })]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    expect(document.getElementById('subtitle').innerHTML).toBe('Scene One')
  })
})

describe('camera target', () => {
  it('sets orbitTargetGoal from cameraTarget', () => {
    const target = new THREE.Vector3(5, 10, 15)
    const scenes = [makeScene({ cameraTarget: target })]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)

    // After several updates, controls.target should approach the goal
    for (let i = 0; i < 300; i++) mgr.update(0, 0.016)
    expect(controls.target.x).toBeCloseTo(5, 0)
    expect(controls.target.y).toBeCloseTo(10, 0)
    expect(controls.target.z).toBeCloseTo(15, 0)
  })
})

describe('zoom', () => {
  it('lerps camera distance toward zoomDistance goal', () => {
    const scenes = [makeScene({ zoomDistance: 20 })]
    camera.position.set(0, 0, 5)
    const mgr = createSceneManager({ scenes, controls, camera, lerpRate: 0.1 })
    mgr.goTo(0)

    const initialDist = camera.position.distanceTo(controls.target)
    for (let i = 0; i < 200; i++) mgr.update(0, 0.016)
    const finalDist = camera.position.distanceTo(controls.target)
    expect(finalDist).toBeCloseTo(20, 0)
    expect(finalDist).toBeGreaterThan(initialDist)
  })
})

describe('update loop', () => {
  it('lerps controls.target toward goal', () => {
    const target = new THREE.Vector3(10, 0, 0)
    const scenes = [makeScene({ cameraTarget: target })]
    const mgr = createSceneManager({ scenes, controls, camera, lerpRate: 0.5 })
    mgr.goTo(0)

    mgr.update(0, 0.016)
    expect(controls.target.x).toBeGreaterThan(0)
    expect(controls.target.x).toBeLessThan(10)
  })

  it('calls active scene onUpdate', () => {
    const onUpdate = vi.fn()
    const scenes = [makeScene({ onUpdate })]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)

    mgr.update(1.0, 0.016)
    expect(onUpdate).toHaveBeenCalledWith(1.0, 0.016)
  })
})

describe('keyboard navigation', () => {
  it('ArrowRight triggers next', () => {
    const scenes = [makeScene(), makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    expect(mgr.currentIndex).toBe(1)
  })

  it('ArrowLeft triggers prev', () => {
    const scenes = [makeScene(), makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }))
    expect(mgr.currentIndex).toBe(0)
  })
})

describe('nav dots', () => {
  it('creates dots when navContainer is provided', () => {
    const navContainer = document.getElementById('nav')
    const scenes = [makeScene(), makeScene(), makeScene()]
    createSceneManager({ scenes, controls, camera, navContainer })

    const dots = navContainer.querySelectorAll('.nav-dot')
    expect(dots.length).toBe(3)
  })

  it('marks active dot on goTo', () => {
    const navContainer = document.getElementById('nav')
    const scenes = [makeScene(), makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera, navContainer })

    mgr.goTo(1)
    const dots = navContainer.querySelectorAll('.nav-dot')
    expect(dots[0].classList.contains('active')).toBe(false)
    expect(dots[1].classList.contains('active')).toBe(true)
  })
})

describe('dispose', () => {
  it('removes keydown listener', () => {
    const scenes = [makeScene(), makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera })
    mgr.goTo(0)
    mgr.dispose()

    // After dispose, keyboard should not navigate
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))
    expect(mgr.currentIndex).toBe(0)
  })

  it('removes nav dots from DOM', () => {
    const navContainer = document.getElementById('nav')
    const scenes = [makeScene()]
    const mgr = createSceneManager({ scenes, controls, camera, navContainer })

    expect(navContainer.querySelector('.nav-dots')).not.toBeNull()
    mgr.dispose()
    expect(navContainer.querySelector('.nav-dots')).toBeNull()
  })
})
