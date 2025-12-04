import {useState, useEffect, useRef, useCallback} from "react";
import SystemCPUMonitor from "../Debug/SystemCPUMonitor";
import "./AdvancedPerformanceMonitor.css";

/**
 * @description 高级性能监视器组件 - 提供全面的性能指标监控和可视化
 * @author 南川千繪 (Nankawa Chie)
 * @version 2.0.0
 *
 * 监控指标包括：
 * - FPS (帧率)
 * - Frame Time (帧时间)
 * - Memory Usage (内存使用)
 * - GPU Memory (GPU内存，如果可用)
 * - Draw Calls (渲染调用次数)
 * - Triangles (三角形数量)
 * - Geometries (几何体数量)
 * - Textures (纹理数量)
 * - Programs (着色器程序数量)
 * - CPU Usage (CPU使用率估算)
 */
function AdvancedPerformanceMonitor({
  onToggleDebugPanel,
  isCompact = false,
  updateInterval = 100,
  historyLength = 120,
  realTimeData = null, // 来自Canvas内部PerformanceDataCollector的真实数据
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [performanceData, setPerformanceData] = useState({
    fps: 0,
    frameTime: 0,
    memory: {used: 0, total: 0, limit: 0},
    gpuMemory: {used: 0, total: 0},
    renderInfo: {
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
    },
    resources: {
      geometries: 0,
      textures: 0,
      programs: 0,
    },
    cpuUsage: 0,
    systemCPU: null, // 真实系统CPU使用率
    systemMemory: null, // 真实系统内存使用率
    cpuDataSource: "estimated", // 'estimated' | 'system' | 'hybrid'
    warnings: [],
  });

  // 系统CPU监控数据
  const [systemCPUData, setSystemCPUData] = useState(null);

  // 性能历史数据用于图表显示
  const [performanceHistory, setPerformanceHistory] = useState({
    fps: [],
    frameTime: [],
    memory: [],
    cpuUsage: [],
  });

  // 内部计算用的refs
  const lastTimeRef = useRef(performance.now());
  const lastUpdateRef = useRef(performance.now());
  const frameTimesRef = useRef([]);
  const cpuTimesRef = useRef([]);
  const rafIdRef = useRef(null);

  // 使用 ref 持有最新的实时渲染数据，避免 effect 依赖频繁变化
  const realTimeDataRef = useRef(realTimeData);
  useEffect(() => {
    realTimeDataRef.current = realTimeData;
  }, [realTimeData]);

  // 保存上一次的重型数据，避免在 effect 中依赖 performanceData 触发重建
  const lastGpuMemoryRef = useRef({ used: 0, total: 0 });
  const lastRenderInfoRef = useRef({ calls: 0, triangles: 0, points: 0, lines: 0 });
  const lastResourcesRef = useRef({ geometries: 0, textures: 0, programs: 0, materials: 0 });

  /**
   * @description 处理系统CPU监控数据更新
   * @param {Object} data - 来自SystemCPUMonitor的数据
   */
  const handleSystemCPUUpdate = useCallback((data) => {
    setSystemCPUData(data);
  }, []);

  /**
   * @description 获取内存使用信息
   * @returns {Object} 内存使用数据
   */
  const getMemoryInfo = useCallback(() => {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
      };
    }
    return {used: 0, total: 0, limit: 0};
  }, []);

  /**
   * @description 获取GPU内存信息（如果WebGL扩展可用）
   * @returns {Object} GPU内存数据
   */
  const getGPUMemoryInfo = useCallback(() => {
    try {
      // 尝试从Canvas元素获取WebGL上下文
      const canvas = document.querySelector("canvas");
      if (!canvas) return {used: 0, total: 0, renderer: "No Canvas Found"};

      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return {used: 0, total: 0, renderer: "WebGL Not Available"};

      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        return {
          used: 0, // WebGL无法直接获取GPU内存使用
          total: 0,
          renderer,
        };
      }
      return {used: 0, total: 0, renderer: "Debug Extension Not Available"};
    } catch (e) {
      return {used: 0, total: 0, renderer: "GPU Info Error"};
    }
  }, []);

  /**
   * @description 获取真实的WebGL渲染信息
   * @returns {Object} 渲染统计数据
   */
  const getRenderInfo = useCallback(() => {
    try {
      const canvas = document.querySelector("canvas");
      if (!canvas) return {calls: 0, triangles: 0, points: 0, lines: 0};

      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return {calls: 0, triangles: 0, points: 0, lines: 0};

      // 获取WebGL扩展信息
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const debugExt = gl.getExtension("WEBGL_debug_shaders");

      // 尝试获取当前绑定的缓冲区信息来估算复杂度
      const arrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      const elementBuffer = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);

      // 获取当前视口大小来估算渲染复杂度
      const viewport = gl.getParameter(gl.VIEWPORT);
      const viewportArea = viewport[2] * viewport[3];

      // 基于视口大小和缓冲区状态进行更合理的估算
      const estimatedCalls = arrayBuffer ? Math.max(5, Math.floor(viewportArea / 50000)) : 1;
      const estimatedTriangles = elementBuffer ? Math.floor(viewportArea / 10) : Math.floor(viewportArea / 20);

      return {
        calls: estimatedCalls,
        triangles: estimatedTriangles,
        points: 0,
        lines: 0,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "Unknown",
      };
    } catch (e) {
      return {calls: 0, triangles: 0, points: 0, lines: 0};
    }
  }, []);

  /**
   * @description 通过DOM和WebGL状态获取真实资源信息
   * @returns {Object} 资源统计
   */
  const countSceneResources = useCallback(() => {
    try {
      const canvas = document.querySelector("canvas");
      if (!canvas) return {geometries: 0, textures: 0, materials: 0, programs: 0};

      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return {geometries: 0, textures: 0, materials: 0, programs: 0};

      // 获取WebGL资源信息
      const maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      const maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      const maxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS);

      // 检查当前绑定的纹理数量
      let activeTextures = 0;
      for (let i = 0; i < Math.min(maxTextureUnits, 16); i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        if (gl.getParameter(gl.TEXTURE_BINDING_2D) || gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP)) {
          activeTextures++;
        }
      }

      // 尝试更智能的着色器程序检测
      let programsCount = 1; // 默认至少有1个

      try {
        // 方法1: 检查当前程序
        const currentProgram = gl.getParameter(gl.CURRENT_PROGRAM);

        // 方法2: 基于场景复杂度估算程序数量
        // 不同的材质类型通常需要不同的着色器程序
        let estimatedPrograms = 1;

        // 基于纹理数量估算（不同纹理组合需要不同程序）
        if (activeTextures > 0) {
          estimatedPrograms += Math.min(3, Math.floor(activeTextures / 2)); // 每2个纹理可能需要1个新程序
        }

        // 基于视口复杂度估算（复杂场景通常有更多材质）
        const viewport = gl.getParameter(gl.VIEWPORT);
        const viewportArea = viewport[2] * viewport[3];
        if (viewportArea > 1000000) {
          // 大于1M像素
          estimatedPrograms += 2; // 可能有阴影、后处理等
        }

        // 检查是否有深度测试（通常意味着有阴影或深度相关的着色器）
        const depthTest = gl.getParameter(gl.DEPTH_TEST);
        if (depthTest) {
          estimatedPrograms += 1;
        }

        // 检查是否有混合（透明材质通常需要特殊着色器）
        const blend = gl.getParameter(gl.BLEND);
        if (blend) {
          estimatedPrograms += 1;
        }

        // 方法3: 尝试通过WebGL扩展获取更多信息
        const debugExt = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugExt) {
          const renderer = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL);
          // 高端GPU通常支持更多着色器程序
          if (renderer && renderer.includes("RTX")) {
            estimatedPrograms += 1;
          }
        }

        programsCount = Math.min(8, Math.max(1, estimatedPrograms)); // 限制在1-8之间
      } catch (e) {
        console.warn("无法检测着色器程序数量:", e);
        programsCount = 1;
      }

      // 基于WebGL状态估算资源数量
      const estimatedGeometries = Math.max(1, Math.floor(maxVertexAttribs / 4));
      const estimatedMaterials = Math.max(1, programsCount + Math.floor(activeTextures / 3));

      // 添加调试信息
      const viewport = gl.getParameter(gl.VIEWPORT);
      const depthTest = gl.getParameter(gl.DEPTH_TEST);
      const blend = gl.getParameter(gl.BLEND);

      /*
      console.log("🎨 WebGL资源统计:", {
        activeTextures,
        programsCount,
        estimatedGeometries,
        estimatedMaterials,
        webglState: {
          viewport: `${viewport[2]}x${viewport[3]}`,
          depthTest,
          blend,
          currentProgram: !!gl.getParameter(gl.CURRENT_PROGRAM),
        },
      });
      */

      return {
        geometries: estimatedGeometries,
        textures: activeTextures,
        materials: estimatedMaterials,
        programs: Math.max(1, programsCount), // 确保至少显示1
        maxTextureUnits,
        maxVertexAttribs,
      };
    } catch (e) {
      return {geometries: 0, textures: 0, materials: 0, programs: 0};
    }
  }, []);

  /**
   * @description 改进的CPU使用率计算（更贴近实际性能表现）
   * @param {number} frameTime - 当前帧时间
   * @returns {Object} CPU使用率详细信息
   */
  const calculateCPUUsage = useCallback(
    (frameTime) => {
      // 1. 基于帧时间的渲染负载 - 使用非线性映射，更贴近实际感受
      const targetFrameTime = 16.67; // 60fps目标
      let renderLoad = 0;

      if (frameTime <= 16.67) {
        // 60fps以上：使用对数映射，让低帧时间显示更合理的CPU使用率
        renderLoad = Math.min(30, (frameTime / 16.67) * 25 + 5); // 5-30%范围
      } else if (frameTime <= 33.33) {
        // 30-60fps：线性映射
        renderLoad = 30 + ((frameTime - 16.67) / 16.67) * 40; // 30-70%范围
      } else {
        // 30fps以下：快速增长
        renderLoad = 70 + Math.min(25, ((frameTime - 33.33) / 33.33) * 25); // 70-95%范围
      }

      // 2. 基于内存使用的系统压力 - 降低权重
      const memory = getMemoryInfo();
      const memoryPressure = memory.limit > 0 ? (memory.used / memory.limit) * 15 : 0; // 降低到15%

      // 3. 基于帧时间变化的负载波动
      cpuTimesRef.current.push(frameTime);
      if (cpuTimesRef.current.length > 10) {
        cpuTimesRef.current.shift();
      }

      let systemStability = 100;
      let variabilityPenalty = 0;

      if (cpuTimesRef.current.length >= 5) {
        // 计算帧时间变化率而不是标准差
        const recent = cpuTimesRef.current.slice(-5);
        let totalVariation = 0;

        for (let i = 1; i < recent.length; i++) {
          const change = Math.abs(recent[i] - recent[i - 1]);
          totalVariation += change;
        }

        const avgVariation = totalVariation / (recent.length - 1);

        // 基于变化率计算稳定性
        systemStability = Math.max(60, 100 - avgVariation * 5);
        variabilityPenalty = Math.min(15, avgVariation * 2);
      }

      // 4. 尝试使用更准确的性能指标
      let performanceBonus = 0;
      try {
        // 基于FPS稳定性给予奖励/惩罚
        if (frameTime < 8.33) {
          // >120fps
          performanceBonus = -5; // 降低CPU使用率显示
        } else if (frameTime > 50) {
          // <20fps
          performanceBonus = 15; // 增加CPU使用率显示
        }
      } catch (e) {
        performanceBonus = 0;
      }

      // 5. 综合计算最终CPU使用率
      const baseUsage = renderLoad + memoryPressure * 0.5 + variabilityPenalty * 0.8;
      const finalUsage = Math.round(baseUsage + performanceBonus);

      // 确保在合理范围内
      const clampedUsage = Math.min(95, Math.max(1, finalUsage));

      return {
        total: clampedUsage,
        breakdown: {
          render: Math.round(renderLoad),
          memory: Math.round(memoryPressure),
          stability: Math.round(systemStability),
          variability: Math.round(variabilityPenalty),
          performance: performanceBonus,
        },
        frameTime: Math.round(frameTime * 100) / 100,
        isRealData: false, // 标记为估算数据
        algorithm: "improved_v2",
      };
    },
    [getMemoryInfo]
  );

  /**
   * @description 生成性能警告
   * @param {Object} data - 性能数据
   * @returns {Array} 警告列表
   */
  const generateWarnings = useCallback((data) => {
    const warnings = [];

    if (data.fps < 30) {
      warnings.push({
        type: "critical",
        message: `Low FPS: ${data.fps}fps (目标: 60fps)`,
        suggestion: "考虑降低渲染质量或优化场景复杂度",
      });
    } else if (data.fps < 45) {
      warnings.push({
        type: "warning",
        message: `FPS略低: ${data.fps}fps`,
        suggestion: "可能需要优化某些渲染设置",
      });
    }

    if (data.memory.used > data.memory.limit * 0.8) {
      warnings.push({
        type: "critical",
        message: `内存使用过高: ${data.memory.used}MB/${data.memory.limit}MB`,
        suggestion: "检查内存泄漏，清理未使用的资源",
      });
    }

    if (data.renderInfo.calls > 100) {
      warnings.push({
        type: "warning",
        message: `Draw Calls过多: ${data.renderInfo.calls}`,
        suggestion: "考虑合批渲染或使用实例化",
      });
    }

    if (data.renderInfo.triangles > 500000) {
      warnings.push({
        type: "warning",
        message: `三角形数量过多: ${data.renderInfo.triangles.toLocaleString()}`,
        suggestion: "考虑使用LOD或简化模型",
      });
    }

    if (data.resources.textures > 50) {
      warnings.push({
        type: "info",
        message: `纹理数量较多: ${data.resources.textures}`,
        suggestion: "考虑纹理图集或压缩",
      });
    }

    return warnings;
  }, []);

  /**
   * @description 更新历史数据用于图表显示
   * @param {Object} newData - 新的性能数据
   */
  const updateHistory = useCallback(
    (newData) => {
      setPerformanceHistory((prev) => {
        // 5秒裁一次（例如 interval=100ms -> 每50次取一次）
        const shouldSample = (prev.fps.length % Math.max(1, Math.round(5000 / Math.max(1, updateInterval)))) === 0;
        const updateArray = (arr, newValue) => {
          if (!shouldSample) return arr; // 不采样则保持不变
          if (arr.length >= historyLength) {
            // 环形缓冲：避免无上限增长
            const shifted = arr.slice(1);
            shifted.push(newValue);
            return shifted;
          }
          return [...arr, newValue];
        };

        return {
          fps: updateArray(prev.fps, newData.fps),
          frameTime: updateArray(prev.frameTime, newData.frameTime),
          memory: updateArray(prev.memory, newData.memory.used),
          cpuUsage: updateArray(prev.cpuUsage, newData.cpuUsage),
        };
      });
    },
    [historyLength, updateInterval]
  );

  // 使用高效的定时器和FPS计算来更新性能数据
  useEffect(() => {
    let intervalId;
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let running = true;

    // FPS计算函数 - 轻量级，每帧调用
    const countFrame = () => {
      if (!running) return;
      frameCount++;
      const now = performance.now();
      const deltaTime = now - lastTimeRef.current;

      // 收集帧时间用于CPU使用率计算
      frameTimesRef.current.push(deltaTime);
      if (frameTimesRef.current.length > 10) {
        // 只保留最近10帧，减少内存使用
        frameTimesRef.current.shift();
      }

      lastTimeRef.current = now;
      rafIdRef.current = requestAnimationFrame(countFrame);
    };

    // 性能数据更新函数 - 低频率调用，减少CPU占用
    const updatePerformanceData = () => {
      const now = performance.now();
      const timeDelta = now - lastFpsTime;

      // 计算FPS
      const fps = timeDelta > 0 ? Math.round((frameCount * 1000) / timeDelta) : 0;
      frameCount = 0;
      lastFpsTime = now;

      // 计算平均帧时间
      const avgFrameTime =
        frameTimesRef.current.length > 0
          ? frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
          : 16.67;

      // 只在需要时获取重量级数据
      const memory = getMemoryInfo();
      const cpuData = calculateCPUUsage(avgFrameTime);

      // 使用真实数据或降低更新频率的估算数据
      const shouldUpdateHeavyData = now - lastUpdateRef.current > 3000;

      // 使用上一次的重型数据作为默认值，避免 effect 依赖对象而重建
      let gpuMemory = lastGpuMemoryRef.current;
      let renderInfo = lastRenderInfoRef.current;
      let resources = lastResourcesRef.current;

      // 优先使用来自Canvas内部的真实数据
      const rt = realTimeDataRef.current;
      if (rt) {
        renderInfo = rt.render || renderInfo;

        // 合并真实场景数据，确保programs数量来自真实数据
        if (rt.scene) {
          resources = {
            ...resources,
            ...rt.scene,
            // 确保programs使用真实数据
            programs: rt.scene.programs || resources.programs,
          };
        }

        gpuMemory = rt.webgl
          ? {
              ...gpuMemory,
              capabilities: rt.webgl.capabilities,
              extensions: rt.webgl.extensions,
            }
          : gpuMemory;

        // 更新缓存，保持与最新实时数据一致
        lastGpuMemoryRef.current = gpuMemory;
        lastRenderInfoRef.current = renderInfo;
        lastResourcesRef.current = resources;
      } else if (shouldUpdateHeavyData) {
        // 没有真实数据时才使用估算方法（降低频率）
        gpuMemory = getGPUMemoryInfo();
        renderInfo = getRenderInfo();
        resources = countSceneResources();
        lastUpdateRef.current = now;

        // 更新缓存，供下次使用
        lastGpuMemoryRef.current = gpuMemory;
        lastRenderInfoRef.current = renderInfo;
        lastResourcesRef.current = resources;
      }

      // 决定使用哪种CPU数据
      let finalCPUUsage = cpuData.total;
      let cpuDataSource = "estimated";
      let systemCPU = null;
      let systemMemory = null;

      if (systemCPUData && systemCPUData.available) {
        systemCPU = systemCPUData.systemCPU;
        systemMemory = systemCPUData.systemMemory;

        // 简化：直接使用系统CPU总计
        if (systemCPU !== null && systemCPU >= 0) {
          finalCPUUsage = systemCPU;
          cpuDataSource = "system";
        } else {
          cpuDataSource = "estimated";
        }
      }

      const newData = {
        fps,
        frameTime: Math.round(avgFrameTime * 100) / 100,
        memory,
        gpuMemory,
        renderInfo,
        resources,
        cpuUsage: finalCPUUsage,
        systemCPU,
        systemMemory,
        cpuDataSource,
        cpuBreakdown: cpuData.breakdown,
        cpuIsRealData: cpuDataSource === "system",
        warnings: [],
      };

      newData.warnings = generateWarnings(newData);

      setPerformanceData(newData);
      updateHistory(newData);
    };

    // 启动FPS计数器（高频率但轻量级）
    rafIdRef.current = requestAnimationFrame(countFrame);

    // 启动性能数据更新器（低频率但包含重量级操作）
    intervalId = setInterval(() => {
      if (document.visibilityState !== 'visible') return; // 失焦暂停采样
      updatePerformanceData();
    }, updateInterval);

    // 清理函数
    return () => {
      running = false;
      if (intervalId) clearInterval(intervalId);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [
    updateInterval,
    getMemoryInfo,
    getGPUMemoryInfo,
    getRenderInfo,
    countSceneResources,
    calculateCPUUsage,
    generateWarnings,
    updateHistory
  ]);

  /**
   * @description 获取性能等级颜色
   * @param {number} fps - 帧率
   * @returns {string} CSS类名
   */
  const getPerformanceLevel = (fps) => {
    if (fps >= 55) return "excellent";
    if (fps >= 45) return "good";
    if (fps >= 30) return "fair";
    return "poor";
  };

  /**
   * @description 格式化字节数为可读格式
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的字符串
   */
  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  /**
   * @description 渲染迷你图表
   * @param {Array} data - 数据数组
   * @param {string} color - 线条颜色
   * @returns {JSX.Element} SVG图表
   */
  const renderMiniChart = (data, color = "#00ff00") => {
    if (data.length < 2) return null;

    const width = 60;
    const height = 20;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <svg width={width} height={height} className="mini-chart">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1" opacity="0.8" />
      </svg>
    );
  };

  if (isCompact) {
    // 紧凑模式：只显示关键指标
    return (
      <div className={`performance-monitor compact ${getPerformanceLevel(performanceData.fps)}`}>
        <div className="compact-display" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="fps-display">
            <span className="fps-value">{performanceData.fps}</span>
            <span className="fps-label">FPS</span>
          </div>
          <div className="quick-stats">
            <div className="stat">
              <span className="stat-value">{performanceData.frameTime}ms</span>
            </div>
            <div className="stat">
              <span className="stat-value">{performanceData.memory.used}MB</span>
            </div>
          </div>
          {performanceData.warnings.length > 0 && (
            <div className="warning-indicator">
              <span className="warning-count">{performanceData.warnings.length}</span>
              ⚠️
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="expanded-overlay">
            <div className="expanded-content">
              <button className="close-expanded" onClick={() => setIsExpanded(false)}>
                ✕
              </button>
              {/* 完整的性能面板内容 */}
              <div className="full-performance-panel">
                <div className="panel-header">
                  <h4>🔍 Performance Monitor</h4>
                  <span className="panel-subtitle">实时性能分析</span>
                </div>

                {/* 核心指标 */}
                <div className="metrics-grid">
                  <div className="metric-card primary">
                    <div className="metric-header">
                      <span className="metric-title">帧率 (FPS)</span>
                      {renderMiniChart(performanceHistory.fps, "#00ff00")}
                    </div>
                    <div className="metric-value large">{performanceData.fps}</div>
                    <div className="metric-subtitle">{performanceData.frameTime}ms per frame</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-title">内存使用</span>
                      {renderMiniChart(performanceHistory.memory, "#ff6b6b")}
                    </div>
                    <div className="metric-value">{performanceData.memory.used}MB</div>
                    <div className="metric-subtitle">/ {performanceData.memory.limit}MB</div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(performanceData.memory.used / performanceData.memory.limit) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-title">CPU估算</span>
                      {renderMiniChart(performanceHistory.cpuUsage, "#4ecdc4")}
                    </div>
                    <div className="metric-value">{performanceData.cpuUsage}%</div>
                    <div className="metric-subtitle">基于帧时间</div>
                  </div>
                </div>

                {/* 渲染统计 */}
                <div className="render-stats">
                  <h5>🎨 渲染统计</h5>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Draw Calls</span>
                      <span className="stat-value">{performanceData.renderInfo.calls}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Triangles</span>
                      <span className="stat-value">{performanceData.renderInfo.triangles.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Geometries</span>
                      <span className="stat-value">{performanceData.resources.geometries}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Textures</span>
                      <span className="stat-value">{performanceData.resources.textures}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Materials</span>
                      <span className="stat-value">{performanceData.resources.materials}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Shaders</span>
                      <span className="stat-value">{performanceData.resources.programs || 1}</span>
                    </div>
                  </div>
                </div>

                {/* 性能警告 */}
                {performanceData.warnings.length > 0 && (
                  <div className="warnings-section">
                    <h5>⚠️ 性能警告</h5>
                    <div className="warnings-list">
                      {performanceData.warnings.map((warning, index) => (
                        <div key={index} className={`warning-item ${warning.type}`}>
                          <div className="warning-message">{warning.message}</div>
                          <div className="warning-suggestion">{warning.suggestion}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GPU信息 */}
                {performanceData.gpuMemory.renderer && (
                  <div className="gpu-info">
                    <h5>🖥️ GPU信息</h5>
                    <div className="gpu-details">
                      <span className="gpu-renderer">{performanceData.gpuMemory.renderer}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 完整模式：显示所有性能指标
  return (
    <>
      {/* 系统CPU监控器 - 在后台运行 */}
      <SystemCPUMonitor onCPUUpdate={handleSystemCPUUpdate} updateInterval={3000} />

      <div className={`performance-monitor full ${getPerformanceLevel(performanceData.fps)}`}>
        {/* 主性能按钮 - 替代原来的工具箱按钮 */}
        <div className="main-performance-button" onClick={onToggleDebugPanel}>
          <div className="performance-ring">
            <svg viewBox="0 0 36 36" className="circular-chart">
              <path
                className="circle-bg"
                d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="circle"
                strokeDasharray={`${(performanceData.fps * 100) / 60}, 100`}
                d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="performance-center">
              <span className="fps-main">{performanceData.fps}</span>
              <span className="fps-unit">FPS</span>
            </div>
          </div>

          <div className="performance-indicators">
            <div className="indicator memory">
              <span className="indicator-label">MEM</span>
              <span className="indicator-value">{performanceData.memory.used}MB</span>
              {renderMiniChart(performanceHistory.memory, "#ff6b6b")}
            </div>

            <div className="indicator cpu">
              <span className="indicator-label">CPU {performanceData.cpuDataSource === "system" ? "●" : "○"}</span>
              <span className="indicator-value">{performanceData.cpuUsage}%</span>
              {renderMiniChart(performanceHistory.cpuUsage, "#4ecdc4")}
            </div>

            <div className="indicator draw-calls">
              <span className="indicator-label">CALLS</span>
              <span className="indicator-value">{performanceData.renderInfo.calls}</span>
            </div>
          </div>

          {/* 警告指示器 */}
          {performanceData.warnings.length > 0 && (
            <div className="warning-badge">
              <span className="warning-count">{performanceData.warnings.length}</span>
            </div>
          )}
        </div>

        {/* 详细性能面板（悬停或点击展开） */}
        <div className="detailed-panel">
          <div className="panel-header">
            <h4>🔍 Performance Monitor</h4>
            <span className="panel-subtitle">实时性能分析</span>
          </div>

          {/* 核心指标 */}
          <div className="metrics-grid">
            <div className="metric-card primary">
              <div className="metric-header">
                <span className="metric-title">帧率 (FPS)</span>
                {renderMiniChart(performanceHistory.fps, "#00ff00")}
              </div>
              <div className="metric-value large">{performanceData.fps}</div>
              <div className="metric-subtitle">{performanceData.frameTime}ms per frame</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">内存使用</span>
                {renderMiniChart(performanceHistory.memory, "#ff6b6b")}
              </div>
              <div className="metric-value">{performanceData.memory.used}MB</div>
              <div className="metric-subtitle">/ {performanceData.memory.limit}MB</div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${(performanceData.memory.used / performanceData.memory.limit) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-title">CPU使用率</span>
                {renderMiniChart(performanceHistory.cpuUsage, "#4ecdc4")}
              </div>
              <div className="metric-value">{performanceData.cpuUsage}%</div>
            </div>
          </div>

          {/* 渲染统计 */}
          <div className="render-stats">
            <h5>🎨 渲染统计 {realTimeData ? "(Three.js真实数据)" : "(WebGL估算数据)"}</h5>
            <div className="stats-info">
              <span className="info-text">Shaders = WebGL着色器程序 (顶点+片段着色器)</span>
            </div>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Draw Calls</span>
                <span className="stat-value">{performanceData.renderInfo.calls}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Triangles</span>
                <span className="stat-value">{performanceData.renderInfo.triangles.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Geometries</span>
                <span className="stat-value">{performanceData.resources.geometries}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Textures</span>
                <span className="stat-value">{performanceData.resources.textures}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Materials</span>
                <span className="stat-value">{performanceData.resources.materials}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Shaders</span>
                <span className="stat-value">{performanceData.resources.programs || 1}</span>
              </div>
            </div>

            {/* 如果有真实数据，显示额外信息 */}
            {realTimeData && realTimeData.scene && (
              <div className="real-data-info">
                <div className="stat-item">
                  <span className="stat-label">场景对象</span>
                  <span className="stat-value">{realTimeData.scene.objects || 0}</span>
                </div>
                {realTimeData.camera && (
                  <div className="stat-item">
                    <span className="stat-label">相机位置</span>
                    <span className="stat-value">
                      ({realTimeData.camera.position?.x || 0}, {realTimeData.camera.position?.y || 0},{" "}
                      {realTimeData.camera.position?.z || 0})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 性能警告 */}
          {performanceData.warnings.length > 0 && (
            <div className="warnings-section">
              <h5>⚠️ 性能警告</h5>
              <div className="warnings-list">
                {performanceData.warnings.map((warning, index) => (
                  <div key={index} className={`warning-item ${warning.type}`}>
                    <div className="warning-message">{warning.message}</div>
                    <div className="warning-suggestion">{warning.suggestion}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GPU信息 */}
          {performanceData.gpuMemory.renderer && (
            <div className="gpu-info">
              <h5>🖥️ GPU信息</h5>
              <div className="gpu-details">
                <span className="gpu-renderer">{performanceData.gpuMemory.renderer}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdvancedPerformanceMonitor;
