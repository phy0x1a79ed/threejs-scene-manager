import { shared } from './index.js'

export default {
  name: 'overview',
  visible: () => [shared.mesh, shared.floor],
  autoFrame: () => [shared.mesh, shared.floor],
  overlays: {
    title: 'Overview',
    subtitle: 'A wider perspective on the scene',
  },
  onUpdate(elapsed, dt) {
    if (shared.mesh) {
      shared.mesh.rotation.y = elapsed * 0.15
      shared.mesh.rotation.x = Math.sin(elapsed * 0.2) * 0.1
    }
  },
}
