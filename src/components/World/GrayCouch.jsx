import React, {useMemo} from "react";
import {useGLTF} from "@react-three/drei";

/**
 * GrayCouch 组件 - 灰色L型沙发
 * 参考 GrandPiano 组件的正确做法
 * @param {Object} props - 组件属性
 * @param {Array} props.position - 位置坐标 [x, y, z]
 * @param {Number|Array} props.scale - 缩放比例
 * @param {Array} props.rotation - 旋转角度 [x, y, z]
 */
export default function GrayCouch(props) {
  const {scene} = useGLTF("/src/assets/models/gray_l-shaped_couch.glb");

  // 使用 useMemo 缓存克隆后的场景，避免每次渲染都克隆
  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    
    // 遍历场景启用阴影
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    return cloned;
  }, [scene]);

  // 使用 primitive 渲染克隆后的场景
  return <primitive object={clonedScene} {...props} />;
}

// 预加载模型以提升性能
useGLTF.preload("/src/assets/models/gray_l-shaped_couch.glb");
