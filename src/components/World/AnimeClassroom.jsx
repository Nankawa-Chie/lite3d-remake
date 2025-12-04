import React, {useMemo} from "react";
import {useGLTF, useTexture} from "@react-three/drei";
import * as THREE from "three";

/**
 * @name JapaneseChart
 * @description 在教室場景中渲染五十音圖表板的內部組件。
 * 它會加載指定的 SVG 紋理並將其應用到一個平面網格上，模擬教室黑板或海報。
 * @returns {JSX.Element}
 */
function JapaneseChart() {
  // 使用 useTexture 鉤子加載你提供的 Gojuon.svg 紋理。
  const chartTexture = useTexture("/assets/plantuml/Gojuon.svg");

  // 確保紋理使用正確的色彩空間以獲得最佳顯示效果。
  chartTexture.encoding = THREE.sRGBEncoding;
  // SVG 紋理可能需要翻轉 Y 軸才能正確顯示，這是一個常見的設置。
  chartTexture.flipY = false;

  return (
    <mesh
      position={[4.42, 1.95, 11]} // 將圖表定位在教室前方的黑板位置
      rotation={[Math.PI, Math.PI, 0]}
      scale={[2.2, 2.2, 1]} // 微調了高度以更好地適應SVG的長寬比
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        map={chartTexture}
        metalness={0.05} // 給予一點點金屬質感，模擬黑板框架
        roughness={0.7} // 較高的粗糙度，使其看起來不那麼光滑
        side={THREE.DoubleSide} // 渲染雙面以防穿模
        transparent={true} // 啟用透明度，以正確顯示SVG的透明背景
      />
    </mesh>
  );
}

/**
 * @name McArmorChart
 * @description 在教室場景中渲染 Minecraft 傷害機制圖表的內部組件。
 * 它會加載指定的 SVG 紋理並將其應用到一個平面網格上。
 * @returns {JSX.Element}
 */
function McArmorChart() {
  // 加載 Minecraft 傷害機制 SVG 紋理
  const chartTexture = useTexture("/assets/plantuml/MC伤害机制.svg");

  // 設置紋理屬性
  chartTexture.encoding = THREE.sRGBEncoding;
  chartTexture.flipY = false;

  return (
    <mesh
      position={[-91.6, 6, -60]} // 與日語圖表位置類似，但 Z 軸向後移動 2 個單位
      rotation={[Math.PI, -Math.PI / 2, 0]}
      scale={[5.5, 1, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial map={chartTexture} metalness={0.05} roughness={0.7} side={THREE.DoubleSide} transparent={true} />
    </mesh>
  );
}

/**
 * @name AnimeClassroom
 * @description 加載並展示“動漫風格教室”GLB模型的組件，並內置了學習圖表。
 * 該組件遵循了項目中既定的高效加載模式：
 * - **模型加載**: 使用 `@react-three/drei` 的 `useGLTF` 輔助函數來加載模型，並利用其內置的緩存機制。
 * - **性能優化**: 通過 `useMemo` 鉤子來緩存場景處理的結果。這確保了遍歷和修改模型屬性的操作只在模型初次加載時執行一次，避免了不必要的重複計算。
 * - **安全操作**: `scene.clone()` 創建了場景的一個副本進行操作，這可以保護全局緩存中的原始模型不受影響，確保了組件在多處使用時的獨立性。
 * - **視覺集成**: 遍歷模型的所有網格（Mesh），為其統一啟用投射和接收陰影的屬性，使其能與 `GameScene` 中的光照系統完美融合。同時，對材質進行了微調，以獲得更好的視覺效果。
 * - **內容擴展**: 內部集成了 `JapaneseChart` 和 `McArmorChart` 組件，將2D學習內容無縫融入3D環境。
 *
 * @param {object} props - 傳遞給 `group` 元素的標準屬性，例如 position, scale, rotation 等。
 * @returns {JSX.Element}
 */
export default function AnimeClassroom(props) {
  // Load the GLB model using drei's helper.
  // It automatically handles loading states and caching.
  const {scene} = useGLTF("/assets/models/anime_class_room.glb");

  // Memoize the processed scene to prevent re-computation on every render.
  const modifiedScene = useMemo(() => {
    // Clone the scene to avoid altering the cached version from useGLTF.
    const clonedScene = scene.clone();

    // Traverse through all the objects in the cloned scene.
    clonedScene.traverse((child) => {
      // Check if the current object is a mesh.
      if (child.isMesh) {
        // Enable casting and receiving shadows for realistic lighting.
        child.castShadow = true;
        child.receiveShadow = true;

        // Adjust material properties for a better look.
        if (child.material) {
          // Ensure we handle both single and multi-material meshes.
          const materials = Array.isArray(child.material) ? child.material : [child.material];

          materials.forEach((material) => {
            if (material.isMeshStandardMaterial) {
              // Reduce metallic properties unless it's meant to be metal.
              material.metalness = 0.1;
              // Increase roughness for a more matte, less glossy finish.
              material.roughness = 0.8;

              // If the material has a texture map, ensure correct color space.
              if (material.map) {
                material.map.encoding = THREE.sRGBEncoding;
              }

              // Mark the material as needing an update.
              material.needsUpdate = true;
            }
          });
        }
      }
    });

    return clonedScene;
  }, [scene]); // This effect re-runs only if the original 'scene' object changes.

  // Render the classroom and the charts inside a group.
  // This allows us to position them together in the main scene.
  return (
    <group {...props}>
      <primitive object={modifiedScene} />
      <JapaneseChart />
      <McArmorChart />
    </group>
  );
}

// Preload the model and textures for a smoother user experience.
useGLTF.preload("/assets/models/anime_class_room.glb");
useTexture.preload("/assets/plantuml/Gojuon.svg");
useTexture.preload("/assets/plantuml/MC伤害机制.svg");
