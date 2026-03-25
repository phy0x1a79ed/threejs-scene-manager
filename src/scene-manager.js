import { Registry } from './registry.js'
import { PropRegistry } from './prop-registry.js'
import { TransitionRunner } from './transition-runner.js'
import { computeFrameDistance, computeFrameTarget } from './auto-frame.js'
import { CameraDirector } from './camera-director.js'

/**
 * createSceneManager — declarative scenes + explicit transitions.
 *
 * Scenes are pure state snapshots (visibility, camera, uniforms, properties).
 * Transitions describe HOW to animate between scene pairs.
 * The Three.js scene graph provides the scene tree and inherited transforms.
 *
 * @param {object} opts
 * @param {Array}  opts.scenes         — ordered scene declarations
 * @param {Array}  [opts.transitions]  — explicit transition definitions
 * @param {object} opts.controls       — OrbitControls instance
 * @param {object} opts.camera         — PerspectiveCamera
 * @param {object} [opts.orthoCamera]  — OrthographicCamera (for scenes with cameraType:'orthographic')
 * @param {object} [opts.props]        — named props by type { camera: { name: config } }
 * @param {object} [opts.scene]        — Three.js Scene (for transition temp objects)
 * @param {HTMLElement} [opts.navContainer] — element for nav dots
 * @returns {object} manager API
 */
export function createSceneManager(opts) {
  const { scenes, transitions = [], controls, camera, orthoCamera, navContainer } = opts

  const registry = new Registry()
  const propRegistry = new PropRegistry(opts.props)
  const directorOpts = { ...opts.directorOpts, orthoCamera }
  const director = new CameraDirector(camera, controls, directorOpts)

  // Wire transition interruption: user grabs during transition → snap it
  director.onInterrupt = () => {
    if (runner && !runner.isComplete) {
      runner.snap()
      // Finalize without calling endTransition — director handles its own state
      const pending = pendingVisibility
      pendingVisibility = null
      runner = null  // Clear BEFORE applyVisibility so keepVisible doesn't re-show objects
      if (pending) {
        applyVisibility(pending)
      }
      const active = currentIndex >= 0 ? scenes[currentIndex] : null
      if (active && !currentSameCamera) director.setKeyframe(resolveKeyframe(active))
      transitionSourceScene = null
      transitionSourceProps = null
    }
  }

  let currentIndex = -1
  let runner = null
  let pendingVisibility = null  // deferred visibility set
  let currentSameCamera = false // true when prev/next scenes share a camera prop
  let transitionSourceScene = null  // source scene kept alive during transition
  let transitionSourceProps = null  // resolved props for source scene during transition
  const activatedScenes = new Set()  // for onActivate one-shot

  // --- Build transition lookup (from.name → to.name → def) ---
  const transitionMap = new Map()

  function transKey(a, b) { return `${a}→${b}` }

  for (const t of transitions) {
    const dir = t.direction ?? 'both'
    if (dir === 'both' || dir === 'forward') {
      transitionMap.set(transKey(t.from, t.to), { def: t, reverse: false })
    }
    if (dir === 'both') {
      transitionMap.set(transKey(t.to, t.from), { def: t, reverse: true })
    }
    if (dir === 'reverse') {
      transitionMap.set(transKey(t.to, t.from), { def: t, reverse: true })
    }
  }

  function findTransition(fromName, toName) {
    return transitionMap.get(transKey(fromName, toName)) ?? null
  }

  // --- Prop resolution for scenes ---

  /** Resolve a scene's declared props into live mutable state objects */
  function resolveSceneProps(scene) {
    if (!scene.props) return null
    const resolved = {}
    for (const [key, ref] of Object.entries(scene.props)) {
      if (typeof ref === 'string') {
        // Search all prop types for this name
        const state = propRegistry.getState(key, ref)
        if (state) resolved[key] = state
      }
    }
    return Object.keys(resolved).length > 0 ? resolved : null
  }

  // --- Transition prop validation ---

  function validateTransitionProps() {
    const sceneMap = new Map(scenes.map(s => [s.name, s]))
    const errors = []

    for (const t of transitions) {
      if (!sceneMap.has(t.from)) errors.push(`Transition references unknown scene '${t.from}'`)
      if (!sceneMap.has(t.to)) errors.push(`Transition references unknown scene '${t.to}'`)
      if (!sceneMap.has(t.from) || !sceneMap.has(t.to)) continue

      // Validate transition's declared prop dependencies are resolvable
      if (t.props) {
        for (const propRef of t.props) {
          let found = false
          for (const [type, entries] of propRegistry._defs) {
            if (entries.has(propRef)) { found = true; break }
          }
          if (!found) errors.push(`Transition ${t.from}→${t.to}: prop '${propRef}' not found in any prop type`)
        }
      }

      // Validate slaved prop references
      if (t.slavedProps) {
        for (const propName of Object.keys(t.slavedProps)) {
          let found = false
          for (const [type, entries] of propRegistry._defs) {
            if (entries.has(propName)) { found = true; break }
          }
          if (!found) errors.push(`Transition ${t.from}→${t.to}: slavedProp '${propName}' not found in any prop type`)
        }
      }
    }

    if (errors.length > 0) {
      const msg = 'Scene manager prop validation errors:\n' + errors.join('\n')
      console.error(msg)
      throw new Error(msg)
    }
  }

  validateTransitionProps()

  // --- Panels ---
  const allPanelIds = new Set()
  for (const s of scenes) {
    const ids = s.panels ?? s.showPanels
    if (ids) ids.forEach(id => allPanelIds.add(id))
  }
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

  // --- Nav dots ---
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
    dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex))
  }

  // --- Keyboard ---
  function onKeyDown(e) {
    if (e.code === 'ArrowRight') { e.preventDefault(); next() }
    if (e.code === 'ArrowLeft')  { e.preventDefault(); prev() }
  }
  window.addEventListener('keydown', onKeyDown)

  // User interruption handled by CameraDirector via onInterrupt callback

  // --- Visibility ---

  /** Collect all Object3D names referenced by any scene's visible array */
  function getAllManagedNames() {
    const names = new Set()
    for (const s of scenes) {
      if (s.visible) for (const n of s.visible) names.add(n)
    }
    return names
  }

  function applyVisibility(scene) {
    const visibleSet = new Set(scene.visible ?? [])
    for (const name of getAllManagedNames()) {
      const obj = registry.tryResolve(name)
      if (obj) obj.visible = visibleSet.has(name)
    }
    // Also apply keepVisible from active transition
    const trans = runner?._transition
    if (trans?.keepVisible) {
      for (const name of trans.keepVisible) {
        const obj = registry.tryResolve(name)
        if (obj) obj.visible = true
      }
    }
  }

  // --- Apply scene state (non-animated, immediate) ---

  function applySceneState(scene) {
    // Uniforms — set directly
    if (scene.uniforms) {
      for (const [objName, uniforms] of Object.entries(scene.uniforms)) {
        const obj = registry.tryResolve(objName)
        if (!obj?.material?.uniforms) continue
        for (const [uName, val] of Object.entries(uniforms)) {
          if (obj.material.uniforms[uName]) {
            obj.material.uniforms[uName].value = val
          }
        }
      }
    }

    // Properties — call setters directly
    if (scene.properties) {
      for (const [objName, props] of Object.entries(scene.properties)) {
        for (const [pName, val] of Object.entries(props)) {
          const setter = registry.resolveProperty(objName, pName)
          if (setter) setter(val)
        }
      }
    }

    // Legend
    if (scene.legend) {
      const builder = registry.resolveLegend(scene.legend)
      if (builder) builder()
      const el = document.getElementById('legend')
      if (el) el.style.display = ''
    } else if (scene.legend === null) {
      const el = document.getElementById('legend')
      if (el) el.style.display = 'none'
    }
  }

  // --- Camera keyframe from scene declaration ---

  function resolveKeyframe(scene) {
    // Resolve camera prop: string → named prop lookup, object → inline
    const cam = propRegistry.resolve('camera', scene.camera) ?? {}
    const keyframe = {}

    if (cam.target) {
      const resolved = registry.tryResolve(cam.target)
      if (resolved?.isVector3) keyframe.target = resolved
    }

    if (cam.frame) {
      const frameObj = registry.tryResolve(cam.frame)
      if (frameObj) {
        const padding = cam.framePadding ?? 1.2
        keyframe.zoom = computeFrameDistance(frameObj, camera, padding)
        if (!keyframe.target) keyframe.target = computeFrameTarget(frameObj)
      }
    } else if (cam.zoom != null) {
      keyframe.zoom = cam.zoom
    }

    // Full position (supersedes zoom when present)
    if (cam.position) {
      const resolved = registry.tryResolve(cam.position)
      keyframe.position = resolved?.isVector3 ? resolved : cam.position
    }

    return keyframe
  }

  // --- Transition finalization ---

  function finalizeTransition() {
    const pending = pendingVisibility
    pendingVisibility = null
    runner = null  // Clear BEFORE applyVisibility so keepVisible doesn't re-show objects
    if (pending) {
      applyVisibility(pending)
    }
    // Set keyframe for the active scene — skip when same camera prop (no leaking)
    const active = currentIndex >= 0 ? scenes[currentIndex] : null
    if (active && !currentSameCamera) {
      const immediate = (active.cameraType === 'orthographic')
      director.setKeyframe({ ...resolveKeyframe(active), immediate })
    }
    director.endTransition()
  }

  // --- Core navigation ---

  function goTo(idx, { force = false } = {}) {
    const clamped = Math.max(0, Math.min(scenes.length - 1, idx))
    if (clamped === currentIndex && !force) return

    const prevScene = currentIndex >= 0 ? scenes[currentIndex] : null
    const nextScene = scenes[clamped]

    // Detect same camera prop — scenes sharing a prop skip camera transitions
    currentSameCamera = prevScene != null
      && propRegistry.isSameProp(prevScene.camera, nextScene.camera)

    // Snap any in-progress transition
    if (runner && !runner.isComplete) {
      runner.snap()
      finalizeTransition()
    }

    // Store source scene for onUpdate during transition
    transitionSourceScene = prevScene
    transitionSourceProps = prevScene ? resolveSceneProps(prevScene) : null

    currentIndex = clamped
    updateDots()

    // Panels
    for (const id of allPanelIds) hidePanel(id)
    const showIds = nextScene.panels ?? nextScene.showPanels
    if (showIds) {
      for (const id of showIds) showPanel(id)
    }

    // Overlays
    if (nextScene.overlays) {
      for (const [id, content] of Object.entries(nextScene.overlays)) {
        const el = document.getElementById(id)
        if (el) el.innerHTML = content
      }
    }

    // Find transition
    const match = prevScene ? findTransition(prevScene.name, nextScene.name) : null
    const transDef = match?.def ?? { tracks: 'auto', duration: 600, easing: 'easeInOut' }
    const reverse = match?.reverse ?? false

    // Visibility: defer when transitioning so crossfade tracks can animate
    if (prevScene) {
      // Auto-detect visibility changes that need crossfade
      const fromVis = new Set(prevScene.visible ?? [])
      const toVis = new Set(nextScene.visible ?? [])
      const hasVisChange = [...fromVis].some(n => !toVis.has(n)) || [...toVis].some(n => !fromVis.has(n))

      if (transDef.deferVisibility || hasVisChange) {
        // Keep current + keepVisible objects alive for crossfade animation
        if (transDef.keepVisible) {
          for (const name of transDef.keepVisible) {
            const obj = registry.tryResolve(name)
            if (obj) obj.visible = true
          }
        }
        pendingVisibility = nextScene
      } else {
        applyVisibility(nextScene)
      }
    } else {
      applyVisibility(nextScene)
    }

    // Switch camera type if scene declares one
    const nextCameraType = nextScene.cameraType ?? 'perspective'
    director.setActiveCameraType(nextCameraType)

    // If no previous scene (first navigation), apply state directly
    if (!prevScene) {
      applySceneState(nextScene)
      // Snap camera via director keyframe
      const keyframe = resolveKeyframe(nextScene)
      director.setKeyframe({ ...keyframe, immediate: true })
    } else {
      // Begin transition — director disables user controls
      director.beginTransition()
      // Create transition runner
      runner = new TransitionRunner({
        fromScene: prevScene,
        toScene: nextScene,
        transition: transDef,
        registry,
        propRegistry,
        controls,
        camera,
        orthoCamera,
        reverse,
        sameCamera: currentSameCamera,
        scene: opts.scene,
      })
    }

    // Legend (immediate)
    if (nextScene.legend) {
      const builder = registry.resolveLegend(nextScene.legend)
      if (builder) builder()
      const el = document.getElementById('legend')
      if (el) el.style.display = ''
    } else if (nextScene.legend === null) {
      const el = document.getElementById('legend')
      if (el) el.style.display = 'none'
    }

    // One-shot onActivate
    if (nextScene.onActivate && !activatedScenes.has(nextScene.name)) {
      activatedScenes.add(nextScene.name)
      nextScene.onActivate()
    }

    // Lifecycle callbacks (backward compat with callback-based scenes)
    if (prevScene?.onLeave) prevScene.onLeave(nextScene, manager)
    if (nextScene.onEnter) nextScene.onEnter(prevScene, manager)
  }

  function next() { goTo(currentIndex + 1) }
  function prev() { goTo(currentIndex - 1) }

  // --- Per-frame update ---

  function update(elapsed, dt) {
    const transitioning = runner && !runner.isComplete

    if (transitioning) {
      // Source scene keeps running during transition (drives rotation, etc.)
      if (transitionSourceScene?.onUpdate) {
        transitionSourceScene.onUpdate(elapsed, dt, transitionSourceProps)
      }

      // Drive active transition (tracks + lifecycle hooks)
      runner.update(elapsed)
      if (runner.isComplete) {
        finalizeTransition()
        transitionSourceScene = null
        transitionSourceProps = null
      }
    }

    // Camera director — eases keyframes, manages auto-rotate/user handoff
    director.update(dt)

    // Run tickers for visible objects
    for (const { name, obj, fns } of registry.getVisibleTickers()) {
      for (const fn of fns) fn(elapsed, dt, obj)
    }

    // Per-frame callback for active scene (only when NOT transitioning)
    if (!transitioning) {
      const active = currentIndex >= 0 ? scenes[currentIndex] : null
      if (active?.onUpdate) active.onUpdate(elapsed, dt, resolveSceneProps(active))
    }
  }

  // --- Cleanup ---

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    director.dispose()
    if (dotsContainer) dotsContainer.remove()
  }

  // --- Public API ---

  const manager = {
    // Navigation
    goTo,
    next,
    prev,
    update,
    dispose,

    // Registry delegation
    register: (name, obj) => registry.register(name, obj),
    registerProperty: (objName, propName, setter) => registry.registerProperty(objName, propName, setter),
    registerLegend: (name, fn) => registry.registerLegend(name, fn),
    registerTicker: (objName, fn) => registry.registerTicker(objName, fn),

    // Camera director
    get director() { return director },

    // Active camera (perspective or orthographic based on current scene)
    get activeCamera() { return director.activeCamera },

    // Getters
    get currentIndex() { return currentIndex },
    get currentScene() { return scenes[currentIndex] },
    get isTransitioning() { return runner != null && !runner.isComplete },
  }

  return manager
}
