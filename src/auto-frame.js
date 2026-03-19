import * as THREE from 'three'

/**
 * Compute the camera distance needed to frame the given objects.
 * Uses bounding sphere + FOV to find the optimal distance.
 */
export function computeFrameDistance(objects, camera, padding = 1.2) {
  const arr = Array.isArray(objects) ? objects : [objects]
  const box = new THREE.Box3()
  for (const obj of arr) box.expandByObject(obj)

  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)

  const fovRad = THREE.MathUtils.degToRad(camera.fov)
  const vDist = sphere.radius / Math.sin(fovRad / 2)
  const hDist = sphere.radius / Math.sin(Math.atan(Math.tan(fovRad / 2) * camera.aspect))

  return Math.max(vDist, hDist) * padding
}

/**
 * Compute the center of the bounding box of the given objects.
 */
export function computeFrameTarget(objects) {
  const arr = Array.isArray(objects) ? objects : [objects]
  const box = new THREE.Box3()
  for (const obj of arr) box.expandByObject(obj)

  const center = new THREE.Vector3()
  box.getCenter(center)
  return center
}
