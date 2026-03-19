import * as THREE from 'three'
import { shared } from './index.js'
import { createColorTransition } from '../color-transition.js'
import { preloadFigure } from '../figures.js'

const POINT_COUNT = 500

const palettes = {
  warm(i, count) {
    return [1.0, 0.3 + 0.7 * (i / count), 0.1]
  },
  cool(i, count) {
    return [0.1, 0.4 + 0.4 * (i / count), 1.0]
  },
  random() {
    return [Math.random(), Math.random(), Math.random()]
  },
}

function generateColors(paletteName) {
  const fn = palettes[paletteName]
  const colors = new Float32Array(POINT_COUNT * 3)
  for (let i = 0; i < POINT_COUNT; i++) {
    const [r, g, b] = fn(i, POINT_COUNT)
    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
  return colors
}

let ct = null

export function initPointCloud(threeScene) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(POINT_COUNT * 3)

  for (let i = 0; i < POINT_COUNT; i++) {
    // Random points in a sphere
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 2 * Math.cbrt(Math.random())
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) + 3
    positions[i * 3 + 2] = r * Math.cos(phi)
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const initialColors = generateColors('cool')
  ct = createColorTransition(geometry, initialColors)

  shared.pointCloud = new THREE.Points(geometry, ct.material)
  shared.pointCloud.visible = false
  threeScene.add(shared.pointCloud)
}

export default {
  name: 'points',
  autoFrame: () => shared.pointCloud,
  autoFramePadding: 1.4,
  overlays: {
    title: 'Point Cloud',
    subtitle: 'GPU color transitions between palettes',
  },
  onEnter(prev, sm) {
    if (shared.pointCloud) shared.pointCloud.visible = true
    if (shared.mesh) shared.mesh.visible = false
    // Transition to warm palette
    if (ct) ct.setColors(generateColors('warm'))
    // Preload the chart scene's figure
    preloadFigure('/data/sample-chart.json')
  },
  onLeave(next, sm) {
    if (shared.pointCloud) shared.pointCloud.visible = false
  },
  onUpdate(elapsed, dt) {
    if (ct) ct.update(0.04)
    if (shared.pointCloud) {
      shared.pointCloud.rotation.y = elapsed * 0.1
    }
  },
}
