import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { quatFromAxisAngle, quatNormalize, slerp as quatSlerp, nlerp as quatNlerp } from "../../Math/quaternionMath";

function Gizmo({ color = 0xffaa00, quaternion=[0,0,0,1], position=[0,0,0], opacity=1 }){
  const ref = useRef();
  const geom = useMemo(() => new THREE.BoxGeometry(0.5,0.5,0.5), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: opacity<1, opacity }), [color, opacity]);
  useEffect(() => { if (ref.current) ref.current.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]); }, [quaternion]);
  return <mesh ref={ref} geometry={geom} material={mat} position={position} castShadow receiveShadow />;
}

export default function SlerpVisualizer({ method = "SLERP", t = 0 }){
  // 预设 QA=绕X 90°，QB=绕Y 90°
  const QA = useMemo(() => quatNormalize(quatFromAxisAngle([1,0,0], Math.PI/2)), []);
  const QB = useMemo(() => quatNormalize(quatFromAxisAngle([0,1,0], Math.PI/2)), []);

  const QI = useMemo(() => {
    return method === "NLERP" ? quatNlerp(QA, QB, t) : quatSlerp(QA, QB, t);
  }, [method, t, QA, QB]);

  return (
    <group position={[3.2,0,0]}>
      <Gizmo color={0x6699ff} quaternion={QA} position={[-1.2,0,0]} opacity={0.4} />
      <Gizmo color={0x66cc88} quaternion={QB} position={[1.2,0,0]} opacity={0.4} />
      <Gizmo color={0xffaa00} quaternion={QI} position={[0,0,0]} opacity={1} />
    </group>
  );
}
