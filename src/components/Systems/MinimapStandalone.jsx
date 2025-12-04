import React, { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import useGameStore from "../../stores/gameStore";
import { PERFORMANCE_CONFIG } from "../../config/PerformanceConfig";

function MinimapContent({ playerRef }) {
  const { camera, invalidate } = useThree();
  const minimapSettings = useGameStore((state) => state.settings.minimap);
  const { viewRange, height: cameraHeight, zoom } = minimapSettings;

  // Simple background quad (top-down square)
  const bg = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ color: 0x0b0f14, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }, []);

  // Player marker: small triangle/arrow
  const playerArrowRef = useRef();
  const arrowGeom = useMemo(() => new THREE.ConeGeometry(0.06, 0.2, 8), []);
  const arrowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x00ff88 }), []);

  useFrame((_, delta) => {
    if (!playerRef.current) return;
    const pos = playerRef.current.position;
    if (!pos || !Array.isArray(pos)) return;

    // Update camera top-down
    camera.position.set(pos[0], pos[1] + cameraHeight, pos[2]);
    camera.up.set(0, 0, -1);
    camera.lookAt(new THREE.Vector3(pos[0], pos[1], pos[2]));

    // Update background to cover viewRange
    const effectiveRange = viewRange / zoom;
    bg.scale.set(effectiveRange, effectiveRange, 1);
    if (bg.parent === null) camera.add(bg); // attach once

    // Update player marker in local space of scene
    if (playerArrowRef.current) {
      playerArrowRef.current.position.set(pos[0], pos[1] + 0.1, pos[2]);
      const rotY = playerRef.current.getRotation ? playerRef.current.getRotation() : 0;
      playerArrowRef.current.rotation.set(-Math.PI / 2, 0, -rotY);
    }

    // Demand render only when needed
    invalidate();
  });

  return (
    <group>
      <mesh geometry={arrowGeom} material={arrowMat} ref={playerArrowRef} />
    </group>
  );
}

export default function MinimapStandalone({ playerRef, size = 180 }) {
  const minimapSettings = useGameStore((state) => state.settings.minimap);
  const { enabled } = minimapSettings;
  if (!enabled) return null;
  return (
    <Canvas
      orthographic
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, stencil: false, depth: true }}
      camera={{ zoom: 100, near: 0.1, far: 2000, position: [0, 10, 0] }}
      frameloop="demand"
      style={{ width: size, height: size }}
    >
      <MinimapContent playerRef={playerRef} />
    </Canvas>
  );
}
