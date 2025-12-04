import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { MMDLoader, MMDAnimationHelper } from "three-stdlib";

/**
 * MMDTest
 * - Loads PMX model and applies VMD motion(s)
 * - Optionally applies camera VMD and takes over the main R3F camera during playback
 * - Optional physics via ammojs-typed (no WASM files required)
 * - Optional audio playback synced using MMDAnimationHelper
 */
export default function MMDTest({
  modelUrl,
  motionUrls = [],
  cameraUrl = null,
  audioUrl = null,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  physicsEnabled = false,
  timeScale = 1,
  loop = true,
  cameraPosScale = 1,
  cameraOffset = [0,0,0],
  cameraMinHeight = 0,
  linkCameraScale = true,
  linkCameraPosition = true,
  morphRemapMap = null,
  morphRemapIndexMap = null,
  onLoaded,
}) {
  const groupRef = useRef();
  const meshRef = useRef();
  const helperRef = useRef();
  const mmdCameraRef = useRef();
  const camRigRef = useRef();
  const audioRef = useRef();
  const prevCameraRef = useRef();
  const tmpVecRef = useRef(new THREE.Vector3());
  const { camera: mainCamera, set, gl, scene } = useThree();

  // Load model and motions
  const loader = useMemo(() => new MMDLoader(), []);

  useEffect(() => {
    let mounted = true;
    const helper = new MMDAnimationHelper({
      afterglow: 2.0,
      pmxAnimation: true,
    });
    helperRef.current = helper;

    async function setup() {
      try {
        // Ammo (optional)
        let ammoInstance = null;
        if (physicsEnabled) {
          // Dynamically import ammojs-typed only when needed
          const AmmoModule = await import("ammojs-typed");
          const AmmoLib = await AmmoModule.default();
          ammoInstance = AmmoLib?.Ammo ? await AmmoLib.Ammo() : AmmoLib;
          // Expose to global for MMDPhysics which expects global Ammo
          try {
            if (ammoInstance && !globalThis.Ammo) globalThis.Ammo = ammoInstance;
          } catch (e) {
            console.warn("Failed to expose Ammo to global scope, physics may not work:", e);
          }
        }

        // Load model with animations in one call
        const vmds = (motionUrls || []).filter(Boolean);
        const mmd = await new Promise((resolve, reject) => {
          loader.loadWithAnimation(
            modelUrl,
            vmds,
            (mmdResult) => resolve(mmdResult),
            undefined,
            reject
          );
        });

        const mesh = mmd.mesh;
        meshRef.current = mesh;

        // Optional: morph track remapping before adding to helper
        let animClip = mmd.animation;
        // Remap morph targets to numeric indices expected by KeyframeTracks
        try {
          const dict = mesh.morphTargetDictionary || {};
          // Build name->index map
          const nameToIndex = dict;
          const getIndexForName = (name) => {
            if (!name) return null;
            if (Object.prototype.hasOwnProperty.call(nameToIndex, name)) return nameToIndex[name];
            return null;
          };

          let changed = false;
          const remappedTracks = animClip.tracks.map((track) => {
            if (typeof track.name !== 'string') return track;

            // Extract name or index from track
            let m = track.name.match(/\.(?:morph|morphTargetInfluences)\[(.*?)\]/);
            if (!m) return track;
            const token = m[1];

            let targetIndex = null;

            // If source is a name and we have a name->name remap
            const isName = isNaN(Number(token));
            if (isName && morphRemapMap) {
              const srcName = token;
              const tgtName = morphRemapMap[srcName] || srcName; // allow identity mapping
              targetIndex = getIndexForName(tgtName);
            }

            // If source is an index and we have index->name remap
            if (targetIndex == null && !isName && morphRemapIndexMap) {
              const srcIdx = String(token);
              const tgtName = morphRemapIndexMap[srcIdx];
              targetIndex = getIndexForName(tgtName);
            }

            // If still null and token is already a valid morph name in dict
            if (targetIndex == null && isName) {
              targetIndex = getIndexForName(token);
            }

            if (targetIndex != null && Number.isInteger(targetIndex)) {
              const newName = track.name.replace(/(\.(?:morph|morphTargetInfluences)\[)(.*?)(\])/, `$1${targetIndex}$3`);
              if (newName !== track.name) {
                const cloned = track.clone();
                cloned.name = newName;
                changed = true;
                return cloned;
              }
            }
            return track;
          });

          if (changed) {
            const clonedClip = animClip.clone();
            clonedClip.tracks = remappedTracks;
            clonedClip.resetDuration();
            animClip = clonedClip;
            console.log('[MMDTest] Applied morph remap to tracks (to indices)');
          }
        } catch (e) {
          console.warn('[MMDTest] morph remap failed:', e);
        }

        // Helper binds mesh animation and optional physics
        helper.add(mesh, {
          animation: animClip,
          physics: physicsEnabled,
          physicsRigidBodyType: 2,
          Ammo: ammoInstance || undefined,
        });

        // Explicitly ensure animation enabled
        try { helper.enable && helper.enable('animation', true); } catch (e) {}

        // Appearance fix removed as per request
        if (false && mesh) {
          try {
            mesh.traverse((obj) => {
              if (obj.isMesh && obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((mat) => {
                  if (mat.color && mat.color.multiplyScalar) {
                    mat.color.multiplyScalar(0.6);
                  }
                  if (mat.emissive && mat.emissive.multiplyScalar) {
                    // Remove emissive to avoid self-glow
                    mat.emissive.multiplyScalar(0);
                  }
                  if ('toneMapped' in mat) mat.toneMapped = false;
                  mat.needsUpdate = true;
                });
              }
            });
          } catch (e) {
            console.warn('[MMDTest] appearanceFix pass failed:', e);
          }
        }

        // Debug: print animation tracks to verify morph tracks presence
        try {
          const trackNames = (mmd.animation?.tracks || []).map((t) => t.name);
          console.log('[MMDTest] Animation track count:', trackNames.length);
          console.log('[MMDTest] Sample tracks:', trackNames.slice(0, 10));

          const morphTracks = (mmd.animation?.tracks || []).filter((t) => t.name.includes('.morph'));
          console.log('[MMDTest] Morph track count:', morphTracks.length);
          if (morphTracks.length) {
            console.log('[MMDTest] Morph tracks (first 20):', morphTracks.slice(0,20).map(t=>t.name));
          }

          if (mesh && mesh.morphTargetInfluences) {
            console.log('[MMDTest] morphTargetInfluences length:', mesh.morphTargetInfluences.length);
            const dict = mesh.morphTargetDictionary || {};
            console.log('[MMDTest] morphTarget names (first 30):', Object.keys(dict).slice(0,30));
          }
        } catch (e) {}

        // Camera takeover if camera vmd provided
        if (cameraUrl) {
          const cam = new THREE.PerspectiveCamera(45, gl.domElement.clientWidth / gl.domElement.clientHeight, 1, 2000);
          cam.position.set(0, 10, 30);
          mmdCameraRef.current = cam;

          // Create a rig at scene level (do not inherit model scale) and place animated camera under it
          const rig = new THREE.Group();
          camRigRef.current = rig;
          scene.add(rig);
          rig.add(cam);

          const camAnim = await new Promise((resolve, reject) => {
            loader.loadAnimation(
              cameraUrl,
              cam,
              (clip) => resolve(clip),
              undefined,
              reject
            );
          });
          helper.add(cam, { animation: camAnim });

          // Save prev R3F camera and replace
          prevCameraRef.current = mainCamera;
          set({ camera: cam });
        }

        // Audio sync if provided - robust loading with graceful fallback
        if (audioUrl) {
          try {
            if (audioUrl.startsWith('/src/')) {
              console.warn('Audio path points to /src/. Please move audio under /public (e.g., /mmd/audio/...) for runtime fetching. Attempting anyway...');
            }

            const listener = new THREE.AudioListener();
            (mmdCameraRef.current || mainCamera).add(listener);

            const audio = new THREE.Audio(listener);
          audioRef.current = audio;
            // Prefetch with fetch to get clearer errors and ensure arrayBuffer
            const res = await fetch(audioUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${audioUrl}`);
            const arrayBuffer = await res.arrayBuffer();

            // Use the listener's AudioContext to decode manually for better error handling
            const decoded = await listener.context.decodeAudioData(arrayBuffer.slice(0));
            audio.setBuffer(decoded);
            audio.setLoop(loop);
            audio.setVolume(1.0);

            // Let MMDAnimationHelper control audio sync; no manual play to avoid double playback
          helper.add(audio, { delayTime: 0.0 });
          } catch (e) {
            console.warn('MMD audio load failed, continuing without audio:', e);
          }
        }

        // Time scale
        helper.timeScale = timeScale;

        if (mounted && onLoaded) onLoaded({ helper, mesh });
      } catch (err) {
        console.error("MMDTest setup error:", err);
      }
    }

    setup();

    return () => {
      mounted = false;
      try {
        if (helperRef.current) {
          // Stop audio if playing
          if (audioRef.current && audioRef.current.isPlaying) {
            try { audioRef.current.stop(); } catch {}
          }
          if (audioRef.current) {
            try { helperRef.current.remove(audioRef.current); } catch {}
          }
          // Remove managed objects
          if (meshRef.current) helperRef.current.remove(meshRef.current);
          if (mmdCameraRef.current) helperRef.current.remove(mmdCameraRef.current);
          // Detach and dispose rig
          if (camRigRef.current && camRigRef.current.parent) {
            try { camRigRef.current.parent.remove(camRigRef.current); } catch {}
          }
        }
      } catch (e) {
        // ignore
      }
      // Restore previous camera if we took it over
      if (mmdCameraRef.current && prevCameraRef.current) {
        set({ camera: prevCameraRef.current });
      }
    };
  }, [modelUrl, JSON.stringify(motionUrls), cameraUrl, audioUrl, physicsEnabled, timeScale, loop]);

  // Advance helper each frame
  useFrame((_, delta) => {
    if (helperRef.current) helperRef.current.update(delta);

    // Apply camera correction after helper updates camera
    const rig = camRigRef.current;
    const cam = mmdCameraRef.current;
    if (cam && rig) {
      // Do not scale camera with model; keep original MMD camera motion
      const [ox, oy, oz] = cameraOffset || [0,0,0];
      const minY = Number(cameraMinHeight) || 0;

      // Follow model world position without inheriting scale
      let rx = ox, ry = Math.max(oy, minY), rz = oz;
      if (linkCameraPosition && groupRef.current) {
        const wp = tmpVecRef.current;
        groupRef.current.getWorldPosition(wp);
        rx += wp.x; ry += wp.y; rz += wp.z;
      }
      rig.position.set(rx, ry, rz);
    }
  });

  // Render
  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      {meshRef.current && <primitive object={meshRef.current} />}
    </group>
  );
}
