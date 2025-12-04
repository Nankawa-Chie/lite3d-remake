import React, {useMemo} from "react";
import {useGLTF} from "@react-three/drei";

/**
 * @name LivingRoom
 * @description 加载并显示“客厅”GLB模型。
 * 此组件遵循了优秀的React Three Fiber实践，在模型加载后，通过遍历其场景图（traverse）
 * 来统一修改所有网格（Mesh）的属性，例如启用阴影和调整基础材质。
 * - **useMemo**: 用于缓存场景的修改结果。这确保了遍历和克隆操作只在
 * 原始 `scene` 对象加载或变化时执行一次，避免了在每次重渲染时不必要的性能开销。
 * - **克隆**: 通过 `scene.clone()` 创建场景副本进行修改，这是一个好习惯，
 * 可以避免直接修改由`useGLTF`维护的全局缓存，从而防止影响此模型在应用中其他地方的实例。
 *
 * @param {object} props - 传递给 `primitive` 对象的标准属性，如 `position`, `scale`, `rotation`。
 * @returns {JSX.Element}
 */
export default function LivingRoom(props) {
  // 使用drei的useGLTF辅助函数加载GLB模型
  const {scene} = useGLTF("/assets/models/cozy_living_room_baked.glb");

  // useMemo 缓存修改后的场景。内部的逻辑只在`scene`对象变化时执行。
  const modifiedScene = useMemo(() => {
    // 克隆场景以避免修改原始缓存模型
    const clonedScene = scene.clone();

    // 遍历克隆后场景中的所有对象
    clonedScene.traverse((child) => {
      // 检查子对象是否是网格（Mesh）
      if (child.isMesh) {
        // 为每个网格启用投射和接收阴影
        child.castShadow = true;
        child.receiveShadow = true;

        // 调整材质属性，使其看起来更像非金属、表面粗糙的材质
        if (child.material) {
          // 处理单个材质和多材质网格的情况
          const materials = Array.isArray(child.material) ? child.material : [child.material];

          materials.forEach((material) => {
            if (material.isMeshStandardMaterial) {
              // 很多家居物品是非金属的
              material.metalness = 0.0;
              // 增加粗糙度，减少镜面反射，更符合布料、哑光墙面等质感
              material.roughness = 0.9;
              // 修改材质属性后，建议设置为true以确保更新
              material.needsUpdate = true;
            }
          });
        }
      }
    });
    return clonedScene;
  }, [scene]);

  // 使用primitive对象渲染修改后的场景
  return <primitive object={modifiedScene} {...props} />;
}

// 预加载模型，以便在组件挂载时能更快显示，提升用户体验
useGLTF.preload("/assets/models/cozy_living_room_baked.glb");
