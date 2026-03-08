import {create} from "zustand";

// === High-frequency time (non-reactive) ===
// currentTimeInternal is advanced every frame WITHOUT triggering zustand setState.
// We only sync to zustand state at a low frequency for UI/debug display.
let currentTimeInternal = 12;
let lastUiSyncMs = 0;
const UI_TIME_SYNC_INTERVAL_MS = 250; // 4Hz

/**
 * @description 遊戲全局狀態管理 Store
 * 使用 Zustand 來管理高頻更新的狀態，避免不必要的組件重新渲染
 */
const useGameStore = create((set, get) => ({
  // === 時間系統 ===
  // 注意：currentTime 用于 UI/调试（低频同步），避免每帧 setState 造成全场景重渲染。
  time: {
    currentTime: 12, // UI/Debug time (0-24)
    timeSpeed: 0.1, // 時間流逝速度
  },

  // High-frequency time API (non-reactive)
  getTimeInternal: () => currentTimeInternal,

  /**
   * 每帧推进内部时间，但只低频同步到 zustand state。
   * @param {number} deltaSeconds
   */
  advanceTime: (deltaSeconds) => {
    const {timeSpeed} = get().time;
    if (!timeSpeed || timeSpeed <= 0) return;

    // 原逻辑：delta * timeSpeed * 0.1，再乘 24
    const timeIncrement = deltaSeconds * timeSpeed * 0.1;
    currentTimeInternal = (currentTimeInternal + timeIncrement * 24) % 24;

    const now = performance.now();
    if (now - lastUiSyncMs >= UI_TIME_SYNC_INTERVAL_MS) {
      lastUiSyncMs = now;
      // 同步到 state（会触发订阅者重渲染，但频率很低）
      set((state) => ({
        time: {...state.time, currentTime: currentTimeInternal},
      }));
    }
  },

  // === 天氣系統 ===
  weather: {
    type: "clear", // 天氣類型
    settings: {intensity: 1.0}, // 天氣設置
  },

  // === 玩家狀態 ===
  player: {
    stamina: 100, // 當前體力值
    maxStamina: 100, // 最大體力值
    movementState: {}, // 移動狀態信息
    selectedCharacter: "manuka", // 選中的角色
  },

  // === MMD 測試暫存狀態 ===
  mmdTest: {
    active: false,
    config: null,
  },

  // === 場景狀態 ===
  scene: {
    currentScene: "game", // 當前場景 ('game' 或 'maze')
  },

  // === 未来场景预留 ===
  // 可以在这里添加新的场景状态

  // === 設置狀態 ===
  settings: {
    minimap: {
      enabled: true, // 小地图总开关
      size: 250,
      viewRange: 50,
      height: 150,
      zoom: 1.0,
      showCoordinates: true,
      coordinatePrecision: 1,
      showDebugLines: false,
    },
    ui: {
      showPerformanceMonitor: true, // 性能监视器显示开关
      showCrosshair: true, // 十字准星显示开关
      crosshairStyle: "cross", // 十字准星样式: 'cross', 'circle', 'dot'
      crosshairSize: 20, // 十字准星大小
      crosshairColor: "#ffffff", // 十字准星颜色
      crosshairOpacity: 0.8, // 十字准星透明度
    },
    terrain: {
      sandHeight: -5,
      grassHeight: 8,
      rockHeight: 18,
      snowHeight: 25,
      blendSharpness: 6,
      textureScale: 50,
    },
    rendering: {
      // 基础渲染设置
      enableShadows: true,
      shadowMapSize: 2048,
      shadowMapType: "PCF", // PCF, PCFSoft, VSM
      toneMapping: "ACESFilmic", // None, Linear, Reinhard, Cineon, ACESFilmic
      toneMappingExposure: 1.0,

      // 分辨率/抗锯齿\n      dprMin: 1,\n      dprMax: 2,\n      msaaSamples: 0, // 0=disabled, 2/4/8 for WebGL2 multisampling in EffectComposer\n\n      // New anti-aliasing controls\n      enableFXAA: 'auto', // 'auto' | 'on' | 'off'\n      bloomMode: 'global', // 'global' | 'layer' (selective bloom via layers)\n      qualityPreset: 'balanced', // 'performance' | 'balanced' | 'quality'\n\n      // 后处理效果（Balanced Cinematic 默认：克制、自然、可控）
      enablePostProcessing: true,
      enableBloom: true,
      enableSSAO: true,
      enableOutline: false,
      enableDOF: false,
      enableMotionBlur: false,
      enableChromaticAberration: false,
      enableVignette: true,
      enableNoise: false,

      // Bloom 设置（默认非常克制，避免“假”）
      bloomIntensity: 0.35,
      bloomLuminanceThreshold: 1.05,
      bloomLuminanceSmoothing: 0.06,
      bloomRadius: 0.55,

      // SSAO 设置（默认轻量，只做接触阴影）
      ssaoIntensity: 0.25,
      ssaoRadius: 0.12,
      ssaoBias: 0.02,
      ssaoSamples: 8,
      ssaoHalfRes: true,
      ssaoBilateral: true,

      // DOF 设置
      // DOF 焦距（归一化 0..1）
      dofFocusDistance: 0.5,
      dofFocalLength: 0.02,
      dofBokehScale: 2.0,
      dofAutoFocus: false,
      dofFocusSpeed: 0.15,
      dofFocusTarget: "center", // 'center' | 'object'
      // 自动对焦优化与模式
      dofAFIntervalMs: 200, // 节流间隔，降低每帧射线成本
      dofAFMode: "raycast", // 'raycast' | 'target'
      dofFocusLayer: null, // 仅对该 layer 的对象进行对焦（如 2），null 为全部
      dofAFTargetName: null,

      // Outline 设置
      outlineMode: "standard", // 'standard' | 'sobel' | 'hybrid'

      // 色彩调整（默认只做一点点对比度/饱和度，避免“滤镜感”）
      brightness: -0.02,
      contrast: 0.12,
      saturation: 0.02,
      hue: 0,

      // Vignette 参数（避免固定写死在组件里导致“过强假片感”）
      vignetteOffset: 0.2,
      vignetteDarkness: 0.35,

      // Toon-ish（Soft Toon，白名单材质启用；默认尽量克制）
      enableToonishShading: true,
      toonRampSteps: 4,
      toonRampSmoothness: 0.55,
      toonRimStrength: 0.35,
      toonRimPower: 2.5,
      toonRimColor: "#dbe9ff",
      toonShadowLift: 0.08,

      // 环境（HDRI/雾）
      environmentIntensity: 0.35,

      // 视距/空气透视（阶段4C：200~500 视距范围的沉浸感）
      viewDistance: 350,
      hazePreset: "balanced", // 'performance' | 'balanced' | 'quality'

      // 近/远段的空气透视控制（FogRenderer 会用这些值动态生成 fog）
      hazeNear: 20,
      hazeFar: 350,
      hazeDensityDay: 0.0012,
      hazeDensityNight: 0.0028,
      hazeColorDay: "#b8c7d6",
      hazeColorNight: "#0b1320",

      // 地形远景降频/降噪（不增加 sampler）
      terrainDistanceFadeStart: 120,
      terrainDistanceFadeEnd: 350,
      terrainFarTexScale: 0.35, // 远处纹理频率倍率（越小越大块、更干净）
      terrainFarNormalScale: 0.35, // 远处法线强度倍率（减少闪烁）
      terrainFarRoughnessBoost: 0.35, // 远处额外粗糙度（减少高光噪点）

      enableFog: true,
      fogType: "exp2", // 'linear' | 'exp2'
      fogNear: 10,
      fogFar: 180,
      fogColor: "#b8c7d6",
      fogDensity: 0.0015,
    },
    physics: {
      // 物理调试设置
      showWireframes: false,
      showBoundingBoxes: false,
      showContactPoints: false,
      showVelocityVectors: false,
      showRaycast: false,
      wireframeOpacity: 0.5,
      boundingBoxColor: "#ff0000",
      velocityScale: 1.0,
    },
  },

  // === 性能監控數據 ===
  performance: {
    realTimeData: null,
  },

  // === Action Methods ===

  // MMD Test control
  startMMDTest: (config) => set(() => ({mmdTest: {active: true, config}})),
  stopMMDTest: () => set(() => ({mmdTest: {active: false, config: null}})),

  /**
   * @description 更新時間流逝 (高頻調用，不會觸發組件重新渲染)
   * @param {number} newTime - 新的時間值
   */
  // 兼容旧 API：updateTime 仍可用，但会同时写内部时间（不建议每帧调用）
  updateTime: (newTime) => {
    currentTimeInternal = ((newTime % 24) + 24) % 24;
    set((state) => ({
      time: {...state.time, currentTime: currentTimeInternal},
    }));
  },

  /**
   * @description 設置時間和速度
   * @param {number} currentTime - 當前時間
   * @param {number} timeSpeed - 時間速度
   */
  setTime: (currentTime, timeSpeed = 0) =>
    set((state) => ({
      time: {currentTime, timeSpeed},
    })),

  /**
   * @description 設置時間速度
   * @param {number} timeSpeed - 新的時間速度
   */
  setTimeSpeed: (timeSpeed) =>
    set((state) => ({
      time: {...state.time, timeSpeed},
    })),

  /**
   * @description 更新天氣狀態
   * @param {string} type - 天氣類型
   * @param {object} settings - 天氣設置
   */
  setWeather: (type, settings) =>
    set({
      weather: {type, settings},
    }),

  /**
   * @description 更新玩家體力
   * @param {number} stamina - 新的體力值
   */
  setPlayerStamina: (stamina) =>
    set((state) => ({
      player: {...state.player, stamina},
    })),

  /**
   * @description 更新玩家移動狀態
   * @param {object} movementState - 移動狀態對象
   */
  setPlayerMovementState: (movementState) =>
    set((state) => ({
      player: {...state.player, movementState},
    })),

  /**
   * @description 設置選中的角色
   * @param {string} character - 角色類型
   */
  setSelectedCharacter: (character) =>
    set((state) => ({
      player: {...state.player, selectedCharacter: character},
    })),

  /**
   * @description 切換當前場景
   * @param {string} scene - 場景類型
   */
  setCurrentScene: (scene) =>
    set((state) => ({
      scene: {currentScene: scene},
    })),

  /**
   * @description 更新小地圖設置
   * @param {object} settings - 小地圖設置對象
   */
  setMinimapSettings: (settings) =>
    set((state) => ({
      settings: {...state.settings, minimap: settings},
    })),

  /**
   * @description 更新地形設置
   * @param {object} settings - 地形設置對象
   */
  setTerrainSettings: (settings) =>
    set((state) => ({
      settings: {...state.settings, terrain: settings},
    })),

  /**
   * @description 更新性能監控數據
   * @param {object} data - 性能數據
   */
  setPerformanceData: (data) =>
    set({
      performance: {realTimeData: data},
    }),

  /**
   * @description 更新渲染设置
   * @param {object} settings - 渲染设置对象
   */
  setRenderingSettings: (settings) =>
    set((state) => ({
      settings: {...state.settings, rendering: settings},
    })),

  /**
   * @description 更新物理调试设置
   * @param {object} settings - 物理调试设置对象
   */
  setPhysicsDebugSettings: (settings) =>
    set((state) => ({
      settings: {...state.settings, physics: settings},
    })),

  /**
   * @description 更新UI设置
   * @param {object} settings - UI设置对象
   */
  setUISettings: (settings) =>
    set((state) => ({
      settings: {...state.settings, ui: settings},
    })),

  /**
   * @description 切换性能监视器显示状态
   */
  togglePerformanceMonitor: () =>
    set((state) => ({
      settings: {
        ...state.settings,
        ui: {
          ...state.settings.ui,
          showPerformanceMonitor: !state.settings.ui.showPerformanceMonitor,
        },
      },
    })),
}));

export default useGameStore;
