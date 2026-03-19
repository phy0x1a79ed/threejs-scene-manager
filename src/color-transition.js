import * as THREE from 'three'

const vertexShader = /* glsl */ `
  attribute vec3 prevColor;
  attribute vec3 currentColor;
  uniform float uBlend;
  varying vec3 vColor;

  void main() {
    vColor = mix(prevColor, currentColor, uBlend);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 4.0 * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    // Circular point
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`

/**
 * Create a color-transitioning material for a Points geometry.
 *
 * @param {THREE.BufferGeometry} geometry — must already have a 'position' attribute
 * @param {Float32Array} initialColors — rgb triplets, same length as position array
 * @returns {{ material, setColors, update, dispose, uniforms }}
 */
export function createColorTransition(geometry, initialColors) {
  const count = geometry.attributes.position.count

  const prevAttr = new THREE.BufferAttribute(new Float32Array(count * 3), 3)
  const currAttr = new THREE.BufferAttribute(new Float32Array(count * 3), 3)

  // Initialize both to initial colors
  prevAttr.array.set(initialColors)
  currAttr.array.set(initialColors)

  geometry.setAttribute('prevColor', prevAttr)
  geometry.setAttribute('currentColor', currAttr)

  const uniforms = { uBlend: { value: 1.0 } }

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: false,
  })

  function setColors(newColors) {
    // Copy current → prev
    prevAttr.array.set(currAttr.array)
    prevAttr.needsUpdate = true

    // Write new → current
    currAttr.array.set(newColors)
    currAttr.needsUpdate = true

    // Reset blend
    uniforms.uBlend.value = 0.0
  }

  function update(lerpRate = 0.03) {
    if (uniforms.uBlend.value < 1.0) {
      uniforms.uBlend.value += (1.0 - uniforms.uBlend.value) * lerpRate
      if (uniforms.uBlend.value > 0.999) uniforms.uBlend.value = 1.0
    }
  }

  function dispose() {
    material.dispose()
  }

  return { material, setColors, update, dispose, uniforms }
}
