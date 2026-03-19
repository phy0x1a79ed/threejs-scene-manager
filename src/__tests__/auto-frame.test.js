import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeFrameDistance, computeFrameTarget } from '../auto-frame.js'

function makeMesh(size = 1, position = [0, 0, 0]) {
  const geo = new THREE.BoxGeometry(size, size, size)
  const mat = new THREE.MeshBasicMaterial()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(...position)
  mesh.updateMatrixWorld(true)
  return mesh
}

function makeCamera(fov = 50, aspect = 1) {
  return new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000)
}

describe('computeFrameDistance', () => {
  it('returns a positive distance for a single mesh', () => {
    const mesh = makeMesh(2)
    const cam = makeCamera()
    const dist = computeFrameDistance(mesh, cam)
    expect(dist).toBeGreaterThan(0)
  })

  it('accepts an array of objects', () => {
    const a = makeMesh(1, [-2, 0, 0])
    const b = makeMesh(1, [2, 0, 0])
    const cam = makeCamera()
    const dist = computeFrameDistance([a, b], cam)
    expect(dist).toBeGreaterThan(0)
  })

  it('larger objects produce greater distance', () => {
    const cam = makeCamera()
    const small = makeMesh(1)
    const large = makeMesh(10)
    const dSmall = computeFrameDistance(small, cam)
    const dLarge = computeFrameDistance(large, cam)
    expect(dLarge).toBeGreaterThan(dSmall)
  })

  it('respects padding multiplier', () => {
    const mesh = makeMesh(2)
    const cam = makeCamera()
    const base = computeFrameDistance(mesh, cam, 1.0)
    const padded = computeFrameDistance(mesh, cam, 2.0)
    expect(padded).toBeCloseTo(base * 2, 5)
  })

  it('wider FOV results in shorter distance', () => {
    const mesh = makeMesh(2)
    const narrow = makeCamera(30)
    const wide = makeCamera(90)
    expect(computeFrameDistance(mesh, narrow)).toBeGreaterThan(
      computeFrameDistance(mesh, wide)
    )
  })
})

describe('computeFrameTarget', () => {
  it('returns the center of a single mesh at origin', () => {
    const mesh = makeMesh(2, [0, 0, 0])
    const center = computeFrameTarget(mesh)
    expect(center.x).toBeCloseTo(0)
    expect(center.y).toBeCloseTo(0)
    expect(center.z).toBeCloseTo(0)
  })

  it('returns the center of a single offset mesh', () => {
    const mesh = makeMesh(2, [4, 6, 8])
    const center = computeFrameTarget(mesh)
    expect(center.x).toBeCloseTo(4)
    expect(center.y).toBeCloseTo(6)
    expect(center.z).toBeCloseTo(8)
  })

  it('returns the midpoint of two meshes', () => {
    const a = makeMesh(1, [-3, 0, 0])
    const b = makeMesh(1, [3, 0, 0])
    const center = computeFrameTarget([a, b])
    expect(center.x).toBeCloseTo(0)
    expect(center.y).toBeCloseTo(0)
    expect(center.z).toBeCloseTo(0)
  })

  it('accepts a single object (not array)', () => {
    const mesh = makeMesh(1, [1, 2, 3])
    const center = computeFrameTarget(mesh)
    expect(center).toBeInstanceOf(THREE.Vector3)
  })
})
