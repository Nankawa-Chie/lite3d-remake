import {useFrame, useThree} from "@react-three/fiber";

/**
 * CenterAimRaycast
 *
 * Forces R3F's pointer NDC to (0, 0) while pointer-lock is active, so any
 * onPointer* interactions behave like a fixed center crosshair.
 *
 * This fixes the "crosshair interaction turns into mouse pointer interaction
 * after re-render" class of issues, by making the pointer source of truth
 * derived from pointer-lock state every frame.
 */
export default function CenterAimRaycast() {
  const pointer = useThree((s) => s.pointer);
  const raycaster = useThree((s) => s.raycaster);
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    // Pointer-lock is the source of truth for "center aim" mode.
    const locked = !!document.pointerLockElement;
    if (!locked) return;

    pointer.set(0, 0);
    raycaster.setFromCamera(pointer, camera);
  });

  return null;
}
