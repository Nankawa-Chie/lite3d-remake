import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

function makeTextSprite(char, color = "#ffffff"){
  const canvas = document.createElement("canvas");
  const size = 128;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,size,size);
  ctx.fillStyle = color;
  ctx.font = "bold 84px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, size/2, size/2 + 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 1;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.18, 0.18, 0.18);
  return sprite;
}

function Axis({ color=0xffffff, length=0.35, radius=0.01, dir=[1,0,0], label="X" }){
  const group = useMemo(() => new THREE.Group(), []);
  const mat = useMemo(()=> new THREE.MeshBasicMaterial({ color, depthTest:false }), [color]);
  const shaft = useMemo(()=> new THREE.CylinderGeometry(radius, radius, length*0.8, 8), [radius, length]);
  const tipSphere = useMemo(()=> new THREE.SphereGeometry(radius*2.2, 12, 12), [radius]);

  useEffect(() => {
    // 轴体
    const shaftMesh = new THREE.Mesh(shaft, mat); shaftMesh.position.y = length*0.4; shaftMesh.renderOrder = 999;
    const tipMesh = new THREE.Mesh(tipSphere, mat); tipMesh.position.y = length*0.9; tipMesh.renderOrder = 999;
    group.add(shaftMesh); group.add(tipMesh);
    // 标签
    const sprite = makeTextSprite(label, new THREE.Color(color).getStyle());
    sprite.position.set(0, length*1.05, 0); sprite.renderOrder = 1000;
    group.add(sprite);
    return () => {
      group.remove(shaftMesh); group.remove(tipMesh); group.remove(sprite);
      shaftMesh.geometry.dispose(); tipMesh.geometry.dispose();
      // sprite 纹理自动由 GC 处理
    };
  }, [group, shaft, tipSphere, mat, color, length, label]);

  // 初始沿 +Y，旋转到 dir
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    const from = new THREE.Vector3(0,1,0); const to = new THREE.Vector3(...dir).normalize();
    if (from.dot(to) < 0.9999){
      const axis = new THREE.Vector3().crossVectors(from, to).normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(from.dot(to), -1, 1));
      q.setFromAxisAngle(axis, angle);
    }
    return q;
  }, [dir]);

  return <primitive object={group} quaternion={quat} />;
}

export default function CornerAxes({ size=0.35, margin=0.12 }){
  const { camera } = useThree();
  const groupRef = useRef();
  useEffect(() => {
    const g = groupRef.current; if (!g) return;
    camera.add(g);
    g.renderOrder = 999;
    return () => { camera.remove(g); };
  }, [camera]);

  // 动态根据相机 FOV 与宽高比，计算在距离 d 处的屏幕角落坐标（世界单位）
  const d = 1.4; // 距离相机的前方距离（正值，最终 z 取 -d）
  useEffect(() => {
    const updatePos = () => {
      const g = groupRef.current; if (!g) return;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * d;
      const halfW = halfH * camera.aspect;
      g.position.set(halfW - margin, -halfH + margin, -d);
      g.scale.set(1,1,1);
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [camera, margin]);

  return (
    <group ref={groupRef}>
      {/* Blender 风格：三轴 + 球头 + 字母标签 */}
      <Axis color={0xff5555} length={size} dir={[1,0,0]} label="X" />
      <Axis color={0x55dd55} length={size} dir={[0,1,0]} label="Y" />
      <Axis color={0x5588ff} length={size} dir={[0,0,1]} label="Z" />
    </group>
  );
}
