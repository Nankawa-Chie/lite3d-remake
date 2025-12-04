# Vite3D-0620 项目文件结构说明 v0.1.7

## 项目概述

这是一个基于 React + Vite + React Three Fiber 的 3D 交互式世界项目，从旧版本的 Vanilla JS + Webpack 项目迁移而来。支持多种 3D 场景、物理模拟、音频系统和高级性能监控。

## 📁 根目录结构

```
Vite3D-0620/
├── 📄 package.json              # 项目依赖和脚本配置
├── 📄 package-lock.json         # 依赖版本锁定文件
├── 📄 vite.config.js            # Vite 构建配置
├── 📄 eslint.config.js          # ESLint 代码规范配置
├── 📄 index.html                # 主 HTML 入口文件
├── 📄 README.md                 # 项目说明文档
├── 📄 PROJECT_STRUCTURE.md      # 项目结构说明文档
├── 📄 SYSTEM_MONITOR_GUIDE.md   # 系统监控指南
├── 📄 run.bat                   # Windows 启动脚本
├── 📄 .gitignore                # Git 忽略文件配置
├── 📁 node_modules/             # NPM 依赖包目录
├── 📁 public/                   # 静态资源目录
├── 📁 src/                      # 源代码目录
└── 📁 scripts/                  # 工具脚本目录
```

## 📁 public/ 静态资源目录

```
public/
├── 📄 vite.svg                  # Vite 图标
├── 📄 gsap.min.js               # GSAP 动画库
├── 📁 iPhone12/                 # iPhone 模拟器相关资源
└── 📁 video/                    # 视频资源文件夹
```

### 📱 iPhone12/ 子目录

模拟 iPhone 界面的完整实现，包含多个应用：

```
iPhone12/
├── 📄 index.html                # iPhone 主界面
├── 📄 script.js                 # iPhone 主逻辑
├── 📄 style.css                 # iPhone 样式
├── 📄 iphoneLockScreen.mp3      # 锁屏音效
├── 📁 src/                      # iPhone 界面依赖库和图标资源
└── 📁 apps/                     # iPhone 内置应用
    ├── 📁 EasyChess/            # 象棋游戏应用
    ├── 📁 Open-LLM-VTuber/      # Open-LLM-VTuber 应用
    ├── 📁 video/                # 视频播放器应用
    ├── 📁 扫雷/                  # 扫雷游戏应用
    ├── 📁 音乐播放器/             # 音乐播放器应用
    └── 📁 黑白棋/                # 黑白棋游戏应用（含AI功能）
```

## 📁 src/ 源代码目录

```
src/
├── 📄 main.jsx                  # React 应用入口
├── 📄 App.jsx                   # 主应用组件
├── 📄 App.css                   # 主应用样式
├── 📄 index.css                 # 全局样式
├── 📁 assets/                   # 项目资源文件
├── 📁 components/               # React 组件目录
├── 📁 config/                   # 配置文件目录
├── 📁 hooks/                    # 自定义 React Hooks
├── 📁 shaders/                  # GLSL 着色器文件
├── 📁 stores/                   # 状态管理存储
└── 📁 utils/                    # 工具函数库
```

### 📁 assets/ 资源文件

```
assets/
├── 📄 react.svg                 # React 图标
├── 📁 fonts/                    # 字体文件（Three.js 字体格式）
├── 📁 icons/                    # 图标资源
├── 📁 models/                   # 3D 模型文件（.glb 格式）
├── 📁 plantuml/                 # PlantUML 图表文件
├── 📁 terrain/                  # 地形纹理资源
└── 📁 textures/                 # 纹理贴图文件
```

#### 📁 fonts/ 字体资源

```
fonts/
├── 📄 First Coffee.otf          # First Coffee 字体
├── 📄 helvetiker_regular.typeface.json  # Helvetiker 字体（Three.js 格式）
├── 📄 LICENSE                   # 字体许可证
├── 📄 Ma_Shan_Zheng_Regular.json # 马善政字体（Three.js 格式）
└── 📄 Sevillana_Regular.json    # Sevillana 字体（Three.js 格式）
```

#### 📁 models/ 3D 模型资源

```
models/
├── 📄 anime_class_room.glb      # 动漫教室模型
├── 📄 cozy_living_room_baked.glb # 温馨客厅模型（烘焙版）
├── 📄 garden_v1.glb             # 花园模型 v1
├── 📄 Manuka.glb                # Manuka 角色模型
├── 📄 Milk.glb                  # Milk 角色模型
├── 📄 modern_entertainment_center_free.glb # 现代娱乐中心模型
├── 📄 plastic_chair.glb         # 塑料椅子模型
├── 📄 starry_night_converted.glb # 星夜场景模型
└── 📄 Suger.glb                 # Suger 角色模型
```

#### 📁 plantuml/ PlantUML 图表

```
plantuml/
└── 📄 Gojuon.svg                # 五十音图表
```

### 📁 components/ 组件架构

```
components/
├── 📁 Camera/                   # 相机控制组件
│   └── 📄 CameraController.jsx
├── 📁 Debug/                    # 调试工具组件
│   ├── 📄 PerformanceDataCollector.jsx
│   ├── 📄 PhysicsDebugRenderer.jsx
│   └── 📄 SystemCPUMonitor.jsx
├── 📁 Player/                   # 玩家角色组件
│   ├── 📄 ManukaPlayer.jsx      # Manuka 角色玩家
│   └── 📄 MilkPlayer.jsx        # Milk 角色玩家
├── 📁 Rendering/                # 渲染相关组件
│   ├── 📄 FogRenderer.jsx       # 雾效渲染器
│   └── 📄 PostProcessingRenderer.jsx # 后处理渲染器
├── 📁 Scenes/                   # 场景组件
│   ├── 📄 GameScene.jsx
│   └── 📄 SlimeBattleScene.jsx
├── 📁 Systems/                  # 系统功能组件
│   ├── 📄 AudioController.jsx
│   ├── 📄 AudioController.css
│   ├── 📄 AudioSystem.jsx
│   ├── 📄 MinimapRenderer.jsx
│   ├── 📄 SmoothStaminaCalculator.jsx
│   ├── 📄 TrailMapRenderer.jsx
│   ├── 📄 TVSystem.jsx
│   └── 📄 WeatherSystem.jsx
├── 📁 UI/                       # 用户界面组件
│   ├── 📄 AdvancedPerformanceMonitor.jsx
│   ├── 📄 AdvancedPerformanceMonitor.css
│   ├── 📄 CSS3DPhone.jsx
│   ├── 📄 DebugPanel.jsx
│   ├── 📄 DebugPanel.css
│   ├── 📄 GameUI.jsx
│   ├── 📄 LoadingScreen.jsx
│   ├── 📄 LoadingScreen.css
│   ├── 📄 SlimeBattleUI.jsx
│   ├── 📄 SlimeBattleUI.css
│   └── 📄 StaminaBar.jsx
└── 📁 World/                    # 世界场景组件
    ├── 📄 AnimeClassroom.jsx    # 动漫教室场景
    ├── 📄 BlendedTerrain.jsx    # 混合地形
    ├── 📄 Galaxy.jsx            # 银河系场景
    ├── 📄 Garden.jsx            # 花园场景
    ├── 📄 LivingRoom.jsx        # 客厅场景
    ├── 📄 LivingRoomWithTV.jsx  # 带电视的客厅场景
    ├── 📄 OptimizedHouse.jsx    # 优化房屋场景
    ├── 📄 SlimeParticleSystem.jsx # 史莱姆粒子系统
    ├── 📄 SoccerField.jsx       # 足球场场景
    ├── 📄 SolarSystem.jsx       # 太阳系场景
    ├── 📄 StarryNight.jsx       # 星夜场景
    └── 📄 Television.jsx        # 电视组件
```

### 📁 hooks/ 自定义 Hooks

```
hooks/
└── 📄 usePlanets.js             # 行星系统相关的 Hook
```

### 📁 config/ 配置文件

```
config/
└── 📄 PerformanceConfig.js      # 性能监控配置
```

### 📁 shaders/ 着色器文件

```
shaders/
├── 📁 galaxy/                   # 银河系着色器
│   ├── 📄 fragment.glsl         # 片段着色器
│   └── 📄 vertex.glsl           # 顶点着色器
├── 📁 slime/                    # 史莱姆模拟着色器
│   ├── 📄 diffusionFragment.glsl
│   ├── 📄 diffusionVertex.glsl
│   ├── 📄 slimeFragment.glsl
│   ├── 📄 slimeVertex.glsl
│   ├── 📄 trailFragment.glsl
│   └── 📄 trailVertex.glsl
└── 📁 terrain/                  # 地形着色器
    ├── 📄 fragment.glsl         # 片段着色器
    └── 📄 vertex.glsl           # 顶点着色器
```

### 📁 stores/ 状态管理

```
stores/
└── 📄 gameStore.js              # 游戏状态管理（Zustand）
```

### 📁 utils/ 工具函数

```
utils/
├── 📄 FrameSync.js              # 帧同步工具
├── 📄 ObjectPool.js             # 对象池管理
└── 📄 TextureManager.js         # 纹理管理器
```

### 📁 scripts/ 工具脚本

```
scripts/
└── 📄 system-monitor.cjs        # 系统性能监控脚本
```

## 🔧 技术栈

### 核心框架

- **React 19.1.0** - 用户界面框架
- **Vite 6.3.5** - 构建工具和开发服务器
- **Three.js 0.177.0** - 3D 图形库

### 3D 渲染

- **@react-three/fiber 9.1.2** - React 的 Three.js 渲染器
- **@react-three/drei 10.3.0** - Three.js 实用组件库
- **@react-three/cannon 6.6.0** - 物理引擎集成
- **@react-three/rapier 2.1.0** - Rapier 物理引擎集成

### 物理引擎

- **cannon-es 0.20.0** - 物理模拟引擎
- **ammo.js 0.0.10** - Bullet 物理引擎的 JavaScript 移植
- **three-to-cannon 5.0.2** - Three.js 到 Cannon.js 的转换工具

### 动画和音频

- **gsap 3.13.0** - 高性能动画库
- **@tweenjs/tween.js 25.0.0** - 补间动画库
- **tone 14.9.17** - Web 音频框架

### 状态管理

- **zustand 5.0.7** - 轻量级状态管理库

### 工具库

- **noisejs 2.1.0** - 噪声生成库（用于地形生成）
- **html2canvas 1.4.1** - HTML 转 Canvas 截图工具
- **cors 2.8.5** - 跨域资源共享中间件
- **express 5.1.0** - Node.js Web 应用框架
- **os-utils 0.0.14** - 操作系统工具库

### 开发工具

- **concurrently 9.2.0** - 并发运行多个命令
- **vite-plugin-glsl 1.5.1** - GLSL 着色器支持

## 🎮 主要功能模块

1. **玩家控制系统** - 第一人称/第三人称视角控制
2. **物理模拟** - 重力、碰撞检测、刚体物理（支持 Cannon-es 和 Rapier）
3. **世界渲染** - 多样化的 3D 场景和环境
4. **音频系统** - 背景音乐和音效管理（基于 Tone.js）
5. **天气系统** - 动态天气效果
6. **小地图系统** - 实时位置显示和导航
7. **史莱姆模拟系统** - 基于着色器的粒子模拟
8. **地形生成系统** - 程序化地形生成和混合纹理
9. **性能监控系统** - 实时 FPS、内存和 CPU 监控
10. **调试面板** - 开发时的参数调试工具
11. **iPhone 模拟器** - 完整的移动设备界面模拟
12. **电视系统** - 3D 场景中的视频播放功能

## 📝 开发说明

- 项目使用 ES6+ 模块化开发
- 组件采用函数式 React 组件和 Hooks
- 3D 场景使用声明式的 React Three Fiber 语法
- 物理模拟通过 React Three Cannon 和 React Three Rapier 集成
- 状态管理使用 Zustand 实现轻量级全局状态
- 着色器开发支持 GLSL 文件直接导入
- 性能监控系统提供实时性能数据收集
- 开发服务器支持热重载和快速刷新
- 支持并发运行开发服务器和系统监控

## 🚀 启动脚本

```bash
npm run dev                    # 启动开发服务器
npm run dev:with-monitor      # 同时启动开发服务器和性能监控
npm run monitor               # 单独启动性能监控
npm run build                 # 构建生产版本
npm run preview               # 预览生产版本
npm run lint                  # 代码检查
```

---

_本文档记录了项目的整体架构，便于开发者快速了解项目结构和定位相关文件。_
_注：文档不标记纹理内容，只标记图表。_
_版本: v0.1.7 | 最后更新: 2025.08.08_
