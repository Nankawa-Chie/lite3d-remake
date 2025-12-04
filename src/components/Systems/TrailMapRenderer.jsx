import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// 導入著色器
import trailVertexShader from '../../shaders/slime/trailVertex.glsl';
import trailFragmentShader from '../../shaders/slime/trailFragment.glsl';
import diffusionVertexShader from '../../shaders/slime/diffusionVertex.glsl';
import diffusionFragmentShader from '../../shaders/slime/diffusionFragment.glsl';

/**
 * @description 軌跡圖渲染器 - 黏菌的"戰場地圖"
 * 使用FBO技術創建一個獨立的資訊畫布，記錄黏菌的化學氣味
 * @param {Object} props - 組件屬性
 * @param {number} props.size - 軌跡圖解析度
 * @param {number} props.dishRadius - 培養皿半徑
 */
const TrailMapRenderer = forwardRef(({ size = 512, dishRadius = 10 }, ref) => {
  const { gl } = useThree();
  
  // FBO渲染目標
  const trailMapTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });
  }, [size]);
  
  // 雙緩衝用於擴散計算
  const diffusionTargetA = useMemo(() => {
    return new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });
  }, [size]);
  
  const diffusionTargetB = useMemo(() => {
    return new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });
  }, [size]);
  
  // 全屏四邊形用於後處理
  const fullscreenQuad = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(2, 2);
    return geometry;
  }, []);
  
  // 軌跡繪製材質
  const trailMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uTrailMap: { value: trailMapTarget.texture },
        uDishRadius: { value: dishRadius },
        uBrushPosition: { value: new THREE.Vector2(0.5, 0.5) },
        uBrushSize: { value: 0.05 },
        uBrushType: { value: 0 }, // 0: nutrient, 1: inhibitor
        uBrushStrength: { value: 1.0 },
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
  }, [trailMapTarget, dishRadius]);
  
  // 擴散材質
  const diffusionMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: diffusionVertexShader,
      fragmentShader: diffusionFragmentShader,
      uniforms: {
        uTrailMap: { value: trailMapTarget.texture },
        uResolution: { value: new THREE.Vector2(size, size) },
        uDiffusionRate: { value: 0.98 }, // 擴散速率
        uDecayRate: { value: 0.995 }, // 衰減速率
        uDeltaTime: { value: 0 },
      },
    });
  }, [trailMapTarget, size]);
  
  // 渲染場景和相機
  const renderScene = useMemo(() => new THREE.Scene(), []);
  const renderCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  
  // 用於跟蹤當前使用的緩衝區
  const currentBufferRef = useRef(0); // 0 = A, 1 = B
  
  /**
   * @description 在指定位置添加營養物或抑制劑
   * @param {number} u - UV座標 u (0-1)
   * @param {number} v - UV座標 v (0-1)
   * @param {string} type - 物質類型 ('nutrient' 或 'inhibitor')
   */
  const addSubstance = (u, v, type) => {
    // 設置筆刷參數
    trailMaterial.uniforms.uBrushPosition.value.set(u, v);
    trailMaterial.uniforms.uBrushType.value = type === 'nutrient' ? 0 : 1;
    trailMaterial.uniforms.uBrushStrength.value = 1.0;
    
    // 渲染到軌跡圖
    const originalTarget = gl.getRenderTarget();
    gl.setRenderTarget(trailMapTarget);
    
    // 使用加法混合繪製
    const mesh = new THREE.Mesh(fullscreenQuad, trailMaterial);
    renderScene.add(mesh);
    gl.render(renderScene, renderCamera);
    renderScene.remove(mesh);
    
    gl.setRenderTarget(originalTarget);
  };
  
  /**
   * @description 清除軌跡圖
   */
  const clear = () => {
    const originalTarget = gl.getRenderTarget();
    gl.setRenderTarget(trailMapTarget);
    gl.clear();
    gl.setRenderTarget(diffusionTargetA);
    gl.clear();
    gl.setRenderTarget(diffusionTargetB);
    gl.clear();
    gl.setRenderTarget(originalTarget);
  };
  
  /**
   * @description 更新軌跡圖（擴散和衰減）
   * @param {number} deltaTime - 時間增量
   */
  const update = (deltaTime) => {
    // 更新時間uniform
    trailMaterial.uniforms.uTime.value += deltaTime;
    diffusionMaterial.uniforms.uDeltaTime.value = deltaTime;
    
    // 執行擴散計算
    const originalTarget = gl.getRenderTarget();
    
    // 選擇輸入和輸出緩衝區
    const inputTarget = currentBufferRef.current === 0 ? diffusionTargetA : diffusionTargetB;
    const outputTarget = currentBufferRef.current === 0 ? diffusionTargetB : diffusionTargetA;
    
    // 將當前軌跡圖複製到輸入緩衝區
    diffusionMaterial.uniforms.uTrailMap.value = trailMapTarget.texture;
    
    // 創建臨時mesh進行渲染
    const mesh = new THREE.Mesh(fullscreenQuad, diffusionMaterial);
    renderScene.add(mesh);
    
    gl.setRenderTarget(outputTarget);
    gl.render(renderScene, renderCamera);
    
    // 清理場景
    renderScene.remove(mesh);
    
    // 將結果複製回主軌跡圖
    const copyMaterial = new THREE.MeshBasicMaterial({ map: outputTarget.texture });
    const copyMesh = new THREE.Mesh(fullscreenQuad, copyMaterial);
    renderScene.add(copyMesh);
    
    gl.setRenderTarget(trailMapTarget);
    gl.render(renderScene, renderCamera);
    
    renderScene.remove(copyMesh);
    
    // 切換緩衝區
    currentBufferRef.current = 1 - currentBufferRef.current;
    
    gl.setRenderTarget(originalTarget);
  };
  
  /**
   * @description 獲取軌跡圖紋理
   * @returns {THREE.Texture} 軌跡圖紋理
   */
  const getTrailTexture = () => {
    return trailMapTarget.texture;
  };
  
  // 暴露API給父組件
  useImperativeHandle(ref, () => ({
    addSubstance,
    clear,
    update,
    getTrailTexture,
    trailMapTarget,
  }));
  
  return null; // 這是一個邏輯組件，不渲染任何視覺元素
});

TrailMapRenderer.displayName = 'TrailMapRenderer';

export default TrailMapRenderer;