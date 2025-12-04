import React, {useMemo} from "react";
import {useGLTF} from "@react-three/drei";
import * as THREE from "three";

/**
 * @name StarryNight
 * @description 针对 Tilt Brush 模型优化的加载组件
 */
export default function StarryNight(props) {
  const modelPath = "/assets/models/starry_night.glb"; // 确保路径正确
  const {scene} = useGLTF(modelPath);

  // 这些关键词通常暗示 Tilt Brush 中的发光材质
  const {additiveNameHints = ["glow", "add", "light", "fire", "star"]} = props || {};

  const modifiedScene = useMemo(() => {
    // 克隆场景，避免副作用
    const clonedScene = scene.clone(true);

    clonedScene.traverse((child) => {
      if (child.isMesh && child.material) {
        // Tilt Brush 模型通常不需要投射阴影，因为它是自发光的艺术品
        child.castShadow = false;
        child.receiveShadow = false;

        const materials = Array.isArray(child.material) ? child.material : [child.material];

        const replaced = materials.map((originalMaterial) => {
          // 1. 判断是否应该是发光材质
          const name = (originalMaterial.name || "").toLowerCase();
          const isGlowLike = additiveNameHints.some((hint) => name.includes(hint));

          // 2. 创建 Basic 材质 (不受光照影响，还原画作本色)
          const m = new THREE.MeshBasicMaterial({
            vertexColors: true, // 必须开启，Tilt Brush 颜色主要在顶点里
            side: THREE.DoubleSide,
            transparent: true,
            toneMapped: false, // 关键：关闭色调映射，允许颜色超过 1.0 以产生辉光
          });

          // 3. 【关键修复】必须复制原材质的纹理！否则就是纯色块
          if (originalMaterial.map) m.map = originalMaterial.map;
          if (originalMaterial.alphaMap) m.alphaMap = originalMaterial.alphaMap;

          // 4. 复制基础属性
          if (originalMaterial.color) m.color.copy(originalMaterial.color);
          if (originalMaterial.opacity !== undefined) m.opacity = originalMaterial.opacity;

          // 5. 针对发光与非发光的不同处理
          if (isGlowLike) {
            // === 发光材质 ===
            m.blending = THREE.AdditiveBlending; // 叠加混合，越叠越亮
            m.depthWrite = false; // 不写入深度，避免遮挡
            m.opacity = Math.min(m.opacity, 0.8); // 稍微增加一点透明度让光叠加

            // 【辉光核心】：极大地增强亮度，让后期处理的 Bloom 能捕捉到
            m.color.multiplyScalar(5.0);
          } else {
            // === 普通笔触 ===
            m.blending = THREE.NormalBlending;
            m.depthWrite = true;

            // 【抗锯齿核心】：设置 alphaTest 解决透明边缘穿插导致的“脏”感
            m.alphaTest = 0.5;

            // 普通颜色也稍微提亮一点，还原鲜艳度
            m.color.multiplyScalar(1.2);
          }

          return m;
        });

        child.material = replaced.length === 1 ? replaced[0] : replaced;
      }
    });
    return clonedScene;
  }, [scene, additiveNameHints]);

  return <primitive object={modifiedScene} {...props} />;
}

useGLTF.preload("/assets/models/starry_night.glb");
