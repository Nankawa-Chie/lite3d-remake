/**
 * @description 幀同步管理器 - 解決第一人稱視角頻閃問題
 * @author 南川千繪 (Nankawa Chie)
 * 
 * 這個工具專門解決骨骼動畫與相機更新不同步導致的頻閃問題
 */

class FrameSync {
  constructor() {
    this.callbacks = new Map();
    this.priorities = new Map();
    this.isUpdating = false;
    this.frameId = 0;
  }

  /**
   * @description 註冊幀更新回調
   * @param {string} id - 回調ID
   * @param {Function} callback - 回調函數
   * @param {number} priority - 優先級 (數字越小優先級越高)
   */
  register(id, callback, priority = 0) {
    this.callbacks.set(id, callback);
    this.priorities.set(id, priority);
  }

  /**
   * @description 取消註冊回調
   * @param {string} id - 回調ID
   */
  unregister(id) {
    this.callbacks.delete(id);
    this.priorities.delete(id);
  }

  /**
   * @description 執行所有註冊的回調，按優先級順序
   * @param {Object} state - React Three Fiber state
   * @param {number} delta - 幀間隔時間
   */
  update(state, delta) {
    if (this.isUpdating) return; // 防止重入
    
    this.isUpdating = true;
    this.frameId++;

    try {
      // 按優先級排序
      const sortedCallbacks = Array.from(this.callbacks.entries())
        .sort(([idA], [idB]) => {
          const priorityA = this.priorities.get(idA) || 0;
          const priorityB = this.priorities.get(idB) || 0;
          return priorityA - priorityB;
        });

      // 依序執行回調
      for (const [id, callback] of sortedCallbacks) {
        try {
          callback(state, delta, this.frameId);
        } catch (error) {
          console.error(`FrameSync: 回調 "${id}" 執行失敗:`, error);
        }
      }
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * @description 獲取當前幀ID
   */
  getCurrentFrame() {
    return this.frameId;
  }

  /**
   * @description 清理所有回調
   */
  clear() {
    this.callbacks.clear();
    this.priorities.clear();
  }
}

// 創建全局實例
const frameSync = new FrameSync();

/**
 * @description 平滑插值工具類
 */
export class SmoothInterpolator {
  constructor(initialValue = 0, smoothness = 0.1) {
    this.current = initialValue;
    this.target = initialValue;
    this.smoothness = smoothness;
    this.threshold = 0.001;
  }

  /**
   * @description 設置目標值
   * @param {number} target - 目標值
   */
  setTarget(target) {
    this.target = target;
  }

  /**
   * @description 更新當前值
   * @param {number} deltaTime - 幀間隔時間
   * @returns {number} 當前值
   */
  update(deltaTime = 1) {
    const difference = this.target - this.current;
    
    if (Math.abs(difference) < this.threshold) {
      this.current = this.target;
    } else {
      this.current += difference * this.smoothness * deltaTime * 60; // 60fps 基準
    }
    
    return this.current;
  }

  /**
   * @description 獲取當前值
   */
  getValue() {
    return this.current;
  }

  /**
   * @description 立即設置值（無平滑）
   * @param {number} value - 值
   */
  setValue(value) {
    this.current = value;
    this.target = value;
  }

  /**
   * @description 檢查是否已達到目標
   */
  isAtTarget() {
    return Math.abs(this.target - this.current) < this.threshold;
  }
}

/**
 * @description Vector3 平滑插值器
 */
export class Vector3Interpolator {
  constructor(initialValue = [0, 0, 0], smoothness = 0.1) {
    this.current = [...initialValue];
    this.target = [...initialValue];
    this.smoothness = smoothness;
    this.threshold = 0.001;
  }

  setTarget(x, y, z) {
    this.target[0] = x;
    this.target[1] = y;
    this.target[2] = z;
  }

  update(deltaTime = 1) {
    const factor = this.smoothness * deltaTime * 60;
    
    for (let i = 0; i < 3; i++) {
      const difference = this.target[i] - this.current[i];
      
      if (Math.abs(difference) < this.threshold) {
        this.current[i] = this.target[i];
      } else {
        this.current[i] += difference * factor;
      }
    }
    
    return this.current;
  }

  getValue() {
    return this.current;
  }

  setValue(x, y, z) {
    this.current[0] = x;
    this.current[1] = y;
    this.current[2] = z;
    this.target[0] = x;
    this.target[1] = y;
    this.target[2] = z;
  }
}

/**
 * @description 性能監控器
 */
export class PerformanceTracker {
  constructor(windowSize = 60) {
    this.frameTimes = [];
    this.windowSize = windowSize;
    this.lastTime = performance.now();
  }

  update() {
    const now = performance.now();
    const frameTime = now - this.lastTime;
    
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > this.windowSize) {
      this.frameTimes.shift();
    }
    
    this.lastTime = now;
  }

  getAverageFPS() {
    if (this.frameTimes.length === 0) return 60;
    
    const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return Math.round(1000 / avgFrameTime);
  }

  getFrameTimeVariance() {
    if (this.frameTimes.length < 2) return 0;
    
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const variance = this.frameTimes.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / this.frameTimes.length;
    
    return Math.sqrt(variance);
  }

  isPerformanceStable() {
    return this.getAverageFPS() >= 45 && this.getFrameTimeVariance() < 5;
  }
}

export default frameSync;