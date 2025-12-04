// src/components/World/Garden.jsx (使用 useEffect 加载的测试版)
import React, {useState, useEffect} from "react";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";

export default function Garden(props) {
  const [scene, setScene] = useState(null);

  useEffect(() => {
    // 创建一个新的加载器，不使用 useGLTF 的缓存
    new GLTFLoader().load("src/assets/models/garden_v1.glb", (gltf) => {
      const loadedScene = gltf.scene;
      loadedScene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      setScene(loadedScene);
    });
  }, []); // 空依赖数组确保只加载一次

  // 如果模型还没加载好，就不渲染任何东西
  if (!scene) {
    return null;
  }

  // 依然使用 group 包裹法
  return (
    <group {...props}>
      <primitive object={scene} />
    </group>
  );
}
