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
  useFrame(() => {
    if (!scene.fog) return;
    const s = settingsRef.current || {};

    // 从 store 读取内部时间（非响应式，不会导致 rerender）
    const tNow = useGameStore.getState().getTimeInternal?.() ?? useGameStore.getState().time.currentTime;
    const t = (tNow % 24) / 24;
    const dayFactor = Math.max(0, Math.min(1, Math.sin(t * Math.PI * 2) * 0.5 + 0.5));

    const dayColor = new THREE.Color(s.hazeColorDay || s.fogColor || '#b8c7d6');
    const nightColor = new THREE.Color(s.hazeColorNight || '#0b1320');
    scene.fog.color.copy(nightColor).lerp(dayColor, dayFactor);

    if (scene.fog.isFogExp2) {
      const dDay = s.hazeDensityDay ?? s.fogDensity ?? 0.0012;
      const dNight = s.hazeDensityNight ?? 0.0028;
      scene.fog.density = THREE.MathUtils.lerp(dNight, dDay, dayFactor);
    } else {
      const viewDistance = s.viewDistance ?? 350;
      scene.fog.near = s.hazeNear ?? s.fogNear ?? 10;
      scene.fog.far = s.hazeFar ?? viewDistance;
    }
  });

  // 这是一个逻辑组件，不渲染任何内容
  return null;
}

export default FogRenderer;