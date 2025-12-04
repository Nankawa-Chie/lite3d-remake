import React, {useMemo, useEffect, useRef} from "react";
import {RigidBody, MeshCollider} from "@react-three/rapier";
import * as THREE from "three";
import {Noise} from "noisejs";
import {useLoader} from "@react-three/fiber";

// 导入着色器
import vertexShader from "../../shaders/terrain/vertex.glsl?raw";
import fragmentShader from "../../shaders/terrain/fragment.glsl?raw";

/**
 * @name BlendedTerrain
 * @description 使用混合纹理的高级程序化地形系统
 *
 * 核心特性：
 * - 基于高度的纹理混合（沙子 < 草地 < 岩石 < 雪）
 * - 坡度修正的岩石分布
 * - 平滑的纹理过渡
 * - 自定义Shader实现的简化AO效果
 * - 精确的物理碰撞体
 *
 * @param {object} props - 传递给 useTrimesh 的cannon属性
 * @returns {JSX.Element} 混合纹理地形网格
 */
function BlendedTerrain({terrainParams, ...cannonProps}) {
  const meshRef = useRef(); // ✅ 合併 terrainRef 和 shaderRef 為一個 ref

  // 地形参数
  const terrainSize = 1024;
  const terrainResolution = 1024; // 提高分辨率以获得更好的纹理混合效果(cannon最高254舒適區64，rapier最高2876舒適區192)
  const flatZoneSize = 256;
  const maxHeight = 32;

  // 默认纹理混合参数
  const defaultParams = {
    sandHeight: -6, // 沙子：更低海拔（解决沙子下面岩石问题）
    grassHeight: 1, // 草地：中低海拔
    rockHeight: 12, // 岩石：中高海拔
    snowHeight: 21, // 雪：高海拔
    blendSharpness: 8, // 混合锐度（略高于rockHeight，基于小希的数学发现）
    textureScale: 10, // 纹理缩放
  };

  // 合并外部参数和默认参数
  const textureParams = {...defaultParams, ...terrainParams};

  // 加载所有纹理
  const [
    sandColor,
    sandNormal,
    sandRoughness,
    grassColor,
    grassNormal,
    grassRoughness,
    rockColor,
    rockNormal,
    rockRoughness,
    snowColor,
    snowNormal,
    snowRoughness,
  ] = useLoader(THREE.TextureLoader, [
    // 沙子纹理
    "/assets/terrain/textures/sand/Ground054_1K-PNG_Color.png",
    "/assets/terrain/textures/sand/Ground054_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/sand/Ground054_1K-PNG_Roughness.png",

    // 草地纹理
    "/assets/terrain/textures/grass/Ground037_1K-PNG_Color.png",
    "/assets/terrain/textures/grass/Ground037_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/grass/Ground037_1K-PNG_Roughness.png",

    // 岩石纹理
    "/assets/terrain/textures/rock/Rock058_1K-PNG_Color.png",
    "/assets/terrain/textures/rock/Rock058_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/rock/Rock058_1K-PNG_Roughness.png",

    // 雪纹理
    "/assets/terrain/textures/snow/Snow010A_1K-PNG_Color.png",
    "/assets/terrain/textures/snow/Snow010A_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/snow/Snow010A_1K-PNG_Roughness.png",
  ]);

  /**
   * @description 生成地形几何体和物理数据
   */
  const {geometry, vertices, indices} = useMemo(() => {
    const noise = new Noise(Math.random());

    // 创建基础平面几何体
    const geom = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainResolution, terrainResolution);
    geom.rotateX(-Math.PI / 2);

    const verts = geom.attributes.position.array;

    // 生成高度数据（可视用）
    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i];
      const z = verts[i + 2];

      const distanceFromCenter = Math.sqrt(x * x + z * z);
      const flatZoneRadius = flatZoneSize / 2;
      let height = 0;

      if (distanceFromCenter > flatZoneRadius) {
        // 多层噪声组合
        const noiseScale = 0.008;
        const noiseValue1 = noise.perlin2(x * noiseScale, z * noiseScale);
        const noiseValue2 = noise.perlin2(x * noiseScale * 2.5, z * noiseScale * 2.5) * 0.4;
        const noiseValue3 = noise.perlin2(x * noiseScale * 6, z * noiseScale * 6) * 0.15;
        const combinedNoise = noiseValue1 + noiseValue2 + noiseValue3;

        // 平滑过渡
        const transitionZone = 40;
        const transitionFactor = Math.min(1, (distanceFromCenter - flatZoneRadius) / transitionZone);

        height = combinedNoise * maxHeight * transitionFactor;
      }

      verts[i + 1] = height;
    }

    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();

    return {geometry: geom, vertices: verts, indices: geom.index?.array};
  }, [terrainSize, terrainResolution, flatZoneSize, maxHeight]);

  // 只創建一次 ShaderMaterial 實例
  const terrainMaterial = useMemo(() => {
    // 創建時，uniforms 的 value 可以是 null，我們稍後會更新它們
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        // 纹理uniforms
        sandColor: {value: null},
        sandNormal: {value: null},
        sandRoughness: {value: null},

        grassColor: {value: null},
        grassNormal: {value: null},
        grassRoughness: {value: null},

        rockColor: {value: null},
        rockNormal: {value: null},
        rockRoughness: {value: null},

        snowColor: {value: null},
        snowNormal: {value: null},
        snowRoughness: {value: null},

        // 混合参数uniforms
        sandHeight: {value: textureParams.sandHeight},
        grassHeight: {value: textureParams.grassHeight},
        rockHeight: {value: textureParams.rockHeight},
        snowHeight: {value: textureParams.snowHeight},
        blendSharpness: {value: textureParams.blendSharpness},
        textureScale: {value: textureParams.textureScale},
      },
      side: THREE.DoubleSide,
    });
  }, [vertexShader, fragmentShader]); // 依賴項是 shader 代碼，它們基本不變

  /**
   * @description 關鍵的 Effect Hook：負責更新材質的 Uniforms
   */
  useEffect(() => {
    // 將所有紋理和它們在 uniform 中的名字對應起來
    const textureMap = {
      sandColor,
      sandNormal,
      sandRoughness,
      grassColor,
      grassNormal,
      grassRoughness,
      rockColor,
      rockNormal,
      rockRoughness,
      snowColor,
      snowNormal,
      snowRoughness,
    };

    const material = meshRef.current?.material;
    if (!material) return; // 如果材質還沒準備好，則退出

    let allTexturesLoaded = true;

    // 遍歷並更新所有紋理 uniforms
    for (const key in textureMap) {
      const texture = textureMap[key];
      if (texture && texture.isTexture) {
        // 確保它是一個有效的紋理對象
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material.uniforms[key].value = texture;
      } else {
        // 如果任何一個紋理還未加載（初始為 undefined），則標記為未完成
        allTexturesLoaded = false;
      }
    }

    // 每次參數變化時，更新非紋理的 uniforms
    material.uniforms.sandHeight.value = textureParams.sandHeight;
    material.uniforms.grassHeight.value = textureParams.grassHeight;
    material.uniforms.rockHeight.value = textureParams.rockHeight;
    material.uniforms.snowHeight.value = textureParams.snowHeight;
    material.uniforms.blendSharpness.value = textureParams.blendSharpness;
    material.uniforms.textureScale.value = textureParams.textureScale;

    // 關鍵！如果所有紋理都已加載，我們需要手動通知材質需要更新。
    // 這會解決紋理異步加載完成後，畫面不更新的問題。
    if (allTexturesLoaded) {
      material.needsUpdate = true;
    }
  }, [
    // 依賴項數組：當任何一個紋理對象或參數對象發生變化時，此 effect 會重新運行
    sandColor,
    sandNormal,
    sandRoughness,
    grassColor,
    grassNormal,
    grassRoughness,
    rockColor,
    rockNormal,
    rockRoughness,
    snowColor,
    snowNormal,
    snowRoughness,
    textureParams,
    terrainMaterial, // 將材質本身也作為依賴項
  ]);

  // 使用 Rapier 的三角网格碰撞体，直接基于 mesh 生成 collider（回滚到原实现）
  return (
    <RigidBody type="fixed" colliders="trimesh">
      <mesh ref={meshRef} geometry={geometry} material={terrainMaterial} receiveShadow castShadow />
    </RigidBody>
  );
}

export default BlendedTerrain;
