# Vite3D-0620

A React + Vite + three.js playground for interactive 3D scenes, gameplay systems, and rendering experiments. This project integrates React Three Fiber, Drei, and custom systems (UI, audio, performance monitor, scenes), and now includes an MMD testing panel (PMX + VMD + camera + optional physics) for quick prototyping.

## Quick Start

- Node.js: 18+
- Install: npm i
- Dev server: npm run dev (or npm run dev:with-monitor to run the system monitor alongside)
- Build: npm run build
- Preview: npm run preview

## Notable Tech Stack

- React 19 + Vite 6
- @react-three/fiber, @react-three/drei, three 0.177
- Zustand for global state (src/stores/gameStore.js)
- Post-processing via @react-three/postprocessing (optional, scene dependent)
- Physics (optional): cannon-es, @react-three/cannon, @react-three/rapier; MMD physics via ammojs-typed (on-demand)

## Project Structure (high level)

- src/
  - components/
    - Scenes/ GameScene.jsx (main scene; mounts systems, world content, UI)
    - World/ ... 3D world content and experiments
    - UI/ DebugPanel.jsx, AdvancedPerformanceMonitor.jsx, GameUI.jsx
    - Systems/ AudioSystem.jsx, WeatherSystem.jsx, etc.
    - Camera/ CameraController.jsx
  - stores/gameStore.js (global state and actions)
  - shaders/ (GLSL)
  - assets/ (fonts, textures, models for bundling)
- public/
  - mmd/ (runtime-fetchable MMD assets)
    - Vergil/ vergil.pmx, yamato.pmx, textures/
    - Lamb/ lamb足ボーン長い人用.vmd, lambカメラ2.vmd
    - audio/ Lamb.wav

See PROJECT_STRUCTURE.md for a detailed and frequently-updated structure reference.

## MMD Test Panel (DebugPanel)

The DebugPanel includes an always-visible "MMD Test" section to quickly validate PMX + VMD + camera playback.

- Inputs:
  - Model (PMX) URL, Motion VMD(s), Camera VMD, Audio URL
  - Character position/scale
  - Physics toggle (ammojs-typed is loaded on-demand)
  - Time scale
  - Camera correction: link camera position/scale to model, position offsets, min camera height
  - Morph remap: optional mapping to reconcile VMD morph names/indices with the model's morph targets
- Actions:
  - Dance: start the test, take over the main camera if camera VMD is provided
  - Stop: stop playback and release resources (mesh, camera, audio), restore the previous camera

### Asset placement and URLs

- MMD runtime loaders (MMDLoader, audio) fetch raw URLs. Place runtime assets under public/ and reference them with absolute paths:
  - /mmd/Vergil/vergil.pmx
  - /mmd/Lamb/lamb足ボーン長い人用.vmd
  - /mmd/Lamb/lambカメラ2.vmd
  - /mmd/audio/Lamb.wav
- Keep PMX-relative texture paths intact inside public to avoid missing references.

### Physics (optional)

- Toggle "Physics" in the panel to enable MMD physics. The app will dynamically import ammojs-typed and expose a global Ammo instance required by THREE.MMDPhysics.

### Morph remap (optional)

Some VMDs target morph names for different models (e.g., Miku). When using a different PMX (e.g., Vergil), morph names or indices may not match.

- DebugPanel provides two remap inputs:
  - Name->Name (e.g., あ=A)
  - Index->Name (e.g., 24=ウィンク)
- You can enter JSON or simple key=value per line; values are persisted in localStorage.
- On start, the app rewrites morph KeyframeTrack paths to use numeric indices required by three, using the mapping and the model's morphTargetDictionary.

## Troubleshooting

- Examples imports: using three-stdlib for MMDLoader/MMDAnimationHelper is supported, but we currently import from three/addons or three-stdlib depending on environment.
- If assets under /src are used as string URLs, runtime fetch will fail. Move assets to public and reference with /mmd/... URLs.
- Audio: if decoding fails, we fallback to silent playback. Prefer mp3 or wav with correct MIME.
- Camera jitter with extreme scales: we parent the animated camera under a rig object placed at scene root to avoid inheriting model scale. Use camera offset/min-height to fine-tune.

## Scripts

- npm run dev: Start Vite dev server
- npm run build: Build for production
- npm run preview: Preview production build
- npm run monitor: System monitor (Node/OS metrics)
- npm run dev:with-monitor: Run monitor alongside dev server

## License

This repository includes third-party assets for testing and educational purposes. Ensure you have appropriate rights to use any models, motions, audio, and textures.
