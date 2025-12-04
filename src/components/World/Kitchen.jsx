import React, {useMemo} from "react";
import {useGLTF} from "@react-three/drei";

/**
 * Kitchen 组件 - 厨房模型
 * 参考 LivingRoom 组件的正确做法
 * @param {Object} props - 组件属性
 * @param {Array} props.position - 位置坐标 [x, y, z]
 * @param {Number|Array} props.scale - 缩放比例
 * @param {Array} props.rotation - 旋转角度 [x, y, z]
 */
export default function Kitchen(props) {
  const {scene} = useGLTF("/src/assets/models/kitchen_v.001.glb");

  // 使用 useMemo 缓存克隆后的场景，避免每次渲染都克隆
  const modifiedScene = useMemo(() => {
    // 深度克隆场景
    const clonedScene = scene.clone(true);
    
    // 遍历所有子对象启用阴影
    clonedScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return clonedScene;
  }, [scene]);

  // 使用 primitive 渲染修改后的场景
  return <primitive object={modifiedScene} {...props} />;
}

// 预加载模型以提升性能
useGLTF.preload("/src/assets/models/kitchen_v.001.glb");
