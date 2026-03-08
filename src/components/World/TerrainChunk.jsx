import React, {useMemo} from "react";
import {RigidBody} from "@react-three/rapier";
import * as THREE from "three";
import {Noise} from "noisejs";

/**
 * TerrainChunk
 *
 * A single chunk of the infinite terrain system.
 * Uses deterministic noise based on global coordinates so adjacent chunks
 * share identical edge vertices and tile seamlessly.
 *
 * Material is received from InfiniteTerrainManager (shared across all chunks)
 * to avoid creating duplicate shaders/textures.
 */

// Shared noise instance with fixed seed (created once, reused by all chunks)
let _sharedNoise = null;
function getSharedNoise(seed) {
  if (!_sharedNoise || _sharedNoise._seed !== seed) {
    _sharedNoise = new Noise(seed);
    _sharedNoise._seed = seed;
  }
  return _sharedNoise;
}

/**
 * Compute terrain height at a global (world) position.
 * Exported so the player ground-check or other systems can query it.
 */
/**
 * Multi-octave terrain height with natural mountain feel.
 *
 * Key improvements over the original:
 * 1. Continental scale (very low freq, high amplitude) for large mountain ranges
 * 2. Ridge noise for sharper peaks (abs trick)
 * 3. 6 octaves instead of 3 for richer detail
 * 4. Amplitude-weighted sum (fbm) with persistence
 * 5. Smooth transition from flat zone
 */
export function getTerrainHeight(worldX, worldZ, {
  noiseSeed = 42,
  maxHeight = 32,
  flatZoneRadius = 128,
  transitionZone = 80,
} = {}) {
  const noise = getSharedNoise(noiseSeed);
  const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);

  if (distFromCenter <= flatZoneRadius) return 0;

  // --- Continental / mountain range scale (very low frequency, high amplitude) ---
  const continental = noise.perlin2(worldX * 0.0012, worldZ * 0.0012);
  // Bias upward slightly so we get more hills than valleys
  const continentalHeight = (continental * 0.5 + 0.25) * maxHeight * 1.8;

  // --- Ridge noise for sharp mountain peaks ---
  const ridge1 = 1.0 - Math.abs(noise.perlin2(worldX * 0.004 + 100, worldZ * 0.004 + 100));
  const ridge2 = 1.0 - Math.abs(noise.perlin2(worldX * 0.008 + 200, worldZ * 0.008 + 200));
  const ridgeHeight = (ridge1 * ridge1 * 0.6 + ridge2 * ridge2 * 0.3) * maxHeight * 0.8;

  // --- FBM detail (standard octaves for surface texture) ---
  let fbm = 0;
  let freq = 0.015;
  let amp = 1.0;
  const persistence = 0.45;
  const lacunarity = 2.2;

  for (let i = 0; i < 5; i++) {
    fbm += noise.perlin2(worldX * freq + i * 31.7, worldZ * freq + i * 47.3) * amp;
    freq *= lacunarity;
    amp *= persistence;
  }
  const fbmHeight = fbm * maxHeight * 0.35;

  // --- Combine ---
  const combined = continentalHeight + ridgeHeight + fbmHeight;

  // Smooth transition from flat zone
  const tFactor = Math.min(1, (distFromCenter - flatZoneRadius) / transitionZone);
  // Ease-in for smoother hills near the flat zone
  const easedT = tFactor * tFactor * (3 - 2 * tFactor); // smoothstep

  return combined * easedT;
}

function TerrainChunk({
  cx,
  cz,
  chunkSize = 128,
  resolution = 64,
  maxHeight = 32,
  noiseSeed = 42,
  flatZoneRadius = 128,
  terrainMaterial = null,
}) {
  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(chunkSize, chunkSize, resolution, resolution);
    geom.rotateX(-Math.PI / 2);

    const verts = geom.attributes.position.array;
    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    for (let i = 0; i < verts.length; i += 3) {
      // Local vertex positions are relative to chunk center, range [-chunkSize/2, chunkSize/2]
      const localX = verts[i];
      const localZ = verts[i + 2];

      // Global world coordinates
      const worldX = originX + localX;
      const worldZ = originZ + localZ;

      verts[i + 1] = getTerrainHeight(worldX, worldZ, {
        noiseSeed,
        maxHeight,
        flatZoneRadius,
      });
    }

    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();

    return geom;
  }, [cx, cz, chunkSize, resolution, maxHeight, noiseSeed, flatZoneRadius]);

  // World position of chunk center
  const posX = cx * chunkSize;
  const posZ = cz * chunkSize;

  // Default material fallback (simple green, should not normally be used)
  const fallbackMaterial = useMemo(() => {
    if (terrainMaterial) return null;
    return new THREE.MeshStandardMaterial({
      color: "#4a7a3a",
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
  }, [terrainMaterial]);

  return (
    <RigidBody type="fixed" colliders="trimesh" position={[posX, 0, posZ]}>
      <mesh
        geometry={geometry}
        material={terrainMaterial || fallbackMaterial}
        receiveShadow
        castShadow
      />
    </RigidBody>
  );
}

export default React.memo(TerrainChunk);
