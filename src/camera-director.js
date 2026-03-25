import * as THREE from 'three'

/**
 * CameraDirector — multiplexes camera control between actors.
 *
 * Actors (by priority):
 *   transition  — animated move A→B, blocks all other input
 *   user        — OrbitControls drag/scroll, overrides scene while active
 *   scene       — auto-rotate (relative) + keyframed target/zoom (absolute, ease back)
 *
 * States:
 *   idle          — auto-rotate on, keyframes easing toward goals
 *   user          — auto-rotate paused, keyframe easing paused
 *   transitioning — transition drives camera, user controls disabled
 *
 * Supports both PerspectiveCamera and OrthographicCamera. For perspective,
 * zoom = distance from target. For orthographic, zoom = camera.zoom (scale).
 */
export class CameraDirector {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {OrbitControls} controls
   * @param {object} [opts]
   * @param {number} [opts.idleDelay=1.0]  — seconds after user releases before scene resumes
   * @param {number} [opts.easeRate=2.0]   — exponential ease speed for keyframe convergence
   * @param {THREE.OrthographicCamera} [opts.orthoCamera] — optional orthographic camera
   */
  constructor(camera, controls, { idleDelay = 1.0, easeRate = 2.0, orthoCamera } = {}) {
    this._camera = camera
    this._orthoCamera = orthoCamera ?? null
    this._activeCamera = camera          // currently active camera
    this._controls = controls
    this._idleDelay = idleDelay
    this._easeRate = easeRate

    this._target = new THREE.Vector3()  // keyframed orbit target
    this._zoom = null                    // keyframed distance or ortho scale (null = unconstrained)
    this._position = null                // keyframed full camera position (null = unconstrained)
    this._isOrtho = false                // whether current scene uses orthographic camera
    this._state = 'idle'
    this._idleTimer = 0
    this._autoRotatePaused = false       // user-toggled pause (sticky)

    /** Called when user grabs during a transition — set by scene-manager */
    this.onInterrupt = null

    this._onStart = () => {
      if (this._state === 'transitioning') {
        // User interrupted transition — notify manager to snap
        if (this.onInterrupt) this.onInterrupt()
      }
      this._state = 'user'
      this._idleTimer = 0
      controls.autoRotate = false
      controls.enabled = true // re-enable in case transition had disabled
    }
    this._onEnd = () => {
      // Reset idle timer on release — update() counts up from here
      if (this._state === 'user') this._idleTimer = 0
    }

    controls.addEventListener('start', this._onStart)
    controls.addEventListener('end', this._onEnd)
  }

  /** Current state: 'idle' | 'user' | 'transitioning' */
  get state() { return this._state }

  /** Keyframed orbit target (read-only reference) */
  get target() { return this._target }

  /** Keyframed zoom distance (perspective) or scale (orthographic) */
  get zoom() { return this._zoom }

  /** The currently active camera (perspective or orthographic) */
  get activeCamera() { return this._activeCamera }

  /** The orthographic camera, if configured */
  get orthoCamera() { return this._orthoCamera }

  /** Whether the current scene uses orthographic projection */
  get isOrtho() { return this._isOrtho }

  /**
   * Switch the active camera type.
   * @param {'perspective'|'orthographic'} type
   */
  setActiveCameraType(type) {
    this._isOrtho = type === 'orthographic'
    this._activeCamera = this._isOrtho && this._orthoCamera ? this._orthoCamera : this._camera
  }

  /** User-toggled auto-rotate pause (sticky across interactions/transitions) */
  get autoRotatePaused() { return this._autoRotatePaused }
  set autoRotatePaused(v) {
    this._autoRotatePaused = v
    this._controls.autoRotate = !v && this._state === 'idle'
  }

  /**
   * Set keyframed camera goals. Called by scene-manager on scene enter.
   * @param {object} opts
   * @param {THREE.Vector3} [opts.target]   — orbit center goal
   * @param {number} [opts.zoom]            — distance from target goal
   * @param {THREE.Vector3} [opts.position] — full camera position (supersedes zoom)
   * @param {boolean} [opts.immediate]      — snap instead of easing
   */
  setKeyframe({ target, zoom, position, immediate = false } = {}) {
    if (target) {
      this._target.copy(target)
      if (immediate) this._controls.target.copy(target)
    }
    if (position) {
      this._position = position.clone()
      this._zoom = null // position supersedes zoom (distance is implicit)
      if (immediate) this._activeCamera.position.copy(position)
    } else if (zoom != null) {
      this._position = null
      this._zoom = zoom
      if (immediate) this._snapZoom(zoom)
    }
  }

  /** Enter transition state — disable user controls */
  beginTransition() {
    this._state = 'transitioning'
    this._controls.autoRotate = false
    this._controls.enabled = false
  }

  /** Exit transition state — re-enable controls, resume auto-rotate */
  endTransition() {
    this._state = 'idle'
    this._controls.enabled = true
    this._controls.autoRotate = !this._autoRotatePaused
  }

  /**
   * Per-frame update. Call from the render loop.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    if (this._state === 'transitioning') return

    if (this._state === 'user') {
      this._idleTimer += dt
      if (this._idleTimer >= this._idleDelay) {
        this._state = 'idle'
        this._controls.autoRotate = !this._autoRotatePaused
      }
      return // no easing while user is active
    }

    // IDLE — ease toward keyframed goals
    const rate = 1 - Math.exp(-this._easeRate * dt)

    this._controls.target.lerp(this._target, rate)

    if (this._isOrtho && this._orthoCamera && this._zoom != null) {
      // Orthographic: zoom = camera.zoom (scale factor)
      this._orthoCamera.zoom += (this._zoom - this._orthoCamera.zoom) * rate
      this._orthoCamera.updateProjectionMatrix()
    } else if (this._position) {
      // Full position easing — controls both angles and distance
      this._activeCamera.position.lerp(this._position, rate)
    } else if (this._zoom != null) {
      // Distance-only easing — preserves user's orbit angles
      const offset = this._activeCamera.position.clone().sub(this._controls.target)
      const dist = offset.length()
      if (dist > 0.001) {
        const newDist = dist + (this._zoom - dist) * rate
        offset.normalize().multiplyScalar(newDist)
        this._activeCamera.position.copy(this._controls.target).add(offset)
      }
    }
  }

  /** Snap camera zoom to a specific value */
  _snapZoom(value) {
    if (this._isOrtho && this._orthoCamera) {
      this._orthoCamera.zoom = value
      this._orthoCamera.updateProjectionMatrix()
    } else {
      const offset = this._activeCamera.position.clone().sub(this._controls.target)
      if (offset.length() > 0.001) {
        offset.normalize().multiplyScalar(value)
        this._activeCamera.position.copy(this._controls.target).add(offset)
      }
    }
  }

  dispose() {
    this._controls.removeEventListener('start', this._onStart)
    this._controls.removeEventListener('end', this._onEnd)
  }
}
