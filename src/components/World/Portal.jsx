import React, {useEffect, useMemo, useRef, useState} from "react";
import * as THREE from "three";
import {useFrame} from "@react-three/fiber";
import {Text, useTexture} from "@react-three/drei";

/**
 * Portal
 * - Lightweight clickable portal object for external links.
 * - Uses refs + useFrame for animation (no per-frame React state updates).
 */
export default function Portal({
  url,
  label,
  iconUrl,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  radius = 0.75,
  ringTube = 0.085,
  onProximityActive = false,
}) {
  const groupRef = useRef();
  const ringRef = useRef();
  // Hover is disabled for now (KeyE-only interaction). Keep state for potential future re-enable.
  const [hovered, setHovered] = useState(false);

  const iconTex = useTexture(iconUrl);
  useMemo(() => {
    if (!iconTex) return;
    iconTex.colorSpace = THREE.SRGBColorSpace;
    iconTex.anisotropy = 8;
    iconTex.needsUpdate = true;
  }, [iconTex]);

  const {panelGeo, iconGeo, bgMat, borderMat, iconMat, labelColor} = useMemo(() => {
    // Main panel: rounded rectangle (simplified as plane for now)
    const panelGeo = new THREE.PlaneGeometry(radius * 2.2, radius * 2.6);
    const iconGeo = new THREE.PlaneGeometry(radius * 1.2, radius * 1.2);

    // Semi-transparent dark background with subtle glow
    const bgMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0d1419"),
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
      emissive: new THREE.Color("#0a1820"),
      emissiveIntensity: 0.3,
    });

    // Glowing border (slightly larger plane behind)
    const borderMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#3dd7ff"),
      transparent: true,
      opacity: 0.6,
    });

    const iconMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.95,
    });

    return {
      panelGeo,
      iconGeo,
      bgMat,
      borderMat,
      iconMat,
      labelColor: "#e8f4fb",
    };
  }, [radius]);

  // Apply icon texture once available
  useMemo(() => {
    if (iconMat && iconTex) {
      iconMat.map = iconTex;
      iconMat.needsUpdate = true;
    }
  }, [iconMat, iconTex]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const t = performance.now() * 0.001;

    // Gentle floating animation
    groupRef.current.position.y = position[1] + Math.sin(t * 0.8) * 0.05;

    // Border glow pulse
    if (ringRef.current?.material) {
      const pulse = 0.6 + Math.sin(t * 2.5) * 0.3;
      const activeBoost = onProximityActive ? 0.4 : 0.0;
      const hoverBoost = hovered ? 0.3 : 0.0;
      ringRef.current.material.opacity = pulse + activeBoost + hoverBoost;
    }

    // Subtle scale on hover
    const targetScale = hovered ? scale * 1.08 : scale;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 8);
  });

  useEffect(() => {
    return () => {
      // Restore cursor in case we unmount while hovered
      if (document?.body) document.body.style.cursor = "default";
    };
  }, []);

  // NOTE: opening is handled by SocialPortals (KeyE) to avoid mouse interaction.
  // Keeping url prop for future optional click support.
  const open = () => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={1}>
      {/* Glowing border (back layer) */}
      <mesh ref={ringRef} geometry={panelGeo} material={borderMat} position={[0, 0, -0.005]} scale={[1.03, 1.03, 1]} />

      {/* Main panel background */}
      <mesh geometry={panelGeo} material={bgMat} position={[0, 0, 0]} />

      {/* Icon */}
      <mesh geometry={iconGeo} material={iconMat} position={[0, 0.25, 0.01]} />

      {/* Label */}
      <Text
        position={[0, -0.4, 0.01]}
        fontSize={0.18}
        color={labelColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#05121a"
        fontWeight={600}
      >
        {label}
      </Text>

      {/* Subtitle (URL domain) */}
      {url && (
        <Text
          position={[0, -0.65, 0.01]}
          fontSize={0.1}
          color="#7ba8c4"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.005}
          outlineColor="#05121a"
        >
          {new URL(url).hostname.replace("www.", "")}
        </Text>
      )}

      {/* Proximity hint */}
      {onProximityActive && (
        <Text
          position={[0, -0.85, 0.02]}
          fontSize={0.12}
          color="#3dd7ff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#05121a"
        >
          Press E to Open
        </Text>
      )}

      {/* Invisible hit area (larger for easier aiming) */}
      <mesh position={[0, 0, 0.02]} visible={false}>
        <planeGeometry args={[radius * 2.2, radius * 2.6]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}
