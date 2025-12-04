import React, {useEffect, useMemo, useRef, useState, useCallback} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import {Grid, GizmoHelper, GizmoViewport} from "@react-three/drei";
import * as THREE from "three";
import {
  quatFromAxisAngle,
  quatToAxisAngle,
  quatNormalize,
  quatMultiply,
  quatRotateVector,
  slerp,
  nlerp,
  eulerToQuat,
} from "../Math/quaternionMath";
import {dqFromRotationTranslation, dqNormalize, dqMultiply, dqTransformPoint} from "../Math/dualQuaternion";
import SlerpVisualizer from "./visualizers/SlerpVisualizer";
import ArmRigVisualizer from "./visualizers/ArmRigVisualizer";
// import CornerAxes from "./visualizers/CornerAxes";

function FreePointerCameraControls({lockElement}) {
  const {camera, gl} = useThree();
  const [keys, setKeys] = useState({});
  const velocity = useRef(new THREE.Vector3());
  const speedBase = 4.0;
  const accel = 20.0;
  const damping = 8.0;
  const isLockedRef = useRef(false);

  const onLock = useCallback(() => {
    isLockedRef.current = true;
  }, []);
  const onUnlock = useCallback(() => {
    isLockedRef.current = false;
  }, []);

  useEffect(() => {
    const target = lockElement || gl.domElement;
    const pointerLockChange = () => {
      const doc = document;
      const locked = doc.pointerLockElement === target;
      if (locked) onLock();
      else onUnlock();
    };
    document.addEventListener("pointerlockchange", pointerLockChange);
    return () => document.removeEventListener("pointerlockchange", pointerLockChange);
  }, [gl.domElement, lockElement, onLock, onUnlock]);

  useEffect(() => {
    const keydown = (e) => setKeys((s) => ({...s, [e.code]: true}));
    const keyup = (e) => setKeys((s) => ({...s, [e.code]: false}));
    document.addEventListener("keydown", keydown);
    document.addEventListener("keyup", keyup);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("keyup", keyup);
    };
  }, []);

  useEffect(() => {
    const target = lockElement || gl.domElement;
    const onMouseDown = (e) => {
      if (e.button === 2 || e.button === 0) {
        target.requestPointerLock?.();
      }
    };
    const onContextMenu = (e) => {
      if (e.target === target) e.preventDefault();
    };
    target.addEventListener("mousedown", onMouseDown);
    target.addEventListener("contextmenu", onContextMenu);
    return () => {
      target.removeEventListener("mousedown", onMouseDown);
      target.removeEventListener("contextmenu", onContextMenu);
    };
  }, [gl.domElement]);

  // Yaw/Pitch handling
  const yaw = useRef(0);
  const pitch = useRef(0);
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isLockedRef.current) return;
      const sx = e.movementX * 0.002;
      const sy = e.movementY * 0.002;
      yaw.current -= sx;
      pitch.current = THREE.MathUtils.clamp(pitch.current - sy, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    };
    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, []);

  useFrame((_, dt) => {
    // Update camera quaternion from yaw/pitch
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch.current);
    camera.quaternion.copy(qx.multiply(qy));

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    const desired = new THREE.Vector3();
    if (keys.KeyW) desired.add(forward);
    if (keys.KeyS) desired.add(forward.clone().multiplyScalar(-1));
    if (keys.KeyD) desired.add(right);
    if (keys.KeyA) desired.add(right.clone().multiplyScalar(-1));
    if (keys.Space) desired.add(up);
    if (keys.ShiftLeft) desired.add(up.clone().multiplyScalar(-1));

    if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(speedBase * (keys.AltLeft ? 4.0 : 1.0));

    velocity.current.lerp(desired, THREE.MathUtils.clamp(accel * dt, 0, 1));
    const damp = Math.exp(-damping * dt);
    velocity.current.multiplyScalar(damp);
    camera.position.addScaledVector(velocity.current, dt);
  });

  return null;
}

function UnitSphere() {
  const geom = useMemo(() => new THREE.SphereGeometry(1, 48, 32), []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({color: 0x1e90ff, transparent: true, opacity: 0.08, roughness: 1, metalness: 0}),
    []
  );
  return <mesh geometry={geom} material={mat} />;
}

function RotatingGizmo({quaternion}) {
  const ref = useRef();
  const base = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, 0.5), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({color: 0xffaa00, roughness: 0.5}), []);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  }, [quaternion]);
  return <mesh ref={ref} geometry={base} material={mat} position={[0, 0, 0]} castShadow receiveShadow />;
}

function QuaternionVisualizerScene({axis, angleDeg, lockElement, slerpMethod, slerpT, armL, armR, abT, abPlaying, abPreview, poseA, poseB}) {
  const q = useMemo(() => quatNormalize(quatFromAxisAngle(axis, THREE.MathUtils.degToRad(angleDeg))), [axis, angleDeg]);

  // 计算 A->B 过渡的局部四元数（若 A/B 定义）
  const interp = useMemo(()=>{
    if (!poseA || !poseB) return null;
    const t = abT ?? 0;
    const lerpQ = (qa,qb)=> (slerpMethod === 'NLERP' ? nlerp(qa,qb,t) : slerp(qa,qb,t));
    return {
      L: {
        clavicle: lerpQ(poseA.L.clavicle, poseB.L.clavicle),
        shoulder: lerpQ(poseA.L.shoulder, poseB.L.shoulder),
        elbow: lerpQ(poseA.L.elbow, poseB.L.elbow),
      },
      R: {
        clavicle: lerpQ(poseA.R.clavicle, poseB.R.clavicle),
        shoulder: lerpQ(poseA.R.shoulder, poseB.R.shoulder),
        elbow: lerpQ(poseA.R.elbow, poseB.R.elbow),
      }
    };
  }, [poseA, poseB, abT, slerpMethod]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.0} castShadow />
      <Grid args={[50, 50]} position={[0, -0.001, 0]} cellSize={1} cellColor="#333" sectionColor="#555" infiniteGrid />
      <primitive object={useMemo(() => new THREE.AxesHelper(2), [])} />
      <UnitSphere />
      {/* 简易躯干（与双臂同一Z）*/}
      <mesh position={[0, 0.6, 1.9]}>
        <boxGeometry args={[0.6, 1.2, 0.3]} />
        <meshStandardMaterial color={0x8088aa} opacity={0.5} transparent />
      </mesh>

      <RotatingGizmo quaternion={q} />
      <SlerpVisualizer method={slerpMethod} t={slerpT} />
      {/* 右下角小坐标轴 UI（相机附着）*/}
      
      {/* Drei 提供的 Blender 风格视口坐标轴 */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={["#ff5555", "#55dd55", "#5588ff"]} labelColor="white" />
      </GizmoHelper>
      {/* 左臂：靠近身体中线 */}
      <ArmRigVisualizer
        position={[-0.35, 0.9, 1.9]}
        side="L"
        clavSwingX={armL.clavSwingX}
        clavSwingZ={armL.clavSwingZ}
        clavTwistY={armL.clavTwistY}
        shoulderSwingX={armL.shoulderSwingX}
        shoulderSwingZ={armL.shoulderSwingZ}
        shoulderTwistY={armL.shoulderTwistY}
        elbowFlex={armL.elbowFlex}
        enableLimits={armL.enableLimits}
        overrideLocalQuats={interp && abPreview ? interp.L : null}
      />
      {/* 右臂：靠近身体中线 */}
      <ArmRigVisualizer
        position={[0.35, 0.9, 1.9]}
        side="R"
        clavSwingX={armR.clavSwingX}
        clavSwingZ={armR.clavSwingZ}
        clavTwistY={armR.clavTwistY}
        shoulderSwingX={armR.shoulderSwingX}
        shoulderSwingZ={armR.shoulderSwingZ}
        shoulderTwistY={armR.shoulderTwistY}
        elbowFlex={armR.elbowFlex}
        enableLimits={armR.enableLimits}
        overrideLocalQuats={interp && abPreview ? interp.R : null}
      />
      <FreePointerCameraControls lockElement={lockElement} />
    </>
  );
}

export default function QuaternionScene({axis, angleDeg, lockElement, slerpMethod, slerpT, armL, armR, abT, abPlaying, abPreview, poseA, poseB}) {
  // 仅返回 3D 内容，由 App 传入参数；UI 在 Canvas 外部渲染，避免 R3F 解析 DOM 元素
  return (
    <QuaternionVisualizerScene
      axis={axis}
      angleDeg={angleDeg}
      lockElement={lockElement}
      slerpMethod={slerpMethod}
      slerpT={slerpT}
      armL={armL}
      armR={armR}
      abT={abT}
      abPlaying={abPlaying}
      abPreview={abPreview}
      poseA={poseA}
      poseB={poseB}
    />
  );
}
