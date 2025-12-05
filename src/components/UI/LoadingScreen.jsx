import React from "react";
import "./LoadingScreen.css";

/**
 * @name LoadingScreen
 * @description 增强版加载屏幕组件，显示详细的加载进度信息。
 * 支持显示加载百分比、已加载文件数量、当前正在加载的文件等信息。
 *
 * @param {object} props - 组件属性
 * @param {boolean} props.active - 控制加载屏幕是否可见
 * @param {number} props.progress - 加载进度百分比 (0-100)
 * @param {number} props.loaded - 已加载的项目数量
 * @param {number} props.total - 总项目数量
 * @param {string} props.item - 当前正在加载的文件名
 * @returns {JSX.Element}
 */
function LoadingScreen({active, progress = 0, loaded = 0, total = 0, item = ""}) {
  // 提取文件名（去除路径）
  const getFileName = (path) => {
    if (!path) return "";
    const parts = path.split("/");
    return parts[parts.length - 1];
  };

  const fileName = getFileName(item);

  return (
    <div className={`loading-screen ${active ? "active" : ""}`}>
      {/* 动画背景 */}
      <div className="loading-background">
        <div className="loading-background-gradient"></div>
        <div className="loading-particles">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="particle" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}></div>
          ))}
        </div>
      </div>

      {/* 加载内容 */}
      <div className="loading-screen-container">
        <div className="loading-title">
          <h1>Loading Open World</h1>
          <div className="loading-subtitle">Preparing your experience...</div>
        </div>

        <div className="loading-info">
          <div className="progress-percentage">{Math.round(progress)}%</div>
          
          {total > 0 && (
            <div className="loading-stats">
              <span className="stat-label">Assets:</span>
              <span className="stat-value">{loaded} / {total}</span>
            </div>
          )}
        </div>

        <div className="progress-bar-container">
          <div className="progress-bar-track">
            <div className="progress-bar" style={{width: `${progress}%`}}>
              <div className="progress-bar-glow"></div>
            </div>
          </div>
        </div>

        {fileName && (
          <div className="loading-file-info">
            <div className="loading-file-label">Loading:</div>
            <div className="loading-file-name">{fileName}</div>
          </div>
        )}

        <div className="loading-tips">
          <p>💡 Tip: Use WASD to move, mouse to look around, and Space to jump!</p>
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
