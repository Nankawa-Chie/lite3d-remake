import React, {useEffect, useMemo, useRef} from "react";
import {RigidBody} from "@react-three/rapier";
import * as THREE from "three";
import {Noise} from "noisejs";
import {useLoader, useThree} from "@react-three/fiber";
import {applyToonishPatchToStandardMaterial, updateToonishUniforms} from "../../utils/ToonishMaterialPatch";
import useGameStore from "../../stores/gameStore";

/**
 * @name BlendedTerrain
 * @description
 * 地形：基于高度/坡度混合四套地表贴图（沙/草/岩/雪）。
 *
 * 阶段2（受光PBR混合）：
 * - 使用 MeshStandardMaterial 进入 three.js 的标准 PBR 管线（方向光/阴影/HDRI/雾/后期自动生效）
 * - 通过 onBeforeCompile 注入自定义贴图混合逻辑（diffuse/roughness/normal）
 *
 * 注意（非常重要）：
 * - WebGL1/部分设备的 fragment sampler 上限通常是 16。
 * - MeshStandardMaterial 自身就会占用不少采样器（envmap/阴影/等）。
 * - 若我们再声明 12 个 sampler（4层 * color/normal/roughness），很容易超限导致 shader 编译失败，
 *   现象就是“地形不可见但碰撞还在”。
 * - 因此这里会根据 renderer 能力自动降级：
 *   - LITE：只混合 4 张 Color（4 samplers），normal/roughness 使用单层（sand）
 *   - FULL：混合 Color + Normal + Roughness（12 samplers）
 */
function BlendedTerrain({terrainParams, ...props}) {
  const meshRef = useRef();
  const {gl} = useThree();
  const renderingSettings = useGameStore((s) => s.settings.rendering);

  // 地形参数
  const terrainSize = 1024;
  const terrainResolution = 1024;
  const flatZoneSize = 256;
  const maxHeight = 32;

  // 默认混合参数
  const defaultParams = {
    sandHeight: -6,
    grassHeight: 1,
    rockHeight: 12,
    snowHeight: 21,
    blendSharpness: 8,
    textureScale: 10,

    // 调试：打印 shader 源码（默认关闭）
    debugTerrainShader: false,
  };

  const textureParams = {...defaultParams, ...terrainParams};

  // 能力检测：WebGL1 或 maxTextures 较低时，启用 LITE 混合避免 sampler 超限
  const maxTextures = gl?.capabilities?.maxTextures ?? 16;
  const isWebGL2 = gl?.capabilities?.isWebGL2 ?? false;
  const useLiteMix = !isWebGL2 || maxTextures <= 16;

  // 加载贴图（默认 NormalGL / Roughness / Color）
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
    "/assets/terrain/textures/sand/Ground054_1K-PNG_Color.png",
    "/assets/terrain/textures/sand/Ground054_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/sand/Ground054_1K-PNG_Roughness.png",

    "/assets/terrain/textures/grass/Ground037_1K-PNG_Color.png",
    "/assets/terrain/textures/grass/Ground037_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/grass/Ground037_1K-PNG_Roughness.png",

    "/assets/terrain/textures/rock/Rock058_1K-PNG_Color.png",
    "/assets/terrain/textures/rock/Rock058_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/rock/Rock058_1K-PNG_Roughness.png",

    "/assets/terrain/textures/snow/Snow010A_1K-PNG_Color.png",
    "/assets/terrain/textures/snow/Snow010A_1K-PNG_NormalGL.png",
    "/assets/terrain/textures/snow/Snow010A_1K-PNG_Roughness.png",
  ]);

  /**
   * 生成地形几何体
   */
  const geometry = useMemo(() => {
    const noise = new Noise(Math.random());

    const geom = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainResolution, terrainResolution);
    geom.rotateX(-Math.PI / 2);

    const verts = geom.attributes.position.array;

    for (let i = 0; i < verts.length; i += 3) {
      const x = verts[i];
      const z = verts[i + 2];

      const distanceFromCenter = Math.sqrt(x * x + z * z);
      const flatZoneRadius = flatZoneSize / 2;
      let height = 0;

      if (distanceFromCenter > flatZoneRadius) {
        const noiseScale = 0.008;
        const noiseValue1 = noise.perlin2(x * noiseScale, z * noiseScale);
        const noiseValue2 = noise.perlin2(x * noiseScale * 2.5, z * noiseScale * 2.5) * 0.4;
        const noiseValue3 = noise.perlin2(x * noiseScale * 6, z * noiseScale * 6) * 0.15;
        const combinedNoise = noiseValue1 + noiseValue2 + noiseValue3;

        const transitionZone = 40;
        const transitionFactor = Math.min(1, (distanceFromCenter - flatZoneRadius) / transitionZone);
        height = combinedNoise * maxHeight * transitionFactor;
      }

      verts[i + 1] = height;
    }

    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();

    return geom;
  }, [terrainSize, terrainResolution, flatZoneSize, maxHeight]);

  const terrainMaterial = useMemo(() => {
    // 读取 stage4C 远景参数（来自 rendering settings）
    const terrainDistanceFadeStart = renderingSettings?.terrainDistanceFadeStart ?? 120;
    const terrainDistanceFadeEnd = renderingSettings?.terrainDistanceFadeEnd ?? 350;
    const terrainFarTexScale = renderingSettings?.terrainFarTexScale ?? 0.35;
    const terrainFarNormalScale = renderingSettings?.terrainFarNormalScale ?? 0.35;
    const terrainFarRoughnessBoost = renderingSettings?.terrainFarRoughnessBoost ?? 0.35;

    const m = new THREE.MeshStandardMaterial({
      metalness: 0.0,
      roughness: 1.0,
      side: THREE.DoubleSide,
    });

    // 轻微增强法线影响（让地形受光更“立体”一些）
    m.normalScale = new THREE.Vector2(0.9, 0.9);

    // 给底座材质绑定一套贴图，确保 three 启用对应 shader chunks
    m.map = sandColor ?? null;
    m.normalMap = sandNormal ?? null;
    m.roughnessMap = sandRoughness ?? null;

    // 统一：颜色贴图走 sRGB，其他贴图保持 Linear
    if (sandColor) sandColor.colorSpace = THREE.SRGBColorSpace;
    if (grassColor) grassColor.colorSpace = THREE.SRGBColorSpace;
    if (rockColor) rockColor.colorSpace = THREE.SRGBColorSpace;
    if (snowColor) snowColor.colorSpace = THREE.SRGBColorSpace;

    const allTex = [
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
    ].filter(Boolean);

    for (const t of allTex) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }

    // uniforms：按 FULL/LITE 模式分别组织，避免声明未使用 sampler（降低超限风险）
    const uniformsCommon = {
      sandHeight: {value: textureParams.sandHeight},
      grassHeight: {value: textureParams.grassHeight},
      rockHeight: {value: textureParams.rockHeight},
      snowHeight: {value: textureParams.snowHeight},
      blendSharpness: {value: textureParams.blendSharpness},
      textureScale: {value: textureParams.textureScale},

      // stage4C distance LOD
      terrainDistanceFadeStart: {value: terrainDistanceFadeStart},
      terrainDistanceFadeEnd: {value: terrainDistanceFadeEnd},
      terrainFarTexScale: {value: terrainFarTexScale},
      terrainFarNormalScale: {value: terrainFarNormalScale},
      terrainFarRoughnessBoost: {value: terrainFarRoughnessBoost},
    };

    const uniformsLite = {
      sandColor: {value: sandColor},
      grassColor: {value: grassColor},
      rockColor: {value: rockColor},
      snowColor: {value: snowColor},
    };

    const uniformsFull = {
      ...uniformsLite,
      sandNormal: {value: sandNormal},
      sandRoughness: {value: sandRoughness},
      grassNormal: {value: grassNormal},
      grassRoughness: {value: grassRoughness},
      rockNormal: {value: rockNormal},
      rockRoughness: {value: rockRoughness},
      snowNormal: {value: snowNormal},
      snowRoughness: {value: snowRoughness},
    };

    m.userData.blendedTerrainUniforms = {
      ...uniformsCommon,
      ...(useLiteMix ? uniformsLite : uniformsFull),
    };

    m.userData.blendedTerrainMode = useLiteMix ? 'LITE' : 'FULL';

    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, m.userData.blendedTerrainUniforms);
      m.userData._blendedTerrainShader = shader;

      const shouldDebug = !!textureParams.debugTerrainShader;
      const debugPrint = (label, src, maxLines) => {
        if (!shouldDebug) return;
        // eslint-disable-next-line no-console
        console.groupCollapsed(label);
        // eslint-disable-next-line no-console
        console.log(src.split('\n').slice(0, maxLines).map((l, i) => `${String(i + 1).padStart(4, ' ')} | ${l}`).join('\n'));
        // eslint-disable-next-line no-console
        console.groupEnd();
      };

      // Vertex: 输出 world position / world normal / uv
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\n\nvarying vec3 vBtWorldPosition;\nvarying vec3 vBtWorldNormal;\nvarying vec2 vBtUv;`
        )
        .replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>\n\nvBtUv = uv;`
        )
        .replace(
          "#include <worldpos_vertex>",
          `#include <worldpos_vertex>\n\nvBtWorldPosition = worldPosition.xyz;\nvBtWorldNormal = normalize(mat3(modelMatrix) * normal);`
        );

      debugPrint(`[BlendedTerrain] vertexShader (${m.userData.blendedTerrainMode})`, shader.vertexShader, 120);

      // Fragment injection
      const isGLSL3 = shader.fragmentShader.includes('#version 300 es');
      const vQualifier = isGLSL3 ? 'in' : 'varying';
      const sample2D = isGLSL3 ? 'texture' : 'texture2D';

      const samplerDecl = (name) => `uniform sampler2D ${name};`;

      const headerCommon = `
// ---- BlendedTerrain PBR mix injection (${m.userData.blendedTerrainMode}) ----
uniform float sandHeight;
uniform float grassHeight;
uniform float rockHeight;
uniform float snowHeight;
uniform float blendSharpness;
uniform float textureScale;

// Distance-based LOD (stage4C): reduce far detail frequency & shimmer (no extra samplers)
// NOTE: cameraPosition is provided by three.js <common> already; do NOT redeclare it.
uniform float terrainDistanceFadeStart;
uniform float terrainDistanceFadeEnd;
uniform float terrainFarTexScale;
uniform float terrainFarNormalScale;
uniform float terrainFarRoughnessBoost;

${vQualifier} vec3 vBtWorldPosition;
${vQualifier} vec3 vBtWorldNormal;
${vQualifier} vec2 vBtUv;

float _bt_heightBlend(float height, float targetHeight, float blendRange) {
  float distance = abs(height - targetHeight);
  return 1.0 - smoothstep(0.0, blendRange, distance);
}

float _bt_slopeFactor(vec3 worldNormal) {
  return 1.0 - abs(dot(normalize(worldNormal), vec3(0.0, 1.0, 0.0)));
}

vec4 _bt_sampleColor(sampler2D tex, vec2 uv) {
  return ${sample2D}(tex, uv);
}

void _bt_weights(float height, vec3 worldNormal, out float wSand, out float wGrass, out float wRock, out float wSnow) {
  float slope = _bt_slopeFactor(worldNormal);

  wSand = _bt_heightBlend(height, sandHeight, blendSharpness);
  wGrass = _bt_heightBlend(height, grassHeight, blendSharpness);
  wRock = _bt_heightBlend(height, rockHeight, blendSharpness);
  wSnow = _bt_heightBlend(height, snowHeight, blendSharpness);

  // 坡度修正：越陡越偏岩石
  wRock = mix(wRock, 1.0, slope * 0.6);

  float total = wSand + wGrass + wRock + wSnow;
  if (total > 0.0) {
    wSand /= total;
    wGrass /= total;
    wRock /= total;
    wSnow /= total;
  }
}
`;

      const headerLite = `
${samplerDecl('sandColor')}
${samplerDecl('grassColor')}
${samplerDecl('rockColor')}
${samplerDecl('snowColor')}
`;

      const headerFull = `
${headerLite}
${samplerDecl('sandNormal')}
${samplerDecl('sandRoughness')}
${samplerDecl('grassNormal')}
${samplerDecl('grassRoughness')}
${samplerDecl('rockNormal')}
${samplerDecl('rockRoughness')}
${samplerDecl('snowNormal')}
${samplerDecl('snowRoughness')}

float _bt_sampleRough(sampler2D tex, vec2 uv) {
  return ${sample2D}(tex, uv).r;
}

vec3 _bt_sampleNormalGL(sampler2D tex, vec2 uv) {
  vec3 n = ${sample2D}(tex, uv).xyz * 2.0 - 1.0;
  return normalize(n);
}
`;

      const injectedHeader = headerCommon + (useLiteMix ? headerLite : headerFull);

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>\n${injectedHeader}`
      );

      // 在 main() 一开始就计算一次混合权重与 btUv，保证后续 chunk 可复用
      shader.fragmentShader = shader.fragmentShader.replace(
        "void main() {",
        `void main() {\nfloat wSand; float wGrass; float wRock; float wSnow;\n\n// Distance fade: 0=near, 1=far\nfloat btDist = distance(cameraPosition, vBtWorldPosition);\nfloat btFarT = smoothstep(terrainDistanceFadeStart, terrainDistanceFadeEnd, btDist);\n\n// Near uses original textureScale; far uses reduced frequency (bigger patches)
float btScale = mix(textureScale, textureScale * max(0.01, terrainFarTexScale), btFarT);\nvec2 btUv = vBtUv * btScale;\n\n_bt_weights(vBtWorldPosition.y, vBtWorldNormal, wSand, wGrass, wRock, wSnow);\n`
      );

      // 覆盖 BaseColor
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
// --- blended baseColor ---
vec3 cSand = _bt_sampleColor(sandColor, btUv).rgb;
vec3 cGrass = _bt_sampleColor(grassColor, btUv).rgb;
vec3 cRock = _bt_sampleColor(rockColor, btUv).rgb;
vec3 cSnow = _bt_sampleColor(snowColor, btUv).rgb;

vec3 blendedColor = cSand * wSand + cGrass * wGrass + cRock * wRock + cSnow * wSnow;

#ifdef USE_MAP
  diffuseColor.rgb *= blendedColor;
#else
  diffuseColor.rgb = blendedColor;
#endif
`
      );

      if (!useLiteMix) {
        // FULL：覆盖 roughnessFactor（远处额外增加粗糙度，减少高光噪点）
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          `
// --- blended roughness ---
float rSand = _bt_sampleRough(sandRoughness, btUv);
float rGrass = _bt_sampleRough(grassRoughness, btUv);
float rRock = _bt_sampleRough(rockRoughness, btUv);
float rSnow = _bt_sampleRough(snowRoughness, btUv);

float blendedRoughness = rSand * wSand + rGrass * wGrass + rRock * wRock + rSnow * wSnow;
blendedRoughness = clamp(blendedRoughness + terrainFarRoughnessBoost * btFarT, 0.0, 1.0);
roughnessFactor *= blendedRoughness;
`
        );

        // FULL：覆盖 normal map（blended tangent-space normal）
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <normal_fragment_maps>",
          `
#ifdef USE_NORMALMAP
  vec3 nSand = _bt_sampleNormalGL(sandNormal, btUv);
  vec3 nGrass = _bt_sampleNormalGL(grassNormal, btUv);
  vec3 nRock = _bt_sampleNormalGL(rockNormal, btUv);
  vec3 nSnow = _bt_sampleNormalGL(snowNormal, btUv);

  vec3 mapN = normalize(nSand * wSand + nGrass * wGrass + nRock * wRock + nSnow * wSnow);
  // distance-based normal reduction (less shimmer)
  mapN.xy *= normalScale * mix(1.0, terrainFarNormalScale, btFarT);
  normal = perturbNormal2Arb(-vViewPosition, normal, mapN, faceDirection);
#endif
`
        );
      }

      debugPrint(`[BlendedTerrain] fragmentShader AFTER injection (${m.userData.blendedTerrainMode})`, shader.fragmentShader, 220);
    };

    // 白名单：地形材质应用 toon-ish patch（不会影响 VRM/MToon）
    applyToonishPatchToStandardMaterial(m, renderingSettings);

    return m;
  }, [
    renderingSettings?.terrainDistanceFadeStart,
    renderingSettings?.terrainDistanceFadeEnd,
    renderingSettings?.terrainFarTexScale,
    renderingSettings?.terrainFarNormalScale,
    renderingSettings?.terrainFarRoughnessBoost,

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
    textureParams.sandHeight,
    textureParams.grassHeight,
    textureParams.rockHeight,
    textureParams.snowHeight,
    textureParams.blendSharpness,
    textureParams.textureScale,
    textureParams.debugTerrainShader,
    useLiteMix,
  ]);

  // 当参数变化时，更新 uniforms
  useEffect(() => {
    // toon-ish uniforms update
    if (meshRef.current?.material) {
      updateToonishUniforms(meshRef.current.material, renderingSettings);
    }
    const material = meshRef.current?.material;
    if (!material?.userData?.blendedTerrainUniforms) return;

    const u = material.userData.blendedTerrainUniforms;
    u.sandHeight.value = textureParams.sandHeight;
    u.grassHeight.value = textureParams.grassHeight;
    u.rockHeight.value = textureParams.rockHeight;
    u.snowHeight.value = textureParams.snowHeight;
    u.blendSharpness.value = textureParams.blendSharpness;
    u.textureScale.value = textureParams.textureScale;

    // stage4C distance LOD values
    u.terrainDistanceFadeStart.value = renderingSettings?.terrainDistanceFadeStart ?? u.terrainDistanceFadeStart.value;
    u.terrainDistanceFadeEnd.value = renderingSettings?.terrainDistanceFadeEnd ?? u.terrainDistanceFadeEnd.value;
    u.terrainFarTexScale.value = renderingSettings?.terrainFarTexScale ?? u.terrainFarTexScale.value;
    u.terrainFarNormalScale.value = renderingSettings?.terrainFarNormalScale ?? u.terrainFarNormalScale.value;
    u.terrainFarRoughnessBoost.value = renderingSettings?.terrainFarRoughnessBoost ?? u.terrainFarRoughnessBoost.value;

    const shader = material.userData._blendedTerrainShader;
    if (shader) {
      shader.uniforms.sandHeight.value = textureParams.sandHeight;
      shader.uniforms.grassHeight.value = textureParams.grassHeight;
      shader.uniforms.rockHeight.value = textureParams.rockHeight;
      shader.uniforms.snowHeight.value = textureParams.snowHeight;
      shader.uniforms.blendSharpness.value = textureParams.blendSharpness;
      shader.uniforms.textureScale.value = textureParams.textureScale;
      shader.uniforms.terrainDistanceFadeStart.value = u.terrainDistanceFadeStart.value;
      shader.uniforms.terrainDistanceFadeEnd.value = u.terrainDistanceFadeEnd.value;
      shader.uniforms.terrainFarTexScale.value = u.terrainFarTexScale.value;
      shader.uniforms.terrainFarNormalScale.value = u.terrainFarNormalScale.value;
      shader.uniforms.terrainFarRoughnessBoost.value = u.terrainFarRoughnessBoost.value;
    }
  }, [textureParams, renderingSettings]);

  return (
    <RigidBody type="fixed" colliders="trimesh" {...props}>
      <mesh ref={meshRef} geometry={geometry} material={terrainMaterial} receiveShadow castShadow />
    </RigidBody>
  );
}

export default BlendedTerrain;
