import * as THREE from 'three'
import { computeFrameDistance, computeFrameTarget } from './auto-frame.js'

/**
 * createSceneManager — multi-scene navigation with smooth camera transitions.
 *
 * @param {object} opts
 * @param {Array}  opts.scenes        — ordered array of scene definition objects
 * @param {object} opts.controls      — OrbitControls instance
 * @param {object} opts.camera        — PerspectiveCamera
 * @param {number} [opts.lerpRate]    — camera transition speed (default 0.03)
 * @param {HTMLElement} [opts.navContainer] — element to append nav dots to
 * @returns {{ goTo, next, prev, update, currentIndex, currentScene, dispose }}
 */
export function createSceneManager(opts) {
  const { scenes, controls, camera, lerpRate = 0.03, navContainer } = opts

  let currentIndex = -1
  const orbitTargetGoal = new THREE.Vector3()
  let zoomDistGoal = null
  let zoomSettled = true
  let transitioning = false

  // Cancel camera transition on user input (zoom, pan, rotate)
  function onControlsStart() {
    if (transitioning) {
      transitioning = false
    }
  }
  controls.addEventListener('start', onControlsStart)

  // Visibility helpers
  function resolveVisible(scene) {
    if (!scene.visible) return new Set()
    const objs = typeof scene.visible === 'function' ? scene.visible() : scene.visible
    if (!objs) return new Set()
    const arr = Array.isArray(objs) ? objs : [objs]
    return new Set(arr.filter(Boolean))
  }

  function resolveAllManaged() {
    const all = new Set()
    for (const s of scenes) {
      for (const obj of resolveVisible(s)) all.add(obj)
    }
    return all
  }

  // Collect all panel IDs referenced by any scene
  const allPanelIds = new Set()
  for (const s of scenes) {
    if (s.showPanels) s.showPanels.forEach(id => allPanelIds.add(id))
  }

  // Panel show/hide with clearTimeout race prevention
  const hideTimers = {}

  function hidePanel(id) {
    clearTimeout(hideTimers[id])
    const el = document.getElementById(id)
    if (!el) return
    el.classList.remove('visible')
    hideTimers[id] = setTimeout(() => { el.style.display = 'none' }, 400)
  }

  function showPanel(id) {
    clearTimeout(hideTimers[id])
    const el = document.getElementById(id)
    if (!el) return
    el.style.display = 'block'
    requestAnimationFrame(() => el.classList.add('visible'))
  }

  // Nav dots
  let dots = []
  let dotsContainer = null

  if (navContainer) {
    dotsContainer = document.createElement('div')
    dotsContainer.className = 'nav-dots'
    navContainer.appendChild(dotsContainer)

    scenes.forEach((s, i) => {
      const dot = document.createElement('div')
      dot.className = 'nav-dot'
      dot.title = s.name
      dot.addEventListener('click', () => goTo(i))
      dotsContainer.appendChild(dot)
      dots.push(dot)
    })
  }

  function updateDots() {
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex)
    })
  }

  // Keyboard navigation
  function onKeyDown(e) {
    if (e.code === 'ArrowRight') { e.preventDefault(); next() }
    if (e.code === 'ArrowLeft')  { e.preventDefault(); prev() }
  }
  window.addEventListener('keydown', onKeyDown)

  // Core navigation
  function goTo(idx, { force = false } = {}) {
    const clamped = Math.max(0, Math.min(scenes.length - 1, idx))
    if (clamped === currentIndex && !force) return

    const prevIdx = currentIndex
    const prevScene = prevIdx >= 0 ? scenes[prevIdx] : null
    const nextScene = scenes[clamped]

    // Call onLeave on previous scene
    if (prevScene && prevScene.onLeave) {
      prevScene.onLeave(nextScene, manager)
    }

    currentIndex = clamped
    updateDots()

    // Hide all panels, then show this scene's panels
    for (const id of allPanelIds) hidePanel(id)
    if (nextScene.showPanels) {
      for (const id of nextScene.showPanels) showPanel(id)
    }

    // Update overlay text
    if (nextScene.overlays) {
      for (const [id, content] of Object.entries(nextScene.overlays)) {
        const el = document.getElementById(id)
        if (el) el.innerHTML = content
      }
    }

    // Apply declarative visibility
    const nextVisible = resolveVisible(nextScene)
    const allManaged = resolveAllManaged()
    for (const obj of allManaged) {
      obj.visible = nextVisible.has(obj)
    }

    // Camera target
    if (nextScene.cameraTarget) {
      orbitTargetGoal.copy(nextScene.cameraTarget)
    }

    // Auto-frame (takes priority over zoomDistance)
    if (nextScene.autoFrame) {
      const objs = typeof nextScene.autoFrame === 'function'
        ? nextScene.autoFrame()
        : nextScene.autoFrame
      if (objs) {
        const padding = nextScene.autoFramePadding || 1.2
        zoomDistGoal = computeFrameDistance(objs, camera, padding)
        zoomSettled = false
        if (!nextScene.cameraTarget) {
          orbitTargetGoal.copy(computeFrameTarget(objs))
        }
      }
    } else if (nextScene.zoomDistance != null) {
      zoomDistGoal = nextScene.zoomDistance
      zoomSettled = false
    } else {
      zoomSettled = true
    }

    // Start camera transition
    transitioning = true

    // Call onEnter on new scene
    if (nextScene.onEnter) {
      nextScene.onEnter(prevScene, manager)
    }
  }

  function next() { goTo(currentIndex + 1) }
  function prev() { goTo(currentIndex - 1) }

  // Per-frame update: lerp camera, call active scene's onUpdate
  function update(elapsed, dt) {
    if (transitioning) {
      // Lerp orbit target
      controls.target.lerp(orbitTargetGoal, lerpRate)
      const targetSettled = controls.target.distanceTo(orbitTargetGoal) < 0.05

      // Lerp zoom distance if active
      if (!zoomSettled && zoomDistGoal != null) {
        const offset = camera.position.clone().sub(controls.target)
        const currentDist = offset.length()
        const newDist = currentDist + (zoomDistGoal - currentDist) * lerpRate
        offset.normalize().multiplyScalar(newDist)
        camera.position.copy(controls.target).add(offset)
        if (Math.abs(newDist - zoomDistGoal) < 0.1) {
          zoomSettled = true
        }
      }

      // Settle when both are done
      if (targetSettled && zoomSettled) {
        transitioning = false
      }
    }

    // Active scene update
    const active = scenes[currentIndex]
    if (active && active.onUpdate) {
      active.onUpdate(elapsed, dt)
    }
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    controls.removeEventListener('start', onControlsStart)
    if (dotsContainer) dotsContainer.remove()
  }

  const manager = {
    goTo,
    next,
    prev,
    update,
    dispose,
    get currentIndex() { return currentIndex },
    get currentScene() { return scenes[currentIndex] },
    get isTransitioning() { return transitioning },
  }

  return manager
}
