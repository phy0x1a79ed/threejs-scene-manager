import * as THREE from 'three'
import { shared } from './index.js'

export default {
  name: 'overview',
  cameraTarget: new THREE.Vector3(0, 2, -3),
  zoomDistance: 10,
  overlays: {
    title: 'Overview',
    subtitle: 'A wider perspective on the scene',
  },
  onEnter(prev, sm) {
    if (shared.mesh) shared.mesh.visible = true
  },
  onUpdate(elapsed, dt) {
    if (shared.mesh) {
      shared.mesh.rotation.y = elapsed * 0.15
      shared.mesh.rotation.x = Math.sin(elapsed * 0.2) * 0.1
    }
  },
}
