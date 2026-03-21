import * as THREE from 'three'
import { shared } from './index.js'

export default {
  name: 'front',
  visible: () => [shared.mesh, shared.floor],
  cameraTarget: new THREE.Vector3(0, 1, 0),
  autoFrame: () => shared.mesh,
  autoFramePadding: 1.3,
  overlays: {
    title: 'Welcome',
    subtitle: 'Arrow keys or nav dots to navigate',
  },
  onUpdate(elapsed, dt) {
    if (shared.mesh) {
      shared.mesh.rotation.y = elapsed * 0.3
      shared.mesh.position.y = 1.5 + Math.sin(elapsed * 0.5) * 0.2
    }
  },
}
