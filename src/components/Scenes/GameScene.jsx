import React, {Suspense, useRef, useEffect, useImperativeHandle} from "react";
import * as THREE from "three";
import {useFrame} from "@react-three/fiber";
import {Sky, Environment} from "@react-three/drei";
import MilkPlayer from "../Player/MilkPlayer";
import ManukaPlayer from "../Player/ManukaPlayer";
import CameraController from "../Camera/CameraController";
import PhysicsDebugRenderer from "../Debug/PhysicsDebugRenderer";
import PostProcessingRenderer from "../Rendering/PostProcessingRenderer";
import FogRenderer from "../Rendering/FogRenderer";
import useGameStore from "../../stores/gameStore";

import BlendedTerrain from "../World/BlendedTerrain";
import WeatherSystem from "../Systems/WeatherSystem";
import SoccerField from "../World/SoccerField";
import SolarSystem from "../World/SolarSystem";
import Garden from "../World/Garden";
import LivingRoomWithTV from "../World/LivingRoomWithTV";
import OptimizedHouse from "../World/OptimizedHouse"; // 優化版房屋組件
import AnimeClassroom from "../World/AnimeClassroom";
import StarryNight from "../World/StarryNight";
import Chart3D from "../World/Chart3D";
import MMDTest from "../World/MMDTest";
import {HouseModel} from "../World/NankawaRoom"; // 南川白模房间
import GrandPiano from "../World/GrandPiano"; // 大理石钢琴
import GrayCouch from "../World/GrayCouch"; // 灰色L型沙发
import Kitchen from "../World/Kitchen"; // 厨房

// ... (LoggedPlayer 方便調試)
const LoggedMilkPlayer = React.forwardRef((props, ref) => {
  console.log("%cMilkPlayer is re-rendering", "color: red;");
  return <MilkPlayer {...props} ref={ref} />;
});

const LoggedManukaPlayer = React.forwardRef((props, ref) => {
  console.log("%cManukaPlayer is re-rendering", "color: blue;");
  return <ManukaPlayer {...props} ref={ref} />;
});

/**
 * @name PlayerRenderer
 * @description 动态角色渲染组件，支持角色切换时保持位置
 */
const PlayerRenderer = React.forwardRef(({selectedCharacter, ...props}, ref) => {
  const savedPositionRef = useRef([0, 2, 0]);
  const currentPlayerRef = useRef();
  const previousCharacterRef = useRef(selectedCharacter);

  // 当角色切换时的处理
  useEffect(() => {
    if (previousCharacterRef.current !== selectedCharacter) {
      console.log(`%c角色切换: ${previousCharacterRef.current} -> ${selectedCharacter}`, "color: cyan;");

      // 如果有前一个角色，保存其位置
      if (currentPlayerRef.current && currentPlayerRef.current.getPosition) {
        savedPositionRef.current = currentPlayerRef.current.getPosition();
        console.log(`%c保存 ${previousCharacterRef.current} 位置:`, "color: orange;", savedPositionRef.current);
      }

      previousCharacterRef.current = selectedCharacter;
    }
  }, [selectedCharacter]);

  // 当新角色加载后，恢复位置
  useEffect(() => {
    if (currentPlayerRef.current && currentPlayerRef.current.setPosition) {
      const timer = setTimeout(() => {
        if (currentPlayerRef.current && currentPlayerRef.current.setPosition) {
          console.log(`%c恢复 ${selectedCharacter} 位置:`, "color: green;", savedPositionRef.current);
          currentPlayerRef.current.setPosition(savedPositionRef.current);
        }
      }, 300); // 增加延迟确保物理体完全初始化

      return () => clearTimeout(timer);
    }
  });

  // 将内部ref暴露给外部
  useImperativeHandle(ref, () => currentPlayerRef.current);

  // 根据选中的角色渲染对应组件
  switch (selectedCharacter) {
    case "manuka":
      return <LoggedManukaPlayer {...props} ref={currentPlayerRef} key="manuka" />;
    case "milk":
    default:
      return <LoggedMilkPlayer {...props} ref={currentPlayerRef} key="milk" />;
  }
});

/**
 * @name World
 * @description 基础世界场景组件。
 * 这是第一层加载的内容，主要包含地形和电视等核心静态环境。
 * 它利用 React.Suspense 的 `children` 属性，在其内容加载完成后才渲染子组件。
 * @param {object} props - 组件属性
 * @param {React.ReactNode} props.children - 在 World 加载完成后需要渲染的子组件。
 * @returns {JSX.Element}
 */
function World({children, terrainSettings}) {
  console.log("%cWorld component is re-rendering", "color: blue;"); // 在 World 中添加日誌
  return (
    <>
      <BlendedTerrain position={[0, 0, 0]} terrainParams={terrainSettings} />

      {/* Render children only after the primary world components are loaded */}
      {children}
    </>
  );
}

/**
 * @name GameScene
 * @description 游戏的主场景组件，负责组织所有游戏元素、系统和逻辑。
 * - **场景搭建**: 包括天空、光照、物理碰撞体和所有可见模型。
 * - **系统集成**: 集成了天气系统、相机控制系统和日夜循环系统。
 * - **状态管理**: 直接從 Zustand Store 讀取和更新狀態，避免 props 傳遞造成的渲染循環。
 * - **加载策略**: 使用嵌套的 `Suspense` 来实现分阶段加载，优化用户体验。
 * 首先加载基础 `World`（地形），然后加载玩家和其他动态/静态模型。
 *
 * @param {object} props - 组件属性
 * @param {React.RefObject} props.playerRef - 指向玩家实体的引用，传递给需要它的子组件。
 * @returns {JSX.Element}
 */
function GameScene({playerRef, physicsDebugSettings, renderingSettings}) {
  // 避免订阅高频时间导致 GameScene 每帧重渲染：不要 useGameStore(selector) 订阅 time.currentTime
  const advanceTime = useGameStore.getState().advanceTime;
  // 在 GameScene 渲染時打印日誌
  console.log("%c!!! GameScene is re-rendering !!!", "background: #f00; color: #fff; font-size: 14px;");

  const sunRef = useRef();
  const skyRef = useRef();
  const hemiRef = useRef();

  // 從 Store 訂閱地形設置，用於實時響應調參
  const terrainSettings = useGameStore((state) => state.settings.terrain);

  // 訂閱選中的角色
  const selectedCharacter = useGameStore((state) => state.player.selectedCharacter);

  // 訂閱 MMD 測試狀態
  const mmdTest = useGameStore((state) => state.mmdTest);

  /**
   * Day/Night Cycle and Lighting Logic.
   * 此幀循環直接從 Store 讀取狀態並更新，避免通過 props 回調造成的渲染循環。
   */
  useFrame((state, delta) => {
    // 獲取最新的時間狀態
    // 推进内部时间（不触发每帧 setState，从而避免全场景重渲染/重置）
    advanceTime(delta);

    // 获取最新的天气状态
    const currentWeather = useGameStore.getState().weather;

    // Calculate sun position based on INTERNAL time (non-reactive)
    const tNow = useGameStore.getState().getTimeInternal?.() ?? useGameStore.getState().time.currentTime;
    const timeOfDay = tNow / 24;
    const sunAngle = timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunX = Math.cos(sunAngle);
    const sunY = Math.sin(sunAngle);
    const sunZ = 0; // Keep sun on a 2D plane for simplicity

    // Update Sky and Sun
    if (skyRef.current) {
      skyRef.current.material.uniforms.sunPosition.value.set(sunX, sunY, sunZ);
    }
    if (sunRef.current) {
      sunRef.current.position.set(
        sunX * 50,
        Math.max(sunY * 50, -10), // Ensure sun doesn't go too far below horizon
        sunZ * 50
      );

      // Adjust light intensity based on time and weather
      let baseIntensity = Math.max(0.05, Math.min(1.1, sunY + 0.35));
      switch (currentWeather.type) {
        case "cloudy":
          baseIntensity *= 0.7;
          break;
        case "rainy":
        case "stormy":
          baseIntensity *= 0.4;
          break;
        case "foggy":
          baseIntensity *= 0.6;
          break;
        case "snowy":
          baseIntensity *= 0.8;
          break;
        default:
          break;
      }
      sunRef.current.intensity = baseIntensity;

      // Adjust light color for different weather and time of day
      const isDay = sunY > -0.1;
      if (isDay) {
        let lightColor = 0xffffff;
        switch (currentWeather.type) {
          case "stormy":
            lightColor = 0x444466;
            break;
          case "cloudy":
          case "foggy":
            lightColor = 0xccccdd;
            break;
          case "snowy":
            lightColor = 0xeeeeff;
            break;
          default:
            lightColor = 0xffffff;
        }
        sunRef.current.color.setHex(lightColor);
      } else {
        // Night time light color
        sunRef.current.color.setHex(0x2a4b9a);
      }
    }

    // Hemisphere fill light: drive day/night ambiance without blowing out exposure
    if (hemiRef.current) {
      const dayFactor = THREE.MathUtils.smoothstep(sunY, -0.15, 0.35); // 0=night, 1=day
      const hemiIntensity = THREE.MathUtils.lerp(0.18, 0.45, dayFactor);
      hemiRef.current.intensity = hemiIntensity;

      // Slightly bluer at night; slightly warmer at day
      const skyDay = new THREE.Color(0xbfd8ff);
      const skyNight = new THREE.Color(0x2a3550);
      const groundDay = new THREE.Color(0x6b6a64);
      const groundNight = new THREE.Color(0x0b0d12);
      hemiRef.current.color.copy(skyNight).lerp(skyDay, dayFactor);
      hemiRef.current.groundColor.copy(groundNight).lerp(groundDay, dayFactor);
    }
  });

  return (
    <>
      {/* --- Environment and Systems --- */}
      <Sky
        ref={skyRef}
        distance={450000}
        sunPosition={[0, 1, 0]} // Initial position, will be updated in useFrame
        inclination={0}
        azimuth={0.25}
        turbidity={10}
        rayleigh={3}
        mieCoefficient={0.005}
        mieDirectionalG={0.7}
      />
      <directionalLight
        ref={sunRef}
        intensity={1}
        color="#fffde7"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-bias={-0.001}
      />

      {/* 天空半球光：提供“可控的环境补光”，避免夜晚死黑、白天更有层次 */}
      <hemisphereLight ref={hemiRef} args={[0xbfd8ff, 0x1b1f2a, 0.35]} />
      {/* Disable CameraController when MMD test is active to allow MMD camera takeover */}
      {mmdTest.active ? null : <CameraController playerRef={playerRef} />}
      <WeatherSystem />

      {/* 物理调试渲染器 */}
      <PhysicsDebugRenderer playerRef={playerRef} debugSettings={physicsDebugSettings || {}} />

      {/* 雾效渲染器 */}
      <FogRenderer settings={renderingSettings || {}} enabled={renderingSettings?.enableFog || false} />

      {/* 后处理效果渲染器 */}
      <PostProcessingRenderer settings={renderingSettings || {}} enabled={renderingSettings?.enablePostProcessing || false} />

      {/* --- Staged Loading with Nested Suspense --- */}
      <Suspense fallback={null}>
        {/* Stage 1: Load the essential world (terrain, etc.) */}

        <World terrainSettings={terrainSettings}>
          {/* Stage 2: After the world is ready, load all other assets */}
          <Suspense fallback={null}>
            <PlayerRenderer selectedCharacter={selectedCharacter} ref={playerRef} />
            <OptimizedHouse position={[0, 0, -10]} />

            {/* Other world objects */}
            <SoccerField position={[-50, 0.03, 0]} />
            <SolarSystem />
            <Garden position={[-2, 0.1, 10]} scale={1.6} rotation-y={Math.PI} />
            <Environment
              files="/hdri/dikhololo_night_1k.hdr"
              intensity={renderingSettings?.environmentIntensity ?? 0.35}
              background={false}
            />
            <LivingRoomWithTV position={[15, -0.05, -10]} />
            <AnimeClassroom position={[40, 0.5, 20]} scale={0.5} />
            <StarryNight scale={2} position={[20, -2, 10]} rotation-y={-Math.PI / 2} />

            {/* MC护甲伤害抵消机制3D图表 */}
            <Chart3D position={[-5.8, 2.1, -10]} scale={0.4} rotation={[0, Math.PI / 2, 0]} />

            {/* 南川白模房间 - Nankawa Room */}
            <group position={[25, 0.02, -30]}>
              <HouseModel />
            </group>

            {/* 大理石钢琴 - 放置在场景中 */}
            <GrandPiano position={[42, 0, -12.5]} scale={0.0014} rotation={[0, Math.PI / 2, 0]} />

            {/* 灰色L型沙发 - 放置在南川房间主厅 */}
            <GrayCouch position={[44, 0, -26]} scale={2} rotation={[0, -Math.PI / 2, 0]} />

            {/* 厨房 - 放置在南川房间主厨区域 */}
            <Kitchen position={[60.16, 0, -11.15]} scale={0.042} rotation={[0, -Math.PI / 2, 0]} />

            {/* MMD Test Mount */}
            {mmdTest.active && mmdTest.config && (
              <MMDTest
                modelUrl={mmdTest.config.modelUrl}
                motionUrls={mmdTest.config.motionUrls}
                cameraUrl={mmdTest.config.cameraUrl}
                audioUrl={mmdTest.config.audioUrl}
                position={mmdTest.config.position || [0, 0, 0]}
                rotation={mmdTest.config.rotation || [0, 0, 0]}
                scale={mmdTest.config.scale || 1}
                physicsEnabled={!!mmdTest.config.physicsEnabled}
                timeScale={mmdTest.config.timeScale || 1}
                loop={mmdTest.config.loop !== false}
                cameraPosScale={mmdTest.config.cameraPosScale ?? 1}
                cameraOffset={mmdTest.config.cameraOffset ?? [0, 0, 0]}
                cameraMinHeight={mmdTest.config.cameraMinHeight ?? 0}
                linkCameraScale={mmdTest.config.linkCameraScale ?? true}
                linkCameraPosition={mmdTest.config.linkCameraPosition ?? true}
                morphRemapMap={mmdTest.config.morphRemapMap || null}
                morphRemapIndexMap={mmdTest.config.morphRemapIndexMap || null}
                onLoaded={mmdTest.config.onLoaded}
              />
            )}
          </Suspense>
        </World>
      </Suspense>
    </>
  );
}

export default GameScene;
