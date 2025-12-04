import React, {forwardRef, memo} from "react";
import useGameStore from "../../stores/gameStore";

/**
 * @name StaminaBar
 * @description 一个高性能的“哑”UI组件，用于显示体力条。
 * "哑"组件意味着它自身不包含任何动态逻辑。其初始状态由props设定，
 * 而后续的所有平滑动画和数值更新都由外部控制器（`SmoothStaminaCalculator`）
 * 通过 `ref` 直接操作其DOM来完成。
 * - **forwardRef**: 用于接收父组件传递的 ref，允许外部直接访问其根DOM元素。
 * - **memo**: 用于优化性能，防止在props没有实际变化时发生不必要的重渲染。
 * - **data-testid**: 为内部元素设置了测试ID，方便外部控制器精确查找和操作。
 *
 * @param {object} props - 组件属性
 * @param {number} [props.maxStamina=100] - 最大体力值。
 * @param {React.Ref} ref - The forwarded ref.
 * @returns {JSX.Element}
 */
const StaminaBar = forwardRef(
  ({maxStamina = 100}, ref) => {
    // 從 Store 訂閱體力值來控制可見性
    const stamina = useGameStore((state) => state.player.stamina);
    const visible = stamina < 100;
    // Note: This component is "dumb". It only renders the initial state.
    // All dynamic updates are handled by an external controller via the ref.

    const initialPercentage = (stamina / maxStamina) * 100;
    const isLow = initialPercentage < 30;
    const isEmpty = initialPercentage <= 0;
    const initialBarColor = isEmpty ? "#ff4444" : isLow ? "#ffaa44" : "#44ff44";

    return (
      // Attach the forwarded ref to the root div
      <div
        ref={ref}
        style={{
          position: "fixed",
          bottom: "20px",
          left: "20px",
          width: "200px",
          height: "20px",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          border: "2px solid #fff",
          borderRadius: "10px",
          overflow: "hidden",
          zIndex: 1000,
          opacity: visible ? 1 : 0,
          visibility: visible ? "visible" : "hidden",
          transition: "opacity 0.3s ease, visibility 0.3s ease",
        }}
      >
        {/* The inner bar element, given a data-testid for easy external lookup */}
        <div
          data-testid="stamina-bar-inner"
          style={{
            width: `${initialPercentage}%`,
            height: "100%",
            backgroundColor: initialBarColor,
            borderRadius: "8px",
            // Note: transitions for width and color are removed,
            // as they will be controlled smoothly by JavaScript.
          }}
        />

        {/* The text display, also with a data-testid */}
        <div
          data-testid="stamina-bar-text"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#fff",
            fontSize: "12px",
            fontWeight: "bold",
            textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
            pointerEvents: "none",
          }}
        >
          Stamina: {Math.round(stamina)}/{maxStamina}
        </div>
      </div>
    );
  }
);

export default memo(StaminaBar);
