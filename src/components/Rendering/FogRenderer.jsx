import React, {useEffect, useRef} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import useGameStore from "../../stores/gameStore";
import * as THREE from "three";

/**
 * @name FogRenderer
 * @description 雾效渲染器
 * 为场景添加雾效以增强深度感和氛围
 * 
 * @param {object} props - 组件属性
 * @param {object} props.settings - 雾效设置
 * @param {boolean} props.enabled - 是否启用雾效
 * @returns {null}
 */
function FogRenderer({settings, enabled = false}) {
  const {scene} = useThree();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // 只在 enable/disable 时创建/移除 fog 实例，避免 settings/time 的高频变化触发重建
  useEffect(() => {
    if (!(enabled && settings.enableFog)) {
      scene.fog = null;
      return;
    }

    const fogType = settings.fogType || 'exp2';
    const initialColor = new THREE.Color(settings.fogColor || '#b8c7d6');

    if (fogType === 'exp2') {
      scene.fog = new THREE.FogExp2(initialColor, settings.fogDensity ?? 0.0012);
    } else {
      scene.fog = new THREE.Fog(initialColor, settings.fogNear ?? 10, settings.fogFar ?? 350);
    }

    return () => {
      if (scene.fog) scene.fog = null;
    };
  }, [scene, enabled, settings.enableFog, settings.fogType]);

  // 每帧命令式更新雾参数（不触发 React rerender）
  // Pre-allocate colors to avoid per-frame GC
  const dayColorRef = useRef(new THREE.Color());
  const nightColorRef = useRef(new THREE.Color());
  const dawnColorRef = useRef(new THREE.Color());
  const targetColorRef = useRef(new THREE.Color());

  useFrame(() => {
    if (!scene.fog) return;
    const s = settingsRef.current || {};

    // 从 store 读取内部时间（非响应式，不会导致 rerender）
    const tNow = useGameStore.getState().getTimeInternal?.() ?? useGameStore.getState().time.currentTime;
    const t = (tNow % 24) / 24;
    const sunAngle = t * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(sunAngle);
    const dayFactor = THREE.MathUtils.smoothstep(sunY, -0.15, 0.35);
    const dawnDuskFactor = Math.max(0, 1 - Math.abs(sunY) * 3);

    // Richer fog colors: blue-purple day → warm orange dawn/dusk → deep blue night
    dayColorRef.current.set(s.hazeColorDay || s.fogColor || '#7ba0c8'); // Blue-purple haze
    nightColorRef.current.set(s.hazeColorNight || '#0a0f1e');          // Deep dark blue
    dawnColorRef.current.set('#c4755a');                                // Warm orange-red for dawn/dusk

    // Blend day color with dawn color based on sun position
    targetColorRef.current.copy(dayColorRef.current).lerp(dawnColorRef.current, dawnDuskFactor * 0.7);
    // Then blend with night
    scene.fog.color.copy(nightColorRef.current).lerp(targetColorRef.current, dayFactor);

    if (scene.fog.isFogExp2) {
      const dDay = s.hazeDensityDay ?? s.fogDensity ?? 0.0015;
      const dNight = s.hazeDensityNight ?? 0.003;
      // Slightly denser fog at dawn/dusk for atmosphere
      const dDawn = dDay * 1.3;
      const baseDensity = THREE.MathUtils.lerp(dNight, dDay, dayFactor);
      scene.fog.density = baseDensity + dawnDuskFactor * (dDawn - dDay) * 0.5;
    } else {
      const viewDistance = s.viewDistance ?? 350;
      scene.fog.near = s.hazeNear ?? s.fogNear ?? 10;
      // Reduce view distance at dawn/dusk for more atmosphere
      const baseFar = s.hazeFar ?? viewDistance;
      scene.fog.far = baseFar - dawnDuskFactor * baseFar * 0.15;
    }
  });

  // 这是一个逻辑组件，不渲染任何内容
  return null;
}

export default FogRenderer;