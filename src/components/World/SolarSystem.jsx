import React, {useMemo} from "react";
import {RigidBody, BallCollider} from "@react-three/rapier";
import * as THREE from "three";
import {usePlanets} from "../../hooks/usePlanets"; // Custom hook to fetch planet data

/**
 * @name Planet
 * @description 渲染单个星球的组件，它封装了该星球的视觉和物理表示（Rapier）。
 * 注意：為了穩定性，預設將星球設為固定剛體（type="fixed"），避免在主場景中無意下墜。
 * 若未來需要可選動態效果，可基於 options.physicsMass 切換為動態剛體。
 *
 * @param {object} props - 组件属性
 * @param {object} props.data - 单个星球的数据对象，包含半径、纹理、选项等。
 * @param {THREE.Vector3} props.position - 星球的初始位置。
 * @returns {JSX.Element}
 */
import {useRef} from "react";
function Planet({data, position}) {
  const {name, radius, textures, options = {}} = data;

  // 保守策略：固定剛體，避免與玩家/環境發生意外互動
  // 若 options.physicsMass > 0，則可切換為動態剛體
  const mass = typeof options.physicsMass === "number" ? options.physicsMass : name === "Sun" ? 0 : 1;
  const rigidType = mass > 0 ? "dynamic" : "fixed";

  return (
    <RigidBody type={rigidType} colliders={false} position={position} mass={mass} linearDamping={0.05} angularDamping={0.2}>
      <BallCollider args={[radius]} friction={0.8} restitution={0.2} />
      {/* 可視模型包在剛體內，位置由剛體控制 */}
      <mesh
        name={name}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          // 將指向操作轉為施加輕微衝量，觸發滾動而非純平移
          const rb = e.object.parent?.__r3f?.objects?.find?.((o) => o?.raw === e.eventObject)?.raw || null;
          // 後備：從 Three 對象樹向上找最近的 RigidBody
          const body = e?.eventObject?.parent?.rigidBody || e?.object?.parent?.rigidBody || null;
          const rigid = body || (typeof rb?.applyImpulse === "function" ? rb : null);
          if (rigid && rigid.applyImpulse) {
            rigid.applyImpulse({x: (Math.random() - 0.5) * 2, y: 0.5, z: (Math.random() - 0.5) * 2}, true);
            rigid.applyTorqueImpulse(
              {x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5, z: (Math.random() - 0.5) * 0.5},
              true
            );
          }
        }}
      >
        <sphereGeometry args={[radius, 32, 32]} />

        {/* 材質選擇：太陽使用發光，其他行星使用 Phong 材質 */}
        {name === "Sun" ? (
          <meshStandardMaterial
            map={textures.map}
            emissive={new THREE.Color(options.emissive || 0xffffff)}
            emissiveMap={textures.map}
            emissiveIntensity={options.emissiveIntensity ?? 0.6}
          />
        ) : (
          <meshPhongMaterial map={textures.map} normalMap={textures.normal} specularMap={textures.specular} shininess={10} />
        )}

        {/* 大氣層（可選） */}
        {textures.atmosphere && (
          <mesh>
            <sphereGeometry args={[radius * 1.02, 32, 32]} />
            <meshPhongMaterial
              map={textures.atmosphere}
              transparent
              opacity={name === "Venus" ? 0.6 : 0.8}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}

        {/* 土星環（可選） */}
        {textures.ring && (
          <mesh rotation-x={-0.5 * Math.PI}>
            <ringGeometry args={[radius * 1.2, radius * 2.5, 64]} />
            <meshPhongMaterial map={textures.ring} side={THREE.DoubleSide} transparent opacity={0.7} depthWrite={false} />
          </mesh>
        )}
      </mesh>
    </RigidBody>
  );
}

/**
 * @name SolarSystem
 * @description 渲染整个太阳系的组件。
 * 它从自定义Hook `usePlanets` 获取所有星球的数据，
 * 然后遍历数据，为每个星球渲染一个 `Planet` 组件，并为它们赋予一个初始位置。
 *
 * @returns {JSX.Element}
 */
export default function SolarSystem() {
  const planets = usePlanets();

  // 使用useMemo缓存星球位置，避免重新渲染时重置位置
  const planetsWithPositions = useMemo(() => {
    return planets.map((planet, index) => {
      let position;
      if (planet.name === "Sun") {
        position = [0, 15, -40]; // Fixed position for the sun
      } else if (planet.name === "Earth") {
        position = [10, 5, 0]; // Fixed position for Earth
      } else {
        // 散佈其他行星（隨機一次）
        const x = (Math.random() - 0.5) * 80;
        const z = (Math.random() - 0.5) * 80;
        const y = 10 + index * 5; // 不同高度
        position = [x, y, z];
      }
      return {
        ...planet,
        position,
      };
    });
  }, [planets]);

  return (
    <>
      {planetsWithPositions.map((planet) => (
        <Planet key={planet.name} data={planet} position={planet.position} />
      ))}
    </>
  );
}
