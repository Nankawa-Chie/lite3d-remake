import React, {useEffect, useMemo, useRef, useState} from "react";
import * as THREE from "three";
import {useFrame} from "@react-three/fiber";
import Portal from "./Portal";

const DEFAULT_PORTALS = [
  {
    key: "youtube",
    label: "YouTube",
    url: "https://www.youtube.com/@nankawachie",
    icon: "/assets/icons/portal_youtube.svg",
  },
  {
    key: "steam",
    label: "Steam",
    url: "https://steamcommunity.com/id/Nankawa-Chie/",
    icon: "/assets/icons/portal_steam.svg",
  },
  {
    key: "discord",
    label: "Discord",
    url: "https://discord.gg/G5zBgTDnwk",
    icon: "/assets/icons/portal_discord.svg",
  },
];

/**
 * SocialPortals
 * - Places a small set of portals.
 * - Optional proximity interaction: if player is within radius, show hint and allow pressing E.
 * - Keeps logic in refs/useFrame to avoid rerenders.
 */
export default function SocialPortals({
  playerRef,
  basePosition = [0, 0, 0],
  rotationY = 0,
  spacing = 1.9,
  proximityRadius = 2.2,
  portals = DEFAULT_PORTALS,
}) {
  const groupRef = useRef();
  const [activeKey, setActiveKey] = useState(null);

  const portalInstances = useMemo(() => {
    // Align on a gentle arc for nicer composition
    const startX = -(portals.length - 1) * 0.5 * spacing;
    return portals.map((p, i) => {
      const x = startX + i * spacing;
      const z = 0;
      const pos = [x, 0, z];
      return {...p, localPosition: pos};
    });
  }, [portals, spacing]);

  // Proximity check (throttled) - avoid per-tick allocations
  const lastCheckRef = useRef(0);
  const playerPosRef = useRef(new THREE.Vector3());
  const worldPosRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const now = performance.now();
    if (now - lastCheckRef.current < 120) return; // ~8Hz
    lastCheckRef.current = now;

    const player = playerRef?.current;
    const getPos = player?.getPosition;
    if (!getPos || !groupRef.current) {
      if (activeKey !== null) setActiveKey(null);
      return;
    }

    const p = getPos();
    playerPosRef.current.set(p[0], p[1], p[2]);

    // Find nearest portal
    let nearestKey = null;
    let nearestDist = Infinity;

    for (const inst of portalInstances) {
      const local = inst.localPosition;
      worldPosRef.current.set(local[0], local[1] + 0.9, local[2]);
      groupRef.current.localToWorld(worldPosRef.current);
      const d = worldPosRef.current.distanceTo(playerPosRef.current);
      if (d < nearestDist) {
        nearestDist = d;
        nearestKey = inst.key;
      }
    }

    if (nearestDist <= proximityRadius) {
      if (activeKey !== nearestKey) setActiveKey(nearestKey);
    } else {
      if (activeKey !== null) setActiveKey(null);
    }
  });

  // Press E to open active portal (guard key-repeat)
  useEffect(() => {
    let lastOpen = 0;
    const onKeyDown = (e) => {
      if (e.code !== "KeyE") return;
      if (!activeKey) return;

      const now = performance.now();
      if (now - lastOpen < 800) return;
      lastOpen = now;

      const inst = portals.find((p) => p.key === activeKey);
      if (!inst?.url) return;
      window.open(inst.url, "_blank", "noopener,noreferrer");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeKey, portals]);

  return (
    <group ref={groupRef} position={basePosition} rotation={[0, rotationY, 0]}>
      {portalInstances.map((p) => (
        <Portal
          key={p.key}
          url={p.url}
          label={p.label}
          iconUrl={p.icon}
          position={p.localPosition}
          onProximityActive={activeKey === p.key}
        />
      ))}
    </group>
  );
}
