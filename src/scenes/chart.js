import { loadFigure, clearFigure, exportFigure } from '../figures.js'

let exportHandler = null

export default {
  name: 'chart',
  cameraTarget: null,
  showPanels: ['chart-panel'],
  overlays: {
    title: 'Chart',
    subtitle: 'Plotly figure with dark theme \u2014 Ctrl+E to export SVG',
  },
  onEnter(prev, sm) {
    loadFigure('chart-container', { src: '/data/sample-chart.json' })
    exportHandler = (e) => {
      if (e.ctrlKey && e.code === 'KeyE') {
        e.preventDefault()
        exportFigure('chart-container', 'svg', 'sample-chart')
      }
    }
    window.addEventListener('keydown', exportHandler)
  },
  onLeave(next, sm) {
    clearFigure('chart-container')
    if (exportHandler) {
      window.removeEventListener('keydown', exportHandler)
      exportHandler = null
    }
  },
}
