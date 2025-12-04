import React, {useMemo, useRef} from "react";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";
import galaxyVertexShader from "../../shaders/galaxy/vertex.glsl";
import galaxyFragmentShader from "../../shaders/galaxy/fragment.glsl";

/**
 * @name Galaxy
 * @description 一个使用自定义着色器创建的程序化、动态的星系粒子系统。
 * - **粒子生成**: 使用 `useMemo` 在客户端程序化地生成大量粒子的位置、颜色、大小等属性，形成螺旋臂结构。
 * - **自定义着色器**: 使用顶点和片元着色器来实现复杂的动画效果，如粒子的旋转和闪烁，这是标准材质难以实现的。
 * - **性能**: 所有计算都在GPU上进行，性能非常高。
 * - **材质创建**: [关键点] 此组件手动创建 `THREE.ShaderMaterial`，而不是使用 `drei` 的 `shaderMaterial` 辅助函数。
 * 这解决了在某些情况下 `drei` 辅助函数可能导致的 uniform 变量更新问题，确保了 `uTime` 的可靠更新。
 *
 * @param {object} props - 传递给 `points` 对象的标准属性，如 `position`。
 * @returns {JSX.Element}
 */
export default function Galaxy(props) {
  const pointsRef = useRef();

  // 1. Generate particle attributes procedurally
  const [positions, colors, scales, randomness] = useMemo(() => {
    const parameters = {
      count: 100000,
      radius: 2,
      branches: 7,
      randomness: 0.2,
      randomnessPower: 3,
      insideColor: "#ff6030",
      outsideColor: "#1b3984",
    };
    const pos = new Float32Array(parameters.count * 3);
    const col = new Float32Array(parameters.count * 3);
    const scl = new Float32Array(parameters.count);
    const rand = new Float32Array(parameters.count * 3);
    const insideColor = new THREE.Color(parameters.insideColor);
    const outsideColor = new THREE.Color(parameters.outsideColor);

    // Loop to create spiral galaxy structure
    for (let i = 0; i < parameters.count; i++) {
      const i3 = i * 3;
      const radius = Math.random() * parameters.radius;
      const branchAngle =
        ((i % parameters.branches) / parameters.branches) * Math.PI * 2;
      const randomX =
        Math.pow(Math.random(), parameters.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) *
        parameters.randomness *
        radius;
      const randomY =
        Math.pow(Math.random(), parameters.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) *
        parameters.randomness *
        0.5;
      const randomZ =
        Math.pow(Math.random(), parameters.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) *
        parameters.randomness *
        radius;
      pos[i3] = Math.cos(branchAngle) * radius;
      pos[i3 + 1] = 0;
      pos[i3 + 2] = Math.sin(branchAngle) * radius;
      rand[i3] = randomX;
      rand[i3 + 1] = randomY;
      rand[i3 + 2] = randomZ;
      const mixedColor = insideColor.clone();
      mixedColor.lerp(outsideColor, radius / parameters.radius);
      col[i3] = mixedColor.r;
      col[i3 + 1] = mixedColor.g;
      col[i3 + 2] = mixedColor.b;
      scl[i] = Math.random();
    }
    return [pos, col, scl, rand];
  }, []);

  // 2. [FIX] Manually create the ShaderMaterial
  // This approach provides more direct control and avoids potential issues with
  // the drei `shaderMaterial` helper's abstraction layer.
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: galaxyVertexShader,
      fragmentShader: galaxyFragmentShader,
      uniforms: {
        uTime: {value: 0},
        uSize: {value: 30.0}, // Use a larger base size for better visibility
      },
    });
  }, []); // Empty dependency array ensures the material is created only once

  // 3. [FIX] Update the material's `uTime` uniform in the frame loop
  // This now reliably updates the manually created material instance.
  useFrame((state) => {
    if (material) {
      material.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  return (
    <points ref={pointsRef} {...props}>
      <bufferGeometry>
        {/* Attach all the generated attributes to the geometry */}
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aColor" // Custom attribute for color
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aScale" // Custom attribute for scale
          count={scales.length}
          array={scales}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aRandomness" // Custom attribute for randomness
          count={randomness.length / 3}
          array={randomness}
          itemSize={3}
        />
      </bufferGeometry>

      {/* 4. [FIX] Use the <primitive> component to render the material */}
      {/* This is the correct way to use a manually created Three.js object */}
      {/* within the R3F declarative syntax. */}
      <primitive object={material} attach="material" />
    </points>
  );
}
