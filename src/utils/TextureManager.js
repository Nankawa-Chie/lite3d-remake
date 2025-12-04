import * as THREE from "three";

/**
 * @description 全局紋理管理器 - 避免重複加載紋理，提升性能
 * @author 南川千繪 (Nankawa Chie)
 */
class TextureManager {
  constructor() {
    this.cache = new Map();
    this.loader = new THREE.TextureLoader();
    this.loadingPromises = new Map(); // 防止同時加載同一個紋理
  }

  /**
   * @description 加載紋理（帶緩存）
   * @param {string} url - 紋理URL
   * @param {Object} options - 紋理配置選項
   * @returns {Promise<THREE.Texture>}
   */
  async loadTexture(url, options = {}) {
    // 檢查緩存
    if (this.cache.has(url)) {
      const texture = this.cache.get(url);
      return this.configureTexture(texture.clone(), options);
    }

    // 檢查是否正在加載
    if (this.loadingPromises.has(url)) {
      const texture = await this.loadingPromises.get(url);
      return this.configureTexture(texture.clone(), options);
    }

    // 開始加載
    const loadingPromise = new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          this.cache.set(url, texture);
          this.loadingPromises.delete(url);
          resolve(texture);
        },
        undefined,
        (error) => {
          this.loadingPromises.delete(url);
          reject(error);
        }
      );
    });

    this.loadingPromises.set(url, loadingPromise);
    const texture = await loadingPromise;
    return this.configureTexture(texture.clone(), options);
  }

  /**
   * @description 批量加載紋理
   * @param {Array<string>} urls - 紋理URL數組
   * @param {Object} options - 通用配置選項
   * @returns {Promise<Array<THREE.Texture>>}
   */
  async loadTextures(urls, options = {}) {
    const promises = urls.map(url => this.loadTexture(url, options));
    return Promise.all(promises);
  }

  /**
   * @description 配置紋理屬性
   * @param {THREE.Texture} texture - 紋理對象
   * @param {Object} options - 配置選項
   * @returns {THREE.Texture}
   */
  configureTexture(texture, options) {
    const {
      wrapS = THREE.RepeatWrapping,
      wrapT = THREE.RepeatWrapping,
      repeat = [1, 1],
      flipY = true,
      generateMipmaps = true,
      anisotropy = 16
    } = options;

    texture.wrapS = wrapS;
    texture.wrapT = wrapT;
    texture.repeat.set(...repeat);
    texture.flipY = flipY;
    texture.generateMipmaps = generateMipmaps;
    texture.anisotropy = Math.min(anisotropy, 16); // 限制各向異性過濾

    return texture;
  }

  /**
   * @description 預加載紋理組
   * @param {Object} textureGroups - 紋理組配置
   */
  async preloadTextureGroups(textureGroups) {
    const promises = [];
    
    for (const [groupName, config] of Object.entries(textureGroups)) {
      const groupPromise = this.loadTextures(config.urls, config.options);
      promises.push(groupPromise);
    }

    return Promise.all(promises);
  }

  /**
   * @description 清理緩存
   */
  dispose() {
    for (const texture of this.cache.values()) {
      texture.dispose();
    }
    this.cache.clear();
    this.loadingPromises.clear();
  }

  /**
   * @description 獲取緩存統計
   */
  getCacheStats() {
    return {
      cachedTextures: this.cache.size,
      loadingTextures: this.loadingPromises.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * @description 估算內存使用量
   */
  estimateMemoryUsage() {
    let totalBytes = 0;
    for (const texture of this.cache.values()) {
      if (texture.image) {
        const { width, height } = texture.image;
        // 估算：RGBA * width * height * 4 bytes
        totalBytes += width * height * 4;
      }
    }
    return `${(totalBytes / 1024 / 1024).toFixed(2)} MB`;
  }
}

// 創建全局實例
const textureManager = new TextureManager();

export default textureManager;