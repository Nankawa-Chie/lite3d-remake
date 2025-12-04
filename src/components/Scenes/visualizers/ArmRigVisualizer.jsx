import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { quatFromAxisAngle, quatNormalize, quatMultiply, clampTwist } from "../../Math/quaternionMath";

function BoneMesh({ length=1, radius=0.08, color=0xcccccc }){
  const geom = useMemo(() => new THREE.CylinderGeometry(radius, radius, length, 24), [radius, length]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05 }), [color]);
  // 平移几何体使其底部位于原点，沿 +Y 延伸
  const meshRef = useRef();
  useEffect(() => { if (meshRef.current) meshRef.current.position.set(0, length/2, 0); }, [length]);
  return <mesh ref={meshRef} geometry={geom} material={mat} castShadow receiveShadow />;
}

function Axes({ size=0.2 }){
  const obj = useMemo(() => new THREE.AxesHelper(size), [size]);
  return <primitive object={obj} />;
}

export default function ArmRigVisualizer({
  position=[-0.6,0,0],
  upperLen=0.9,
  foreLen=0.9,
  side='L',
  clavSwingX=0,
  clavSwingZ=0,
  clavTwistY=0,
  shoulderSwingX=0,
  shoulderSwingZ=0,
  shoulderTwistY=0,
  elbowFlex=0,
  enableLimits=true,
  overrideLocalQuats=null, // {clavicle:[x,y,z,w], shoulder:[...], elbow:[...]}
}){
  // 限制（度）
  const limits = {
    clavSwingX: [-25, 25],
    clavSwingZ: [-25, 25],
    clavTwistY: [-15, 15],
    shoulderSwingX: [-120, 120],
    shoulderSwingZ: [-120, 120],
    shoulderTwistY: [-90, 90],
    elbowFlex: [0, 150],
  };
  const clampDeg = (v, [mn, mx]) => Math.min(mx, Math.max(mn, v));

  const cSX = enableLimits ? clampDeg(clavSwingX, limits.clavSwingX) : clavSwingX;
  const cSZ = enableLimits ? clampDeg(clavSwingZ, limits.clavSwingZ) : clavSwingZ;
  const cTY = enableLimits ? clampDeg(clavTwistY, limits.clavTwistY) : clavTwistY;

  const sX = enableLimits ? clampDeg(shoulderSwingX, limits.shoulderSwingX) : shoulderSwingX;
  const sZ = enableLimits ? clampDeg(shoulderSwingZ, limits.shoulderSwingZ) : shoulderSwingZ;
  const tY = enableLimits ? clampDeg(shoulderTwistY, limits.shoulderTwistY) : shoulderTwistY;
  const eX = enableLimits ? clampDeg(elbowFlex, limits.elbowFlex) : elbowFlex;

  // 生成肩部四元数（先 swing 后 twist，骨轴沿 +Y）
  const qSwingX = useMemo(() => quatFromAxisAngle([1,0,0], THREE.MathUtils.degToRad(sX)), [sX]);
  const qSwingZ = useMemo(() => quatFromAxisAngle([0,0,1], THREE.MathUtils.degToRad(sZ)), [sZ]);
  const qTwistY = useMemo(() => quatFromAxisAngle([0,1,0], THREE.MathUtils.degToRad(tY)), [tY]);
  const qSwing = useMemo(() => quatNormalize(quatMultiply(qSwingZ, qSwingX)), [qSwingX, qSwingZ]);
  let qShoulder = useMemo(() => quatNormalize(quatMultiply(qSwing, qTwistY)), [qSwing, qTwistY]);
  // 优先处理扭转限制（绕骨轴 +Y）
  qShoulder = useMemo(() => clampTwist(qShoulder, [0,1,0], -90, 90), [qShoulder]);

  // 锁骨四元数（小范围 swing/twist）
  const qClavSwingX = useMemo(() => quatFromAxisAngle([1,0,0], THREE.MathUtils.degToRad(cSX)), [cSX]);
  const qClavSwingZ = useMemo(() => quatFromAxisAngle([0,0,1], THREE.MathUtils.degToRad(cSZ)), [cSZ]);
  const qClavTwistY = useMemo(() => quatFromAxisAngle([0,1,0], THREE.MathUtils.degToRad(cTY)), [cTY]);
  const qClavSwing = useMemo(() => quatNormalize(quatMultiply(qClavSwingZ, qClavSwingX)), [qClavSwingX, qClavSwingZ]);
  let qClavicle = useMemo(() => quatNormalize(quatMultiply(qClavSwing, qClavTwistY)), [qClavSwing, qClavTwistY]);
  qClavicle = useMemo(() => clampTwist(qClavicle, [0,1,0], -15, 15), [qClavicle]);

  // 肘部局部四元数：仅绕本地 X 屈伸
  const qElbowLocal = useMemo(() => quatFromAxisAngle([1,0,0], THREE.MathUtils.degToRad(eX)), [eX]);

  // 如果提供了覆盖四元数，则使用覆盖（用于 A↔B 预览）
  const qLoc = overrideLocalQuats || null;

  // 转 three Quaternion
  const tqClavicle = useMemo(() => {
    const q = qLoc? qLoc.clavicle : qClavicle; return new THREE.Quaternion(q[0],q[1],q[2],q[3]);
  }, [qClavicle, qLoc]);
  const tqShoulder = useMemo(() => {
    const q = qLoc? qLoc.shoulder : qShoulder; return new THREE.Quaternion(q[0],q[1],q[2],q[3]);
  }, [qShoulder, qLoc]);
  const tqElbowLocal = useMemo(() => {
    const q = qLoc? qLoc.elbow : qElbowLocal; return new THREE.Quaternion(q[0],q[1],q[2],q[3]);
  }, [qElbowLocal, qLoc]);

  // 预旋转：默认骨条沿 +Y，为了 T-pose 沿 X 展开：右臂绕 Z -90°，左臂绕 Z +90°
  const tqBase = useMemo(() => {
    const q = new THREE.Quaternion();
    const angle = (side === 'R') ? -Math.PI/2 : Math.PI/2;
    q.setFromAxisAngle(new THREE.Vector3(0,0,1), angle);
    return q;
  }, [side]);

  return (
    <group position={position} quaternion={tqBase}>
      {/* 层级结构：Clavicle -> Shoulder -> UpperArm -> Elbow -> Forearm */}
      <group name="Clavicle" quaternion={tqClavicle}>
        {/* 锁骨球与本地轴（示意）*/}
        <mesh>
          <sphereGeometry args={[0.09, 24, 16]} />
          <meshStandardMaterial color={0x99ddff} />
        </mesh>
        <Axes size={0.22} />

        <group name="Shoulder" quaternion={tqShoulder}>
          {/* 肩关节球与本地轴 */}
          <mesh>
            <sphereGeometry args={[0.1, 24, 16]} />
            <meshStandardMaterial color={0x66ccff} />
          </mesh>
          <Axes size={0.25} />

          {/* 上臂骨条（以肩为原点，沿 +Y）*/}
          <BoneMesh length={upperLen} color={0xdddddd} />

          {/* 肘节点（Shoulder 子节点），位于上臂末端 */}
          <group name="Elbow" position={[0, upperLen, 0]} quaternion={tqElbowLocal}>
            {/* 肘关节球与本地轴 */}
            <mesh>
              <sphereGeometry args={[0.09, 24, 16]} />
              <meshStandardMaterial color={0xffcc66} />
            </mesh>
            <Axes size={0.22} />

            {/* 前臂骨条（以肘为原点，沿 +Y）*/}
            <BoneMesh length={foreLen} color={0xcccccc} />

            {/* 预留：手腕节点 */}
            {/* <group name="Wrist" position={[0, foreLen, 0]} /> */}
          </group>
        </group>
      </group>
    </group>
  );
}
