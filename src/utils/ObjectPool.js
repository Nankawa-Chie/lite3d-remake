/**
 * @description 對象池 - 減少垃圾回收，提升性能
 * @author 南川千繪 (Nankawa Chie)
 */

import * as THREE from "three";

/**
 * @description Vector3 對象池
 */
class Vector3Pool {
  constructor(initialSize = 10) {
    this.pool = [];
    this.index = 0;
    
    // 預先創建對象
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(new THREE.Vector3());
    }
  }

  /**
   * @description 獲取一個 Vector3 對象
   * @returns {THREE.Vector3}
   */
  get() {
    if (this.index >= this.pool.length) {
      // 池子用完了，創建新的
      this.pool.push(new THREE.Vector3());
    }
    
    const vector = this.pool[this.index];
    this.index++;
    return vector.set(0, 0, 0); // 重置為零向量
  }

  /**
   * @description 釋放所有對象回池子
   */
  releaseAll() {
    this.index = 0;
  }

  /**
   * @description 獲取池子大小
   */
  getSize() {
    return this.pool.length;
  }

  /**
   * @description 獲取當前使用的對象數量
   */
  getUsedCount() {
    return this.index;
  }
}

/**
 * @description 通用對象池
 */
class GenericPool {
  constructor(createFn, resetFn, initialSize = 5) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.pool = [];
    this.index = 0;
    
    // 預先創建對象
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  get() {
    if (this.index >= this.pool.length) {
      this.pool.push(this.createFn());
    }
    
    const obj = this.pool[this.index];
    this.index++;
    
    if (this.resetFn) {
      this.resetFn(obj);
    }
    
    return obj;
  }

  releaseAll() {
    this.index = 0;
  }
}

/**
 * @description 全局對象池管理器
 */
class PoolManager {
  constructor() {
    this.pools = new Map();
    this.frameCount = 0;
  }

  /**
   * @description 註冊一個對象池
   * @param {string} name - 池子名稱
   * @param {Object} pool - 池子實例
   */
  register(name, pool) {
    this.pools.set(name, pool);
  }

  /**
   * @description 獲取指定池子
   * @param {string} name - 池子名稱
   */
  getPool(name) {
    return this.pools.get(name);
  }

  /**
   * @description 每幀結束時釋放所有池子
   */
  releaseAllPools() {
    for (const pool of this.pools.values()) {
      if (pool.releaseAll) {
        pool.releaseAll();
      }
    }
    this.frameCount++;
  }

  /**
   * @description 獲取池子統計信息
   */
  getStats() {
    const stats = {};
    for (const [name, pool] of this.pools.entries()) {
      stats[name] = {
        size: pool.getSize ? pool.getSize() : 'unknown',
        used: pool.getUsedCount ? pool.getUsedCount() : 'unknown'
      };
    }
    return stats;
  }
}

// 創建全局實例
const poolManager = new PoolManager();

// 註冊常用的池子
poolManager.register('vector3', new Vector3Pool(20));
poolManager.register('quaternion', new GenericPool(
  () => new THREE.Quaternion(),
  (q) => q.set(0, 0, 0, 1),
  10
));
poolManager.register('matrix4', new GenericPool(
  () => new THREE.Matrix4(),
  (m) => m.identity(),
  5
));

export { Vector3Pool, GenericPool, PoolManager };
export default poolManager;