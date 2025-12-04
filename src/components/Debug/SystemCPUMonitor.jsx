import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * @description 真实系统CPU监控客户端
 * @author 南川千繪 (Nankawa Chie)
 * 
 * 使用方法：
 * 1. 先运行: npm run monitor (启动监控服务器)
 * 2. 然后运行: npm run dev (启动开发服务器)
 * 3. 或者直接运行: npm run dev:with-monitor (同时启动两个服务)
 */
function SystemCPUMonitor({ onCPUUpdate, updateInterval = 2000 }) {
  const [systemData, setSystemData] = useState({
    cpu: {
      usage: 0,
      history: [],
      available: false
    },
    memory: {
      used: 0,
      total: 0,
      percentage: 0,
      history: [],
      available: false
    },
    connection: {
      status: 'disconnected', // 'connected', 'disconnected', 'error'
      lastUpdate: null,
      error: null
    }
  });

  const retryCountRef = useRef(0);
  const maxRetries = 3;

  /**
   * @description 检查监控服务器是否可用
   */
  const checkMonitorServer = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.status === 'ok';
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }, []);

  /**
   * @description 获取CPU数据
   */
  const fetchCPUData = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/cpu');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        usage: data.usage,
        history: data.history || [],
        timestamp: data.timestamp,
        available: true
      };
    } catch (error) {
      console.warn('获取CPU数据失败:', error.message);
      return {
        usage: 0,
        history: [],
        timestamp: Date.now(),
        available: false,
        error: error.message
      };
    }
  }, []);

  /**
   * @description 获取内存数据
   */
  const fetchMemoryData = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/memory');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        used: data.used,
        total: data.total,
        free: data.free,
        percentage: data.percentage,
        history: data.history || [],
        timestamp: data.timestamp,
        available: true
      };
    } catch (error) {
      console.warn('获取内存数据失败:', error.message);
      return {
        used: 0,
        total: 0,
        free: 0,
        percentage: 0,
        history: [],
        timestamp: Date.now(),
        available: false,
        error: error.message
      };
    }
  }, []);

  /**
   * @description 获取完整系统信息
   */
  const fetchSystemInfo = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/system');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        cpu: {
          usage: data.cpu.usage,
          cores: data.cpu.cores,
          loadavg: data.cpu.loadavg,
          available: true
        },
        memory: {
          used: data.memory.used,
          total: data.memory.total,
          percentage: data.memory.percentage,
          available: true
        },
        system: data.system,
        timestamp: data.timestamp
      };
    } catch (error) {
      console.warn('获取系统信息失败:', error.message);
      return null;
    }
  }, []);

  /**
   * @description 更新系统监控数据
   */
  const updateSystemData = useCallback(async () => {
    try {
      // 检查服务器连接
      const serverAvailable = await checkMonitorServer();
      
      if (!serverAvailable) {
        setSystemData(prev => ({
          ...prev,
          connection: {
            status: 'disconnected',
            lastUpdate: Date.now(),
            error: '监控服务器未运行。请运行: npm run monitor'
          }
        }));
        
        retryCountRef.current++;
        return;
      }

      // 获取CPU和内存数据
      const [cpuData, memoryData] = await Promise.all([
        fetchCPUData(),
        fetchMemoryData()
      ]);

      const newSystemData = {
        cpu: cpuData,
        memory: memoryData,
        connection: {
          status: 'connected',
          lastUpdate: Date.now(),
          error: null
        }
      };

      setSystemData(newSystemData);
      retryCountRef.current = 0; // 重置重试计数

      // 通知父组件
      if (onCPUUpdate) {
        onCPUUpdate({
          systemCPU: cpuData.usage,
          systemMemory: memoryData.percentage,
          available: cpuData.available && memoryData.available,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error('系统监控更新失败:', error);
      
      setSystemData(prev => ({
        ...prev,
        connection: {
          status: 'error',
          lastUpdate: Date.now(),
          error: error.message
        }
      }));
      
      retryCountRef.current++;
    }
  }, [checkMonitorServer, fetchCPUData, fetchMemoryData, onCPUUpdate]);

  /**
   * @description 获取连接状态显示文本
   */
  const getConnectionStatusText = useCallback(() => {
    const { status, error } = systemData.connection;
    
    switch (status) {
      case 'connected':
        return '✅ 已连接到系统监控服务';
      case 'disconnected':
        return '⚠️ 监控服务未启动';
      case 'error':
        return `❌ 连接错误: ${error}`;
      default:
        return '🔍 正在连接...';
    }
  }, [systemData.connection]);

  // 初始化和定期更新
  useEffect(() => {
    // 立即执行一次
    updateSystemData();
    
    // 设置定期更新
    const intervalId = setInterval(() => {
      // 如果重试次数过多，降低更新频率
      if (retryCountRef.current < maxRetries) {
        updateSystemData();
      }
    }, updateInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [updateSystemData, updateInterval]);

  // 这个组件不渲染任何内容，只提供数据
  return null;
}

export default SystemCPUMonitor;