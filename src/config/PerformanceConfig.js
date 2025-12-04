/**
 * @description 性能優化配置文件
 * @author 南川千繪 (Nankawa Chie)
 * 
 * 統一管理各個組件的更新頻率和性能參數，
 * 讓咱們的"佳釀"運行得更加順滑！
 */

export const PERFORMANCE_CONFIG = {
  // 性能監控相關
  PERFORMANCE_DATA_UPDATE_INTERVAL: 2000, // 性能數據更新間隔 (ms)
  
  // 小地圖相關
  MINIMAP_FPS: 30, // 小地圖更新幀率
  MINIMAP_POSITION_THRESHOLD: 0.5, // 玩家移動距離閾值
  MINIMAP_COORDINATE_UPDATE_INTERVAL: 200, // 坐標更新間隔 (ms)
  MINIMAP_RESOLUTION_SCALE: 0.5, // 小地圖渲染分辨率縮放（0.5=50%）
  
  // 體力條相關
  STAMINA_UPDATE_THRESHOLD: 0.1, // 體力值變化閾值
  STAMINA_PRECISION: 10, // 體力值精度（小數點後位數 * 10）
  
  // 紋理管理相關
  TEXTURE_ANISOTROPY: 16, // 各向異性過濾最大值
  TEXTURE_CACHE_SIZE_LIMIT: 100, // 紋理緩存數量限制
  
  // 事件節流相關
  MOUSE_MOVE_THROTTLE: 16, // 鼠標移動事件節流間隔 (ms)
  RESIZE_THROTTLE: 100, // 窗口大小調整節流間隔 (ms)
  
  // useFrame 優化相關
  MAX_DELTA_TIME: 1 / 60, // 最大幀間隔時間，防止大幅跳躍
  
  // 場景渲染相關
  SHADOW_MAP_SIZE: 2048, // 陰影貼圖大小
  LOD_DISTANCE_THRESHOLD: 100, // LOD 距離閾值
  
  // 內存管理相關
  GEOMETRY_CACHE_SIZE: 50, // 幾何體緩存大小
  MATERIAL_CACHE_SIZE: 30, // 材質緩存大小
  
  // 調試模式配置
  DEBUG_MODE: false, // 是否開啟調試模式
  DEBUG_PERFORMANCE_LOGGING: false, // 是否記錄性能日誌
  
  // 自適應性能配置
  AUTO_QUALITY_ADJUSTMENT: true, // 是否啟用自動品質調整
  TARGET_FPS: 60, // 目標幀率
  MIN_FPS_THRESHOLD: 45, // 最低幀率閾值，低於此值會降低品質
  
  // 移動設備優化
  MOBILE_OPTIMIZATIONS: {
    REDUCED_SHADOW_QUALITY: true,
    SIMPLIFIED_MATERIALS: true,
    LOWER_TEXTURE_RESOLUTION: true,
    REDUCED_PARTICLE_COUNT: true
  }
};

/**
 * @description 根據設備性能動態調整配置
 */
export function getOptimizedConfig() {
  const config = { ...PERFORMANCE_CONFIG };
  
  // 檢測設備性能
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  
  if (gl) {
    const renderer = gl.getParameter(gl.RENDERER);
    const vendor = gl.getParameter(gl.VENDOR);
    
    // 檢測是否為移動設備或低端設備
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLowEnd = renderer.includes('Intel') || renderer.includes('Adreno 3') || renderer.includes('Mali-4');
    
    if (isMobile || isLowEnd) {
      // 為低端設備降低配置
      config.MINIMAP_FPS = 20;
      config.PERFORMANCE_DATA_UPDATE_INTERVAL = 3000;
      config.SHADOW_MAP_SIZE = 1024;
      config.TEXTURE_ANISOTROPY = 8;
      config.TARGET_FPS = 30;
      config.MIN_FPS_THRESHOLD = 25;
    }
  }
  
  return config;
}

/**
 * @description 性能監控工具
 */
export class PerformanceMonitor {
  constructor() {
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
    this.avgFrameTime = 16.67;
    this.frameTimeHistory = [];
    this.maxHistorySize = 60; // 保存最近60幀的數據
  }
  
  /**
   * @description 更新性能統計
   */
  update() {
    const now = performance.now();
    const frameTime = now - this.lastTime;
    
    this.frameTimeHistory.push(frameTime);
    if (this.frameTimeHistory.length > this.maxHistorySize) {
      this.frameTimeHistory.shift();
    }
    
    // 計算平均幀時間和FPS
    this.avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    this.fps = 1000 / this.avgFrameTime;
    
    this.frameCount++;
    this.lastTime = now;
  }
  
  /**
   * @description 獲取性能統計
   */
  getStats() {
    return {
      fps: Math.round(this.fps),
      avgFrameTime: Math.round(this.avgFrameTime * 100) / 100,
      frameCount: this.frameCount,
      isPerformanceGood: this.fps >= PERFORMANCE_CONFIG.MIN_FPS_THRESHOLD
    };
  }
  
  /**
   * @description 重置統計
   */
  reset() {
    this.frameCount = 0;
    this.frameTimeHistory = [];
    this.lastTime = performance.now();
  }
}

export default PERFORMANCE_CONFIG;