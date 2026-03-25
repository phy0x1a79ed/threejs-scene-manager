import { resolveEasing } from './easing.js'
import { computeFrameDistance, computeFrameTarget } from './auto-frame.js'

/**
 * TransitionRunner — drives concurrent animation tracks between two scenes.
 *
 * Track types:
 *   uniform   — interpolate a shader uniform on a registered object
 *   property  — interpolate a consumer property via registered setter
 *   crossfade — opacity crossfade between two sets of objects
 *   camera    — lerp orbit target + zoom distance
 *   visibility — instant show/hide (at t=0 or t=1 if deferred)
 */
export class TransitionRunner {
  /**
   * @param {object} opts
   * @param {object} opts.fromScene  — source scene declaration
   * @param {object} opts.toScene    — target scene declaration
   * @param {object} opts.transition — transition definition (tracks, duration, easing, etc.)
   * @param {object} opts.registry     — Registry instance
   * @param {object} opts.propRegistry — PropRegistry instance
   * @param {object} opts.controls     — OrbitControls
   * @param {object} opts.camera       — PerspectiveCamera
   * @param {object} [opts.orthoCamera] — OrthographicCamera (if available)
   * @param {boolean} opts.reverse     — true if navigating to→from with direction:'both'
   * @param {boolean} opts.sameCamera  — true when scenes share a camera prop (skip camera track)
   */
  constructor(opts) {
    this._registry = opts.registry
    this._propRegistry = opts.propRegistry
    this._controls = opts.controls
    this._camera = opts.camera
    this._orthoCamera = opts.orthoCamera ?? null
    this._fromScene = opts.fromScene
    this._toScene = opts.toScene
    this._transition = opts.transition
    this._reverse = opts.reverse
    this._sameCamera = opts.sameCamera ?? false

    this._duration = opts.transition.duration ?? 600
    this._easing = resolveEasing(opts.transition.easing)
    this._startTime = null
    this._complete = false
    this._tracks = []
    this._visibilityApplied = false

    this._buildTracks()
  }

  get isComplete() { return this._complete }

  /** Initialise all track state from scene declarations + overrides */
  _buildTracks() {
    const def = this._transition
    const tracks = def.tracks ?? 'auto'

    if (tracks === 'auto') {
      this._buildAutoTracks()
      return
    }

    for (const trackDef of tracks) {
      switch (trackDef.type) {
        case 'uniform':
          this._addUniformTrack(trackDef)
          break
        case 'property':
          this._addPropertyTrack(trackDef)
          break
        case 'crossfade':
          this._addCrossfadeTrack(trackDef)
          break
        case 'camera':
          if (!this._sameCamera) this._addCameraTrack(trackDef)
          break
        case 'visibility':
          // handled in update() based on deferVisibility
          break
      }
    }

    // Always add a camera track if none specified — unless same camera prop
    if (!this._sameCamera && !tracks.some(t => t.type === 'camera')) {
      this._addCameraTrack({})
    }

    // Gap-fill: auto-crossfade any visibility changes not covered by explicit crossfade tracks
    const handledFadeOut = new Set()
    const handledFadeIn = new Set()
    for (const trackDef of tracks) {
      if (trackDef.type === 'crossfade') {
        for (const n of trackDef.fadeOut ?? []) handledFadeOut.add(n)
        for (const n of trackDef.fadeIn ?? []) handledFadeIn.add(n)
      }
    }
    this._addAutoVisibilityCrossfade(handledFadeOut, handledFadeIn)
  }

  /** Auto-generate tracks by diffing from/to scene declarations */
  _buildAutoTracks() {
    // Auto-diff uniforms
    const toUniforms = this._toScene.uniforms ?? {}
    const fromUniforms = this._fromScene.uniforms ?? {}
    for (const [objName, uniforms] of Object.entries(toUniforms)) {
      for (const [uName, toVal] of Object.entries(uniforms)) {
        const fromVal = fromUniforms[objName]?.[uName]
        if (fromVal != null && fromVal !== toVal) {
          this._addUniformTrack({ target: objName, uniform: uName, from: fromVal, to: toVal })
        } else if (fromVal == null) {
          // No from-scene value; set directly (no interpolation)
          this._addUniformTrack({ target: objName, uniform: uName, to: toVal })
        }
      }
    }

    // Auto-diff properties
    const toProps = this._toScene.properties ?? {}
    const fromProps = this._fromScene.properties ?? {}
    for (const [objName, props] of Object.entries(toProps)) {
      for (const [pName, toVal] of Object.entries(props)) {
        const fromVal = fromProps[objName]?.[pName]
        if (fromVal != null && fromVal !== toVal) {
          this._addPropertyTrack({ target: objName, property: pName, from: fromVal, to: toVal })
        } else if (fromVal == null) {
          this._addPropertyTrack({ target: objName, property: pName, to: toVal })
        }
      }
    }

    // Auto-crossfade: diff visible arrays for objects that change visibility
    this._addAutoVisibilityCrossfade(new Set(), new Set())

    // Add camera track unless scenes share the same camera prop
    if (!this._sameCamera) this._addCameraTrack({})
  }

  _addUniformTrack(def) {
    const obj = this._registry.tryResolve(def.target)
    if (!obj || !obj.material?.uniforms?.[def.uniform]) return

    const uniform = obj.material.uniforms[def.uniform]
    const from = def.from ?? uniform.value
    const to = def.to ?? this._getSceneUniform(this._toScene, def.target, def.uniform) ?? from
    const easing = resolveEasing(def.easing ?? this._transition.easing)

    this._tracks.push({
      type: 'uniform',
      apply: (t) => {
        const et = easing(t)
        uniform.value = from + (to - from) * et
      },
      snap: () => { uniform.value = to },
    })
  }

  _addPropertyTrack(def) {
    const setter = this._registry.resolveProperty(def.target, def.property)
    if (!setter) return

    const from = def.from ?? this._getSceneProperty(this._fromScene, def.target, def.property) ?? 0
    const to = def.to ?? this._getSceneProperty(this._toScene, def.target, def.property) ?? 0
    const easing = resolveEasing(def.easing ?? this._transition.easing)

    this._tracks.push({
      type: 'property',
      apply: (t) => {
        setter(from + (to - from) * easing(t))
      },
      snap: () => { setter(to) },
    })
  }

  _addCrossfadeTrack(def) {
    const easing = resolveEasing(def.easing ?? this._transition.easing)
    // Swap fadeOut/fadeIn when running in reverse
    const fadeOutNames = this._reverse ? (def.fadeIn ?? []) : (def.fadeOut ?? [])
    const fadeInNames = this._reverse ? (def.fadeOut ?? []) : (def.fadeIn ?? [])
    const fadeOutObjs = fadeOutNames.map(n => this._registry.tryResolve(n)).filter(Boolean)
    const fadeInObjs = fadeInNames.map(n => this._registry.tryResolve(n)).filter(Boolean)

    // Capture base opacities on first run
    const captured = new Map()
    const capture = (obj) => {
      obj.traverse((child) => {
        if (child.material && !captured.has(child.material)) {
          captured.set(child.material, child.material.opacity)
        }
      })
    }
    for (const obj of [...fadeOutObjs, ...fadeInObjs]) capture(obj)

    // Make fadeIn objects visible but at 0 opacity
    for (const obj of fadeInObjs) {
      obj.visible = true
      obj.traverse((child) => {
        if (child.material) child.material.opacity = 0
      })
    }

    this._tracks.push({
      type: 'crossfade',
      apply: (t) => {
        const et = easing(t)
        for (const obj of fadeOutObjs) {
          obj.visible = (1 - et) > 0.01
          obj.traverse((child) => {
            if (child.material) {
              const base = captured.get(child.material) ?? 1
              child.material.opacity = base * (1 - et)
            }
          })
        }
        for (const obj of fadeInObjs) {
          obj.visible = et > 0.01
          obj.traverse((child) => {
            if (child.material) {
              const base = captured.get(child.material) ?? 1
              child.material.opacity = base * et
            }
          })
        }
      },
      snap: () => {
        for (const obj of fadeOutObjs) {
          obj.visible = false
          obj.traverse((child) => {
            if (child.material) child.material.opacity = captured.get(child.material) ?? 1
          })
        }
        for (const obj of fadeInObjs) {
          obj.visible = true
          obj.traverse((child) => {
            if (child.material) child.material.opacity = captured.get(child.material) ?? 1
          })
        }
      },
    })
  }

  _addCameraTrack(def) {
    const easing = resolveEasing(def.easing ?? this._transition.easing)
    const toOrtho = this._toScene.cameraType === 'orthographic'

    // Resolve camera prop: string → named prop lookup, object → inline
    const cam = this._propRegistry
      ? (this._propRegistry.resolve('camera', this._toScene.camera) ?? {})
      : (this._toScene.camera ?? {})

    // Compute camera goals from toScene declaration
    let targetGoal = null
    let zoomGoal = null
    let positionGoal = null

    if (cam.target) {
      const resolved = this._registry.tryResolve(cam.target)
      if (resolved) {
        targetGoal = resolved.isVector3 ? resolved.clone() : null
      }
    }

    if (cam.frame) {
      const frameObj = this._registry.tryResolve(cam.frame)
      if (frameObj) {
        const padding = cam.framePadding ?? 1.2
        zoomGoal = computeFrameDistance(frameObj, this._camera, padding)
        if (!targetGoal) {
          targetGoal = computeFrameTarget(frameObj)
        }
      }
    } else if (cam.zoom != null) {
      zoomGoal = cam.zoom
    }

    // Full position (supersedes zoom when present)
    if (cam.position) {
      const resolved = this._registry.tryResolve(cam.position)
      positionGoal = resolved?.isVector3 ? resolved.clone() : cam.position?.clone?.()
    }

    if (!targetGoal) targetGoal = this._controls.target.clone()

    // Orthographic camera track — interpolate orthoCamera.zoom (scale)
    if (toOrtho && this._orthoCamera) {
      const startOrthoZoom = this._orthoCamera.zoom
      const orthoZoomGoal = zoomGoal ?? 1.0
      const startTarget = this._controls.target.clone()

      this._tracks.push({
        type: 'camera',
        apply: (t) => {
          const et = easing(t)
          this._controls.target.lerpVectors(startTarget, targetGoal, et)
          this._orthoCamera.zoom = startOrthoZoom + (orthoZoomGoal - startOrthoZoom) * et
          this._orthoCamera.updateProjectionMatrix()
        },
        snap: () => {
          this._controls.target.copy(targetGoal)
          this._orthoCamera.zoom = orthoZoomGoal
          this._orthoCamera.updateProjectionMatrix()
        },
      })
      return
    }

    // Perspective camera track (existing logic)
    if (!positionGoal && zoomGoal == null) {
      zoomGoal = this._camera.position.distanceTo(this._controls.target)
    }

    const startTarget = this._controls.target.clone()
    const startPosition = this._camera.position.clone()
    const startZoom = startPosition.distanceTo(startTarget)

    this._tracks.push({
      type: 'camera',
      apply: (t) => {
        const et = easing(t)
        this._controls.target.lerpVectors(startTarget, targetGoal, et)

        if (positionGoal) {
          // Full position lerp — controls both angles and distance
          this._camera.position.lerpVectors(startPosition, positionGoal, et)
        } else {
          // Distance-only lerp — preserves current orbit direction
          const offset = this._camera.position.clone().sub(this._controls.target)
          const dist = startZoom + (zoomGoal - startZoom) * et
          offset.normalize().multiplyScalar(dist)
          this._camera.position.copy(this._controls.target).add(offset)
        }
      },
      snap: () => {
        this._controls.target.copy(targetGoal)
        if (positionGoal) {
          this._camera.position.copy(positionGoal)
        } else {
          const offset = this._camera.position.clone().sub(this._controls.target)
          offset.normalize().multiplyScalar(zoomGoal)
          this._camera.position.copy(this._controls.target).add(offset)
        }
      },
    })
  }

  /** Auto-crossfade objects that change visibility but aren't already handled */
  _addAutoVisibilityCrossfade(handledFadeOut, handledFadeIn) {
    const fromVisible = new Set(this._fromScene.visible ?? [])
    const toVisible = new Set(this._toScene.visible ?? [])
    const fadeOut = [...fromVisible].filter(n => !toVisible.has(n) && !handledFadeOut.has(n))
    const fadeIn = [...toVisible].filter(n => !fromVisible.has(n) && !handledFadeIn.has(n))
    if (fadeOut.length || fadeIn.length) {
      this._addCrossfadeTrack({ fadeOut, fadeIn })
    }
    // Flag that this transition has crossfade work so the manager can defer visibility
    this._hasCrossfade = this._tracks.some(t => t.type === 'crossfade')
  }

  // --- Helpers ---

  _getSceneUniform(scene, objName, uName) {
    return scene.uniforms?.[objName]?.[uName] ?? null
  }

  _getSceneProperty(scene, objName, pName) {
    return scene.properties?.[objName]?.[pName] ?? null
  }

  // --- Runtime ---

  /** Call every frame with cumulative elapsed time (seconds) */
  update(elapsed) {
    if (this._complete) return

    if (this._startTime == null) this._startTime = elapsed

    const elapsedMs = (elapsed - this._startTime) * 1000
    const t = Math.min(1, elapsedMs / this._duration)

    for (const track of this._tracks) {
      track.apply(t)
    }

    if (t >= 1) {
      // Snap to clean end state — restores base opacities on faded-out objects
      // so future transitions capture the correct base values
      this.snap()
    }
  }

  /** Snap all tracks to their end state immediately */
  snap() {
    for (const track of this._tracks) {
      track.snap()
    }
    this._complete = true
  }
}
