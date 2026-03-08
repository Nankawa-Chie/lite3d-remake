import React, {useRef} from "react";
import {useFrame, useThree} from "@react-three/fiber";

/**
 * DistanceCull
 *
 * Wraps children in a group that becomes invisible when the camera is
 * farther than `maxDistance` from `origin` (world coords).
 *
 * Uses refs + useFrame to avoid any React re-renders.
 * When invisible, the GPU skips all draw calls for the subtree.
 *
 * Props:
 *   origin       - [x, y, z] world position to measure distance from (default [0,0,0])
 *   maxDistance   - hide when camera is farther than this (default 80)
 *   hysteresis    - extra distance before re-showing (prevents flicker at boundary)
 *   playerRef    - optional: use player position instead of camera
 */
export default function DistanceCull({
  children,
  origin = [0, 0, 0],
  maxDistance = 80,
  hysteresis = 5,
  playerRef = null,
}) {
  const groupRef = useRef();
  const wasVisibleRef = useRef(true);
  const lastCheckRef = useRef(0);

  const camera = useThree((s) => s.camera);

  useFrame(() => {
    if (!groupRef.current) return;

    // Throttle to ~10Hz
    const now = performance.now();
    if (now - lastCheckRef.current < 100) return;
    lastCheckRef.current = now;

    // Get reference position (player or camera)
    let refX, refY, refZ;
    const player = playerRef?.current;
    const getPos = player?.getPosition;

    if (getPos) {
      const p = getPos();
      refX = p[0] ?? p.x ?? 0;
      refY = p[1] ?? p.y ?? 0;
      refZ = p[2] ?? p.z ?? 0;
    } else {
      refX = camera.position.x;
      refY = camera.position.y;
      refZ = camera.position.z;
    }

    // Distance from origin
    const dx = refX - origin[0];
    const dy = refY - origin[1];
    const dz = refZ - origin[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Hysteresis: show at maxDistance, hide at maxDistance + hysteresis
    const threshold = wasVisibleRef.current
      ? maxDistance + hysteresis
      : maxDistance;

    const shouldBeVisible = dist <= threshold;

    if (shouldBeVisible !== wasVisibleRef.current) {
      groupRef.current.visible = shouldBeVisible;
      wasVisibleRef.current = shouldBeVisible;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
