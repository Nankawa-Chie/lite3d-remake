import React, {useMemo} from "react";
import {Canvas} from "@react-three/fiber";
import {OrbitControls, Text, Environment, useTexture} from "@react-three/drei";
import * as THREE from "three";
import SocialPortals from "./SocialPortals";

// ==========================================
// 1. 基础配置
// ==========================================
const COLORS = {
  wall: "#e0e0e0",
  floorIndoor: "#f5f5f5",
  floorOutdoor: "#121212",
  floorPool: "#a8d5e5", // 浅蓝砖
  doorSingle: "#bfa128",
  doorDouble: "#d4b635",
  doorSliding: "#5c3a21",
  glass: "#87ceeb",
  grass: "#2d4c1e",
  water: "#006994",
};

// --- 厚度调整区 ---
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.12; // 墙体极薄化
const DOOR_HEIGHT = 2.4;
const DOOR_THICKNESS = 0.06; // 普通门极薄化
const SLIDING_DOOR_THICKNESS = 0.05; // 推拉门极薄化

// ==========================================
// 2. 墙体组件
// ==========================================
const ensureUv2 = (geometry) => {
  // Needed for aoMap. Safe no-op if already present.
  if (!geometry?.attributes?.uv || geometry.attributes.uv2) return;
  geometry.setAttribute("uv2", new THREE.BufferAttribute(geometry.attributes.uv.array, 2));
};

const SmartWall = ({start, end, door = null, glass = false, materials}) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const midX = (start[0] + end[0]) / 2;
  const midY = (start[1] + end[1]) / 2;

  if (glass) {
    return (
      <group position={[midX, WALL_HEIGHT / 2, midY]} rotation={[0, -angle, 0]}>
        <mesh>
          <boxGeometry args={[length, WALL_HEIGHT, 0.04]} />
          <meshPhysicalMaterial color={COLORS.glass} transparent opacity={0.3} roughness={0} metalness={0.9} />
        </mesh>
        <mesh>
          <boxGeometry args={[length, WALL_HEIGHT, 0.015]} />
          <meshBasicMaterial color="#333" wireframe />
        </mesh>
      </group>
    );
  }

  if (!door) {
    return (
      <mesh
        position={[midX, WALL_HEIGHT / 2, midY]}
        rotation={[0, -angle, 0]}
        onUpdate={(self) => {
          if (self.geometry) ensureUv2(self.geometry);
        }}
      >
        <boxGeometry args={[length, WALL_HEIGHT, WALL_THICKNESS]} />
        {materials?.wallMat ? (
          <primitive object={materials.wallMat} attach="material" />
        ) : (
          <meshStandardMaterial color={COLORS.wall} />
        )}
      </mesh>
    );
  }

  const doorWidth = door.width || 1.0;
  const doorOffset = door.offset || length / 2;
  const part1Length = doorOffset - doorWidth / 2;
  const part2Length = length - (doorOffset + doorWidth / 2);

  let doorColor = COLORS.doorSingle;
  let currentDoorThickness = DOOR_THICKNESS;

  if (door.type === "double") doorColor = COLORS.doorDouble;
  if (door.type === "sliding") {
    doorColor = COLORS.doorSliding;
    currentDoorThickness = SLIDING_DOOR_THICKNESS;
  }

  return (
    <group position={[start[0], 0, start[1]]} rotation={[0, -angle, 0]}>
      {part1Length > 0 && (
        <mesh
          position={[part1Length / 2, WALL_HEIGHT / 2, 0]}
          onUpdate={(self) => {
            if (self.geometry) ensureUv2(self.geometry);
          }}
        >
          <boxGeometry args={[part1Length, WALL_HEIGHT, WALL_THICKNESS]} />
          {materials?.wallMat ? (
            <primitive object={materials.wallMat} attach="material" />
          ) : (
            <meshStandardMaterial color={COLORS.wall} />
          )}
        </mesh>
      )}
      <group position={[doorOffset, DOOR_HEIGHT / 2, 0]}>
        {/* 门板 */}
        <mesh>
          <boxGeometry args={[doorWidth, DOOR_HEIGHT, currentDoorThickness]} />
          {/* Door is kept simple for now */}
          <meshStandardMaterial color={doorColor} roughness={0.85} metalness={0.0} />
        </mesh>
        {/* 门上方补墙 (门梁) */}
        <mesh
          position={[0, (WALL_HEIGHT - DOOR_HEIGHT) / 2 + DOOR_HEIGHT / 2, 0]}
          onUpdate={(self) => {
            if (self.geometry) ensureUv2(self.geometry);
          }}
        >
          <boxGeometry args={[doorWidth, WALL_HEIGHT - DOOR_HEIGHT, WALL_THICKNESS]} />
          {materials?.wallMat ? (
            <primitive object={materials.wallMat} attach="material" />
          ) : (
            <meshStandardMaterial color={COLORS.wall} />
          )}
        </mesh>
      </group>
      {part2Length > 0 && (
        <mesh
          position={[length - part2Length / 2, WALL_HEIGHT / 2, 0]}
          onUpdate={(self) => {
            if (self.geometry) ensureUv2(self.geometry);
          }}
        >
          <boxGeometry args={[part2Length, WALL_HEIGHT, WALL_THICKNESS]} />
          {materials?.wallMat ? (
            <primitive object={materials.wallMat} attach="material" />
          ) : (
            <meshStandardMaterial color={COLORS.wall} />
          )}
        </mesh>
      )}
    </group>
  );
};

// ==========================================
// 3. 房间标注
// ==========================================
const RoomLabel = ({position, text, subText}) => (
  <group position={position}>
    <Text position={[0, 1.5, 0]} fontSize={0.8} color="#333" anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}>
      {text}
    </Text>
    {subText && (
      <Text
        position={[0, 0.7, 0]}
        fontSize={0.4}
        color="#666"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {subText}
      </Text>
    )}
  </group>
);

// ==========================================
// 4. 户型核心逻辑
// ==========================================
const HouseModel = ({playerRef} = {}) => {
  // === PBR materials (lightweight, shared) ===
  const wallColor = useTexture("/assets/textures/PBR/Wall/Planks021_1K-PNG_Color.png");
  const wallNormal = useTexture("/assets/textures/PBR/Wall/Planks021_1K-PNG_NormalGL.png");
  const wallRough = useTexture("/assets/textures/PBR/Wall/Planks021_1K-PNG_Roughness.png");
  const wallAO = useTexture("/assets/textures/PBR/Wall/Planks021_1K-PNG_AmbientOcclusion.png");

  const floorColor = useTexture("/assets/textures/PBR/Floor/Tiles081_1K-PNG_Color.png");
  const floorNormal = useTexture("/assets/textures/PBR/Floor/Tiles081_1K-PNG_NormalGL.png");
  const floorRough = useTexture("/assets/textures/PBR/Floor/Tiles081_1K-PNG_Roughness.png");

  const bathroomTilesColor = useTexture("/assets/textures/PBR/Tiles/Tiles122_1K-PNG_Color.png");
  const bathroomTilesNormal = useTexture("/assets/textures/PBR/Tiles/Tiles122_1K-PNG_NormalGL.png");
  const bathroomTilesRough = useTexture("/assets/textures/PBR/Tiles/Tiles122_1K-PNG_Roughness.png");
  const bathroomTilesAO = useTexture("/assets/textures/PBR/Tiles/Tiles122_1K-PNG_AmbientOcclusion.png");

  const rugColor = useTexture("/assets/textures/PBR/Rug/Carpet003_1K-PNG_Color.png");
  const rugNormal = useTexture("/assets/textures/PBR/Rug/Carpet003_1K-PNG_NormalGL.png");
  const rugRough = useTexture("/assets/textures/PBR/Rug/Carpet003_1K-PNG_Roughness.png");
  const rugAO = useTexture("/assets/textures/PBR/Rug/Carpet003_1K-PNG_AmbientOcclusion.png");

  const metalColor = useTexture("/assets/textures/PBR/Metal/Metal009_1K-PNG_Color.png");
  const metalNormal = useTexture("/assets/textures/PBR/Metal/Metal009_1K-PNG_NormalGL.png");
  const metalRough = useTexture("/assets/textures/PBR/Metal/Metal009_1K-PNG_Roughness.png");
  const metalMetalness = useTexture("/assets/textures/PBR/Metal/Metal009_1K-PNG_Metalness.png");

  const materials = useMemo(() => {
    const configure = (tex, {repeat = [1, 1], isColor = false} = {}) => {
      if (!tex) return;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat[0], repeat[1]);
      tex.anisotropy = 8;
      if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    };

    // Reasonable tiling defaults (can tweak later)
    configure(wallColor, {repeat: [6, 2], isColor: true});
    configure(wallNormal, {repeat: [6, 2]});
    configure(wallRough, {repeat: [6, 2]});
    configure(wallAO, {repeat: [6, 2]});

    configure(floorColor, {repeat: [10, 8], isColor: true});
    configure(floorNormal, {repeat: [10, 8]});
    configure(floorRough, {repeat: [10, 8]});

    configure(bathroomTilesColor, {repeat: [4, 4], isColor: true});
    configure(bathroomTilesNormal, {repeat: [4, 4]});
    configure(bathroomTilesRough, {repeat: [4, 4]});
    configure(bathroomTilesAO, {repeat: [4, 4]});

    configure(rugColor, {repeat: [2, 2], isColor: true});
    configure(rugNormal, {repeat: [2, 2]});
    configure(rugRough, {repeat: [2, 2]});
    configure(rugAO, {repeat: [2, 2]});

    configure(metalColor, {repeat: [2, 2], isColor: true});
    configure(metalNormal, {repeat: [2, 2]});
    configure(metalRough, {repeat: [2, 2]});
    configure(metalMetalness, {repeat: [2, 2]});

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallColor,
      normalMap: wallNormal,
      roughnessMap: wallRough,
      aoMap: wallAO,
      roughness: 1,
    });

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorColor,
      normalMap: floorNormal,
      roughnessMap: floorRough,
      roughness: 1,
    });

    const bathroomTilesMat = new THREE.MeshStandardMaterial({
      map: bathroomTilesColor,
      normalMap: bathroomTilesNormal,
      roughnessMap: bathroomTilesRough,
      aoMap: bathroomTilesAO,
      roughness: 1,
    });

    const rugMat = new THREE.MeshStandardMaterial({
      map: rugColor,
      normalMap: rugNormal,
      roughnessMap: rugRough,
      aoMap: rugAO,
      roughness: 1,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      map: metalColor,
      normalMap: metalNormal,
      roughnessMap: metalRough,
      metalnessMap: metalMetalness,
      roughness: 0.85,
      metalness: 1,
    });

    return {wallMat, floorMat, bathroomTilesMat, rugMat, metalMat};
  }, [
    wallColor,
    wallNormal,
    wallRough,
    wallAO,
    floorColor,
    floorNormal,
    floorRough,
    bathroomTilesColor,
    bathroomTilesNormal,
    bathroomTilesRough,
    bathroomTilesAO,
    rugColor,
    rugNormal,
    rugRough,
    rugAO,
    metalColor,
    metalNormal,
    metalRough,
    metalMetalness,
  ]);

  // === 坐标定义 ===
  const X0 = 0;
  const X_LIVING_R = 15;
  const X_BED_START = 22;
  const X_BED_DIV1 = 34;
  const X_BED_DIV2 = 42;
  const X_RIGHT = 52;

  const Z0 = 0;
  const Z_BED_WALL = 12;
  const Z_LIVING_SEP = 14;
  const Z_BATH_BOT = 22;
  const Z_HALL_BOT = 28;
  const Z_BOTTOM = 36;

  const X_UNSPEC_START = 38;

  const walls = useMemo(
    () => [
      // 1. 北墙 (完整)
      {start: [X0, Z0], end: [X_RIGHT, Z0]},

      // 2. 左侧区域
      // 西墙 (主门)
      {start: [X0, Z0], end: [X0, Z_LIVING_SEP], door: {type: "double", offset: 7, width: 2.2}},
      // 客卫西墙
      {start: [X0, Z_LIVING_SEP], end: [X0, Z_BATH_BOT]},
      // 客卫南墙
      {start: [X0, Z_BATH_BOT], end: [X_LIVING_R, Z_BATH_BOT]},
      // 客卫东墙
      {start: [X_LIVING_R, Z_LIVING_SEP], end: [X_LIVING_R, Z_BATH_BOT]},
      // 客卫北墙 (带门)
      {start: [X0, Z_LIVING_SEP], end: [X_LIVING_R, Z_LIVING_SEP], door: {type: "single", offset: 8, width: 1.2}},
      // 玻璃取景墙
      {start: [X_LIVING_R, Z_BATH_BOT], end: [X_LIVING_R, Z_BOTTOM], glass: true},

      // 3. 右侧卧室群
      // 主卧西墙
      {start: [X_BED_START, Z0], end: [X_BED_START, Z_BED_WALL]},

      // 卧室南侧走廊墙
      // 主卧门 (靠右)
      {start: [X_BED_START, Z_BED_WALL], end: [X_BED_DIV1, Z_BED_WALL], door: {type: "double", offset: 9, width: 1.8}},
      // 儿童房门
      {start: [X_BED_DIV1, Z_BED_WALL], end: [X_BED_DIV2, Z_BED_WALL], door: {type: "single", offset: 4, width: 1.2}},
      // 次卧门
      {start: [X_BED_DIV2, Z_BED_WALL], end: [X_RIGHT, Z_BED_WALL], door: {type: "single", offset: 5, width: 1.2}},

      // 卧室之间的隔断
      {start: [X_BED_DIV1, Z0], end: [X_BED_DIV1, Z_BED_WALL]},
      {start: [X_BED_DIV2, Z0], end: [X_BED_DIV2, Z_BED_WALL]},

      // --- 主卧内卫 ---
      // 内卫东墙 (X位置移动到 X_BED_START + 6)
      {start: [X_BED_START + 6, Z_BED_WALL - 3.5], end: [X_BED_START + 6, Z_BED_WALL]},
      // 内卫北墙 (门 offset 4.5 靠右)
      {
        start: [X_BED_START, Z_BED_WALL - 3.5],
        end: [X_BED_START + 6, Z_BED_WALL - 3.5],
        door: {type: "single", offset: 4.5, width: 0.9},
      },

      // 4. 东侧与南侧
      {start: [X_RIGHT, Z0], end: [X_RIGHT, Z_BED_WALL], door: {type: "sliding", offset: 6, width: 2.5}},
      {start: [X_RIGHT, Z_BED_WALL], end: [X_RIGHT, Z_HALL_BOT], door: {type: "double", offset: 8, width: 2.0}},
      {start: [X_RIGHT, Z_HALL_BOT], end: [X_RIGHT, Z_BOTTOM], door: {type: "sliding", offset: 4, width: 2.5}},
      {start: [X_LIVING_R, Z_BOTTOM], end: [X_RIGHT, Z_BOTTOM]},
      {start: [X_UNSPEC_START, Z_HALL_BOT], end: [X_UNSPEC_START, Z_BOTTOM]},
      {start: [X_UNSPEC_START, Z_HALL_BOT], end: [X_RIGHT, Z_HALL_BOT], door: {type: "single", offset: 3, width: 1.2}},
    ],
    [],
  );

  return (
    <group>
      {walls.map((wall, index) => (
        <SmartWall key={index} {...wall} materials={materials} />
      ))}

      {/* === 地板系统 === */}

      {/* 1. 主室内地板 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[X_RIGHT / 2 + 2, -0.01, Z_BOTTOM / 2]}
        onUpdate={(self) => {
          if (self.geometry) ensureUv2(self.geometry);
        }}
      >
        <planeGeometry args={[X_RIGHT + 10, Z_BOTTOM + 5]} />
        {materials?.floorMat ? (
          <primitive object={materials.floorMat} attach="material" />
        ) : (
          <meshStandardMaterial color={COLORS.floorIndoor} />
        )}
      </mesh>

      {/* 2. 客卫地板 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[X_LIVING_R / 2, 0.02, (Z_LIVING_SEP + Z_BATH_BOT) / 2]}
        onUpdate={(self) => {
          if (self.geometry) ensureUv2(self.geometry);
        }}
      >
        <planeGeometry args={[X_LIVING_R, Z_BATH_BOT - Z_LIVING_SEP]} />
        {materials?.bathroomTilesMat ? (
          <primitive object={materials.bathroomTilesMat} attach="material" />
        ) : (
          <meshStandardMaterial color={COLORS.floorPool} />
        )}
      </mesh>

      {/* 3. 主卫地板 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[X_BED_START + 3, 0.02, Z_BED_WALL - 1.75]}
        onUpdate={(self) => {
          if (self.geometry) ensureUv2(self.geometry);
        }}
      >
        <planeGeometry args={[6, 3.5]} />
        {materials?.bathroomTilesMat ? (
          <primitive object={materials.bathroomTilesMat} attach="material" />
        ) : (
          <meshStandardMaterial color={COLORS.floorPool} />
        )}
      </mesh>

      {/* 4. 户外大草坪 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[X_RIGHT + 20, -0.05, Z_BOTTOM / 2]}>
        <planeGeometry args={[50, 80]} />
        <meshStandardMaterial color={COLORS.floorOutdoor} />
      </mesh>

      {/* === 户外功能区 === */}

      {/* 泳池 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[X_RIGHT + 8, 0.05, 6]}>
        <planeGeometry args={[10, 12]} />
        <meshStandardMaterial color={COLORS.water} roughness={0.1} metalness={0.1} />
      </mesh>
      <Text position={[X_RIGHT + 8, 0.5, 6]} rotation={[-Math.PI / 2, 0, 0]} fontSize={1.5} color="white">
        泳池
      </Text>

      {/* 种植园 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[X_RIGHT + 8, 0.05, Z_BOTTOM - 5]}>
        <planeGeometry args={[10, 8]} />
        <meshStandardMaterial color={COLORS.grass} />
      </mesh>
      <Text position={[X_RIGHT + 8, 0.5, Z_BOTTOM - 5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={1.5} color="white">
        种植园
      </Text>

      {/* === 客厅展示区：Portal墙 + 沙发 + 地毯 + 灯光（背靠主卧西墙，面向客厅中心） === */}

      {/* Rug: in living room, in front of master bedroom west wall */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[X_BED_START - 2.5, 0.01, Z_LIVING_SEP / 2]}
        onUpdate={(self) => {
          if (self.geometry) ensureUv2(self.geometry);
        }}
      >
        <planeGeometry args={[5, 7]} />
        {materials?.rugMat ? <primitive object={materials.rugMat} attach="material" /> : <meshStandardMaterial color="#999" />}
      </mesh>

      {/* Ceiling lights for living room showcase area */}
      <group>
        <pointLight
          position={[X_BED_START - 2.5, 3.2, Z_LIVING_SEP / 2]}
          intensity={35}
          distance={18}
          decay={2}
          color={0xfff1dd}
        />
        <pointLight
          position={[X_BED_START - 3.5, 3.0, Z_LIVING_SEP / 2 - 2]}
          intensity={18}
          distance={14}
          decay={2}
          color={0xe8f1ff}
        />
        <pointLight
          position={[X_BED_START - 3.5, 3.0, Z_LIVING_SEP / 2 + 2]}
          intensity={18}
          distance={14}
          decay={2}
          color={0xe8f1ff}
        />

        {/* Small metal fixtures (purely visual) */}
        <mesh position={[X_BED_START - 2.5, 3.45, Z_LIVING_SEP / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.08, 24]} />
          {materials?.metalMat ? (
            <primitive object={materials.metalMat} attach="material" />
          ) : (
            <meshStandardMaterial color="#666" metalness={1} roughness={0.6} />
          )}
        </mesh>
      </group>

      {/* Social portals: on master bedroom west wall (living room side), facing west into living room */}
      <SocialPortals
        playerRef={playerRef}
        basePosition={[X_BED_START - 0.5, 1.5, Z_LIVING_SEP / 2]}
        rotationY={-Math.PI / 2}
        spacing={2.2}
      />

      {/* Metal pedestal under portals */}
      <mesh position={[X_BED_START - 0.5, 0.15, Z_LIVING_SEP / 2]}>
        <boxGeometry args={[0.8, 0.15, 7.0]} />
        {materials?.metalMat ? (
          <primitive object={materials.metalMat} attach="material" />
        ) : (
          <meshStandardMaterial color="#777" metalness={1} roughness={0.55} />
        )}
      </mesh>

      {/* === 标签 === */}
      <RoomLabel position={[X_LIVING_R / 2, 0, Z_LIVING_SEP / 2]} text="客厅" />
      <RoomLabel position={[X_LIVING_R / 2, 0, (Z_LIVING_SEP + Z_BATH_BOT) / 2]} text="客卫" />

      <RoomLabel position={[X_BED_START + 8, 0, Z_BED_WALL / 2]} text="主卧" />
      <RoomLabel position={[X_BED_START + 3, 0, Z_BED_WALL - 1.75]} text="主卫" subText="(内)" />

      <RoomLabel position={[(X_BED_DIV1 + X_BED_DIV2) / 2, 0, Z_BED_WALL / 2]} text="儿童房" />
      <RoomLabel position={[(X_BED_DIV2 + X_RIGHT) / 2, 0, Z_BED_WALL / 2]} text="次卧" />

      <RoomLabel position={[25, 0, 20]} text="主厅" />

      <RoomLabel position={[28, 0, Z_BOTTOM - 5]} text="主厨" subText="(开放式)" />
      <RoomLabel position={[(X_UNSPEC_START + X_RIGHT) / 2, 0, Z_BOTTOM - 5]} text="未指定" />
      <RoomLabel position={[X_RIGHT + 8, 0, 20]} text="后庭" />
    </group>
  );
};

export {HouseModel};

export default function FloorPlanViewer() {
  return (
    <div style={{width: "100%", height: "100vh", background: "#111"}}>
      <Canvas camera={{position: [25, 45, 50], fov: 45}} shadows>
        <ambientLight intensity={0.5} />
        <pointLight position={[25, 20, 25]} intensity={0.8} />
        <directionalLight position={[-10, 30, -10]} intensity={0.6} castShadow />

        <HouseModel />

        <OrbitControls target={[25, 0, 18]} />
        <Environment preset="city" />
        <gridHelper args={[80, 80, 0x444444, 0x222222]} position={[25, -0.03, 18]} />
      </Canvas>
    </div>
  );
}
