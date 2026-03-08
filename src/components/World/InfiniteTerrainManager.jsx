import React, {useRef, useState, useEffect, useCallback, useMemo} from "react";
import {useFrame, useThree, useLoader} from "@react-three/fiber";
import * as THREE from "three";
import TerrainChunk from "./TerrainChunk";
import {applyToonishPatchToStandardMaterial, updateToonishUniforms} from "../../utils/ToonishMaterialPatch";
import useGameStore from "../../stores/gameStore";

/**
 * InfiniteTerrainManager
 *
 * Manages a grid of terrain chunks around the player.
 * Only chunks within viewRadius are rendered; chunks outside are unloaded.
 * Uses a throttled position check (~4Hz) to avoid per-frame state updates.
 */
export default function InfiniteTerrainManager({
  playerRef,
  chunkSize = 128,
  viewRadius = 3,         // Number of chunks in each direction (total grid = (2*viewRadius+1)^2)
  chunkResolution = 64,   // Vertices per chunk edge
  maxHeight = 32,
  noiseSeed = 42,
  flatZoneRadius = 128,   // Flat area around origin (for buildings)
  terrainParams = {},      // PBR blend params (sandHeight, grassHeight, etc.)
}) {
  const {gl} = useThree();
  const renderingSettings = useGameStore((s) => s.settings.rendering);

  // Load terrain textures (shared across all chunks)
  const [
    sandColor, sandNormal, sandRoughness,
    grassColor, grassNormal, grassRoughness,
    rockColor, rockNormal, rockRoughness,
    snowColor, snowNormal, snowRoughness,
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

  // Create shared terrain material (same logic as BlendedTerrain)
  const sharedMaterial = useMemo(() => {
    const maxTextures = gl?.capabilities?.maxTextures ?? 16;
    const isWebGL2 = gl?.capabilities?.isWebGL2 ?? false;
    const useLiteMix = !isWebGL2 || maxTextures <= 16;

    const defaultParams = {
      sandHeight: -6, grassHeight: 1, rockHeight: 12, snowHeight: 21,
      blendSharpness: 8, textureScale: 10,
    };
    const tp = {...defaultParams, ...terrainParams};

    const terrainDistanceFadeStart = renderingSettings?.terrainDistanceFadeStart ?? 120;
    const terrainDistanceFadeEnd = renderingSettings?.terrainDistanceFadeEnd ?? 350;
    const terrainFarTexScale = renderingSettings?.terrainFarTexScale ?? 0.35;
    const terrainFarNormalScale = renderingSettings?.terrainFarNormalScale ?? 0.35;
    const terrainFarRoughnessBoost = renderingSettings?.terrainFarRoughnessBoost ?? 0.35;

    // Configure textures
    if (sandColor) sandColor.colorSpace = THREE.SRGBColorSpace;
    if (grassColor) grassColor.colorSpace = THREE.SRGBColorSpace;
    if (rockColor) rockColor.colorSpace = THREE.SRGBColorSpace;
    if (snowColor) snowColor.colorSpace = THREE.SRGBColorSpace;

    [sandColor, sandNormal, sandRoughness, grassColor, grassNormal, grassRoughness,
     rockColor, rockNormal, rockRoughness, snowColor, snowNormal, snowRoughness]
      .filter(Boolean).forEach(t => { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; });

    const m = new THREE.MeshStandardMaterial({
      metalness: 0, roughness: 1, side: THREE.DoubleSide,
      map: sandColor, normalMap: sandNormal, roughnessMap: sandRoughness,
    });
    m.normalScale = new THREE.Vector2(0.9, 0.9);

    const uniformsCommon = {
      sandHeight: {value: tp.sandHeight}, grassHeight: {value: tp.grassHeight},
      rockHeight: {value: tp.rockHeight}, snowHeight: {value: tp.snowHeight},
      blendSharpness: {value: tp.blendSharpness}, textureScale: {value: tp.textureScale},
      terrainDistanceFadeStart: {value: terrainDistanceFadeStart},
      terrainDistanceFadeEnd: {value: terrainDistanceFadeEnd},
      terrainFarTexScale: {value: terrainFarTexScale},
      terrainFarNormalScale: {value: terrainFarNormalScale},
      terrainFarRoughnessBoost: {value: terrainFarRoughnessBoost},
    };

    const uniformsLite = {
      sandColor: {value: sandColor}, grassColor: {value: grassColor},
      rockColor: {value: rockColor}, snowColor: {value: snowColor},
    };

    const uniformsFull = {
      ...uniformsLite,
      sandNormal: {value: sandNormal}, sandRoughness: {value: sandRoughness},
      grassNormal: {value: grassNormal}, grassRoughness: {value: grassRoughness},
      rockNormal: {value: rockNormal}, rockRoughness: {value: rockRoughness},
      snowNormal: {value: snowNormal}, snowRoughness: {value: snowRoughness},
    };

    m.userData.blendedTerrainUniforms = {...uniformsCommon, ...(useLiteMix ? uniformsLite : uniformsFull)};
    m.userData.blendedTerrainMode = useLiteMix ? 'LITE' : 'FULL';

    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, m.userData.blendedTerrainUniforms);
      m.userData._blendedTerrainShader = shader;

      const isGLSL3 = shader.fragmentShader.includes('#version 300 es');
      const vQualifier = isGLSL3 ? 'in' : 'varying';
      const sample2D = isGLSL3 ? 'texture' : 'texture2D';
      const samplerDecl = (name) => `uniform sampler2D ${name};`;

      // Vertex: output world position / world normal / uv
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>",
          `#include <common>\nvarying vec3 vBtWorldPosition;\nvarying vec3 vBtWorldNormal;\nvarying vec2 vBtUv;`)
        .replace("#include <uv_vertex>",
          `#include <uv_vertex>\nvBtUv = uv;`)
        .replace("#include <worldpos_vertex>",
          `#include <worldpos_vertex>\nvBtWorldPosition = worldPosition.xyz;\nvBtWorldNormal = normalize(mat3(modelMatrix) * normal);`);

      const headerCommon = `
uniform float sandHeight; uniform float grassHeight; uniform float rockHeight; uniform float snowHeight;
uniform float blendSharpness; uniform float textureScale;
uniform float terrainDistanceFadeStart; uniform float terrainDistanceFadeEnd;
uniform float terrainFarTexScale; uniform float terrainFarNormalScale; uniform float terrainFarRoughnessBoost;
${vQualifier} vec3 vBtWorldPosition; ${vQualifier} vec3 vBtWorldNormal; ${vQualifier} vec2 vBtUv;

float _bt_heightBlend(float h, float target, float range) { return 1.0 - smoothstep(0.0, range, abs(h - target)); }
float _bt_slopeFactor(vec3 wn) { return 1.0 - abs(dot(normalize(wn), vec3(0,1,0))); }
vec4 _bt_sampleColor(sampler2D tex, vec2 uv) { return ${sample2D}(tex, uv); }
void _bt_weights(float h, vec3 wn, out float wS, out float wG, out float wR, out float wSn) {
  float slope = _bt_slopeFactor(wn);
  wS = _bt_heightBlend(h, sandHeight, blendSharpness);
  wG = _bt_heightBlend(h, grassHeight, blendSharpness);
  wR = _bt_heightBlend(h, rockHeight, blendSharpness);
  wSn = _bt_heightBlend(h, snowHeight, blendSharpness);
  wR = mix(wR, 1.0, slope * 0.6);
  float total = wS + wG + wR + wSn;
  if(total > 0.0) { wS /= total; wG /= total; wR /= total; wSn /= total; }
}
`;

      const headerLite = `${samplerDecl('sandColor')} ${samplerDecl('grassColor')} ${samplerDecl('rockColor')} ${samplerDecl('snowColor')}`;
      const headerFull = `${headerLite}
${samplerDecl('sandNormal')} ${samplerDecl('sandRoughness')}
${samplerDecl('grassNormal')} ${samplerDecl('grassRoughness')}
${samplerDecl('rockNormal')} ${samplerDecl('rockRoughness')}
${samplerDecl('snowNormal')} ${samplerDecl('snowRoughness')}
float _bt_sampleRough(sampler2D tex, vec2 uv) { return ${sample2D}(tex, uv).r; }
vec3 _bt_sampleNormalGL(sampler2D tex, vec2 uv) { return normalize(${sample2D}(tex, uv).xyz * 2.0 - 1.0); }
`;

      shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
        `#include <common>\n${headerCommon}\n${useLiteMix ? headerLite : headerFull}`);

      // Use world position for UV calculation (ensures seamless tiling across chunks)
      shader.fragmentShader = shader.fragmentShader.replace("void main() {",
        `void main() {
float wSand; float wGrass; float wRock; float wSnow;
float btDist = distance(cameraPosition, vBtWorldPosition);
float btFarT = smoothstep(terrainDistanceFadeStart, terrainDistanceFadeEnd, btDist);
float btScale = mix(textureScale, textureScale * max(0.01, terrainFarTexScale), btFarT);
vec2 btUv = vBtWorldPosition.xz * btScale * 0.01; // Use world XZ for seamless tiling
_bt_weights(vBtWorldPosition.y, vBtWorldNormal, wSand, wGrass, wRock, wSnow);
`);

      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
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
`);

      if (!useLiteMix) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `
float rSand = _bt_sampleRough(sandRoughness, btUv);
float rGrass = _bt_sampleRough(grassRoughness, btUv);
float rRock = _bt_sampleRough(rockRoughness, btUv);
float rSnow = _bt_sampleRough(snowRoughness, btUv);
float blendedRoughness = rSand * wSand + rGrass * wGrass + rRock * wRock + rSnow * wSnow;
blendedRoughness = clamp(blendedRoughness + terrainFarRoughnessBoost * btFarT, 0.0, 1.0);
roughnessFactor *= blendedRoughness;
`);

        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
#ifdef USE_NORMALMAP
  vec3 nSand = _bt_sampleNormalGL(sandNormal, btUv);
  vec3 nGrass = _bt_sampleNormalGL(grassNormal, btUv);
  vec3 nRock = _bt_sampleNormalGL(rockNormal, btUv);
  vec3 nSnow = _bt_sampleNormalGL(snowNormal, btUv);
  vec3 mapN = normalize(nSand * wSand + nGrass * wGrass + nRock * wRock + nSnow * wSnow);
  mapN.xy *= normalScale * mix(1.0, terrainFarNormalScale, btFarT);
  normal = perturbNormal2Arb(-vViewPosition, normal, mapN, faceDirection);
#endif
`);
      }
    };

    applyToonishPatchToStandardMaterial(m, renderingSettings);
    return m;
  }, [gl, sandColor, sandNormal, sandRoughness, grassColor, grassNormal, grassRoughness,
      rockColor, rockNormal, rockRoughness, snowColor, snowNormal, snowRoughness,
      terrainParams, renderingSettings]);
  // Current player chunk coordinates
  const [playerChunk, setPlayerChunk] = useState({cx: 0, cz: 0});
  const lastCheckRef = useRef(0);

  // Throttled player position check (~4Hz)
  useFrame(() => {
    const now = performance.now();
    if (now - lastCheckRef.current < 250) return;
    lastCheckRef.current = now;

    const player = playerRef?.current;
    const getPos = player?.getPosition;
    if (!getPos) return;

    const pos = getPos();
    const px = pos[0] ?? pos.x ?? 0;
    const pz = pos[2] ?? pos.z ?? 0;

    const cx = Math.floor(px / chunkSize);
    const cz = Math.floor(pz / chunkSize);

    if (cx !== playerChunk.cx || cz !== playerChunk.cz) {
      setPlayerChunk({cx, cz});
    }
  });

  // Generate list of visible chunk coords
  const visibleChunks = useMemo(() => {
    const chunks = [];
    for (let dx = -viewRadius; dx <= viewRadius; dx++) {
      for (let dz = -viewRadius; dz <= viewRadius; dz++) {
        chunks.push({
          cx: playerChunk.cx + dx,
          cz: playerChunk.cz + dz,
        });
      }
    }
    return chunks;
  }, [playerChunk.cx, playerChunk.cz, viewRadius]);

  return (
    <group>
      {visibleChunks.map(({cx, cz}) => (
        <TerrainChunk
          key={`terrain_${cx}_${cz}`}
          cx={cx}
          cz={cz}
          chunkSize={chunkSize}
          resolution={chunkResolution}
          maxHeight={maxHeight}
          noiseSeed={noiseSeed}
          flatZoneRadius={flatZoneRadius}
          terrainMaterial={sharedMaterial}
        />
      ))}
    </group>
  );
}
