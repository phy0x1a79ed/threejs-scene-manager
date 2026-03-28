import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { shared } from './index.js'
import { createColorTransition } from '../color-transition.js'
import { preloadFigure } from '../figures.js'
import { parsePlotlyTraces, normalizePositions } from '../umap-parse.js'

const CELL = 8       // normalized subplot extent
const GAP_X = 4
const GAP_Y = 4
const STEP_X = CELL + GAP_X  // 12
const STEP_Y = CELL + GAP_Y  // 12

const DATASETS = [
  // row 0 (top): samples
  { src: '/data/umap_sample_nmf_k128.json',     label: 'NMF — Samples (2,844)',     row: 0, col: 0, pointSize: 4.0 },
  { src: '/data/umap_sample_lda_k128.json',     label: 'LDA — Samples (2,844)',     row: 0, col: 1, pointSize: 4.0 },
  { src: '/data/umap_sample_dvae_v5_k128.json', label: 'dVAE v5 — Samples (2,844)', row: 0, col: 2, pointSize: 4.0 },
  // row 1 (bottom): features
  { src: '/data/umap_feature_nmf_k128.json',     label: 'NMF — ORFs (50k)',     row: 1, col: 0, pointSize: 1.5 },
  { src: '/data/umap_feature_lda_k128.json',     label: 'LDA — ORFs (50k)',     row: 1, col: 1, pointSize: 1.5 },
  { src: '/data/umap_feature_dvae_v5_k128.json', label: 'dVAE v5 — ORFs (50k)', row: 1, col: 2, pointSize: 1.5 },
]

function makeLabel(text) {
  const div = document.createElement('div')
  div.textContent = text
  Object.assign(div.style, {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '11px',
    fontFamily: 'system-ui, sans-serif',
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  })
  const obj = new CSS2DObject(div)
  return obj
}

function createSubplot(parsed, ds, group) {
  normalizePositions(parsed.positions, parsed.count, CELL)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3))

  const ct = createColorTransition(geometry, parsed.colors, { pointSize: ds.pointSize })
  const points = new THREE.Points(geometry, ct.material)

  // Grid position: center the 3-col × 2-row grid at origin
  const x = (ds.col - 1) * STEP_X
  const y = (0.5 - ds.row) * STEP_Y
  points.position.set(x, y, 0)

  // Label above subplot
  const label = makeLabel(ds.label)
  label.position.set(0, CELL / 2 + 0.6, 0)
  points.add(label)

  group.add(points)
  return { points, ct, label }
}

/**
 * Initialize the UMAP grid. Call from createContent().
 * Async — fetches data then builds geometry.
 */
export async function initUmapGrid(threeScene) {
  const group = new THREE.Group()
  group.visible = false
  threeScene.add(group)
  shared.umapGrid = group
  shared.umapCTs = []

  // Fetch all 6 in parallel
  const jsons = await Promise.all(DATASETS.map(ds => preloadFigure(ds.src)))

  for (let i = 0; i < DATASETS.length; i++) {
    const parsed = parsePlotlyTraces(jsons[i])
    const { ct } = createSubplot(parsed, DATASETS[i], group)
    shared.umapCTs.push(ct)
  }
}

export default {
  name: 'umaps',
  visible: () => [shared.umapGrid],
  autoFrame: () => shared.umapGrid,
  autoFramePadding: 1.3,
  overlays: {
    title: 'k=128 Decomposition — UMAP Ordinations',
    subtitle: 'Top: samples by environment · Bottom: ORF clusters by dominant component',
  },
  onUpdate(elapsed, dt) {
    for (const ct of shared.umapCTs) {
      ct.update(0.04)
    }
  },
}
