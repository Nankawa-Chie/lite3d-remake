import React, {useEffect} from "react";
import {useThree} from "@react-three/fiber";
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

  useEffect(() => {
    if (enabled && settings.enableFog) {
      // 创建雾效
      scene.fog = new THREE.Fog(
        new THREE.Color(settings.fogColor || '#ffffff'),
        settings.fogNear || 1,
        settings.fogFar || 100
      );
    } else {
      // 移除雾效
      scene.fog = null;
    }

    // 清理函数
    return () => {
      if (scene.fog) {
        scene.fog = null;
      }
    };
  }, [scene, enabled, settings.enableFog, settings.fogColor, settings.fogNear, settings.fogFar]);

  // 这是一个逻辑组件，不渲染任何内容
  return null;
}

export default FogRenderer;