import React, {useMemo, useRef} from "react";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";

/**
 * CloudDome
 *
 * A large semi-transparent sphere with procedural cloud texture.
 * Slowly rotates to give a sense of atmospheric movement.
 *
 * Uses canvas-based procedural noise (Perlin-like) to generate realistic
 * fluffy clouds, not blocky Minecraft-style clouds.
 */
export default function CloudDome({
  radius = 480,
  segments = 48,
  cloudOpacity = 0.6,
  cloudCoverage = 0.45,      // 0-1: how much of sky is covered by clouds
  cloudSharpness = 3,        // higher = sharper cloud edges
  rotationSpeed = 0.00008,   // radians per frame (very slow)
  baseColor = "#ffffff",
  tintColor = "#f5f8ff",     // Slight blue tint
}) {
  const meshRef = useRef();

  // Generate procedural cloud texture
  const cloudTexture = useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // Simple multi-octave Perlin-like noise (canvas-based for speed)
    const noise = (x, y, scale, octaves = 4) => {
      let total = 0;
      let freq = scale;
      let amp = 1;
      let maxAmp = 0;

      for (let i = 0; i < octaves; i++) {
        // Use Math.sin-based pseudo-noise (cheap but looks decent at small scale)
        const nx = x * freq;
        const ny = y * freq;
        const val =
          (Math.sin(nx * 0.31 + ny * 0.47 + i * 7.3) +
           Math.sin(nx * 0.53 - ny * 0.29 + i * 11.7) +
           Math.sin(-nx * 0.37 + ny * 0.61 + i * 13.1)) / 3;

        total += val * amp;
        maxAmp += amp;

        freq *= 2.1;
        amp *= 0.45;
      }

      return total / maxAmp; // Normalize to [-1, 1]
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Normalized coords
        const u = x / size;
        const v = y / size;

        // Generate cloud density
        let cloudDensity = noise(u, v, 3.5, 5); // Range [-1, 1]
        cloudDensity = cloudDensity * 0.5 + 0.5; // Remap to [0, 1]

        // Apply coverage threshold with soft falloff
        const threshold = 1 - cloudCoverage;
        cloudDensity = Math.max(0, (cloudDensity - threshold) / (1 - threshold));
        cloudDensity = Math.pow(cloudDensity, 1 / cloudSharpness); // Soften edges

        // Add some variation (lighter/darker clouds)
        const variation = noise(u * 2.3, v * 2.3, 5, 3) * 0.5 + 0.5;
        const brightness = THREE.MathUtils.lerp(0.85, 1.0, variation);

        // RGB: white-ish clouds
        const rgb = Math.floor(brightness * 255);
        data[i] = rgb;
        data[i + 1] = rgb;
        data[i + 2] = Math.floor(rgb * 1.02); // Slight blue tint

        // Alpha: cloud density
        data[i + 3] = Math.floor(cloudDensity * cloudOpacity * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
  }, [cloudOpacity, cloudCoverage, cloudSharpness]);

  // Material
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 1,
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false,
      fog: false, // Clouds shouldn't be affected by scene fog
      color: new THREE.Color(tintColor),
    });
  }, [cloudTexture, tintColor]);

  // Slow rotation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += rotationSpeed * (delta * 60); // Normalize to ~60fps
    }
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[radius, segments, segments]} />
    </mesh>
  );
}
