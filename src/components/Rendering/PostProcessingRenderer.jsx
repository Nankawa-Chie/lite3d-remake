import React, { useMemo, useRef, useState } from "react";
import {
  EffectComposer,
  Bloom,
  SelectiveBloom,
  SSAO,
  DepthOfField,
  Vignette,
  ChromaticAberration,
  Noise,
  BrightnessContrast,
  HueSaturation,
  FXAA,
} from "@react-three/postprocessing";
import {BlendFunction} from "postprocessing";
import * as THREE from "three";

/**
 * @name PostProcessingRenderer
 * @description 后处理效果渲染器
 * 根据设置动态启用各种后处理效果来提升画面质量
 * 
 * @param {object} props - 组件属性
 * @param {object} props.settings - 后处理设置
 * @param {boolean} props.enabled - 是否启用后处理
 * @returns {JSX.Element|null}
 */
import { useThree, useFrame } from "@react-three/fiber";

function PostProcessingRenderer({settings, enabled = false}) {
  if (!enabled || !settings.enablePostProcessing) {
    return null;
  }

  const msaa = Math.max(0, settings.msaaSamples || 0);
  const { gl } = useThree();
  const isWebGL2 = !!gl.capabilities.isWebGL2;
  const enableFXAA = settings.enableFXAA === 'on' || (settings.enableFXAA === 'auto' && (msaa === 0 || !isWebGL2));

  // DOF 自动对焦（中心射线求交）
  const { camera, scene } = useThree();
  const [autoFocusDistance, setAutoFocusDistance] = useState(settings.dofFocusDistance ?? 0.5);
  const raycasterRef = useRef(null);
  const lastAFRef = useRef(0);
  const ndcCenter = useRef(new THREE.Vector2(0, 0)).current;
  const tmpVec3 = useRef(new THREE.Vector3()).current;

  const getFocusableObjects = useMemo(() => {
    // 可按 layer 过滤，或默认全场景（可能更慢）
    const layer = settings.dofFocusLayer;
    if (layer == null) return null; // null 表示不过滤
    const list = [];
    scene.traverse((obj) => {
      if (obj.isMesh && obj.layers && obj.layers.test(new THREE.Layers().set(layer))) {
        list.push(obj);
      }
    });
    return list;
  }, [scene, settings.dofFocusLayer]);

  useFrame(() => {
    if (!(settings.enableDOF && settings.dofAutoFocus)) return;

    const now = performance.now();
    const interval = settings.dofAFIntervalMs ?? 200;
    if (now - lastAFRef.current < interval) return;
    lastAFRef.current = now;

    // target 模式：直接以目标对象为焦点（无需射线）
    if (settings.dofAFMode === 'target' && settings.dofAFTargetName) {
      const target = scene.getObjectByName(settings.dofAFTargetName);
      if (target) {
        tmpVec3.setFromMatrixPosition(target.matrixWorld);
        // 将世界位置转换为相机空间 Z，并归一化
        tmpVec3.applyMatrix4(camera.matrixWorldInverse);
        const z = Math.abs(tmpVec3.z);
        const near = camera.near || 0.1;
        const far = camera.far || 1000;
        const norm = THREE.MathUtils.clamp((z - near) / (far - near), 0, 1);
        const speed = settings.dofFocusSpeed || 0.15;
        setAutoFocusDistance((prev) => prev + (norm - prev) * speed);
      }
      return;
    }

    // raycast 模式
    if (!raycasterRef.current) raycasterRef.current = new THREE.Raycaster();
    const raycaster = raycasterRef.current;

    // 层过滤：若设置 layer，只相交该层对象
    if (settings.dofFocusLayer != null) {
      raycaster.layers.set(settings.dofFocusLayer);
    } else {
      raycaster.layers.mask = -1; // 所有层
    }

    raycaster.setFromCamera(ndcCenter, camera);
    const intersects = getFocusableObjects ? raycaster.intersectObjects(getFocusableObjects, true) : raycaster.intersectObjects(scene.children, true);

    const worldDist = intersects && intersects[0] ? intersects[0].distance : undefined;
    const near = camera.near || 0.1;
    const far = camera.far || 1000;
    const defaultNorm = settings.dofFocusDistance ?? 0.5;
    const targetNorm = worldDist !== undefined
      ? THREE.MathUtils.clamp((worldDist - near) / (far - near), 0, 1)
      : THREE.MathUtils.clamp(defaultNorm, 0, 1);
    const speed = settings.dofFocusSpeed || 0.15;
    setAutoFocusDistance((prev) => prev + (targetNorm - prev) * speed);
  });

  return (
    <EffectComposer multisampling={msaa} enableNormalPass={!!settings.enableSSAO}>
      {/* Bloom 效果 - 发光效果 */}
      {settings.enableBloom && (() => {
        const Selective = settings.bloomMode === 'layer' ? SelectiveBloom : Bloom;
        return (
          <Selective
            intensity={settings.bloomIntensity || 1.5}
            luminanceThreshold={settings.bloomLuminanceThreshold || 0.9}
            luminanceSmoothing={settings.bloomLuminanceSmoothing || 0.025}
            radius={settings.bloomRadius || 0.85}
            blendFunction={BlendFunction.SCREEN}
          />
        );
      })()}

      {/* SSAO 效果 - 屏幕空间环境光遮蔽 */}
      {settings.enableSSAO && (
        <SSAO
          intensity={settings.ssaoIntensity || 0.5}
          radius={settings.ssaoRadius || 0.2}
          bias={settings.ssaoBias || 0.025}
          samples={settings.ssaoSamples || 16}
          blendFunction={BlendFunction.MULTIPLY}
          halfResolution={!!settings.ssaoHalfRes}
          worldDistanceThreshold={0.2}
          worldDistanceFalloff={0.1}
        />
      )}

      {/* 景深效果 */}
      {settings.enableDOF && (
        <DepthOfField
          focusDistance={settings.dofAutoFocus ? autoFocusDistance : THREE.MathUtils.clamp((settings.dofFocusDistance ?? 0.5) > 1 ? ((settings.dofFocusDistance - (camera?.near||0.1)) / ((camera?.far||1000) - (camera?.near||0.1))) : (settings.dofFocusDistance ?? 0.5), 0, 1)}
          focalLength={settings.dofFocalLength || 0.02}
          bokehScale={settings.dofBokehScale || 2.0}
          height={480}
        />
      )}

      {/* 暗角效果 */}
      {settings.enableVignette && (
        <Vignette
          offset={settings.vignetteOffset ?? 0.2}
          darkness={settings.vignetteDarkness ?? 0.35}
          blendFunction={BlendFunction.NORMAL}
        />
      )}

      {/* 色差效果 */}
      {settings.enableChromaticAberration && (
        <ChromaticAberration
          offset={[0.002, 0.002]}
          radialModulation={false}
          modulationOffset={0.0}
          blendFunction={BlendFunction.NORMAL}
        />
      )}

      {/* 噪点效果 */}
      {settings.enableNoise && (
        <Noise
          opacity={0.05}
          blendFunction={BlendFunction.COLOR_DODGE}
        />
      )}

      {/* 亮度对比度调整 */}
      {(settings.brightness !== 0 || settings.contrast !== 0) && (
        <BrightnessContrast
          brightness={settings.brightness || 0}
          contrast={settings.contrast || 0}
        />
      )}

      {/* 色相饱和度调整 */}
      {(settings.hue !== 0 || settings.saturation !== 0) && (
        <HueSaturation
          hue={settings.hue || 0}
          saturation={settings.saturation || 0}
        />
      )}

      {/* FXAA 抗锯齿（条件启用） */}
      {enableFXAA && <FXAA />}
    </EffectComposer>
  );
}

export default PostProcessingRenderer;