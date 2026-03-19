# threejs-scene-manager

Multi-scene navigation framework for Three.js presentations. Provides smooth camera transitions, nav dot UI, and a simple scene definition API.

## Quick Start

```bash
pnpm install
pnpm dev
```

Arrow keys or click nav dots to switch between scenes.

## API

### `createSceneManager(options)` → manager

```js
import { createSceneManager } from './scene-manager.js'

const sm = createSceneManager({
  scenes,         // array of scene definitions (ordered)
  controls,       // OrbitControls instance
  camera,         // PerspectiveCamera
  lerpRate: 0.03, // camera transition speed (optional)
  navContainer: document.body, // where to append nav dots
})

sm.goTo(0) // start on first scene
```

**Returns:** `{ goTo(idx), next(), prev(), update(elapsed, dt), currentIndex, currentScene, dispose() }`

Call `sm.update(elapsed, dt)` and `controls.update()` each frame.

### Scene Definition

```js
{
  name: 'overview',                           // required identifier
  cameraTarget: new THREE.Vector3(0, 0, 0),   // orbit target to lerp toward
  zoomDistance: 20.0,                          // null/omit = don't touch zoom
  showPanels: ['detail-panel'],               // DOM ids; auto-hidden on leave
  overlays: { title: 'Text', subtitle: '…' }, // DOM id → innerHTML
  onEnter(prevScene, sm) {},                  // called when entering this scene
  onUpdate(elapsed, dt) {},                   // per-frame while active
  onLeave(nextScene, sm) {},                  // called when leaving this scene
}
```

All fields except `name` are optional.

## Adding Scenes

1. Create `src/scenes/my-scene.js` exporting a scene definition object
2. Import it in `src/scenes/index.js` and add to the `scenes` array

## Project Structure

```
src/
  main.js            — renderer, camera, controls, animate loop
  scene-manager.js   — core framework (navigation, transitions, nav dots)
  overlays.js        — DOM overlay helpers
  scenes/
    index.js         — barrel export + shared content setup
    front.js         — example scene: close-up view
    overview.js      — example scene: wide angle
```
