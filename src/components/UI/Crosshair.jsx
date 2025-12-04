import React from 'react';
import useGameStore from '../../stores/gameStore';
import './Crosshair.css';

/**
 * @description 屏幕中心十字准星组件
 * 用于调试点击检测和相机对准
 * @returns {JSX.Element}
 */
function Crosshair() {
  const uiSettings = useGameStore((state) => state.settings.ui);

  if (!uiSettings.showCrosshair) {
    return null;
  }

  const {
    crosshairStyle,
    crosshairSize,
    crosshairColor,
    crosshairOpacity
  } = uiSettings;

  const crosshairStyles = {
    '--crosshair-size': `${crosshairSize}px`,
    '--crosshair-color': crosshairColor,
    '--crosshair-opacity': crosshairOpacity,
  };

  return (
    <div 
      className={`crosshair crosshair-${crosshairStyle}`}
      style={crosshairStyles}
    >
      {crosshairStyle === 'cross' && (
        <>
          <div className="crosshair-line crosshair-horizontal"></div>
          <div className="crosshair-line crosshair-vertical"></div>
        </>
      )}
      {crosshairStyle === 'circle' && (
        <div className="crosshair-circle"></div>
      )}
      {crosshairStyle === 'dot' && (
        <div className="crosshair-dot"></div>
      )}
    </div>
  );
}

export default Crosshair;