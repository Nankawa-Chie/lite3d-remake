import * as THREE from 'three';

/**
 * @typedef {Object} ToonishSettings
 * @property {boolean} enableToonishShading
 * @property {number} toonRampSteps        - 2~8（越大越接近真实，越小越卡通）
 * @property {number} toonRampSmoothness   - 0~1（越大越柔和）
 * @property {number} toonRimStrength      - 0~2
 * @property {number} toonRimPower         - 0.5~8（越大越贴边）
 * @property {string} toonRimColor         - '#rrggbb'
 * @property {number} toonShadowLift       - 0~0.5（抬黑，避免夜晚死黑）
 */

/**
 * 给 MeshStandardMaterial/PhysicalMaterial 注入 toon-ish 风格化：
 * - Soft ramp：对 NdotL 做分段/柔化
 * - Rim light：边缘光
 * - Shadow lift：抬黑（更电影、更易控）
 *
 * 设计目标：
 * - 尽量只改“直接光的漫反射”部分，不破坏 three 的整体 PBR 管线
 * - 通过 uniforms 实时更新参数，无需频繁 needsUpdate
 */
export function applyToonishPatchToStandardMaterial(material, settings) {
  if (!material || typeof material !== 'object') return;

  // 只 patch 一次
  if (material.userData.__toonishPatched) return;
  material.userData.__toonishPatched = true;

  // 统一 uniforms（后续可更新）
  const u = {
    toonEnable: {value: settings?.enableToonishShading ? 1.0 : 0.0},
    toonRampSteps: {value: settings?.toonRampSteps ?? 4},
    toonRampSmoothness: {value: settings?.toonRampSmoothness ?? 0.55},
    toonRimStrength: {value: settings?.toonRimStrength ?? 0.35},
    toonRimPower: {value: settings?.toonRimPower ?? 2.5},
    toonRimColor: {value: new THREE.Color(settings?.toonRimColor ?? '#dbe9ff')},
    toonShadowLift: {value: settings?.toonShadowLift ?? 0.08},
  };

  material.userData.__toonishUniforms = u;

  // 链式 onBeforeCompile：保留原有注入（例如地形混合），在其基础上再做 toon-ish
  const prevOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader) => {
    if (typeof prevOnBeforeCompile === 'function') prevOnBeforeCompile(shader);

    Object.assign(shader.uniforms, u);
    material.userData.__toonishShader = shader;

    // inject helper + uniforms
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n\n// ---- Toonish (Soft Toon) injection ----\nuniform float toonEnable;\nuniform float toonRampSteps;\nuniform float toonRampSmoothness;\nuniform float toonRimStrength;\nuniform float toonRimPower;\nuniform vec3 toonRimColor;\nuniform float toonShadowLift;\n\nfloat toonRamp(float x, float steps, float smoothness) {\n  x = clamp(x, 0.0, 1.0);\n  steps = max(1.0, steps);\n  float s = floor(x * steps) / steps;\n  float t = fract(x * steps);\n  float w = smoothstep(0.0, 1.0, t);\n  float mixed = mix(s, s + 1.0/steps, w);\n  return mix(s, mixed, clamp(smoothness, 0.0, 1.0));\n}\n\nvec3 applyRim(vec3 base, vec3 normal, vec3 viewDir) {\n  float rim = pow(1.0 - saturate(dot(normal, viewDir)), max(0.0001, toonRimPower));\n  return base + toonRimColor * rim * toonRimStrength;\n}\n`
    );

    // Soft toon：对直接漫反射做亮度 ramp 压缩（不依赖具体光方向，兼容多光源/阴影）
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>\n\n// ---- Toonish adjustments ----\nif (toonEnable > 0.5) {\n  float directLum = luminance(reflectedLight.directDiffuse);\n  float ramp = toonRamp(clamp(directLum, 0.0, 1.0), toonRampSteps, toonRampSmoothness);\n  ramp = max(ramp, toonShadowLift);\n  reflectedLight.directDiffuse = reflectedLight.directDiffuse * mix(1.0, ramp / max(directLum, 1e-4), 0.85);\n}\n`
    );

    // Rim：在最终 outgoingLight 之前叠加
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;',
      `vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;\nif (toonEnable > 0.5) {\n  outgoingLight = applyRim(outgoingLight, geometryNormal, geometryViewDir);\n}`
    );
  };
}

export function updateToonishUniforms(material, settings) {
  const u = material?.userData?.__toonishUniforms;
  const shader = material?.userData?.__toonishShader;
  if (!u) return;

  u.toonEnable.value = settings?.enableToonishShading ? 1.0 : 0.0;
  u.toonRampSteps.value = settings?.toonRampSteps ?? u.toonRampSteps.value;
  u.toonRampSmoothness.value = settings?.toonRampSmoothness ?? u.toonRampSmoothness.value;
  u.toonRimStrength.value = settings?.toonRimStrength ?? u.toonRimStrength.value;
  u.toonRimPower.value = settings?.toonRimPower ?? u.toonRimPower.value;
  u.toonShadowLift.value = settings?.toonShadowLift ?? u.toonShadowLift.value;
  if (typeof settings?.toonRimColor === 'string') {
    u.toonRimColor.value.set(settings.toonRimColor);
  }

  // 如果 shader 已编译，直接同步到 shader.uniforms（避免某些驱动不即时读取 u）
  if (shader?.uniforms) {
    for (const [k, v] of Object.entries(u)) {
      if (shader.uniforms[k]) shader.uniforms[k].value = v.value;
    }
  }
}
