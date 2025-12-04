import React, {useMemo, useEffect, useState} from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import {Box} from "@react-three/drei";
import * as THREE from "three";
import textureManager from "../../utils/TextureManager";

/**
 * @name OptimizedHouse
 * @description 優化版房屋組件 - 使用紋理管理器避免重複加載
 * @author 南川千繪 (Nankawa Chie)
 */
function OptimizedHouse(props) {
  const [textures, setTextures] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- 物理碰撞體 ---
  // 物理體的位置基於傳入的 props.position 來計算。
  // 這樣，無論房子被放在哪裡，視覺體都會跟隨它。
  // 使用 Rapier 靜態剛體與立方體碰撞器，位置為 group 的當地座標
  // 轉換：先前 useBox 中的 position 為世界座標，這裡改為相對於組的局部偏移
  const base = props.position || [0, 0, 0];
  // 牆體
  const walls = (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[4/2, 6/2, 0.2/2]} position={[-4, 3, 6]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[4/2, 6/2, 0.2/2]} position={[4, 3, 6]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[12/2, 6/2, 0.2/2]} position={[0, 3, -6]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.2/2, 6/2, 12/2]} position={[-6, 3, 0]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.2/2, 6/2, 12/2]} position={[6, 3, 0]} />
      </RigidBody>
      {/* 地板 */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[12/2, 0.2/2, 12/2]} position={[0, 0.1, 0]} />
      </RigidBody>
      {/* 屋頂 */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[12.5/2, 0.3/2, 12.5/2]} position={[0, 6.0, 0]} />
      </RigidBody>
    </>
  );

  // 紋理配置
  const textureConfig = useMemo(
    () => ({
      brick: {
        urls: [
          "/assets/textures/bricks/color.jpg",
          "/assets/textures/bricks/normal.jpg",
          "/assets/textures/bricks/roughness.jpg",
          "/assets/textures/bricks/ambientOcclusion.jpg",
        ],
        options: {
          repeat: [2, 2],
          wrapS: THREE.RepeatWrapping,
          wrapT: THREE.RepeatWrapping,
        },
      },
      floor: {
        urls: ["/assets/textures/floor.jpg"],
        options: {
          repeat: [6, 6],
          wrapS: THREE.RepeatWrapping,
          wrapT: THREE.RepeatWrapping,
        },
      },
    }),
    []
  );

  // 異步加載紋理
  useEffect(() => {
    let mounted = true;

    const loadTextures = async () => {
      try {
        setIsLoading(true);

        const [brickTextures, floorTextures] = await Promise.all([
          textureManager.loadTextures(textureConfig.brick.urls, textureConfig.brick.options),
          textureManager.loadTextures(textureConfig.floor.urls, textureConfig.floor.options),
        ]);

        if (mounted) {
          setTextures({
            brickColor: brickTextures[0],
            brickNormal: brickTextures[1],
            brickRoughness: brickTextures[2],
            brickAO: brickTextures[3],
            floor: floorTextures[0],
          });
          setIsLoading(false);
        }
      } catch (error) {
        console.error("紋理加載失敗:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadTextures();

    return () => {
      mounted = false;
    };
  }, [textureConfig]);

  // 優化：使用 useMemo 緩存材質
  const brickMaterial = useMemo(() => {
    if (!textures) return null;

    return new THREE.MeshStandardMaterial({
      map: textures.brickColor,
      normalMap: textures.brickNormal,
      roughnessMap: textures.brickRoughness,
      aoMap: textures.brickAO,
      roughness: 0.8,
      metalness: 0.1,
    });
  }, [textures]);

  const floorMaterial = useMemo(() => {
    if (!textures) return null;

    return new THREE.MeshStandardMaterial({
      map: textures.floor,
      roughness: 0.9,
      metalness: 0.0,
    });
  }, [textures]);

  const roofMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: "#654321",
      roughness: 0.9,
      metalness: 0.0,
    });
  }, []);

  // 如果還在加載，返回簡化版本
  if (isLoading || !textures) {
    return (
      <group {...props}>
        {/* 簡化版房屋，使用基本材質 */}
        <Box args={[4, 6, 0.2]} position={[-4, 3, 6]} castShadow receiveShadow>
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </Box>
        <Box args={[4, 6, 0.2]} position={[4, 3, 6]} castShadow receiveShadow>
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </Box>
        <Box args={[4, 1.5, 0.2]} position={[0, 5.25, 6]} castShadow receiveShadow>
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </Box>
        <Box args={[12, 6, 0.2]} position={[0, 3, -6]} castShadow receiveShadow>
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </Box>
        <Box args={[0.2, 6, 12]} position={[-6, 3, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </Box>
        <Box args={[0.2, 6, 12]} position={[6, 3, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#8B4513" roughness={0.8} />
        </Box>
        <Box args={[12, 0.2, 12]} position={[0, 0.1, 0]} receiveShadow>
          <meshStandardMaterial color="#D2B48C" roughness={0.9} />
        </Box>
        <Box args={[12.5, 0.3, 12.5]} position={[0, 6.0, 0]} castShadow>
          <meshStandardMaterial color="#654321" roughness={0.9} />
        </Box>
      </group>
    );
  }

  return (
    <group {...props}>
      {/* Rapier 靜態碰撞體 */}
      {walls}
      {/* 牆壁 - 使用優化的材質 */}
      <Box args={[4, 6, 0.2]} position={[-4, 3, 6]} castShadow receiveShadow>
        <primitive object={brickMaterial} />
      </Box>
      <Box args={[4, 6, 0.2]} position={[4, 3, 6]} castShadow receiveShadow>
        <primitive object={brickMaterial.clone()} />
      </Box>
      <Box args={[4, 1.5, 0.2]} position={[0, 5.25, 6]} castShadow receiveShadow>
        <primitive object={brickMaterial.clone()} />
      </Box>
      <Box args={[12, 6, 0.2]} position={[0, 3, -6]} castShadow receiveShadow>
        <primitive object={brickMaterial.clone()} />
      </Box>
      <Box args={[0.2, 6, 12]} position={[-6, 3, 0]} castShadow receiveShadow>
        <primitive object={brickMaterial.clone()} />
      </Box>
      <Box args={[0.2, 6, 12]} position={[6, 3, 0]} castShadow receiveShadow>
        <primitive object={brickMaterial.clone()} />
      </Box>

      {/* 地板 */}
      <Box args={[12, 0.2, 12]} position={[0, 0.1, 0]} receiveShadow>
        <primitive object={floorMaterial} />
      </Box>

      {/* 屋頂 */}
      <Box args={[12.5, 0.3, 12.5]} position={[0, 6.0, 0]} castShadow>
        <primitive object={roofMaterial} />
      </Box>
    </group>
  );
}

export default OptimizedHouse;
