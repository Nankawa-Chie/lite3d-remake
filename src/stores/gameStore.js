import {create} from "zustand";

/**
 * @description 遊戲全局狀態管理 Store
 * 使用 Zustand 來管理高頻更新的狀態，避免不必要的組件重新渲染
 */
const useGameStore = create((set, get) => ({
  // === 時間系統 ===
  time: {
    currentTime: 12, // 當前時間 (0-24小時制)
    timeSpeed: 0.1, // 時間流逝速度
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
      showCrosshair: false, // 十字准星显示开关
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

      // 分辨率/抗锯齿\n      dprMin: 1,\n      dprMax: 2,\n      msaaSamples: 0, // 0=disabled, 2/4/8 for WebGL2 multisampling in EffectComposer\n\n      // New anti-aliasing controls\n      enableFXAA: 'auto', // 'auto' | 'on' | 'off'\n      bloomMode: 'global', // 'global' | 'layer' (selective bloom via layers)\n      qualityPreset: 'balanced', // 'performance' | 'balanced' | 'quality'\n\n      // 后处理效果
      enablePostProcessing: false,
      enableBloom: false,
      enableSSAO: false,
      enableOutline: false,
      enableDOF: false,
      enableMotionBlur: false,
      enableChromaticAberration: false,
      enableVignette: false,
      enableNoise: false,

      // Bloom 设置
      bloomIntensity: 1.5,
      bloomLuminanceThreshold: 0.9,
      bloomLuminanceSmoothing: 0.025,
      bloomRadius: 0.85,

      // SSAO 设置
      ssaoIntensity: 0.5,
      ssaoRadius: 0.2,
      ssaoBias: 0.025,
      ssaoSamples: 16,
      ssaoHalfRes: true,
      ssaoBilateral: true,

      // DOF 设置
      // DOF 焦距（归一化 0..1）
      dofFocusDistance: 0.5,
      dofFocalLength: 0.02,
      dofBokehScale: 2.0,
      dofAutoFocus: false,
      dofFocusSpeed: 0.15,
      dofFocusTarget: 'center', // 'center' | 'object'
      // 自动对焦优化与模式
      dofAFIntervalMs: 200, // 节流间隔，降低每帧射线成本
      dofAFMode: 'raycast', // 'raycast' | 'target'
      dofFocusLayer: null, // 仅对该 layer 的对象进行对焦（如 2），null 为全部
      dofAFTargetName: null,

      // Outline 设置
      outlineMode: 'standard', // 'standard' | 'sobel' | 'hybrid'

      // 色彩调整
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,

      // 环境设置
      enableFog: false,
      fogNear: 1,
      fogFar: 100,
      fogColor: "#ffffff",
      fogDensity: 0.00025,
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
  startMMDTest: (config) => set(() => ({ mmdTest: { active: true, config } })),
  stopMMDTest: () => set(() => ({ mmdTest: { active: false, config: null } })),


  /**
   * @description 更新時間流逝 (高頻調用，不會觸發組件重新渲染)
   * @param {number} newTime - 新的時間值
   */
  updateTime: (newTime) =>
    set((state) => ({
      time: {...state.time, currentTime: newTime},
    })),

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
