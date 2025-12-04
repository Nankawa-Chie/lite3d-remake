import React from "react";
import "./LoadingScreen.css";

/**
 * @name LoadingScreen
 * @description 一个纯粹的React UI组件，用于显示游戏加载进度。
 * 它与 Three.js/R3F 完全解耦，其显示状态和进度由外部通过 props 控制。
 * 这种解耦使得加载界面的逻辑可以独立于3D场景的管理。
 *
 * @param {object} props - 组件属性
 * @param {boolean} props.active - 控制加载屏幕是否可见。
 * @param {number} props.progress - 加载进度百分比 (0-100)。
 * @returns {JSX.Element}
 */
function LoadingScreen({active, progress}) {
  return (
    // The `active` class controls the visibility and fade-in/out animations via CSS
    <div className={`loading-screen ${active ? "active" : ""}`}>
      <div className="loading-screen-container">
        <div>Loading Open World...</div>
        <div className="progress-text">{Math.round(progress)}%</div>
        <div className="progress-bar-container">
          {/* The width of the progress bar is updated dynamically via inline styles */}
          <div className="progress-bar" style={{width: `${progress}%`}} />
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
