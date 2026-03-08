import {useState, useEffect, useCallback} from "react"; // 导入 useCallback
import AudioController from "../Systems/AudioController";
import AdvancedPerformanceMonitor from "./AdvancedPerformanceMonitor";
import useGameStore from "../../stores/gameStore";
import "./DebugPanel.css";

const WEATHER_TYPES = {
  CLEAR: "clear",
  CLOUDY: "cloudy",
  RAINY: "rainy",
  SNOWY: "snowy",
  FOGGY: "foggy",
  STORMY: "stormy",
};

const TIME_SPEEDS = {
  PAUSED: 0,
  SLOW: 0.025,
  NORMAL: 0.1,
  FAST: 0.5,
  VERY_FAST: 2,
};

function DebugPanel({
  onWeatherChange,
  onTimeSet,
  onTimeSpeedChange,
  onCharacterChange,
  onSceneChange,
  selectedCharacter,
  currentScene = "game",
}) {
  // 從 Store 訂閱相關狀態
  const playerMovementState = useGameStore((state) => state.player.movementState);
  const minimapSettings = useGameStore((state) => state.settings.minimap);
  const terrainSettings = useGameStore((state) => state.settings.terrain);
  const renderingSettings = useGameStore((state) => state.settings.rendering);
  const physicsDebugSettings = useGameStore((state) => state.settings.physics);
  const uiSettings = useGameStore((state) => state.settings.ui);
  const realTimePerformanceData = useGameStore.getState().performance.realTimeData;

  // Store actions
  const setMinimapSettings = useGameStore((state) => state.setMinimapSettings);
  const setTerrainSettings = useGameStore((state) => state.setTerrainSettings);
  const setRenderingSettings = useGameStore((state) => state.setRenderingSettings);
  const setPhysicsDebugSettings = useGameStore((state) => state.setPhysicsDebugSettings);
  const [isOpen, setIsOpen] = useState(false);
  const [currentWeather, setCurrentWeather] = useState(WEATHER_TYPES.CLEAR);
  const [timeSpeed, setTimeSpeed] = useState(TIME_SPEEDS.NORMAL);
  const [currentTime, setCurrentTime] = useState(12);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAudioAdvanced, setShowAudioAdvanced] = useState(false);
  const [weatherSettings, setWeatherSettings] = useState({
    intensity: 1.0,
    windSpeed: 1.0,
    visibility: 1.0,
    temperature: 20,
  });

  // UI 控制狀態
  const [showMinimapAdvanced, setShowMinimapAdvanced] = useState(false);
  const [showTerrainAdvanced, setShowTerrainAdvanced] = useState(false);
  const [showPhysicsAdvanced, setShowPhysicsAdvanced] = useState(false);
  const [showRenderingAdvanced, setShowRenderingAdvanced] = useState(false);

  const handleWeatherChange = (weather) => {
    setCurrentWeather(weather);
    if (onWeatherChange) {
      onWeatherChange(weather, weatherSettings);
    }
  };

  const handleTimeSpeedChange = (speed) => {
    setTimeSpeed(speed);
    if (onTimeSpeedChange) {
      onTimeSpeedChange(speed);
    }
  };

  const handleTimeChange = (time) => {
    setCurrentTime(time);
    if (onTimeSet) {
      onTimeSet(time);
    }
  };

  const handleWeatherSettingChange = (setting, value) => {
    const newSettings = {...weatherSettings, [setting]: value};
    setWeatherSettings(newSettings);
    if (onWeatherChange) {
      onWeatherChange(currentWeather, newSettings);
    }
  };

  // 小地图设置处理函数
  // 小地圖設置處理函數 - 直接更新 Store
  const handleMinimapSettingChange = (setting, value) => {
    const newSettings = {...minimapSettings, [setting]: value};
    setMinimapSettings(newSettings);
  };

  // 地形設置處理函數 - 直接更新 Store
  const handleTerrainSettingChange = (setting, value) => {
    const newSettings = {...terrainSettings, [setting]: value};
    setTerrainSettings(newSettings);
  };

  // 物理调试设置处理函数
  const handlePhysicsDebugChange = (setting, value) => {
    const newSettings = {...physicsDebugSettings, [setting]: value};
    setPhysicsDebugSettings(newSettings);
  };

  // 渲染设置处理函数
  const handleRenderingSettingChange = (setting, value) => {
    const newSettings = {...renderingSettings, [setting]: value};
    setRenderingSettings(newSettings);
  };

  // ==================== 关键修改 #1: 创建一个阻止事件冒泡的处理器 ====================
  const handlePanelClick = useCallback((event) => {
    // 调用 stopPropagation() 会阻止此点击事件继续“冒泡”到父级元素。
    // 这样，在更上层（如 document 或 canvas）监听的指针锁定事件就不会被触发。
    event.stopPropagation();
  }, []);

  const audioController = AudioController({
    playerMovementState,
    weatherType: currentWeather,
    weatherSettings,
  });

  return (
    // ==================== 关键修改 #2: 将处理器应用到最外层的 div 上 ====================
    // 我们在这里监听所有的 mousedown, mouseup, click, 和 contextmenu 事件。
    // 这样无论用户在面板的任何位置点击（左键、右键），事件都会被拦截。
    <div
      className={`debug-panel ${isOpen ? "open" : "closed"}`}
      onMouseDown={handlePanelClick}
      onMouseUp={handlePanelClick}
      onClick={handlePanelClick}
      onContextMenu={handlePanelClick}
    >
      {/* 高级性能监视器 - 替代原来的工具箱按钮 */}
      {uiSettings.showPerformanceMonitor && (
        <AdvancedPerformanceMonitor
          onToggleDebugPanel={() => setIsOpen(!isOpen)}
          isCompact={false}
          updateInterval={100}
          historyLength={60}
          realTimeData={realTimePerformanceData}
        />
      )}

      {/* Panel Content */}
      {isOpen && (
        <div className="debug-content">
          <div className="debug-header">
            <h3>Debug Panel</h3>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              ✕
            </button>
          </div>

          {/* 角色選擇器 */}
          <div className="debug-section">
            <h4>🎭 Character Selection</h4>
            <div className="character-buttons">
              <button
                className={`character-btn ${selectedCharacter === "milk" ? "active" : ""}`}
                onClick={() => onCharacterChange && onCharacterChange("milk")}
              >
                🥛 Milk
              </button>
              <button
                className={`character-btn ${selectedCharacter === "manuka" ? "active" : ""}`}
                onClick={() => onCharacterChange && onCharacterChange("manuka")}
              >
                🌸 Manuka
              </button>
            </div>
          </div>

          {/* 場景選擇器 */}
          <div className="debug-section">
            <h4>🎮 Scene Selection</h4>
            <div className="scene-buttons">
              <button
                className={`scene-btn ${currentScene === "game" ? "active" : ""}`}
                onClick={() => onSceneChange && onSceneChange("game")}
              >
                🌍 探索世界
              </button>
              <button
                className={`scene-btn ${currentScene === "quaternion" ? "active" : ""}`}
                onClick={() => onSceneChange && onSceneChange("quaternion")}
              >
                🧭 四元数可视化
              </button>
              <button
                className={`scene-btn ${currentScene === "maze" ? "active" : ""}`}
                onClick={() => onSceneChange && onSceneChange("maze")}
              >
                👻 鬧鬼迷宮
              </button>
            </div>
          </div>

          {/* Weather Controls */}
          <div className="debug-section">
            <h4>Weather System</h4>
            <div className="weather-grid">
              {Object.values(WEATHER_TYPES).map((weather) => (
                <button
                  key={weather}
                  className={`weather-btn ${currentWeather === weather ? "active" : ""}`}
                  onClick={() => handleWeatherChange(weather)}
                  title={weather.charAt(0).toUpperCase() + weather.slice(1)}
                >
                  <span className="weather-icon">{getWeatherIcon(weather)}</span>
                  <span className="weather-label">{weather}</span>
                </button>
              ))}
            </div>

            {/* Advanced Weather Settings */}
            <div className="advanced-toggle">
              <button onClick={() => setShowAdvanced(!showAdvanced)} className="toggle-btn">
                Advanced {showAdvanced ? "▼" : "▶"}
              </button>
            </div>
            {showAdvanced && (
              <div className="advanced-settings">
                <div className="setting-row">
                  <label>Intensity:</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={weatherSettings.intensity}
                    onChange={(e) => handleWeatherSettingChange("intensity", parseFloat(e.target.value))}
                  />
                  <span>{weatherSettings.intensity.toFixed(1)}</span>
                </div>
                <div className="setting-row">
                  <label>Wind Speed:</label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={weatherSettings.windSpeed}
                    onChange={(e) => handleWeatherSettingChange("windSpeed", parseFloat(e.target.value))}
                  />
                  <span>{weatherSettings.windSpeed.toFixed(1)}</span>
                </div>
                <div className="setting-row">
                  <label>Visibility:</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={weatherSettings.visibility}
                    onChange={(e) => handleWeatherSettingChange("visibility", parseFloat(e.target.value))}
                  />
                  <span>{weatherSettings.visibility.toFixed(1)}</span>
                </div>
                <div className="setting-row">
                  <label>Temperature:</label>
                  <input
                    type="range"
                    min="-20"
                    max="40"
                    step="1"
                    value={weatherSettings.temperature}
                    onChange={(e) => handleWeatherSettingChange("temperature", parseInt(e.target.value))}
                  />
                  <span>{weatherSettings.temperature}°C</span>
                </div>
              </div>
            )}
          </div>

          {/* Time Controls */}
          <div className="debug-section">
            <h4>Time System</h4>
            <div className="time-display">
              <span className="current-time">{formatTime(currentTime)}</span>
            </div>
            <div className="setting-row">
              <label>Time of Day:</label>
              <input
                type="range"
                min="0"
                max="24"
                step="0.1"
                value={currentTime}
                onChange={(e) => handleTimeChange(parseFloat(e.target.value))}
              />
            </div>
            <div className="time-speed-controls">
              <label>Time Speed:</label>
              <div className="speed-buttons">
                {Object.entries(TIME_SPEEDS).map(([key, speed]) => (
                  <button
                    key={key}
                    className={`speed-btn ${timeSpeed === speed ? "active" : ""}`}
                    onClick={() => handleTimeSpeedChange(speed)}
                  >
                    {getTimeSpeedLabel(speed)}
                  </button>
                ))}
              </div>
            </div>
            {/* Quick Actions */}
            <div className="time-speed-controls">
              <label>Quick Actions:</label>
              <div className="quick-actions">
                <button onClick={() => handleTimeChange(6)}>Dawn</button>
                <button onClick={() => handleTimeChange(12)}>Noon</button>
                <button onClick={() => handleTimeChange(18)}>Dusk</button>
                <button onClick={() => handleTimeChange(0)}>Midnight</button>
              </div>
            </div>
          </div>

          {/* Audio System */}
          <div className="debug-section">
            <h4>🔊 Audio System</h4>
            <div className="audio-status">
              <button
                className={`audio-toggle ${audioController.audioEnabled ? "enabled" : "disabled"}`}
                onClick={audioController.audioEnabled ? audioController.disableAudio : audioController.enableAudio}
              >
                <div className={`status-indicator ${audioController.audioReady ? "ready" : "error"}`}></div>
                {audioController.audioEnabled ? "Audio ON" : "Audio OFF"}
              </button>
            </div>
            {audioController.audioEnabled && (
              <>
                <div className="volume-control">
                  <label>Master Volume:</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={audioController.masterVolume}
                    onChange={(e) => audioController.setMasterVolume(parseFloat(e.target.value))}
                    className="volume-slider"
                  />
                  <span>{Math.round(audioController.masterVolume * 100)}%</span>
                </div>
                <div className="surface-selector">
                  <label>Surface Type:</label>
                  <div className="surface-buttons">
                    {["grass", "stone", "wood", "sand", "metal", "water"].map((surface) => (
                      <button
                        key={surface}
                        className={`surface-btn ${audioController.currentSurface === surface ? "active" : ""}`}
                        onClick={() => audioController.setCurrentSurface(surface)}
                      >
                        {surface}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="test-sounds">
                  <button className="test-btn" onClick={audioController.testFootstep}>
                    🚶 Walk
                  </button>
                  <button className="test-btn" onClick={audioController.testRunstep}>
                    🏃 Run
                  </button>
                  <button className="test-btn" onClick={audioController.testJump}>
                    ⬆️ Jump
                  </button>
                  <button className="test-btn" onClick={audioController.testLand}>
                    ⬇️ Land
                  </button>
                </div>
                <div className="advanced-toggle">
                  <button onClick={() => setShowAudioAdvanced(!showAudioAdvanced)} className="toggle-btn">
                    Audio Advanced {showAudioAdvanced ? "▼" : "▶"}
                  </button>
                </div>
                {showAudioAdvanced && (
                  <div className="advanced-settings">
                    <div className="setting-row">
                      <label>Footstep Vol:</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={audioController.audioSettings.footstepVolume}
                        onChange={(e) =>
                          audioController.setAudioSettings({
                            ...audioController.audioSettings,
                            footstepVolume: parseFloat(e.target.value),
                          })
                        }
                      />
                      <span>{Math.round(audioController.audioSettings.footstepVolume * 100)}%</span>
                    </div>
                    <div className="setting-row">
                      <label>Jump Vol:</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={audioController.audioSettings.jumpVolume}
                        onChange={(e) =>
                          audioController.setAudioSettings({
                            ...audioController.audioSettings,
                            jumpVolume: parseFloat(e.target.value),
                          })
                        }
                      />
                      <span>{Math.round(audioController.audioSettings.jumpVolume * 100)}%</span>
                    </div>
                    <div className="setting-row">
                      <label>Weather Vol:</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={audioController.audioSettings.weatherVolume}
                        onChange={(e) =>
                          audioController.setAudioSettings({
                            ...audioController.audioSettings,
                            weatherVolume: parseFloat(e.target.value),
                          })
                        }
                      />
                      <span>{Math.round(audioController.audioSettings.weatherVolume * 100)}%</span>
                    </div>
                    <div className="setting-row">
                      <label>Step Rate:</label>
                      <input
                        type="range"
                        min="200"
                        max="800"
                        step="50"
                        value={audioController.audioSettings.footstepRate}
                        onChange={(e) =>
                          audioController.setAudioSettings({
                            ...audioController.audioSettings,
                            footstepRate: parseInt(e.target.value),
                          })
                        }
                      />
                      <span>{audioController.audioSettings.footstepRate}ms</span>
                    </div>
                  </div>
                )}
                {audioController.audioReady && (
                  <div className="audio-info">
                    <p>
                      <span className="highlight">Tone.js</span> audio synthesis active
                      <br />
                      Surface: <span className="highlight">{audioController.currentSurface}</span>
                      <br />
                      Weather sounds: <span className="highlight">{currentWeather}</span>
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 小地图控制 */}
          <div className="debug-section">
            <h4>🗺️ Minimap Settings</h4>
            <div className="setting-row">
              <label>Enable Minimap:</label>
              <input
                type="checkbox"
                checked={minimapSettings.enabled}
                onChange={(e) => handleMinimapSettingChange("enabled", e.target.checked)}
              />
            </div>
            <div className="setting-row">
              <label>Map Size:</label>
              <input
                type="range"
                min="200"
                max="400"
                step="10"
                value={minimapSettings.size}
                onChange={(e) => handleMinimapSettingChange("size", parseInt(e.target.value))}
              />
              <span>{minimapSettings.size}px</span>
            </div>
            <div className="setting-row">
              <label>View Range:</label>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={minimapSettings.viewRange}
                onChange={(e) => handleMinimapSettingChange("viewRange", parseInt(e.target.value))}
              />
              <span>{minimapSettings.viewRange}m</span>
            </div>

            {/* 高级小地图设置 */}
            <div className="advanced-toggle">
              <button onClick={() => setShowMinimapAdvanced(!showMinimapAdvanced)} className="toggle-btn">
                Minimap Advanced {showMinimapAdvanced ? "▼" : "▶"}
              </button>
            </div>
            {showMinimapAdvanced && (
              <div className="advanced-settings">
                <div className="setting-row">
                  <label>Camera Height:</label>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    step="10"
                    value={minimapSettings.height}
                    onChange={(e) => handleMinimapSettingChange("height", parseInt(e.target.value))}
                  />
                  <span>{minimapSettings.height}m</span>
                </div>
                <div className="setting-row">
                  <label>Zoom Level:</label>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={minimapSettings.zoom}
                    onChange={(e) => handleMinimapSettingChange("zoom", parseFloat(e.target.value))}
                  />
                  <span>{minimapSettings.zoom.toFixed(1)}x</span>
                </div>
                <div className="setting-row">
                  <label>Show Coordinates:</label>
                  <input
                    type="checkbox"
                    checked={minimapSettings.showCoordinates}
                    onChange={(e) => handleMinimapSettingChange("showCoordinates", e.target.checked)}
                  />
                </div>
                {minimapSettings.showCoordinates && (
                  <div className="setting-row">
                    <label>Coordinate Precision:</label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={minimapSettings.coordinatePrecision}
                      onChange={(e) => handleMinimapSettingChange("coordinatePrecision", parseInt(e.target.value))}
                    />
                    <span>
                      {minimapSettings.coordinatePrecision} decimal{minimapSettings.coordinatePrecision !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                <div className="setting-row">
                  <label>Debug Center Lines:</label>
                  <input
                    type="checkbox"
                    checked={minimapSettings.showDebugLines}
                    onChange={(e) => handleMinimapSettingChange("showDebugLines", e.target.checked)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 地形混合控制 */}
          <div className="debug-section">
            <h4>🏔️ Terrain Blending</h4>
            <div className="setting-row">
              <label>Sand Height:</label>
              <input
                type="range"
                min="-15"
                max="5"
                step="0.5"
                value={terrainSettings.sandHeight}
                onChange={(e) => handleTerrainSettingChange("sandHeight", parseFloat(e.target.value))}
              />
              <span>{terrainSettings.sandHeight}m</span>
            </div>
            <div className="setting-row">
              <label>Grass Height:</label>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={terrainSettings.grassHeight}
                onChange={(e) => handleTerrainSettingChange("grassHeight", parseFloat(e.target.value))}
              />
              <span>{terrainSettings.grassHeight}m</span>
            </div>

            {/* 高级地形设置 */}
            <div className="advanced-toggle">
              <button onClick={() => setShowTerrainAdvanced(!showTerrainAdvanced)} className="toggle-btn">
                Terrain Advanced {showTerrainAdvanced ? "▼" : "▶"}
              </button>
            </div>
            {showTerrainAdvanced && (
              <div className="advanced-settings">
                <div className="setting-row">
                  <label>Rock Height:</label>
                  <input
                    type="range"
                    min="10"
                    max="35"
                    step="0.5"
                    value={terrainSettings.rockHeight}
                    onChange={(e) => handleTerrainSettingChange("rockHeight", parseFloat(e.target.value))}
                  />
                  <span>{terrainSettings.rockHeight}m</span>
                </div>
                <div className="setting-row">
                  <label>Snow Height:</label>
                  <input
                    type="range"
                    min="15"
                    max="40"
                    step="0.5"
                    value={terrainSettings.snowHeight}
                    onChange={(e) => handleTerrainSettingChange("snowHeight", parseFloat(e.target.value))}
                  />
                  <span>{terrainSettings.snowHeight}m</span>
                </div>
                <div className="setting-row">
                  <label>Blend Sharpness:</label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={terrainSettings.blendSharpness}
                    onChange={(e) => handleTerrainSettingChange("blendSharpness", parseFloat(e.target.value))}
                  />
                  <span>{terrainSettings.blendSharpness}</span>
                </div>
                <div className="setting-row">
                  <label>Texture Scale:</label>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="5"
                    value={terrainSettings.textureScale}
                    onChange={(e) => handleTerrainSettingChange("textureScale", parseFloat(e.target.value))}
                  />
                  <span>{terrainSettings.textureScale}x</span>
                </div>
              </div>
            )}

            {/* 地形快捷预设 */}
            <div className="quick-actions">
              <button
                onClick={() => {
                  const realisticSettings = {
                    sandHeight: -6,
                    grassHeight: 1,
                    rockHeight: 12,
                    snowHeight: 21,
                    blendSharpness: 8,
                    textureScale: 10,
                  };
                  setTerrainSettings(realisticSettings);
                  if (onTerrainSettingsChange) {
                    onTerrainSettingsChange(realisticSettings);
                  }
                }}
              >
                Realistic
              </button>
              <button
                onClick={() => {
                  const dramaticSettings = {
                    sandHeight: -10,
                    grassHeight: 8,
                    rockHeight: 20,
                    snowHeight: 28,
                    blendSharpness: 20.5, // 略高于rockHeight
                    textureScale: 40,
                  };
                  setTerrainSettings(dramaticSettings);
                  if (onTerrainSettingsChange) {
                    onTerrainSettingsChange(dramaticSettings);
                  }
                }}
              >
                Dramatic
              </button>
              <button
                onClick={() => {
                  const smoothSettings = {
                    sandHeight: -5,
                    grassHeight: 8,
                    rockHeight: 18,
                    snowHeight: 25,
                    blendSharpness: 18.5, // 略高于rockHeight
                    textureScale: 80,
                  };
                  setTerrainSettings(smoothSettings);
                  if (onTerrainSettingsChange) {
                    onTerrainSettingsChange(smoothSettings);
                  }
                }}
              >
                Smooth
              </button>
            </div>
          </div>

          {/* 物理调试控制 */}
          <div className="debug-section">
            <h4>🔧 Physics Debug</h4>
            <div className="setting-row">
              <label>Show Wireframes:</label>
              <input
                type="checkbox"
                checked={physicsDebugSettings.showWireframes}
                onChange={(e) => handlePhysicsDebugChange("showWireframes", e.target.checked)}
              />
            </div>
            <div className="setting-row">
              <label>Show Bounding Boxes:</label>
              <input
                type="checkbox"
                checked={physicsDebugSettings.showBoundingBoxes}
                onChange={(e) => handlePhysicsDebugChange("showBoundingBoxes", e.target.checked)}
              />
            </div>
            <div className="setting-row">
              <label>Show Raycast:</label>
              <input
                type="checkbox"
                checked={physicsDebugSettings.showRaycast}
                onChange={(e) => handlePhysicsDebugChange("showRaycast", e.target.checked)}
              />
            </div>

            {/* 高级物理调试设置 */}
            <div className="advanced-toggle">
              <button onClick={() => setShowPhysicsAdvanced(!showPhysicsAdvanced)} className="toggle-btn">
                Physics Advanced {showPhysicsAdvanced ? "▼" : "▶"}
              </button>
            </div>
            {showPhysicsAdvanced && (
              <div className="advanced-settings">
                <div className="setting-row">
                  <label>Show Contact Points:</label>
                  <input
                    type="checkbox"
                    checked={physicsDebugSettings.showContactPoints}
                    onChange={(e) => handlePhysicsDebugChange("showContactPoints", e.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <label>Show Velocity Vectors:</label>
                  <input
                    type="checkbox"
                    checked={physicsDebugSettings.showVelocityVectors}
                    onChange={(e) => handlePhysicsDebugChange("showVelocityVectors", e.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <label>Wireframe Opacity:</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={physicsDebugSettings.wireframeOpacity}
                    onChange={(e) => handlePhysicsDebugChange("wireframeOpacity", parseFloat(e.target.value))}
                  />
                  <span>{physicsDebugSettings.wireframeOpacity.toFixed(1)}</span>
                </div>
                <div className="setting-row">
                  <label>Velocity Scale:</label>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={physicsDebugSettings.velocityScale}
                    onChange={(e) => handlePhysicsDebugChange("velocityScale", parseFloat(e.target.value))}
                  />
                  <span>{physicsDebugSettings.velocityScale.toFixed(1)}x</span>
                </div>
                <div className="setting-row">
                  <label>Bounding Box Color:</label>
                  <input
                    type="color"
                    value={physicsDebugSettings.boundingBoxColor}
                    onChange={(e) => handlePhysicsDebugChange("boundingBoxColor", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* 物理调试快捷操作 */}
            <div className="quick-actions">
              <button
                onClick={() => {
                  const allOn = {
                    showWireframes: true,
                    showBoundingBoxes: true,
                    showContactPoints: true,
                    showVelocityVectors: true,
                    showRaycast: true,
                    wireframeOpacity: 0.5,
                    boundingBoxColor: "#ff0000",
                    velocityScale: 1.0,
                  };
                  setPhysicsDebugSettings(allOn);
                }}
              >
                All On
              </button>
              <button
                onClick={() => {
                  const allOff = {
                    showWireframes: false,
                    showBoundingBoxes: false,
                    showContactPoints: false,
                    showVelocityVectors: false,
                    showRaycast: false,
                    wireframeOpacity: 0.5,
                    boundingBoxColor: "#ff0000",
                    velocityScale: 1.0,
                  };
                  setPhysicsDebugSettings(allOff);
                }}
              >
                All Off
              </button>
              <button
                onClick={() => {
                  const basicDebug = {
                    showWireframes: true,
                    showBoundingBoxes: true,
                    showContactPoints: false,
                    showVelocityVectors: false,
                    showRaycast: true,
                    wireframeOpacity: 0.7,
                    boundingBoxColor: "#00ff00",
                    velocityScale: 1.0,
                  };
                  setPhysicsDebugSettings(basicDebug);
                }}
              >
                Basic Debug
              </button>
            </div>
          </div>

          {/* 渲染设置控制 */}
          <div className="debug-section">
            <h4>🎨 Rendering & Post-Processing</h4>

            {/* Toon-ish（Soft Toon）风格化：白名单材质启用（目前地形启用） */}
            <h5>Toon-ish (Soft Toon)</h5>
            <div className="setting-row">
              <label>Enable Toon-ish:</label>
              <input
                type="checkbox"
                checked={renderingSettings.enableToonishShading}
                onChange={(e) => handleRenderingSettingChange("enableToonishShading", e.target.checked)}
              />
            </div>

            <div className="setting-row">
              <label>Ramp Steps:</label>
              <input
                type="range"
                min="2"
                max="8"
                step="1"
                value={renderingSettings.toonRampSteps ?? 4}
                onChange={(e) => handleRenderingSettingChange("toonRampSteps", parseInt(e.target.value))}
              />
              <span>{renderingSettings.toonRampSteps ?? 4}</span>
            </div>

            <div className="setting-row">
              <label>Ramp Smoothness:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={renderingSettings.toonRampSmoothness ?? 0.55}
                onChange={(e) => handleRenderingSettingChange("toonRampSmoothness", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.toonRampSmoothness ?? 0.55).toFixed(2)}</span>
            </div>

            <div className="setting-row">
              <label>Rim Strength:</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={renderingSettings.toonRimStrength ?? 0.35}
                onChange={(e) => handleRenderingSettingChange("toonRimStrength", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.toonRimStrength ?? 0.35).toFixed(2)}</span>
            </div>

            <div className="setting-row">
              <label>Rim Power:</label>
              <input
                type="range"
                min="0.5"
                max="8"
                step="0.05"
                value={renderingSettings.toonRimPower ?? 2.5}
                onChange={(e) => handleRenderingSettingChange("toonRimPower", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.toonRimPower ?? 2.5).toFixed(2)}</span>
            </div>

            <div className="setting-row">
              <label>Rim Color:</label>
              <input
                type="color"
                value={renderingSettings.toonRimColor ?? "#dbe9ff"}
                onChange={(e) => handleRenderingSettingChange("toonRimColor", e.target.value)}
              />
            </div>

            <div className="setting-row">
              <label>Shadow Lift:</label>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.01"
                value={renderingSettings.toonShadowLift ?? 0.08}
                onChange={(e) => handleRenderingSettingChange("toonShadowLift", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.toonShadowLift ?? 0.08).toFixed(2)}</span>
            </div>

            {/* 基础渲染设置 */}
            <div className="setting-row">
              <label>Enable Shadows:</label>
              <input
                type="checkbox"
                checked={renderingSettings.enableShadows}
                onChange={(e) => handleRenderingSettingChange("enableShadows", e.target.checked)}
              />
            </div>
            <div className="setting-row">
              <label>Shadow Map Size:</label>
              <select
                value={renderingSettings.shadowMapSize}
                onChange={(e) => handleRenderingSettingChange("shadowMapSize", parseInt(e.target.value))}
              >
                <option value={512}>512</option>
                <option value={1024}>1024</option>
                <option value={2048}>2048</option>
                <option value={4096}>4096</option>
              </select>
            </div>
            <div className="setting-row">
              <label>Tone Mapping:</label>
              <select
                value={renderingSettings.toneMapping}
                onChange={(e) => handleRenderingSettingChange("toneMapping", e.target.value)}
              >
                <option value="None">None</option>
                <option value="Linear">Linear</option>
                <option value="Reinhard">Reinhard</option>
                <option value="Cineon">Cineon</option>
                <option value="ACESFilmic">ACES Filmic</option>
              </select>
            </div>
            <div className="setting-row">
              <label>Exposure:</label>
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={renderingSettings.toneMappingExposure}
                onChange={(e) => handleRenderingSettingChange("toneMappingExposure", parseFloat(e.target.value))}
              />
              <span>{renderingSettings.toneMappingExposure.toFixed(1)}</span>
            </div>

            {/* 后处理开关 */}
            {/* View Distance & Haze（阶段4C：远景沉浸） */}
            <h5>View Distance & Haze</h5>
            <div className="setting-row">
              <label>View Distance:</label>
              <input
                type="range"
                min="200"
                max="500"
                step="10"
                value={renderingSettings.viewDistance ?? 350}
                onChange={(e) => handleRenderingSettingChange("viewDistance", parseFloat(e.target.value))}
              />
              <span>{renderingSettings.viewDistance ?? 350}</span>
            </div>

            <div className="setting-row">
              <label>Haze Near:</label>
              <input
                type="range"
                min="0"
                max="120"
                step="5"
                value={renderingSettings.hazeNear ?? 20}
                onChange={(e) => handleRenderingSettingChange("hazeNear", parseFloat(e.target.value))}
              />
              <span>{renderingSettings.hazeNear ?? 20}</span>
            </div>

            <div className="setting-row">
              <label>Haze Far:</label>
              <input
                type="range"
                min="200"
                max="500"
                step="10"
                value={renderingSettings.hazeFar ?? renderingSettings.viewDistance ?? 350}
                onChange={(e) => handleRenderingSettingChange("hazeFar", parseFloat(e.target.value))}
              />
              <span>{renderingSettings.hazeFar ?? renderingSettings.viewDistance ?? 350}</span>
            </div>

            <div className="setting-row">
              <label>Haze Density (Day):</label>
              <input
                type="range"
                min="0"
                max="0.01"
                step="0.0001"
                value={renderingSettings.hazeDensityDay ?? 0.0012}
                onChange={(e) => handleRenderingSettingChange("hazeDensityDay", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.hazeDensityDay ?? 0.0012).toFixed(4)}</span>
            </div>

            <div className="setting-row">
              <label>Haze Density (Night):</label>
              <input
                type="range"
                min="0"
                max="0.02"
                step="0.0002"
                value={renderingSettings.hazeDensityNight ?? 0.0028}
                onChange={(e) => handleRenderingSettingChange("hazeDensityNight", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.hazeDensityNight ?? 0.0028).toFixed(4)}</span>
            </div>

            <div className="setting-row">
              <label>Haze Color (Day):</label>
              <input
                type="color"
                value={renderingSettings.hazeColorDay ?? "#b8c7d6"}
                onChange={(e) => handleRenderingSettingChange("hazeColorDay", e.target.value)}
              />
            </div>

            <div className="setting-row">
              <label>Haze Color (Night):</label>
              <input
                type="color"
                value={renderingSettings.hazeColorNight ?? "#0b1320"}
                onChange={(e) => handleRenderingSettingChange("hazeColorNight", e.target.value)}
              />
            </div>

            <h5>Terrain Far Detail</h5>
            <div className="setting-row">
              <label>Fade Start:</label>
              <input
                type="range"
                min="0"
                max="400"
                step="10"
                value={renderingSettings.terrainDistanceFadeStart ?? 120}
                onChange={(e) => handleRenderingSettingChange("terrainDistanceFadeStart", parseFloat(e.target.value))}
              />
              <span>{renderingSettings.terrainDistanceFadeStart ?? 120}</span>
            </div>

            <div className="setting-row">
              <label>Fade End:</label>
              <input
                type="range"
                min="50"
                max="500"
                step="10"
                value={renderingSettings.terrainDistanceFadeEnd ?? 350}
                onChange={(e) => handleRenderingSettingChange("terrainDistanceFadeEnd", parseFloat(e.target.value))}
              />
              <span>{renderingSettings.terrainDistanceFadeEnd ?? 350}</span>
            </div>

            <div className="setting-row">
              <label>Far Tex Scale:</label>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.01"
                value={renderingSettings.terrainFarTexScale ?? 0.35}
                onChange={(e) => handleRenderingSettingChange("terrainFarTexScale", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.terrainFarTexScale ?? 0.35).toFixed(2)}</span>
            </div>

            <div className="setting-row">
              <label>Far Normal Scale:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={renderingSettings.terrainFarNormalScale ?? 0.35}
                onChange={(e) => handleRenderingSettingChange("terrainFarNormalScale", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.terrainFarNormalScale ?? 0.35).toFixed(2)}</span>
            </div>

            <div className="setting-row">
              <label>Far Roughness Boost:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={renderingSettings.terrainFarRoughnessBoost ?? 0.35}
                onChange={(e) => handleRenderingSettingChange("terrainFarRoughnessBoost", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.terrainFarRoughnessBoost ?? 0.35).toFixed(2)}</span>
            </div>

            {/* 环境 HDRI 强度：控制“环境亮度”而不是盲目压低曝光 */}
            <div className="setting-row">
              <label>Environment (HDRI):</label>
              <input
                type="range"
                min="0"
                max="2.0"
                step="0.05"
                value={renderingSettings.environmentIntensity ?? 0.35}
                onChange={(e) => handleRenderingSettingChange("environmentIntensity", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.environmentIntensity ?? 0.35).toFixed(2)}</span>
            </div>

            <div className="setting-row">
              <label>Enable Post-Processing:</label>
              <input
                type="checkbox"
                checked={renderingSettings.enablePostProcessing}
                onChange={(e) => handleRenderingSettingChange("enablePostProcessing", e.target.checked)}
              />
            </div>

            {/* 分辨率与抗锯齿 */}
            <div className="setting-row">
              <label>DPR Min:</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.25"
                value={renderingSettings.dprMin || 1}
                onChange={(e) => handleRenderingSettingChange("dprMin", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.dprMin || 1).toFixed(2)}</span>
            </div>
            <div className="setting-row">
              <label>DPR Max:</label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.5"
                value={renderingSettings.dprMax || 2}
                onChange={(e) => handleRenderingSettingChange("dprMax", parseFloat(e.target.value))}
              />
              <span>{(renderingSettings.dprMax || 2).toFixed(2)}</span>
            </div>
            <div className="setting-row">
              <label>MSAA Samples:</label>
              <select
                value={renderingSettings.msaaSamples || 0}
                onChange={(e) => handleRenderingSettingChange("msaaSamples", parseInt(e.target.value))}
              >
                <option value={0}>Off</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
                <option value={8}>8x</option>
              </select>
            </div>

            {/* 后处理效果 */}
            {renderingSettings.enablePostProcessing && (
              <>
                {/* FXAA 模式 */}
                <div className="setting-row">
                  <label>FXAA:</label>
                  <select
                    value={renderingSettings.enableFXAA || "auto"}
                    onChange={(e) => handleRenderingSettingChange("enableFXAA", e.target.value)}
                  >
                    <option value="off">Off</option>
                    <option value="auto">Auto</option>
                    <option value="on">On</option>
                  </select>
                </div>

                {/* Vignette 参数（开启时可调，避免一上来就“假”）*/}
                {renderingSettings.enableVignette && (
                  <>
                    <div className="setting-row">
                      <label>Vignette Offset:</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={renderingSettings.vignetteOffset ?? 0.2}
                        onChange={(e) => handleRenderingSettingChange("vignetteOffset", parseFloat(e.target.value))}
                      />
                      <span>{(renderingSettings.vignetteOffset ?? 0.2).toFixed(2)}</span>
                    </div>
                    <div className="setting-row">
                      <label>Vignette Darkness:</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={renderingSettings.vignetteDarkness ?? 0.35}
                        onChange={(e) => handleRenderingSettingChange("vignetteDarkness", parseFloat(e.target.value))}
                      />
                      <span>{(renderingSettings.vignetteDarkness ?? 0.35).toFixed(2)}</span>
                    </div>
                  </>
                )}

                {/* Bloom 模式 */}
                <div className="setting-row">
                  <label>Bloom Mode:</label>
                  <select
                    value={renderingSettings.bloomMode || "global"}
                    onChange={(e) => handleRenderingSettingChange("bloomMode", e.target.value)}
                  >
                    <option value="global">Global</option>
                    <option value="layer">Layer (Selective)</option>
                  </select>
                </div>

                <div className="setting-row">
                  <label>Bloom:</label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.enableBloom}
                    onChange={(e) => handleRenderingSettingChange("enableBloom", e.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <label>SSAO:</label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.enableSSAO}
                    onChange={(e) => handleRenderingSettingChange("enableSSAO", e.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <label>Depth of Field:</label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.enableDOF}
                    onChange={(e) => handleRenderingSettingChange("enableDOF", e.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <label>Vignette:</label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.enableVignette}
                    onChange={(e) => handleRenderingSettingChange("enableVignette", e.target.checked)}
                  />
                </div>
                <div className="setting-row">
                  <label>Chromatic Aberration:</label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.enableChromaticAberration}
                    onChange={(e) => handleRenderingSettingChange("enableChromaticAberration", e.target.checked)}
                  />
                </div>
              </>
            )}

            {/* 高级渲染设置 */}
            <div className="advanced-toggle">
              <button onClick={() => setShowRenderingAdvanced(!showRenderingAdvanced)} className="toggle-btn">
                Rendering Advanced {showRenderingAdvanced ? "▼" : "▶"}
              </button>
            </div>
            {showRenderingAdvanced && (
              <div className="advanced-settings">
                {/* Bloom 高级设置 */}
                {renderingSettings.enablePostProcessing && renderingSettings.enableBloom && (
                  <>
                    <h5>Bloom Settings</h5>
                    <div className="setting-row">
                      <label>Intensity:</label>
                      <input
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={renderingSettings.bloomIntensity}
                        onChange={(e) => handleRenderingSettingChange("bloomIntensity", parseFloat(e.target.value))}
                      />
                      <span>{renderingSettings.bloomIntensity.toFixed(1)}</span>
                    </div>
                    <div className="setting-row">
                      <label>Threshold:</label>
                      <input
                        type="range"
                        min="0.0"
                        max="2.0"
                        step="0.05"
                        value={renderingSettings.bloomLuminanceThreshold}
                        onChange={(e) => handleRenderingSettingChange("bloomLuminanceThreshold", parseFloat(e.target.value))}
                      />
                      <span>{renderingSettings.bloomLuminanceThreshold.toFixed(2)}</span>
                    </div>
                    <div className="setting-row">
                      <label>Radius:</label>
                      <input
                        type="range"
                        min="0.1"
                        max="2.0"
                        step="0.05"
                        value={renderingSettings.bloomRadius}
                        onChange={(e) => handleRenderingSettingChange("bloomRadius", parseFloat(e.target.value))}
                      />
                      <span>{renderingSettings.bloomRadius.toFixed(2)}</span>
                    </div>
                  </>
                )}

                {/* SSAO 高级设置 */}
                {renderingSettings.enablePostProcessing && renderingSettings.enableSSAO && (
                  <>
                    <h5>SSAO Settings</h5>
                    <div className="setting-row">
                      <label>Half Resolution:</label>
                      <input
                        type="checkbox"
                        checked={!!renderingSettings.ssaoHalfRes}
                        onChange={(e) => handleRenderingSettingChange("ssaoHalfRes", e.target.checked)}
                      />
                    </div>
                    <div className="setting-row">
                      <label>Bilateral Filter:</label>
                      <input
                        type="checkbox"
                        checked={!!renderingSettings.ssaoBilateral}
                        onChange={(e) => handleRenderingSettingChange("ssaoBilateral", e.target.checked)}
                      />
                    </div>
                    <div className="setting-row">
                      <label>Intensity:</label>
                      <input
                        type="range"
                        min="0.1"
                        max="2.0"
                        step="0.1"
                        value={renderingSettings.ssaoIntensity}
                        onChange={(e) => handleRenderingSettingChange("ssaoIntensity", parseFloat(e.target.value))}
                      />
                      <span>{renderingSettings.ssaoIntensity.toFixed(1)}</span>
                    </div>
                    <div className="setting-row">
                      <label>Radius:</label>
                      <input
                        type="range"
                        min="0.05"
                        max="1.0"
                        step="0.05"
                        value={renderingSettings.ssaoRadius}
                        onChange={(e) => handleRenderingSettingChange("ssaoRadius", parseFloat(e.target.value))}
                      />
                      <span>{renderingSettings.ssaoRadius.toFixed(2)}</span>
                    </div>
                  </>
                )}

                {/* DOF 高级设置 */}
                {renderingSettings.enablePostProcessing && renderingSettings.enableDOF && (
                  <>
                    <h5>Depth of Field Settings</h5>
                    <div className="setting-row">
                      <label>Autofocus:</label>
                      <input
                        type="checkbox"
                        checked={!!renderingSettings.dofAutoFocus}
                        onChange={(e) => handleRenderingSettingChange("dofAutoFocus", e.target.checked)}
                      />
                    </div>
                    {!renderingSettings.dofAutoFocus && (
                      <div className="setting-row">
                        <label>Focus Distance (0-1):</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={renderingSettings.dofFocusDistance}
                          onChange={(e) => handleRenderingSettingChange("dofFocusDistance", parseFloat(e.target.value))}
                        />
                        <span>{renderingSettings.dofFocusDistance.toFixed(2)}</span>
                      </div>
                    )}
                    {renderingSettings.dofAutoFocus && (
                      <div className="dof-af-settings">
                        <div className="setting-row">
                          <label>AF Mode:</label>
                          <select
                            value={renderingSettings.dofAFMode || "raycast"}
                            onChange={(e) => handleRenderingSettingChange("dofAFMode", e.target.value)}
                          >
                            <option value="raycast">Raycast</option>
                            <option value="target">Target</option>
                          </select>
                        </div>
                        <div className="setting-row">
                          <label>AF Interval (ms):</label>
                          <input
                            type="number"
                            min="50"
                            max="1000"
                            step="50"
                            value={renderingSettings.dofAFIntervalMs || 200}
                            onChange={(e) => handleRenderingSettingChange("dofAFIntervalMs", parseInt(e.target.value))}
                          />
                        </div>
                        <div className="setting-row">
                          <label>AF Focus Layer:</label>
                          <input
                            type="number"
                            placeholder="e.g. 2"
                            value={renderingSettings.dofFocusLayer ?? ""}
                            onChange={(e) =>
                              handleRenderingSettingChange(
                                "dofFocusLayer",
                                e.target.value === "" ? null : parseInt(e.target.value),
                              )
                            }
                          />
                        </div>
                        {renderingSettings.dofAFMode === "target" && (
                          <div className="setting-row">
                            <label>AF Target Name:</label>
                            <input
                              type="text"
                              value={renderingSettings.dofAFTargetName || ""}
                              onChange={(e) => handleRenderingSettingChange("dofAFTargetName", e.target.value || null)}
                            />
                          </div>
                        )}
                        <div className="setting-row">
                          <label>AF Speed:</label>
                          <input
                            type="range"
                            min="0.01"
                            max="1"
                            step="0.01"
                            value={renderingSettings.dofFocusSpeed || 0.15}
                            onChange={(e) => handleRenderingSettingChange("dofFocusSpeed", parseFloat(e.target.value))}
                          />
                          <span>{(renderingSettings.dofFocusSpeed || 0.15).toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                    <div className="setting-row">
                      <label>Bokeh Scale:</label>
                      <input
                        type="range"
                        min="0.5"
                        max="10.0"
                        step="0.5"
                        value={renderingSettings.dofBokehScale}
                        onChange={(e) => handleRenderingSettingChange("dofBokehScale", parseFloat(e.target.value))}
                      />
                      <span>{renderingSettings.dofBokehScale.toFixed(1)}</span>
                    </div>
                  </>
                )}

                {/* 色彩调整 */}
                <h5>Color Grading</h5>
                <div className="setting-row">
                  <label>Brightness:</label>
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.05"
                    value={renderingSettings.brightness}
                    onChange={(e) => handleRenderingSettingChange("brightness", parseFloat(e.target.value))}
                  />
                  <span>{renderingSettings.brightness.toFixed(2)}</span>
                </div>
                <div className="setting-row">
                  <label>Contrast:</label>
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.05"
                    value={renderingSettings.contrast}
                    onChange={(e) => handleRenderingSettingChange("contrast", parseFloat(e.target.value))}
                  />
                  <span>{renderingSettings.contrast.toFixed(2)}</span>
                </div>
                <div className="setting-row">
                  <label>Saturation:</label>
                  <input
                    type="range"
                    min="-1.0"
                    max="1.0"
                    step="0.05"
                    value={renderingSettings.saturation}
                    onChange={(e) => handleRenderingSettingChange("saturation", parseFloat(e.target.value))}
                  />
                  <span>{renderingSettings.saturation.toFixed(2)}</span>
                </div>

                {/* 雾效设置 */}
                <h5>Fog Settings</h5>
                <div className="setting-row">
                  <label>Enable Fog:</label>
                  <input
                    type="checkbox"
                    checked={renderingSettings.enableFog}
                    onChange={(e) => handleRenderingSettingChange("enableFog", e.target.checked)}
                  />
                </div>

                {renderingSettings.enableFog && (
                  <>
                    <div className="setting-row">
                      <label>Fog Type:</label>
                      <select
                        value={renderingSettings.fogType || "linear"}
                        onChange={(e) => handleRenderingSettingChange("fogType", e.target.value)}
                      >
                        <option value="linear">Linear</option>
                        <option value="exp2">Exp2</option>
                      </select>
                    </div>

                    {/* Linear Fog */}
                    {(!renderingSettings.fogType || renderingSettings.fogType === "linear") && (
                      <>
                        <div className="setting-row">
                          <label>Fog Near:</label>
                          <input
                            type="range"
                            min="0.1"
                            max="50"
                            step="0.1"
                            value={renderingSettings.fogNear}
                            onChange={(e) => handleRenderingSettingChange("fogNear", parseFloat(e.target.value))}
                          />
                          <span>{renderingSettings.fogNear}</span>
                        </div>
                        <div className="setting-row">
                          <label>Fog Far:</label>
                          <input
                            type="range"
                            min="10"
                            max="500"
                            step="5"
                            value={renderingSettings.fogFar}
                            onChange={(e) => handleRenderingSettingChange("fogFar", parseFloat(e.target.value))}
                          />
                          <span>{renderingSettings.fogFar}</span>
                        </div>
                        <div className="setting-row">
                          <label>Fog Color:</label>
                          <input
                            type="color"
                            value={renderingSettings.fogColor}
                            onChange={(e) => handleRenderingSettingChange("fogColor", e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {/* Exp2 Fog */}
                    {renderingSettings.fogType === "exp2" && (
                      <>
                        <div className="setting-row">
                          <label>Fog Density:</label>
                          <input
                            type="range"
                            min="0"
                            max="0.02"
                            step="0.0005"
                            value={renderingSettings.fogDensity ?? 0.0015}
                            onChange={(e) => handleRenderingSettingChange("fogDensity", parseFloat(e.target.value))}
                          />
                          <span>{(renderingSettings.fogDensity ?? 0.0015).toFixed(4)}</span>
                        </div>
                        <div className="setting-row">
                          <label>Fog Color:</label>
                          <input
                            type="color"
                            value={renderingSettings.fogColor}
                            onChange={(e) => handleRenderingSettingChange("fogColor", e.target.value)}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 渲染预设快捷操作 */}
            <div className="quick-actions">
              <button
                onClick={() => {
                  const cinematic = {
                    ...renderingSettings,
                    enablePostProcessing: true,
                    enableBloom: true,
                    enableSSAO: true,
                    enableDOF: true,
                    enableVignette: true,
                    bloomIntensity: 1.2,
                    bloomLuminanceThreshold: 0.85,
                    ssaoIntensity: 0.7,
                    toneMappingExposure: 1.2,
                  };
                  setRenderingSettings(cinematic);
                }}
              >
                Cinematic
              </button>
              <button
                onClick={() => {
                  const performance = {
                    ...renderingSettings,
                    enablePostProcessing: false,
                    enableShadows: true,
                    shadowMapSize: 1024,
                    toneMapping: "ACESFilmic",
                    toneMappingExposure: 1.0,
                  };
                  setRenderingSettings(performance);
                }}
              >
                Performance
              </button>
              <button
                onClick={() => {
                  const realistic = {
                    ...renderingSettings,
                    enablePostProcessing: true,
                    enableBloom: false,
                    enableSSAO: true,
                    enableVignette: false,
                    enableChromaticAberration: false,
                    ssaoIntensity: 0.5,
                    toneMappingExposure: 1.0,
                    enableFog: true,
                    fogNear: 10,
                    fogFar: 100,
                  };
                  setRenderingSettings(realistic);
                }}
              >
                Realistic
              </button>
              <button
                onClick={() => {
                  const UltraBattle = {
                    ...renderingSettings,
                    enablePostProcessing: true,
                    enableBloom: true,
                    enableSSAO: true,
                    enableDOF: false,
                    enableVignette: true,
                    enableChromaticAberration: true,
                    bloomIntensity: 0.3,
                    bloomLuminanceThreshold: 1.2,
                    bloomRadius: 0.5,
                    ssaoIntensity: 0.7,
                    toneMappingExposure: 0.6,
                    brightness: -0.1,
                    contrast: 0.25,
                    enableFog: true,
                    fogNear: 5,
                    fogFar: 120,
                    fogColor: "#B0B0B0",
                  };
                  setRenderingSettings(UltraBattle);
                }}
              >
                UltraBattle
              </button>
            </div>
          </div>

          {/* MMD Test Panel */}
          <div className="debug-section">
            <h4>💃 MMD Test</h4>
            <MMDTestPanel />
          </div>

          {/* UI设置控制 */}
          <div className="debug-section">
            <h4>🎯 UI & Debug Settings</h4>

            {/* 十字准星设置 */}
            <div className="setting-row">
              <label>Show Crosshair:</label>
              <input
                type="checkbox"
                checked={uiSettings.showCrosshair}
                onChange={(e) => {
                  const newUISettings = {...uiSettings, showCrosshair: e.target.checked};
                  useGameStore.getState().setUISettings(newUISettings);
                }}
              />
            </div>

            {uiSettings.showCrosshair && (
              <>
                <div className="setting-row">
                  <label>Crosshair Style:</label>
                  <select
                    value={uiSettings.crosshairStyle}
                    onChange={(e) => {
                      const newUISettings = {...uiSettings, crosshairStyle: e.target.value};
                      useGameStore.getState().setUISettings(newUISettings);
                    }}
                  >
                    <option value="cross">Cross</option>
                    <option value="circle">Circle</option>
                    <option value="dot">Dot</option>
                  </select>
                </div>

                <div className="setting-row">
                  <label>Crosshair Size:</label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    step="2"
                    value={uiSettings.crosshairSize}
                    onChange={(e) => {
                      const newUISettings = {...uiSettings, crosshairSize: parseInt(e.target.value)};
                      useGameStore.getState().setUISettings(newUISettings);
                    }}
                  />
                  <span>{uiSettings.crosshairSize}px</span>
                </div>

                <div className="setting-row">
                  <label>Crosshair Color:</label>
                  <input
                    type="color"
                    value={uiSettings.crosshairColor}
                    onChange={(e) => {
                      const newUISettings = {...uiSettings, crosshairColor: e.target.value};
                      useGameStore.getState().setUISettings(newUISettings);
                    }}
                  />
                </div>

                <div className="setting-row">
                  <label>Crosshair Opacity:</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={uiSettings.crosshairOpacity}
                    onChange={(e) => {
                      const newUISettings = {...uiSettings, crosshairOpacity: parseFloat(e.target.value)};
                      useGameStore.getState().setUISettings(newUISettings);
                    }}
                  />
                  <span>{(uiSettings.crosshairOpacity * 100).toFixed(0)}%</span>
                </div>
              </>
            )}

            {/* 性能监视器设置 */}
            <div className="setting-row">
              <label>Show Performance Monitor:</label>
              <input
                type="checkbox"
                checked={uiSettings.showPerformanceMonitor}
                onChange={(e) => {
                  useGameStore.getState().togglePerformanceMonitor();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 辅助函数保持不变
const getWeatherIcon = (weather) => {
  const icons = {
    [WEATHER_TYPES.CLEAR]: "☀️",
    [WEATHER_TYPES.CLOUDY]: "☁️",
    [WEATHER_TYPES.RAINY]: "🌧️",
    [WEATHER_TYPES.SNOWY]: "❄️",
    [WEATHER_TYPES.FOGGY]: "🌫️",
    [WEATHER_TYPES.STORMY]: "⛈️",
  };
  return icons[weather] || "☀️";
};
const getTimeSpeedLabel = (speed) => {
  const labels = {
    [TIME_SPEEDS.PAUSED]: "Paused",
    [TIME_SPEEDS.SLOW]: "Slow",
    [TIME_SPEEDS.NORMAL]: "Normal",
    [TIME_SPEEDS.FAST]: "Fast",
    [TIME_SPEEDS.VERY_FAST]: "Very Fast",
  };
  return labels[speed] || "Normal";
};
const formatTime = (hours) => {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

function MMDTestPanel() {
  const mmdTest = useGameStore((s) => s.mmdTest);
  const startMMDTest = useGameStore((s) => s.startMMDTest);
  const stopMMDTest = useGameStore((s) => s.stopMMDTest);

  // Local simple defaults
  const [modelUrl, setModelUrl] = useState("/mmd/Nankawa/NankawaChie.pmx");
  const [motion1, setMotion1] = useState("/mmd/Lamb/lamb足ボーン長い人用.vmd");
  const [motion2, setMotion2] = useState("");
  const [cameraUrl, setCameraUrl] = useState("/mmd/Lamb/lambカメラ2.vmd");
  const [audioUrl, setAudioUrl] = useState("/mmd/audio/Lamb.wav");
  const [px, setPx] = useState(0);
  const [py, setPy] = useState(0);
  const [pz, setPz] = useState(0);
  const [scale, setScale] = useState(1);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [camScale, setCamScale] = useState(1);
  const [linkCamScale, setLinkCamScale] = useState(true);
  const [camOffX, setCamOffX] = useState(0);
  const [linkCamPos, setLinkCamPos] = useState(true);
  const [camOffY, setCamOffY] = useState(0);
  const [camOffZ, setCamOffZ] = useState(0);
  const [morphRemap, setMorphRemap] = useState("");
  const [morphRemapIndex, setMorphRemapIndex] = useState("");

  // persist and restore remap inputs
  useEffect(() => {
    try {
      const a = localStorage.getItem("mmd_morphRemap");
      if (a) setMorphRemap(a);
      const b = localStorage.getItem("mmd_morphRemapIndex");
      if (b) setMorphRemapIndex(b);
    } catch {}
  }, []);
  const onChangeMorphRemap = (v) => {
    setMorphRemap(v);
    try {
      localStorage.setItem("mmd_morphRemap", v);
    } catch {}
  };
  const onChangeMorphRemapIndex = (v) => {
    setMorphRemapIndex(v);
    try {
      localStorage.setItem("mmd_morphRemapIndex", v);
    } catch {}
  };

  // accept JSON or simple lines: key=value per line
  const parseMapping = (txt) => {
    if (!txt || !txt.trim()) return null;
    try {
      return JSON.parse(txt);
    } catch {}
    const map = {};
    txt.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s) return;
      const m = s.match(/^(.*?)=(.*)$/);
      if (m) {
        const k = m[1].trim();
        const val = m[2].trim();
        if (k) map[k] = val;
      }
    });
    return Object.keys(map).length ? map : null;
  };
  const [camMinY, setCamMinY] = useState(0);

  const handleStart = () => {
    const motionUrls = [motion1, motion2].filter((u) => u && u.trim().length > 0);
    startMMDTest({
      modelUrl,
      motionUrls,
      cameraUrl: cameraUrl || null,
      audioUrl: audioUrl || null,
      position: [Number(px), Number(py), Number(pz)],
      scale: Number(scale) || 1,
      physicsEnabled,
      timeScale: Number(timeScale) || 1,
      loop: true,
      cameraPosScale: Number(camScale) || 1,
      cameraOffset: [Number(camOffX) || 0, Number(camOffY) || 0, Number(camOffZ) || 0],
      cameraMinHeight: Number(camMinY) || 0,
      linkCameraScale: !!linkCamScale,
      linkCameraPosition: !!linkCamPos,
      morphRemapMap: parseMapping(morphRemap),
      morphRemapIndexMap: parseMapping(morphRemapIndex),
    });
  };

  const handleStop = () => stopMMDTest();

  return (
    <div className="advanced-settings">
      <div className="setting-row">
        <label>Model (PMX):</label>
        <input type="text" value={modelUrl} onChange={(e) => setModelUrl(e.target.value)} />
      </div>
      <div className="setting-row">
        <label>Motion VMD #1:</label>
        <input type="text" value={motion1} onChange={(e) => setMotion1(e.target.value)} />
      </div>
      <div className="setting-row">
        <label>Motion VMD #2:</label>
        <input type="text" value={motion2} onChange={(e) => setMotion2(e.target.value)} />
      </div>
      <div className="setting-row">
        <label>Camera VMD:</label>
        <input type="text" value={cameraUrl} onChange={(e) => setCameraUrl(e.target.value)} />
      </div>
      <div className="setting-row">
        <label>Audio (optional):</label>
        <input type="text" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} />
        <div style={{fontSize: 12, opacity: 0.8}}>
          建议将音频放在 /public/mmd/audio 下，并以 /mmd/... 路径访问。当前默认：/mmd/audio/Lamb.wav
        </div>
      </div>
      <div className="setting-row">
        <label>Position:</label>
        <input type="number" step="0.1" value={px} onChange={(e) => setPx(e.target.value)} style={{width: 70}} />
        <input type="number" step="0.1" value={py} onChange={(e) => setPy(e.target.value)} style={{width: 70}} />
        <input type="number" step="0.1" value={pz} onChange={(e) => setPz(e.target.value)} style={{width: 70}} />
      </div>
      <div className="setting-row">
        <label>Scale:</label>
        <input type="number" step="0.1" value={scale} onChange={(e) => setScale(e.target.value)} />
      </div>
      <div className="setting-row">
        <label>Physics:</label>
        <input type="checkbox" checked={physicsEnabled} onChange={(e) => setPhysicsEnabled(e.target.checked)} />
      </div>
      <div className="setting-row">
        <label>Time Scale:</label>
        <input type="number" step="0.1" value={timeScale} onChange={(e) => setTimeScale(e.target.value)} />
      </div>

      <div className="setting-row">
        <label>Link Camera Scale:</label>
        <input type="checkbox" checked={linkCamScale} onChange={(e) => setLinkCamScale(e.target.checked)} />
      </div>
      <div className="setting-row">
        <label>Link Camera Position:</label>
        <input type="checkbox" checked={linkCamPos} onChange={(e) => setLinkCamPos(e.target.checked)} />
      </div>
      <div className="setting-row">
        <label>Camera Pos Scale:</label>
        <input
          type="number"
          step="0.1"
          value={camScale}
          onChange={(e) => setCamScale(e.target.value)}
          disabled={linkCamScale}
        />
      </div>
      <div className="setting-row">
        <label>Camera Offset:</label>
        <input type="number" step="0.1" value={camOffX} onChange={(e) => setCamOffX(e.target.value)} style={{width: 70}} />
        <input type="number" step="0.1" value={camOffY} onChange={(e) => setCamOffY(e.target.value)} style={{width: 70}} />
        <input type="number" step="0.1" value={camOffZ} onChange={(e) => setCamOffZ(e.target.value)} style={{width: 70}} />
      </div>
      <div className="setting-row">
        <label>Camera Min Y:</label>
        <input type="number" step="0.1" value={camMinY} onChange={(e) => setCamMinY(e.target.value)} />
      </div>

      <div className="setting-row" style={{flexDirection: "column", alignItems: "flex-start"}}>
        <label>Morph Remap (name→name) JSON:</label>
        <textarea
          rows={3}
          style={{width: "100%"}}
          placeholder='{"あ":"A","い":"I"}'
          value={morphRemap}
          onChange={(e) => setMorphRemap(e.target.value)}
        />
        <div style={{fontSize: 12, opacity: 0.8}}>当 VMD 表情名与模型 morph 名不一致时使用。留空表示不做重映射。</div>
      </div>
      <div className="setting-row" style={{flexDirection: "column", alignItems: "flex-start"}}>
        <label>Morph Remap (index→name) JSON:</label>
        <textarea
          rows={3}
          style={{width: "100%"}}
          placeholder='{"0":"まばたき","24":"ウィンク"}'
          value={morphRemapIndex}
          onChange={(e) => setMorphRemapIndex(e.target.value)}
        />
        <div style={{fontSize: 12, opacity: 0.8}}>
          当 VMD 轨道是以索引形式（如 .morphTargetInfluences[24]）出现时使用。键是源索引，值是目标模型的 morph 名。
        </div>
      </div>

      <div className="quick-actions">
        {!mmdTest.active ? <button onClick={handleStart}>Dance</button> : <button onClick={handleStop}>Stop</button>}
      </div>
    </div>
  );
}

export default DebugPanel;
