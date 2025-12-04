#!/usr/bin/env node

/**
 * @description 系统资源监控服务器
 * @author 南川千繪 (Nankawa Chie)
 * 
 * 运行方式：
 * 1. npm install express cors os-utils
 * 2. node scripts/system-monitor.js
 * 3. 在浏览器中通过 fetch('http://localhost:3001/cpu') 获取数据
 */

const express = require('express');
const cors = require('cors');
const os = require('os');

// 尝试导入系统监控库
let osUtils = null;
try {
  osUtils = require('os-utils');
} catch (e) {
  console.warn('os-utils未安装，使用基础监控');
}

const app = express();
const PORT = 3001;

// 启用CORS，允许从localhost:5173访问
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173']
}));

app.use(express.json());

// 存储历史数据
const performanceHistory = {
  cpu: [],
  memory: [],
  timestamps: []
};

// CPU使用率计算的历史数据
let previousCPUInfo = null;

/**
 * @description 获取CPU使用率（改进版）
 */
function getCPUUsage() {
  return new Promise((resolve) => {
    if (osUtils) {
      osUtils.cpuUsage((usage) => {
        resolve(Math.round(usage * 100));
      });
    } else {
      // 改进的CPU使用率计算
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      
      cpus.forEach((cpu) => {
        for (let type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });

      const currentCPUInfo = {
        idle: totalIdle,
        total: totalTick,
        timestamp: Date.now()
      };

      if (previousCPUInfo) {
        // 计算时间差内的CPU使用率
        const idleDiff = currentCPUInfo.idle - previousCPUInfo.idle;
        const totalDiff = currentCPUInfo.total - previousCPUInfo.total;
        
        const usage = totalDiff > 0 ? Math.round(100 - (idleDiff / totalDiff) * 100) : 0;
        previousCPUInfo = currentCPUInfo;
        resolve(Math.max(0, Math.min(100, usage)));
      } else {
        // 第一次调用，使用简单方法
        previousCPUInfo = currentCPUInfo;
        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = total > 0 ? Math.round(100 - (idle / total) * 100) : 0;
        resolve(Math.max(0, Math.min(100, usage)));
      }
    }
  });
}

/**
 * @description 获取内存使用情况
 */
function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    total: Math.round(totalMem / 1024 / 1024), // MB
    used: Math.round(usedMem / 1024 / 1024),   // MB
    free: Math.round(freeMem / 1024 / 1024),   // MB
    percentage: Math.round((usedMem / totalMem) * 100)
  };
}

/**
 * @description 获取系统信息
 */
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    hostname: os.hostname(),
    uptime: Math.round(os.uptime()),
    loadavg: os.loadavg()
  };
}

// API路由

// 获取CPU使用率
app.get('/cpu', async (req, res) => {
  try {
    const cpuUsage = await getCPUUsage();
    const timestamp = Date.now();
    
    // 存储历史数据
    performanceHistory.cpu.push(cpuUsage);
    performanceHistory.timestamps.push(timestamp);
    
    // 只保留最近60个数据点
    if (performanceHistory.cpu.length > 60) {
      performanceHistory.cpu.shift();
      performanceHistory.timestamps.shift();
    }
    
    res.json({
      usage: cpuUsage,
      timestamp,
      history: performanceHistory.cpu.slice(-10) // 返回最近10个数据点
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取内存使用情况
app.get('/memory', (req, res) => {
  try {
    const memoryUsage = getMemoryUsage();
    const timestamp = Date.now();
    
    performanceHistory.memory.push(memoryUsage.percentage);
    if (performanceHistory.memory.length > 60) {
      performanceHistory.memory.shift();
    }
    
    res.json({
      ...memoryUsage,
      timestamp,
      history: performanceHistory.memory.slice(-10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取完整系统信息
app.get('/system', async (req, res) => {
  try {
    const [cpuUsage, memoryUsage, systemInfo] = await Promise.all([
      getCPUUsage(),
      Promise.resolve(getMemoryUsage()),
      Promise.resolve(getSystemInfo())
    ]);
    
    res.json({
      cpu: {
        usage: cpuUsage,
        cores: systemInfo.cpus,
        loadavg: systemInfo.loadavg
      },
      memory: memoryUsage,
      system: systemInfo,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    message: '系统监控服务运行正常'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🔍 系统监控服务器已启动: http://localhost:${PORT}`);
  console.log(`📊 可用端点:`);
  console.log(`   GET /cpu     - CPU使用率`);
  console.log(`   GET /memory  - 内存使用情况`);
  console.log(`   GET /system  - 完整系统信息`);
  console.log(`   GET /health  - 健康检查`);
  console.log(`\n💡 在你的React应用中使用:`);
  console.log(`   fetch('http://localhost:${PORT}/cpu').then(r => r.json())`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 系统监控服务器正在关闭...');
  process.exit(0);
});