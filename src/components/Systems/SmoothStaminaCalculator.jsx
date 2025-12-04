import {useRef, useEffect} from "react";
import {useFrame} from "@react-three/fiber";
import {PERFORMANCE_CONFIG} from "../../config/PerformanceConfig";
import useGameStore from "../../stores/gameStore";

/**
 * @name SmoothStaminaCalculator
 * @description 一个用于平滑更新体力条UI的性能优化组件。
 * 它不渲染任何实际的DOM元素，而是通过 `useFrame` 循环，
 * 采用线性插值（lerp）算法来平滑地计算体力值的变化，
 * 并直接操作传入的UI DOM元素的样式。这样做可以避免因体力值
 * 频繁变化而导致的React组件重渲染，从而提升性能。
 *
 * @param {object} props - 组件属性
 * @param {number} [props.maxStamina=100] - 最大体力值。
 * @param {React.RefObject<HTMLDivElement>} props.uiRef - 指向体力条UI根DOM元素的引用。
 * @returns {null}
 */
function SmoothStaminaCalculator({maxStamina = 100, uiRef}) {
  // 從 Store 讀取體力值 (不訂閱，避免重新渲染)
  const targetStamina = useGameStore.getState().player.stamina;
  const smoothedStamina = useRef(targetStamina);

  // 缓存DOM节点的引用，避免在每帧中重复查询
  const barElement = useRef(null);
  const textElement = useRef(null);

  // 当uiRef可用时，查询并缓存内部的子元素
  useEffect(() => {
    if (uiRef.current) {
      // 通过 data-testid 这种稳定的选择器来查找子元素
      barElement.current = uiRef.current.querySelector(
        '[data-testid="stamina-bar-inner"]'
      );
      textElement.current = uiRef.current.querySelector(
        '[data-testid="stamina-bar-text"]'
      );
    }
  }, [uiRef]);

  // 優化：緩存必要的狀態，減少不必要的DOM更新
  const lastColor = useRef("");
  const lastText = useRef("");

  useFrame(() => {
    // 如果DOM节点还没准备好，则不执行任何操作
    if (!barElement.current || !textElement.current) return;

    // 每幀從 Store 讀取最新的體力值
    const currentTargetStamina = useGameStore.getState().player.stamina;

    const lerpFactor = 0.15; // 插值因子，控制平滑速度
    const difference = currentTargetStamina - smoothedStamina.current;

    // 只有当视觉值和目标值有足够大的差异时才进行更新，以节省计算
    if (Math.abs(difference) > 0.001) {
      smoothedStamina.current += difference * lerpFactor;
    } else {
      // 当差异很小时，直接设置为目标值，避免无限接近
      smoothedStamina.current = currentTargetStamina;
    }

    // --- 直接操作DOM以获得最佳性能 ---
    const percentage = (smoothedStamina.current / maxStamina) * 100;
    const isLow = percentage < 30;
    const isEmpty = percentage <= 0;
    const barColor = isEmpty ? "#ff4444" : isLow ? "#ffaa44" : "#44ff44";

    // 每幀更新寬度，但只在必要時更新顏色和文本
    barElement.current.style.width = `${percentage}%`;
    
    // 只有顏色改變時才更新
    if (barColor !== lastColor.current) {
      barElement.current.style.backgroundColor = barColor;
      lastColor.current = barColor;
    }

    // 文本更新頻率稍低
    const roundedStamina = Math.round(smoothedStamina.current);
    const currentText = `Stamina: ${roundedStamina}/${maxStamina}`;
    if (currentText !== lastText.current) {
      textElement.current.textContent = currentText;
      lastText.current = currentText;
    }
  });

  return null; // 此组件不渲染任何React元素
}

export default SmoothStaminaCalculator;
