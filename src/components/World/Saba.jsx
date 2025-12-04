import React, {useState, useEffect} from "react";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

/**
 * @name SabaCharacter
 * @description 加载并显示 "Saba.glb" 角色模型。
 * [最终修正版：采用 useEffect + GLTFLoader]
 * 此版本放弃了 useGLTF 以完全绕过其缓存机制，解决了 scale 参数无效的问题。
 * 1.  使用 `useEffect` 和原生的 `GLTFLoader` 来加载模型，确保每次获取的都是一个全新的、
 *     独立的场景实例，不受全局缓存影响。
 * 2.  在加载回调中，遍历模型并智能地设置阴影和PBR材质属性。
 * 3.  模型加载后，将其存储在组件的 state 中，触发重渲染。
 * 4.  依然使用 <group {...props}> 来包裹模型，确保 `scale`, `position` 等外部传入的
 *     props 能够被正确和可靠地应用。
 *
 * @param {object} props - 传递给 group 对象的标准属性，如 `position`, `scale`, `rotation`。
 * @returns {JSX.Element | null}
 */
export default function SabaCharacter(props) {
  // 使用 useState 存储加载完成的模型场景
  const [modelScene, setModelScene] = useState(null);

  useEffect(() => {
    // 创建一个新的 GLTFLoader 实例
    const loader = new GLTFLoader();

    // 加载模型
    loader.load(
      "src/assets/models/Saba.glb", // 模型的路径
      (gltf) => {
        // --- 加载成功后的回调函数 ---
        const loadedScene = gltf.scene;

        // 对加载的模型进行遍历和优化
        loadedScene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            const materials = Array.isArray(child.material) ? child.material : [child.material];

            materials.forEach((material) => {
              if (material.isMeshStandardMaterial) {
                const name = material.name.toLowerCase();
                if (name.includes("skin") || name.includes("face")) {
                  material.metalness = 0.0;
                  material.roughness = 0.4;
                } else if (name.includes("hair")) {
                  material.metalness = 0.0;
                  material.roughness = 0.6;
                } else if (name.includes("metal") || name.includes("accessory")) {
                  material.metalness = 1.0;
                  material.roughness = 0.2;
                } else {
                  material.metalness = 0.0;
                  material.roughness = 0.8;
                }
                material.needsUpdate = true;
              }
            });
          }
        });

        // 将处理好的场景存入 state，触发组件的重渲染
        setModelScene(loadedScene);
      },
      undefined, // onProgress 回调，这里我们不需要
      (error) => {
        // --- 加载失败的回调函数 ---
        console.error("加载 Saba.glb 模型时发生错误:", error);
      }
    );
  }, []); // 空依赖数组 `[]` 确保这个 effect 只在组件首次挂载时执行一次

  // 如果模型尚未加载完成，则不渲染任何内容
  if (!modelScene) {
    return null;
  }

  // 使用 group 包裹加载完成的 scene，并应用传入的 props
  // 这一次，scale 和 position 应该会完美生效
  return (
    <group {...props}>
      <primitive object={modelScene} />
    </group>
  );
}
