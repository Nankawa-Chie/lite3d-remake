import {useMemo, useRef, useEffect} from "react";
import {useThree, useFrame} from "@react-three/fiber";
import * as THREE from "three";
import {PERFORMANCE_CONFIG} from "../../config/PerformanceConfig";
import useGameStore from "../../stores/gameStore";

/**
 * @name MinimapRenderer
 * @description 一个用于渲染小地图的专用组件。
 * 它通过创建一个独立的、从正上方俯视玩家的正交相机，
 * 并利用 `gl.setScissor` 和 `gl.setViewport` 技术，
 * 将主场景的一部分渲染到指定的DOM容器中，从而实现小地图效果。
 * 此组件自身不渲染任何可见的three.js对象到主场景。
 *
 * @param {object} props - 组件属性
 * @param {React.RefObject<THREE.Group>} props.playerRef - 指向玩家对象的引用，用于定位小地图相机。
 * @param {React.RefObject<HTMLDivElement>} props.containerRef - 指向小地图DOM容器元素的引用。
 * @returns {null}
 */
function MinimapRenderer({
  playerRef,
  containerRef,
}) {
  // 從 Store 訂閱小地圖設置
  const minimapSettings = useGameStore((state) => state.settings.minimap);
  const {
    enabled,
    viewRange,
    height: cameraHeight,
    zoom,
    showCoordinates,
    coordinatePrecision,
  } = minimapSettings;
  const {gl, scene, size, viewport} = useThree();

  // 使用 useMemo 创建小地图专用的正交相机，仅在 viewRange 或 zoom 变化时重新创建
  const minimapCamera = useMemo(() => {
    const effectiveRange = viewRange / zoom;
    const cam = new THREE.OrthographicCamera(
      -effectiveRange / 2,
      effectiveRange / 2,
      effectiveRange / 2,
      -effectiveRange / 2,
      0.1,
      1000
    );
    cam.up.set(0, 0, -1); // 设置相机的 up 方向，使其从 Y 轴正上方朝下看
    return cam;
  }, [viewRange, zoom]);

  // 優化：緩存計算結果，但保持流暢更新
  const lastCoordinateUpdate = useRef(0);
  const cachedPlayerPosition = useRef(new THREE.Vector3());

  useFrame(() => {
    // 如果小地图被禁用，直接返回
    if (!enabled || !playerRef.current || !containerRef.current) return;

    const playerPosition = new THREE.Vector3();
    // 从 playerRef 中获取最新的玩家位置
    const pos = playerRef.current.position;
    if (pos && Array.isArray(pos)) {
      playerPosition.fromArray(pos);
      cachedPlayerPosition.current.copy(playerPosition);

      // 1. 更新小地图相机的位置，使其始终在玩家正上方
      minimapCamera.position.set(
        playerPosition.x,
        playerPosition.y + cameraHeight,
        playerPosition.z
      );
      minimapCamera.lookAt(playerPosition);

      // 2. 更新坐标显示 (如果启用) - 降低坐標更新頻率但不影響渲染
      if (showCoordinates) {
        const now = performance.now();
        if (now - lastCoordinateUpdate.current >= PERFORMANCE_CONFIG.MINIMAP_COORDINATE_UPDATE_INTERVAL) {
          const coordElement = document.getElementById("player-coordinates");
          if (coordElement) {
            coordElement.textContent = `X: ${playerPosition.x.toFixed(
              coordinatePrecision
            )}, Y: ${playerPosition.y.toFixed(
              coordinatePrecision
            )}, Z: ${playerPosition.z.toFixed(coordinatePrecision)}`;
          }
          lastCoordinateUpdate.current = now;
        }
      }

      // --- 核心渲染逻辑 ---

      // 保存当前渲染器的状态，以便渲染完小地图后恢复
      const originalScissor = new THREE.Vector4();
      const originalViewport = new THREE.Vector4();
      gl.getScissor(originalScissor);
      gl.getViewport(originalViewport);
      const originalScissorTest = gl.getScissorTest();

      // 获取小地图DOM容器在屏幕上的位置和尺寸
      const rect = containerRef.current.getBoundingClientRect();
      // 转换坐标系：DOM的y坐标是从上到下，而WebGL的y坐标是从下到上
      const {left, bottom, width, height} = {
        left: rect.left,
        bottom: gl.domElement.clientHeight - rect.bottom,
        width: rect.width,
        height: rect.height,
      };

      // 只有当容器可见时才进行渲染
      if (rect.width > 0 && rect.height > 0) {
        // 3. 启用裁剪测试，并设置裁剪区域为小地图容器的范围
        gl.setScissorTest(true);
        gl.setScissor(left, bottom, width, height);

        // 4. 设置视口为小地图容器的范围
        gl.setViewport(left, bottom, width, height);

        // 5. 使用小地图相机渲染主场景到指定的视口和裁剪区域
        gl.render(scene, minimapCamera);
      }

      // 6. 恢复渲染器到原始状态，以便主场景能正常渲染
      gl.setScissorTest(originalScissorTest);
      gl.setScissor(originalScissor);
      gl.setViewport(originalViewport);
    }
  }, 1); // 设置 renderPriority 为 1，确保在主渲染循环之后执行

  return null; // 此组件不直接渲染任何内容到React树中
}

export default MinimapRenderer;
