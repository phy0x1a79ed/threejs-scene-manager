import * as THREE from 'three'
import front from './front.js'
import overview from './overview.js'

// Shared state accessible by scene files
export const shared = {
  mesh: null,
  floor: null,
}

export function createContent(scene) {
  // Floor
  const floorGeo = new THREE.PlaneGeometry(20, 20)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.9,
    metalness: 0.0,
  })
  shared.floor = new THREE.Mesh(floorGeo, floorMat)
  shared.floor.rotation.x = -Math.PI / 2
  shared.floor.receiveShadow = true
  scene.add(shared.floor)

  // Sample object
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4488ff,
    roughness: 0.3,
    metalness: 0.6,
  })
  shared.mesh = new THREE.Mesh(geo, mat)
  shared.mesh.position.y = 1.5
  shared.mesh.castShadow = true
  scene.add(shared.mesh)
}

export const scenes = [front, overview]
