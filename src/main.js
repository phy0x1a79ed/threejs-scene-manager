import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createSceneManager } from './scene-manager.js'
import { createContent, scenes } from './scenes/index.js'
import { initOverlays } from './overlays.js'

// --- Renderer ---
const canvas = document.getElementById('canvas')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setClearColor(0x000000)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.9

// --- Scene ---
const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x000000, 0.035)

// --- Camera ---
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
)
camera.position.set(0, 2, 5)
camera.lookAt(0, 0, 0)

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.rotateSpeed = 0.6
controls.zoomSpeed = 0.8

// --- Lights ---
const sun = new THREE.DirectionalLight(0xffffff, 2.0)
sun.position.set(5, 8, -3)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.near = 0.5
sun.shadow.camera.far = 30
sun.shadow.camera.left = -10
sun.shadow.camera.right = 10
sun.shadow.camera.top = 10
sun.shadow.camera.bottom = -10
sun.shadow.bias = -0.001
scene.add(sun)

const ambient = new THREE.AmbientLight(0x404040, 0.5)
scene.add(ambient)

// --- Content ---
createContent(scene)
initOverlays()

// --- Scene Manager ---
const sm = createSceneManager({
  scenes,
  controls,
  camera,
  navContainer: document.body,
})
sm.goTo(0)

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// --- Animate ---
let elapsed = 0
function animate() {
  requestAnimationFrame(animate)
  elapsed += 0.016

  sm.update(elapsed, 0.016)
  controls.update()

  renderer.render(scene, camera)
}

animate()
