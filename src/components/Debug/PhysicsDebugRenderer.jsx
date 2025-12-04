import React, {useRef, useEffect} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import * as THREE from "three";

/**
 * @name PhysicsDebugRenderer
 * @description 物理调试可视化组件
 * 显示物理体的线框、边界框、射线检测等调试信息
 * 
 * @param {object} props - 组件属性
 * @param {React.RefObject} props.playerRef - 玩家引用
 * @param {object} props.debugSettings - 调试设置
 * @returns {JSX.Element}
 */
function PhysicsDebugRenderer({playerRef, debugSettings = {}}) {
  const {scene} = useThree();
  const debugGroupRef = useRef();
  const wireframeRefs = useRef(new Map());
  const boundingBoxRefs = useRef(new Map());
  const raycastLineRef = useRef();
  const velocityArrowRef = useRef();

  // 创建调试材质
  const wireframeMaterial = useRef(new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    transparent: true,
    opacity: debugSettings.wireframeOpacity || 0.5,
  }));

  const boundingBoxMaterial = useRef(new THREE.LineBasicMaterial({
    color: debugSettings.boundingBoxColor || '#ff0000',
    transparent: true,
    opacity: 0.8,
  }));

  const raycastMaterial = useRef(new THREE.LineBasicMaterial({
    color: 0x0000ff,
    transparent: true,
    opacity: 0.8,
  }));

  const velocityMaterial = useRef(new THREE.MeshBasicMaterial({
    color: 0xff00ff,
  }));

  // 更新材质属性
  useEffect(() => {
    if (wireframeMaterial.current) {
      wireframeMaterial.current.opacity = debugSettings.wireframeOpacity || 0.5;
    }
    if (boundingBoxMaterial.current) {
      boundingBoxMaterial.current.color.set(debugSettings.boundingBoxColor || '#ff0000');
    }
  }, [debugSettings.wireframeOpacity, debugSettings.boundingBoxColor]);

  /**
   * @description 创建边界框线框
   * @param {THREE.Box3} box - 边界框
   * @returns {THREE.LineSegments} 线框对象
   */
  const createBoundingBoxWireframe = (box) => {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];

    // 定义立方体的12条边
    const min = box.min;
    const max = box.max;

    // 底面4条边
    vertices.push(min.x, min.y, min.z, max.x, min.y, min.z);
    vertices.push(max.x, min.y, min.z, max.x, min.y, max.z);
    vertices.push(max.x, min.y, max.z, min.x, min.y, max.z);
    vertices.push(min.x, min.y, max.z, min.x, min.y, min.z);

    // 顶面4条边
    vertices.push(min.x, max.y, min.z, max.x, max.y, min.z);
    vertices.push(max.x, max.y, min.z, max.x, max.y, max.z);
    vertices.push(max.x, max.y, max.z, min.x, max.y, max.z);
    vertices.push(min.x, max.y, max.z, min.x, max.y, min.z);

    // 垂直4条边
    vertices.push(min.x, min.y, min.z, min.x, max.y, min.z);
    vertices.push(max.x, min.y, min.z, max.x, max.y, min.z);
    vertices.push(max.x, min.y, max.z, max.x, max.y, max.z);
    vertices.push(min.x, min.y, max.z, min.x, max.y, max.z);

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return new THREE.LineSegments(geometry, boundingBoxMaterial.current);
  };

  /**
   * @description 创建射线可视化
   * @param {THREE.Vector3} origin - 射线起点
   * @param {THREE.Vector3} direction - 射线方向
   * @param {number} distance - 射线长度
   * @returns {THREE.Line} 射线对象
   */
  const createRaycastLine = (origin, direction, distance) => {
    const geometry = new THREE.BufferGeometry();
    const end = origin.clone().add(direction.clone().multiplyScalar(distance));
    
    const vertices = [
      origin.x, origin.y, origin.z,
      end.x, end.y, end.z
    ];

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return new THREE.Line(geometry, raycastMaterial.current);
  };

  /**
   * @description 创建速度向量箭头
   * @param {THREE.Vector3} position - 起始位置
   * @param {THREE.Vector3} velocity - 速度向量
   * @param {number} scale - 缩放因子
   * @returns {THREE.Group} 箭头组
   */
  const createVelocityArrow = (position, velocity, scale = 1) => {
    const group = new THREE.Group();
    
    if (velocity.length() < 0.1) return group; // 速度太小不显示

    const direction = velocity.clone().normalize();
    const length = velocity.length() * scale;

    // 箭头主体（线）
    const lineGeometry = new THREE.BufferGeometry();
    const end = position.clone().add(direction.clone().multiplyScalar(length));
    
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      position.x, position.y, position.z,
      end.x, end.y, end.z
    ], 3));

    const line = new THREE.Line(lineGeometry, velocityMaterial.current);
    group.add(line);

    // 箭头头部（锥形）
    const coneGeometry = new THREE.ConeGeometry(0.1, 0.3, 8);
    const cone = new THREE.Mesh(coneGeometry, velocityMaterial.current);
    cone.position.copy(end);
    cone.lookAt(end.clone().add(direction));
    cone.rotateX(Math.PI / 2);
    group.add(cone);

    return group;
  };

  // 主更新循环
  useFrame(() => {
    if (!debugGroupRef.current || !playerRef?.current) return;

    // 清除之前的调试对象
    debugGroupRef.current.clear();

    const playerPosition = playerRef.current.position;
    const playerPhysicsRef = playerRef.current.physicsRef;

    if (!playerPosition || !playerPhysicsRef) return;

    // 1. 显示玩家物理体线框
    if (debugSettings.showWireframes && playerPhysicsRef) {
      // 创建与物理体相同形状的线框
      const wireframeGeometry = new THREE.CapsuleGeometry(0.4, 0.8, 8, 16);
      const wireframeMesh = new THREE.Mesh(wireframeGeometry, wireframeMaterial.current);
      wireframeMesh.position.fromArray(playerPosition);
      debugGroupRef.current.add(wireframeMesh);
    }

    // 2. 显示边界框
    if (debugSettings.showBoundingBoxes) {
      const box = new THREE.Box3();
      box.setFromCenterAndSize(
        new THREE.Vector3().fromArray(playerPosition),
        new THREE.Vector3(1.0, 1.0, 1.0) // 球体的边界框
      );
      const boundingBoxWireframe = createBoundingBoxWireframe(box);
      debugGroupRef.current.add(boundingBoxWireframe);
    }

    // 3. 显示地面检测射线
    if (debugSettings.showRaycast) {
      const rayOrigin = new THREE.Vector3().fromArray(playerPosition);
      const rayDirection = new THREE.Vector3(0, -1, 0);
      const rayDistance = 0.7; // 与 PHYSICS_CONFIG.groundRayDistance 保持一致
      
      const rayLine = createRaycastLine(rayOrigin, rayDirection, rayDistance);
      debugGroupRef.current.add(rayLine);
    }

    // 4. 显示速度向量
    if (debugSettings.showVelocityVectors) {
      // 获取当前速度（需要从 MilkPlayer 组件获取）
      const velocity = playerRef.current.velocity || [0, 0, 0];
      const velocityVector = new THREE.Vector3().fromArray(velocity);
      
      if (velocityVector.length() > 0.1) {
        const playerPos = new THREE.Vector3().fromArray(playerPosition);
        playerPos.y += 0.6; // 在角色上方显示速度向量
        
        const velocityArrow = createVelocityArrow(
          playerPos, 
          velocityVector, 
          debugSettings.velocityScale || 1.0
        );
        debugGroupRef.current.add(velocityArrow);
      }
    }
  });

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      wireframeMaterial.current?.dispose();
      boundingBoxMaterial.current?.dispose();
      raycastMaterial.current?.dispose();
      velocityMaterial.current?.dispose();
    };
  }, []);

  return (
    <group ref={debugGroupRef} />
  );
}

export default PhysicsDebugRenderer;