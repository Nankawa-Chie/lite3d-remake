// App.jsx
import {Suspense, useCallback, useRef, useState, useEffect, useMemo} from "react";
import {Canvas} from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import {useProgress, View} from "@react-three/drei";
import LoadingScreen from "./components/UI/LoadingScreen";
import * as THREE from "three";
import {PerfHeadless} from "r3f-perf";
import "./App.css";

// 导入所有需要的组件
import GameScene from "./components/Scenes/GameScene";
import QuaternionScene from "./components/Scenes/QuaternionScene";
import HauntedMazeScene from "./components/Scenes/HauntedMazeScene";
import GameUI from "./components/UI/GameUI";
import QuaternionUI from "./components/UI/QuaternionUI";
import { computeArmLocalQuats } from "./components/Scenes/visualizers/armKinematics";
// import AxesLegend from "./components/UI/AxesLegend";
import { quatFromAxisAngle, quatNormalize, slerp as quatSlerp, nlerp as quatNlerp, quatDelta, quatToEuler } from "./components/Math/quaternionMath";
import StaminaBar from "./components/UI/StaminaBar";
import DebugPanel from "./components/UI/DebugPanel";
import Crosshair from "./components/UI/Crosshair";
import MinimapOverlay from "./components/Systems/MinimapOverlay";
import SmoothStaminaCalculator from "./components/Systems/SmoothStaminaCalculator";
import PerformanceDataCollector from "./components/Debug/PerformanceDataCollector";
import {PERFORMANCE_CONFIG} from "./config/PerformanceConfig";
import useGameStore from "./stores/gameStore";

function App() {
  // 加载进度管理
  const { active, progress, loaded, total, item } = useProgress();

  function formatTs(){
    const d=new Date();
    const pad=n=> String(n).padStart(2,'0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  // Unity/Warudo 模式配置与工具
  const [unityMode, setUnityMode] = useState(false);
  const [axisMap, setAxisMap] = useState({ Xw: "-Yp", Yw: "+Xp", Zw: "+Zp" });
  const [unityEulerOrder, setUnityEulerOrder] = useState("ZXY");
  const [unityCompose, setUnityCompose] = useState("right"); // "right" or "left"

  function buildAxisMatrix(map){
    const pick = {
      "+Xp": [1,0,0], "-Xp": [-1,0,0],
      "+Yp": [0,1,0], "-Yp": [0,-1,0],
      "+Zp": [0,0,1], "-Zp": [0,0,-1],
    };
    const colX = pick[map.Xw] || [1,0,0];
    const colY = pick[map.Yw] || [0,1,0];
    const colZ = pick[map.Zw] || [0,0,1];
    const m = new THREE.Matrix3();
    m.set(
      colX[0], colY[0], colZ[0],
      colX[1], colY[1], colZ[1],
      colX[2], colY[2], colZ[2]
    );
    return m;
  }
  function mapQuatToUnity(qp, M){
    const bx = new THREE.Vector3(M.elements[0], M.elements[3], M.elements[6]);
    const by = new THREE.Vector3(M.elements[1], M.elements[4], M.elements[7]);
    const bz = new THREE.Vector3(M.elements[2], M.elements[5], M.elements[8]);
    const Mp = new THREE.Matrix4().makeBasis(bx, by, bz);
    const MpInv = new THREE.Matrix4().copy(Mp).invert();
    const qP = new THREE.Quaternion(qp[0], qp[1], qp[2], qp[3]);
    const mP = new THREE.Matrix4().makeRotationFromQuaternion(qP);
    const mW = new THREE.Matrix4().multiplyMatrices(Mp, mP).multiply(MpInv);
    const qW = new THREE.Quaternion().setFromRotationMatrix(mW).normalize();
    return [qW.x, qW.y, qW.z, qW.w];
  }
  function quatToEulerOrder(q, order){
    const tq = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
    const e = new THREE.Euler().setFromQuaternion(tq, order || "ZXY");
    // 返回 [Z, X, Y] 度（与 ZXY 顺序对应的显示习惯），仅用于导出显示
    return [
      THREE.MathUtils.radToDeg(e.z),
      THREE.MathUtils.radToDeg(e.x),
      THREE.MathUtils.radToDeg(e.y)
    ];
  }
  function computeDeltasUnity(A,B){
    const joints=["clavicle","shoulder","elbow"]; const sides=["L","R"]; const out={};
    const M = buildAxisMatrix(axisMap);
    for(const s of sides){ out[s]={};
      for(const j of joints){
        const qa = mapQuatToUnity(A[s][j], M);
        const qb = mapQuatToUnity(B[s][j], M);
        const qaT = new THREE.Quaternion(qa[0],qa[1],qa[2],qa[3]);
        const qbT = new THREE.Quaternion(qb[0],qb[1],qb[2],qb[3]);
        const qdT = new THREE.Quaternion().multiplyQuaternions(qbT, qaT.clone().invert()).normalize();
        const qd=[qdT.x,qdT.y,qdT.z,qdT.w];
        const eul=quatToEulerOrder(qd, unityEulerOrder);
        out[s][j]={ qDelta: qd, eulerZXYDeg: eul };
      }
    }
    return out;
  }

  async function handleExportWarudo(){
    if (!poseA || !poseB) return;
    // 简化：导出当前差异的基础数据（后续可补本地验证/轴映射/重指派细节）
    const data = {
      meta: {
        mode: 'Warudo',
        eulerOrder: 'ZXY',
        compose: 'rightMultiply',
        axisMap: { Xw: '-Xp', Yw: '+Xp', Zw: '-Zp' },
        preRotationRemoved: true,
        twistReassign: {
          clavicle: 'twistY -> forearm.Z (same)',
          shoulder: 'twistY -> upperArm.X (inverted)'
        }
      },
      poseB: {},
      deltas: unityMode ? computeDeltasUnity(poseA, poseB) : computeDeltas(poseA, poseB)
    };
    const fileName = `poseTrans_${formatTs()}.json`;
    try{
      const blob=new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
      // 浏览器环境：尝试触发下载
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=fileName; a.click(); URL.revokeObjectURL(url);
    }catch(err){ console.error('Export failed', err); }
  }
  // 计算两姿势差异：按关节输出 quatDelta、Euler XYZ（度）
  function computeDeltas(A,B){
    const toDeg = (r)=> THREE.MathUtils.radToDeg(r);
    const joints=["clavicle","shoulder","elbow"];
    const sides=["L","R"];
    const out={};
    for(const s of sides){
      out[s]={};
      for(const j of joints){
        const qa=A[s][j], qb=B[s][j];
        const qd=quatDelta(qa,qb);
        const eul=quatToEuler(qd,'XYZ').map(toDeg);
        // twist/swing around local Y
        const twistDeg = (()=>{
          // reuse swingTwistDecompose via quatToEuler? Better use math util
          return 0; // placeholder, will be computed in UI with math util if needed
        })();
        out[s][j]={ qDelta: qd, eulerXYZDeg: eul };
      }
    }
    return out;
  }

  // --- Refs ---
  // 用于获取玩家对象API
  const playerRef = useRef();
  // 用于将 R3F 的事件源绑定到主视图DOM元素
  const mainViewRef = useRef();
  // 用于将小地图的渲染目标绑定到对应的DOM元素
  const minimapContainerRef = useRef();
  // 用于将 StaminaBar 的DOM节点传递给计算器
  const staminaBarRef = useRef();

  // --- State Management ---
  // 四元数场景局部状态（用于 UI 与 3D 同步）
  const [quatAxis, setQuatAxis] = useState([0, 1, 0]);
  const [quatAngleDeg, setQuatAngleDeg] = useState(45);
  const currentQuat = useMemo(() => quatNormalize(quatFromAxisAngle(quatAxis, THREE.MathUtils.degToRad(quatAngleDeg))), [quatAxis, quatAngleDeg]);

  // 插值控制
  const [slerpMethod, setSlerpMethod] = useState("SLERP"); // or "NLERP"
  const [slerpT, setSlerpT] = useState(0.0);

  // 手臂控制（0.1° 精度）
  const [leftArm, setLeftArm] = useState({
    clavSwingX: 0,
    clavSwingZ: 0,
    clavTwistY: 0,
    shoulderSwingX: 0,
    shoulderSwingZ: 0,
    shoulderTwistY: 0,
    elbowFlex: 0,
    enableLimits: true,
  });
  const [rightArm, setRightArm] = useState({
    clavSwingX: 0,
    clavSwingZ: 0,
    clavTwistY: 0,
    shoulderSwingX: 0,
    shoulderSwingZ: 0,
    shoulderTwistY: 0,
    elbowFlex: 0,
    enableLimits: true,
  });
  const [mirrorArms, setMirrorArms] = useState(true);

  // 记录 A/B 姿势（以局部关节四元数为准）
  const [poseA, setPoseA] = useState(null); // { L:{clavicle,shoulder,elbow}, R:{...} }
  const [poseB, setPoseB] = useState(null);
  const [abT, setAbT] = useState(0);
  const [abPlaying, setAbPlaying] = useState(false);
  const [abPreview, setAbPreview] = useState(false);

  // 由当前 UI 参数计算局部四元数（用于记录/对比）
  const currentPose = useMemo(()=>{
    const rightEffective = mirrorArms ? {
      clavSwingX: leftArm.clavSwingX,
      clavSwingZ: -leftArm.clavSwingZ,
      clavTwistY: -leftArm.clavTwistY,
      shoulderSwingX: leftArm.shoulderSwingX,
      shoulderSwingZ: -leftArm.shoulderSwingZ,
      shoulderTwistY: -leftArm.shoulderTwistY,
      elbowFlex: leftArm.elbowFlex,
      enableLimits: leftArm.enableLimits,
    } : rightArm;
    return {
      L: computeArmLocalQuats(leftArm,'L'),
      R: computeArmLocalQuats(rightEffective, 'R'),
    };
  }, [leftArm, rightArm, mirrorArms]);

  // 过渡播放（A->B）
  const abLastRef = useRef(0);
  useEffect(()=>{
    if (!abPlaying) return;
    let raf;
    const tick=(t)=>{
      const last = abLastRef.current || t; const dt = Math.min(0.1, (t-last)/1000); abLastRef.current=t;
      setAbT(v=>{ let n=v+dt*0.5; if(n>1) n=0; return n; });
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  },[abPlaying]);

  const mirroredFromLeft = useMemo(() => {
    // 简单镜像规则：Z 轴摆动取反，其余保留（可根据 MMD 轴向调整）
    const la = leftArm;
    return {
      clavSwingX: la.clavSwingX,
      clavSwingZ: -la.clavSwingZ,
      clavTwistY: -la.clavTwistY,
      shoulderSwingX: la.shoulderSwingX,
      shoulderSwingZ: -la.shoulderSwingZ,
      shoulderTwistY: -la.shoulderTwistY,
      elbowFlex: la.elbowFlex,
      enableLimits: la.enableLimits,
    };
  }, [leftArm]);
  const [slerpPlaying, setSlerpPlaying] = useState(false);
  const slerpSpeed = 0.5; // t 每秒增加速度

  const lastTimeRef = useRef(0);
  useEffect(() => {
    if (!slerpPlaying) return;
    let raf;
    const tick = (time) => {
      const scene = useGameStore.getState().scene.currentScene;
      const last = lastTimeRef.current || time;
      const dt = Math.min(0.1, (time - last) / 1000);
      lastTimeRef.current = time;
      if (scene === "quaternion") {
        setSlerpT((prev) => {
          let next = prev + slerpSpeed * dt;
          if (next > 1) next = 0;
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [slerpPlaying]);

  // 只訂閱低頻變化的 UI 狀態 (避免高頻重新渲染)
  const currentScene = useGameStore((state) => state.scene.currentScene);
  const selectedCharacter = useGameStore((state) => state.player.selectedCharacter);

  // 訂閱小地圖設置用於 UI 顯示
  const minimapSettings = useGameStore((state) => state.settings.minimap);

  // 訂閱UI設置
  const uiSettings = useGameStore((state) => state.settings.ui);

  // 从 Store 订阅渲染和物理调试设置
  const physicsDebugSettings = useGameStore((state) => state.settings.physics);
  const renderingSettings = useGameStore((state) => state.settings.rendering);

  // Store actions
  const setWeather = useGameStore((state) => state.setWeather);
  const setTime = useGameStore((state) => state.setTime);
  const setTimeSpeed = useGameStore((state) => state.setTimeSpeed);
  const setCurrentScene = useGameStore((state) => state.setCurrentScene);
  const setSelectedCharacter = useGameStore((state) => state.setSelectedCharacter);
  const setPerformanceData = useGameStore((state) => state.setPerformanceData);
  const togglePerformanceMonitor = useGameStore((state) => state.togglePerformanceMonitor);

  // --- Callback Functions ---
  // 使用 useCallback 来包装所有回调函数，防止不必要的子组件重渲染。
  // 空依赖数组 '[]' 意味着这个函数在组件的整个生命周期内都是同一个实例。

  const handleWeatherChange = useCallback(
    (type, settings) => {
      setWeather(type, settings);
    },
    [setWeather]
  );

  const handleTimeSet = useCallback(
    (newTime) => {
      setTime(newTime, 0);
    },
    [setTime]
  );

  const handleTimeSpeedChange = useCallback(
    (newSpeed) => {
      setTimeSpeed(newSpeed);
    },
    [setTimeSpeed]
  );

  /**
   * @description 处理角色切换
   * @param {string} character - 新选择的角色类型
   */
  const handleCharacterChange = useCallback(
    (character) => {
      setSelectedCharacter(character);
    },
    [setSelectedCharacter]
  );

  /**
   * @description 處理場景切換
   * @param {string} scene - 新選擇的場景類型
   */
  const handleSceneChange = useCallback(
    (scene) => {
      setCurrentScene(scene);
    },
    [setCurrentScene]
  );


  // 键盘快捷键监听器
  useEffect(() => {
    /**
     * @description 处理键盘快捷键
     * @param {KeyboardEvent} event - 键盘事件
     */
    const handleKeyPress = (event) => {
      // 只在没有焦点在输入元素时处理快捷键
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "p":
          event.preventDefault();
          togglePerformanceMonitor();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);

    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [togglePerformanceMonitor]);

  return (
    <div className="app-container">
      {/* ======================= */}
      {/*        UI 层           */}
      {/* ======================= */}

      {/* 主视图和小地图的DOM容器 */}
      <div ref={mainViewRef} className="main-view-container" />
      {minimapSettings.enabled && currentScene === "game" && (
        <div className="minimap-wrapper">
          <div
            ref={minimapContainerRef}
            className="minimap-view-container"
            style={{width: minimapSettings.size, height: minimapSettings.size}}
          >
            <div className="player-marker"></div>
            <div className="north-marker">N</div>
            {minimapSettings.showDebugLines && (
              <>
                <div className="debug-center-line-h"></div>
                <div className="debug-center-line-v"></div>
              </>
            )}
          </div>
          {minimapSettings.showCoordinates && (
            <div className="minimap-coordinates" style={{width: minimapSettings.size}}>
              <div className="coordinate-display">
                <span className="coord-label">Position:</span>
                <span className="coord-values" id="player-coordinates">
                  X: 0.0, Y: 0.0, Z: 0.0
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 其他UI组件 */}
      {currentScene === "game" && <GameUI />}

      {/* 
        StaminaBar 组件:
        - `ref`: 将 staminaBarRef 传递给它，这样其 DOM 节点就可以被其他组件访问。
        - `stamina`: 传递原始耐力值，用于渲染初始状态。
        - `visible`: 控制其可见性，当耐力全满时隐藏。
      */}
      <StaminaBar ref={staminaBarRef} maxStamina={100} />

      <DebugPanel
        onWeatherChange={handleWeatherChange}
        onTimeSet={handleTimeSet}
        onTimeSpeedChange={handleTimeSpeedChange}
        onCharacterChange={handleCharacterChange}
        onSceneChange={handleSceneChange}
        selectedCharacter={selectedCharacter}
        currentScene={currentScene}
      />

      {/* ======================= */}
      {/*      3D Canvas 层       */}
      {/* ======================= */}
      <Canvas
        className="main-canvas"
        dpr={[renderingSettings.dprMin || 1, renderingSettings.dprMax || 2]}
        shadows={renderingSettings.enableShadows}
        eventSource={mainViewRef} // 将鼠标等事件的监听目标设置为我们的主视图div
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          outputColorSpace: THREE.SRGBColorSpace,
          shadowMap: {
            enabled: renderingSettings.enableShadows,
            type: renderingSettings.shadowMapType === "PCF" ? 1 : renderingSettings.shadowMapType === "PCFSoft" ? 2 : 0,
            size: renderingSettings.shadowMapSize,
          },
          toneMapping:
            renderingSettings.toneMapping === "None"
              ? 0
              : renderingSettings.toneMapping === "Linear"
              ? 1
              : renderingSettings.toneMapping === "Reinhard"
              ? 2
              : renderingSettings.toneMapping === "Cineon"
              ? 3
              : renderingSettings.toneMapping === "ACESFilmic"
              ? 4
              : 4,
          toneMappingExposure: renderingSettings.toneMappingExposure,
        }}
      >
        {/* Perf数据收集器（非自定义组件） */}
        <PerfHeadless />
        {/* 主场景视图 */}
        <View index={1} track={mainViewRef}>
          <ambientLight intensity={0.2} />

          {currentScene === "game" && (
            <Physics gravity={[0, -9.82, 0]}>
              <GameScene
                playerRef={playerRef}
                physicsDebugSettings={physicsDebugSettings}
                renderingSettings={renderingSettings}
              />
            </Physics>
          )}
          {currentScene === "maze" && (
            <Physics gravity={[0, -9.82, 0]}>
              <HauntedMazeScene
                playerRef={playerRef}
                physicsDebugSettings={physicsDebugSettings}
                renderingSettings={renderingSettings}
              />
            </Physics>
          )}
          {currentScene === "quaternion" && (
            <group>
              {/* 将四元数场景作为第二场景渲染 */}
              <QuaternionScene
                axis={quatAxis}
                angleDeg={quatAngleDeg}
                lockElement={mainViewRef.current}
                slerpMethod={slerpMethod}
                slerpT={slerpT}
                armL={leftArm}
                armR={mirrorArms ? {
                  clavSwingX: leftArm.clavSwingX,
                  clavSwingZ: -leftArm.clavSwingZ,
                  clavTwistY: -leftArm.clavTwistY,
                  shoulderSwingX: leftArm.shoulderSwingX,
                  shoulderSwingZ: -leftArm.shoulderSwingZ,
                  shoulderTwistY: -leftArm.shoulderTwistY,
                  elbowFlex: leftArm.elbowFlex,
                  enableLimits: leftArm.enableLimits,
                } : rightArm}
                abT={abT}
                abPlaying={abPlaying}
                abPreview={abPreview}
                poseA={poseA}
                poseB={poseB}
              />
            </group>
          )}

          {/* 只在主游戏场景中使用这些组件 */}
          {currentScene === "game" && (
            <>
              {/* 
                SmoothStaminaCalculator 组件:
                这是一个无渲染的"逻辑"组件，放置在Canvas内以使用 useFrame。
                - `targetStamina`: 接收来自 Controller 的原始耐力值。
                - `uiRef`: 接收 StaminaBar 的 DOM 节点引用，以便直接操作它。
              */}
              <SmoothStaminaCalculator maxStamina={100} uiRef={staminaBarRef} />

              {/* 小地图叠加由主 Canvas 内部渲染：在 View 内添加 MinimapOverlay */}
              <MinimapOverlay playerRef={playerRef} containerRef={minimapContainerRef} />
            </>
          )}

          {/* 性能数据收集器 - 收集真实的Three.js渲染数据 */}
          <PerformanceDataCollector
            onDataUpdate={setPerformanceData}
            updateInterval={PERFORMANCE_CONFIG.PERFORMANCE_DATA_UPDATE_INTERVAL}
          />
        </View>
      </Canvas>

      <LoadingScreen 
        active={active} 
        progress={progress} 
        loaded={loaded} 
        total={total} 
        item={item} 
      />
      
      {/* Quaternion Scene UI Overlay */}
      {currentScene === "quaternion" && (
        <>
          {/* AxesLegend overlay disabled to avoid covering 3D gizmo */}
          <QuaternionUI
          axis={quatAxis}
          angleDeg={quatAngleDeg}
          quaternion={currentQuat}
          onAxisChange={setQuatAxis}
          onAngleChange={setQuatAngleDeg}
          slerpMethod={slerpMethod}
          onSlerpMethodChange={setSlerpMethod}
          slerpT={slerpT}
          onSlerpTChange={setSlerpT}
          slerpPlaying={slerpPlaying}
          onTogglePlay={() => setSlerpPlaying((v) => !v)}
          arm={{ mirror: mirrorArms, left: leftArm, right: rightArm }}
          onRecordPoseA={()=> setPoseA(currentPose)}
          onRecordPoseB={()=> setPoseB(currentPose)}
          poseADefined={!!poseA}
          poseBDefined={!!poseB}
          deltasThree={(poseA && poseB) ? computeDeltas(poseA, poseB) : null}
          deltasUnity={(poseA && poseB) ? computeDeltasUnity(poseA, poseB) : null}
          abT={abT}
          onAbTChange={setAbT}
          abPlaying={abPlaying}
          onAbToggle={()=> setAbPlaying(v=>!v)}
          abPreview={abPreview}
          onAbPreviewToggle={()=> setAbPreview(v=>!v)}
          onExportWarudo={handleExportWarudo}
          unityMode={unityMode}
          onUnityModeToggle={()=> setUnityMode(v=>!v)}
          axisMap={axisMap}
          onAxisMapChange={setAxisMap}
          unityEulerOrder={unityEulerOrder}
          onUnityEulerOrderChange={setUnityEulerOrder}
          unityCompose={unityCompose}
          onUnityComposeChange={setUnityCompose}
          onArmChange={(next)=>{
            setMirrorArms(next.mirror);
            setLeftArm(next.left);
            setRightArm(next.right);
          }}
        />
        </>
      )}

      {/* 十字准星 - 用于调试点击检测 */}
      <Crosshair />
    </div>
  );
}

export default App;
