const container = document.getElementById('overlays')

export function initOverlays() {
  // Example: title overlay — customize or remove
  addOverlay('title', {
    top: '2rem',
    left: '2rem',
    color: '#fff',
    fontSize: '1.5rem',
    fontFamily: 'system-ui, sans-serif',
    textShadow: '0 2px 8px rgba(0,0,0,0.7)',
  }, 'Three.js Presentation')

  addOverlay('subtitle', {
    top: '4.2rem',
    left: '2rem',
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.9rem',
    fontFamily: 'system-ui, sans-serif',
    textShadow: '0 1px 6px rgba(0,0,0,0.5)',
  }, '')
}

export function addOverlay(id, styles, content = '') {
  const el = document.createElement('div')
  el.id = id
  Object.assign(el.style, { position: 'absolute', ...styles })
  el.innerHTML = content
  container.appendChild(el)
  return el
}

export function updateOverlay(id, content) {
  const el = document.getElementById(id)
  if (el) el.innerHTML = content
}

export function removeOverlay(id) {
  const el = document.getElementById(id)
  if (el) el.remove()
}
