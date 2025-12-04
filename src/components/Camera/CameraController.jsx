import {useRef, useEffect, useState, useCallback} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import {PointerLockControls} from "@react-three/drei";
import * as THREE from "three";
import {PERFORMANCE_CONFIG} from "../../config/PerformanceConfig";
import useGameStore from "../../stores/gameStore";

/**
 * @name CameraController
 * @description 一个全面的相机与玩家输入控制器。
 * 它管理第一人称和第三人称两种相机模式，处理键盘和鼠标输入，
 * 实现角色移动、冲刺、行走、跳跃等动作，并内置了一套体力值系统来限制冲刺。
 * 同时，它还负责将玩家的输入状态和相机方向传递给Player组件。
 *
 * @param {object} props - 组件属性
 * @param {React.RefObject} props.playerRef - 指向玩家物理实体（MilkPlayer）的引用。
 * @param {boolean} [props.enabled=true] - 是否启用此控制器。
 * @returns {JSX.Element}
 */
function CameraController({playerRef, enabled = true}) {
  const controlsRef = useRef();
  const {camera, gl} = useThree();

  // Store actions
  const setPlayerStamina = useGameStore((state) => state.setPlayerStamina);
  const setPlayerMovementState = useGameStore((state) => state.setPlayerMovementState);

  // --- State Management ---
  const [cameraMode, setCameraMode] = useState("first"); // 'first' | 'third' | 'free' | 'spectate'
  const [isLocked, setIsLocked] = useState(false); // Pointer lock state
  const [showInstructions, setShowInstructions] = useState(true);

  // Input and movement state
  const [keys, setKeys] = useState({});
  const [isSprinting, setIsSprinting] = useState(false);
  const [isWalking, setIsWalking] = useState(false);

  // 按鍵防抖狀態 - 追蹤哪些功能鍵已經被處理過
  const processedKeys = useRef(new Set());

  // 一次性說明浮窗狀態 - 追蹤每種模式是否已經顯示過說明
  const shownInstructions = useRef(new Set());

  // Camera FOV state for dynamic effects (e.g., sprinting)
  const [targetFov, setTargetFov] = useState(70);
  const fovChangeSpeed = 20.0;

  // Camera transition state for smooth first<->third switching
  const cameraTransition = useRef({
    active: false,
    elapsed: 0,
    duration: 0.35,
    toMode: null,
    startPos: new THREE.Vector3(),
    startQuat: new THREE.Quaternion(),
    targetPos: new THREE.Vector3(),
    targetQuat: new THREE.Quaternion(),
  });

  // Free camera/spectate state
  const freeCam = useRef({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  });
  const spectateAnchor = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  });
  // 恢復更靈敏的移動參數（無側滾）
  const FREE_BASE_SPEED = 4.0;
  const FREE_SPRINT_MULT = 2.5;
  const FREE_ACCEL = 20.0;
  const FREE_DAMPING = 8.0;

  // Simple third-person camera configuration (回到簡單版本)
  const thirdPersonParams = {
    pivotOffset: new THREE.Vector3(0, 1.44, 0),
    basePivotHeight: 0.7, // 基础枢轴高度
    sittingPivotHeight: 0.16, // 坐下时的枢轴高度
    distance: 4.0,
    minDistance: 0.6,
    maxDistance: 300.0,
    baseZoomSpeed: 0.2, // 基礎縮放速度
    maxZoomSpeed: 3.0, // 最大縮放速度
    rotationSpeed: 0.002,
    // 只添加縮放平滑度
    zoomSmoothness: 0.1, // 縮放平滑度
  };

  // 簡化的狀態管理 - 只添加平滑縮放
  const currentPivotHeight = useRef(thirdPersonParams.basePivotHeight);
  const targetDistance = useRef(thirdPersonParams.distance); // 目標距離

  // Spherical coordinates for third-person camera control
  const spherical = useRef(new THREE.Spherical(thirdPersonParams.distance, Math.PI / 2.5, Math.PI / 8));

  // Reusable vectors to avoid creating new ones in the render loop
  const _worldDirection = useRef(new THREE.Vector3());
  const _characterPosition = useRef(new THREE.Vector3());
  const _horizontalDirection = useRef(new THREE.Vector3());

  // Stamina system state
  const [stamina, setStamina] = useState(100);
  const [staminaExhausted, setStaminaExhausted] = useState(false);

  // Ref for the instructions DOM element
  const instructionsRef = useRef(null);

  /**
   * 根據當前距離計算動態縮放速度
   * @description 距離越遠，縮放速度越快，提供更好的用戶體驗
   * @param {number} currentDistance - 當前相機距離
   * @returns {number} 動態調整後的縮放速度
   */
  const calculateDynamicZoomSpeed = useCallback(
    (currentDistance) => {
      const {minDistance, maxDistance, baseZoomSpeed, maxZoomSpeed} = thirdPersonParams;

      // 計算距離在總範圍中的比例 (0-1)
      const distanceRatio = (currentDistance - minDistance) / (maxDistance - minDistance);

      // 使用平滑的插值函數，讓速度變化更自然
      // 使用 smoothstep 函數讓變化更平滑
      const smoothRatio = distanceRatio * distanceRatio * (3 - 2 * distanceRatio);

      // 線性插值計算最終縮放速度
      return THREE.MathUtils.lerp(baseZoomSpeed, maxZoomSpeed, smoothRatio);
    },
    [thirdPersonParams]
  );

  /**
   * 平滑地更新相机视场角 (FOV)。
   * @param {number} deltaTime - 帧间隔时间。
   */
  const updateFOV = useCallback(
    (deltaTime) => {
      const fovDifference = targetFov - camera.fov;
      if (Math.abs(fovDifference) > 0.01) {
        camera.fov += fovDifference * fovChangeSpeed * deltaTime;
        camera.updateProjectionMatrix();
      }
    },
    [camera, targetFov, fovChangeSpeed]
  );

  // 啟動第一/第三人稱之間的平滑過渡
  const beginCameraTransition = useCallback(
    (toMode) => {
      if (!playerRef?.current) return;
      cameraTransition.current.active = true;
      cameraTransition.current.elapsed = 0;
      cameraTransition.current.toMode = toMode;
      cameraTransition.current.startPos.copy(camera.position);
      cameraTransition.current.startQuat.copy(camera.quaternion);

      if (toMode === "first") {
        // 計算第一人稱目標位置（使用頭部骨骼或回退計算）
        const headWorldPos = playerRef.current.getHeadWorldPosition?.();
        if (headWorldPos) {
          cameraTransition.current.targetPos.copy(headWorldPos);
        } else {
          const characterPos = playerRef.current.position;
          const headHeight = 1.3;
          const eyeForwardOffset = 0.3;
          camera.getWorldDirection(_worldDirection.current);
          _horizontalDirection.current.copy(_worldDirection.current).setY(0).normalize();
          const finalPosX = characterPos[0] + _horizontalDirection.current.x * eyeForwardOffset;
          const finalPosY = characterPos[1] + headHeight;
          const finalPosZ = characterPos[2] + _horizontalDirection.current.z * eyeForwardOffset;
          cameraTransition.current.targetPos.set(finalPosX, finalPosY, finalPosZ);
        }
        // 保持當前視角方向
        cameraTransition.current.targetQuat.copy(camera.quaternion);
      } else if (toMode === "third") {
        // 計算第三人稱目標位置與朝向
        const characterPos = playerRef.current.position;
        _characterPosition.current.fromArray(characterPos || [0, 0, 0]);

        const currentPlayerState = playerRef.current.getCurrentState?.();
        const isSitting = currentPlayerState === "sitting" || currentPlayerState === "sitting_with_chair";
        const targetPivotHeight = isSitting ? thirdPersonParams.sittingPivotHeight : thirdPersonParams.basePivotHeight;
        const dynamicPivotOffset = new THREE.Vector3(0, targetPivotHeight, 0);
        const pivotPoint = _characterPosition.current.clone().add(dynamicPivotOffset);

        const offset = new THREE.Vector3().setFromSpherical(spherical.current);
        const targetPosition = pivotPoint.clone().add(offset);
        cameraTransition.current.targetPos.copy(targetPosition);
        // 朝向 pivotPoint
        const lookMat = new THREE.Matrix4().lookAt(targetPosition, pivotPoint, camera.up);
        cameraTransition.current.targetQuat.setFromRotationMatrix(lookMat);
      }

      // 立即更新模式（讓頭部顯示邏輯等生效），實際位置在過渡中插值
      setCameraMode(toMode);
    },
    [camera, playerRef, setCameraMode]
  );

  /**
   * 自由相機更新 - 平滑運動
   */
  const updateFreeCamera = useCallback(
    (deltaTime) => {
      if (cameraMode !== "free") return;

      // 初始化 freeCam 狀態（首次進入已在 effect 中同步位置）
      const speedMult = keys.ShiftLeft ? FREE_SPRINT_MULT : 1.0;
      const speed = FREE_BASE_SPEED * speedMult;

      // 從相機當前朝向獲取方向基底（僅使用 yaw/pitch）
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

      // 根據按鍵組裝目標速度
      const desired = new THREE.Vector3();
      if (keys.KeyW) desired.add(forward);
      if (keys.KeyS) desired.add(forward.clone().multiplyScalar(-1));
      if (keys.KeyD) desired.add(right);
      if (keys.KeyA) desired.add(right.clone().multiplyScalar(-1));
      desired.normalize();
      desired.multiplyScalar(speed);

      // 平滑加速度與阻尼
      freeCam.current.velocity.lerp(desired, THREE.MathUtils.clamp(FREE_ACCEL * deltaTime, 0, 1));
      // 額外阻尼避免尾隨
      const damp = Math.exp(-FREE_DAMPING * deltaTime);
      freeCam.current.velocity.multiplyScalar(damp);

      // 位置整合
      freeCam.current.position.addScaledVector(freeCam.current.velocity, deltaTime);
      camera.position.copy(freeCam.current.position);

      // 無側滾：僅依賴 PointerLockControls 的 yaw/pitch 視角，這裡不再調整 rotation.z
    },
    [camera, cameraMode, keys]
  );

  /**
   * @description 簡化版第三人稱相機更新邏輯 - 只添加平滑縮放
   */
  const updateThirdPersonCamera = useCallback(() => {
    if (!playerRef?.current || cameraMode !== "third") return;
    const characterPos = playerRef.current.position;
    if (!characterPos || !Array.isArray(characterPos)) return;

    // 获取玩家当前状态
    const currentPlayerState = playerRef.current.getCurrentState?.();
    const isSitting = currentPlayerState === "sitting" || currentPlayerState === "sitting_with_chair";

    // 确定目标枢轴高度
    const targetPivotHeight = isSitting ? thirdPersonParams.sittingPivotHeight : thirdPersonParams.basePivotHeight;

    // 平滑过渡到目标高度
    const heightSmoothingFactor = 0.1; // 提高平滑系数，让过渡更快
    currentPivotHeight.current = THREE.MathUtils.lerp(currentPivotHeight.current, targetPivotHeight, heightSmoothingFactor);

    _characterPosition.current.fromArray(characterPos);
    const dynamicPivotOffset = new THREE.Vector3(0, currentPivotHeight.current, 0);
    const pivotPoint = _characterPosition.current.clone().add(dynamicPivotOffset);

    // 平滑縮放過渡 - 這是主要的改進
    spherical.current.radius = THREE.MathUtils.lerp(
      spherical.current.radius,
      targetDistance.current,
      thirdPersonParams.zoomSmoothness
    );

    // 限制距離範圍
    spherical.current.radius = THREE.MathUtils.clamp(
      spherical.current.radius,
      thirdPersonParams.minDistance,
      thirdPersonParams.maxDistance
    );

    const offset = new THREE.Vector3().setFromSpherical(spherical.current);
    camera.position.copy(pivotPoint.clone().add(offset));
    camera.lookAt(pivotPoint);
  }, [camera, playerRef, cameraMode, thirdPersonParams]);

  /**
   * 更新第一人称相机的逻辑。
   * 优先使用头部骨骼的真实位置，如果没有则回退到估算位置。
   */
  const updateFirstPersonCamera = useCallback(() => {
    if (!playerRef?.current || cameraMode !== "first") return;

    // 尝试获取头部骨骼的真实位置
    const headWorldPos = playerRef.current.getHeadWorldPosition?.();

    if (headWorldPos) {
      // 使用真实的头部骨骼位置（已经在MilkPlayer中处理了偏移和平滑）
      camera.position.copy(headWorldPos);
    } else {
      // 回退到原来的估算方法
      const characterPos = playerRef.current.position;
      if (!characterPos || !Array.isArray(characterPos)) return;
      const headHeight = 1.3;
      const eyeForwardOffset = 0.3;
      camera.getWorldDirection(_worldDirection.current);
      _horizontalDirection.current.copy(_worldDirection.current).setY(0).normalize();
      const finalPosX = characterPos[0] + _horizontalDirection.current.x * eyeForwardOffset;
      const finalPosY = characterPos[1] + headHeight;
      const finalPosZ = characterPos[2] + _horizontalDirection.current.z * eyeForwardOffset;
      camera.position.set(finalPosX, finalPosY, finalPosZ);
    }
  }, [camera, playerRef, cameraMode]);

  /**
   * 更新体力值。冲刺时消耗，停止时恢复。
   * @param {number} deltaTime - 帧间隔时间。
   */
  const updateStamina = useCallback(
    (deltaTime) => {
      const consumptionRate = 12;
      const recoveryRate = 5;
      if (isSprinting) {
        setStamina((prev) => {
          const newStamina = Math.max(0, prev - consumptionRate * deltaTime);
          if (newStamina <= 0 && !staminaExhausted) {
            setStaminaExhausted(true);
            setIsSprinting(false);
            setTargetFov(70);
          }
          setPlayerStamina(newStamina);
          return newStamina;
        });
      } else {
        setStamina((prev) => {
          const newStamina = Math.min(100, prev + recoveryRate * deltaTime);
          if (staminaExhausted && newStamina > 30) {
            setStaminaExhausted(false);
          }
          setPlayerStamina(newStamina);
          return newStamina;
        });
      }
    },
    [isSprinting, staminaExhausted, setPlayerStamina]
  );

  /**
   * 主更新循環 - 優化版本
   * 確保在 MilkPlayer 更新完成後執行
   */
  useFrame((state, deltaTime) => {
    if (!enabled || !playerRef?.current) return;
    const clampedDelta = Math.min(deltaTime, PERFORMANCE_CONFIG.MAX_DELTA_TIME);

    // 優化：批量處理更新，減少函數調用
    updateFOV(clampedDelta);
    updateStamina(clampedDelta);

    // Smooth transition handling
    // Force first-person in maze
    const sceneName = useGameStore.getState().scene.currentScene;
    if (sceneName === 'maze' && cameraMode !== 'first') {
      setCameraMode('first');
    }

    if (cameraTransition.current.active) {
      cameraTransition.current.elapsed += clampedDelta;
      const tRaw = Math.min(1, cameraTransition.current.elapsed / cameraTransition.current.duration);
      // easeInOutCubic
      const t = tRaw < 0.5 ? 4 * tRaw * tRaw * tRaw : 1 - Math.pow(-2 * tRaw + 2, 3) / 2;
      camera.position.lerpVectors(cameraTransition.current.startPos, cameraTransition.current.targetPos, t);
      camera.quaternion.slerpQuaternions(cameraTransition.current.startQuat, cameraTransition.current.targetQuat, t);
      if (tRaw >= 1) cameraTransition.current.active = false;
    } else {
      // Normal per-mode updates
      if (cameraMode === "first") {
        updateFirstPersonCamera();
      } else if (cameraMode === "third") {
        updateThirdPersonCamera();
      } else if (cameraMode === "free") {
        updateFreeCamera(clampedDelta);
      } else if (cameraMode === "spectate") {
        // 保持相機固定在錨點（首次進入時已記錄），不進行更新
        if (spectateAnchor.current) {
          camera.position.copy(spectateAnchor.current.position);
          camera.quaternion.copy(spectateAnchor.current.quaternion);
        }
      }
    }

    // Determine current movement state
    let currentlyMoving = keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD;
    let currentlyRunning = isSprinting && !staminaExhausted;
    let currentlyJumping = keys.Space;

    if (cameraMode === "free") {
      // 自由相機下，玩家不動
      currentlyMoving = false;
      currentlyRunning = false;
      currentlyJumping = false;
    }

    setPlayerMovementState({
      isMoving: currentlyMoving,
      isRunning: currentlyRunning,
      isJumping: currentlyJumping,
      isSprinting,
      isWalking,
    });

    // Pass input and camera direction to the player component for physics calculation
    if (playerRef.current && playerRef.current.updateMovement) {
      camera.getWorldDirection(_worldDirection.current);

      // 計算相機到角色的距離，用於智能頭部顯示控制
      const characterPos = playerRef.current.position;
      let cameraToPlayerDistance = 1.0; // 默認距離
      if (characterPos && Array.isArray(characterPos)) {
        _characterPosition.current.fromArray(characterPos);
        cameraToPlayerDistance = camera.position.distanceTo(_characterPosition.current);
      }

      if (cameraMode === "free") {
        playerRef.current.updateMovement({
          keys: {},
          cameraDirection: _worldDirection.current,
          cameraMode: "free", // 保持頭部可見
          cameraToPlayerDistance,
        });
      } else if (cameraMode === "spectate") {
        playerRef.current.updateMovement({
          keys,
          cameraDirection: _worldDirection.current,
          cameraMode: "third", // 鏡頭固定但角色可動，保持頭部可見
          cameraToPlayerDistance,
        });
      } else {
        playerRef.current.updateMovement({
          keys,
          cameraDirection: _worldDirection.current,
          cameraMode, // 传递相机模式信息
          cameraToPlayerDistance, // 傳遞相機距離
        });
      }
    }
  }, 1); // 設置較低的優先級，確保在 MilkPlayer 之後執行

  // --- Event Handlers and Effects ---

  const handleKeyDown = useCallback(
    (event) => {
      setKeys((prev) => ({...prev, [event.code]: true}));

      // 對於功能鍵，檢查是否已經處理過（防止長按重複觸發）
      const functionalKeys = ["ControlLeft", "KeyV"];
      if (functionalKeys.includes(event.code)) {
        if (processedKeys.current.has(event.code)) {
          return; // 已經處理過，忽略重複觸發
        }
        processedKeys.current.add(event.code);
      }

      // Maze scene: force first-person and disable toggles
      const sceneName = useGameStore.getState().scene.currentScene;
      switch (event.code) {
        case "ShiftLeft":
          // 在自由相機下不影響FOV與衝刺狀態
          if (cameraMode !== "free" && !isSprinting && !isWalking && !staminaExhausted) {
            setIsSprinting(true);
            setTargetFov(80);
          }
          break;
        case "ControlLeft":
          if (sceneName === 'maze') {
            // disable Ctrl toggle in maze
            break;
          }
          if (cameraMode === "free" || cameraMode === "spectate") {
            setCameraMode("third");
          } else if (cameraMode === "first") {
            beginCameraTransition("third");
          } else if (cameraMode === "third") {
            beginCameraTransition("first");
          }
          break;
        case "KeyV": {
          // 循環： (first|third) -> free -> spectate -> first
          if (sceneName === 'maze') {
            // disable free/spectate cycle in maze
            break;
          }
          if (cameraMode === "first" || cameraMode === "third") {
            // 進入自由相機，對齊當前相機
            freeCam.current.position.copy(camera.position);
            freeCam.current.velocity.set(0, 0, 0);
            setCameraMode("free");
          } else if (cameraMode === "free") {
            // 進入觀戰（鏡頭固定）
            spectateAnchor.current.position.copy(camera.position);
            spectateAnchor.current.quaternion.copy(camera.quaternion);
            setCameraMode("spectate");
          } else if (cameraMode === "spectate") {
            // 返回第一人稱
            setCameraMode("first");
          }
          break;
        }
      }
    },
    [cameraMode, isSprinting, isWalking, staminaExhausted, camera]
  );

  const handleKeyUp = useCallback(
    (event) => {
      setKeys((prev) => ({...prev, [event.code]: false}));

      // 清除功能鍵的防抖狀態，允許下次按下時重新觸發
      const functionalKeys = ["ControlLeft", "KeyV"];
      if (functionalKeys.includes(event.code)) {
        processedKeys.current.delete(event.code);
      }

      if (event.code === "ShiftLeft") {
        setIsSprinting(false);
        // 自由相機下不使用FOV變化
        if (!isWalking && cameraMode !== "free") setTargetFov(70);
      }
    },
    [isWalking, cameraMode]
  );

  const handleMouseMove = useCallback(
    (event) => {
      if (cameraMode === "third" && isLocked) {
        const {movementX = 0, movementY = 0} = event;
        spherical.current.theta -= movementX * thirdPersonParams.rotationSpeed;
        spherical.current.phi -= movementY * thirdPersonParams.rotationSpeed;
        spherical.current.phi = THREE.MathUtils.clamp(spherical.current.phi, 0.1, Math.PI - 0.1);
      }
    },
    [cameraMode, isLocked, thirdPersonParams.rotationSpeed]
  );

  const handleWheel = useCallback(
    (event) => {
      if (cameraMode === "third") {
        event.preventDefault();

        // 獲取當前距離並計算動態縮放速度
        const currentDistance = targetDistance.current;
        const dynamicZoomSpeed = calculateDynamicZoomSpeed(currentDistance);

        // 計算縮放增量，使用動態速度
        const zoomDelta = event.deltaY * 0.01 * dynamicZoomSpeed;

        // 更新目標距離
        targetDistance.current += zoomDelta;

        // 限制縮放範圍
        targetDistance.current = THREE.MathUtils.clamp(
          targetDistance.current,
          thirdPersonParams.minDistance,
          thirdPersonParams.maxDistance
        );
      }
    },
    [cameraMode, thirdPersonParams, calculateDynamicZoomSpeed]
  );

  const handleMouseDown = useCallback(
    (event) => {
      // 检查是否点击在canvas相关区域
      const isCanvasClick =
        event.target === gl.domElement ||
        gl.domElement.contains(event.target) ||
        event.target.classList?.contains("main-view-container") ||
        event.target.closest("canvas") === gl.domElement;

      // 检查是否是非canvas的UI元素（更通用的方法）
      const isUIElement =
        !isCanvasClick &&
        event.target.tagName !== "CANVAS" &&
        event.target !== gl.domElement &&
        !gl.domElement.contains(event.target);

      if (isUIElement) {
        return; // 让UI元素正常处理事件
      }

      // 点击canvas时主动获取焦点
      if (gl.domElement && gl.domElement.focus) {
        gl.domElement.focus();
      }

      // 阻止左键的默认锁定行为
      if (event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
      // 右键锁定指针
      if (event.button === 2) {
        event.preventDefault();
        // 使用我们的自定义锁定方法
        if (window.allowPointerLock) {
          window.allowPointerLock();
        }
      }
    },
    [gl.domElement]
  );

  const handleContextMenu = useCallback(
    (event) => {
      // 只在 canvas 元素上阻止右键菜单
      if (event.target === gl.domElement) {
        event.preventDefault();
      }
    },
    [gl.domElement]
  );

  // Effect to handle pointer lock/unlock events and hijack the lock method
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const onLock = () => {
      setIsLocked(true);
      setShowInstructions(false);
    };
    const onUnlock = () => {
      setIsLocked(false);
      // 只有在該模式從未顯示過說明時才顯示
      if (!shownInstructions.current.has(cameraMode)) {
        setShowInstructions(true);
        shownInstructions.current.add(cameraMode);
      }
    };

    // 劫持 PointerLockControls 的 lock 方法以实现右键锁定
    // 保存原始的 lock 方法
    const originalLock = controls.lock;
    let allowLock = false;

    // 重写 lock 方法，只有在我们允许的时候才执行
    controls.lock = function () {
      if (allowLock) {
        allowLock = false; // 重置标志
        return originalLock.call(this);
      }
      // 静默阻止未授权的锁定尝试（如左键点击）
    };

    // 更新我们的右键处理器
    const originalHandleMouseDown = handleMouseDown;

    controls.addEventListener("lock", onLock);
    controls.addEventListener("unlock", onUnlock);

    // 暴露允许锁定的方法
    window.allowPointerLock = () => {
      allowLock = true;
      controls.lock();
    };

    return () => {
      controls.removeEventListener("lock", onLock);
      controls.removeEventListener("unlock", onUnlock);
      // 恢复原始的 lock 方法
      controls.lock = originalLock;
      delete window.allowPointerLock;
    };
  }, [controlsRef, cameraMode]);

  // 優化：使用 useRef 存儲事件處理器，避免重複綁定
  const eventHandlersRef = useRef({
    handleKeyDown,
    handleKeyUp,
    handleMouseMove,
    handleWheel,
    handleMouseDown,
    handleContextMenu,
  });

  // 更新事件處理器引用
  useEffect(() => {
    eventHandlersRef.current = {
      handleKeyDown,
      handleKeyUp,
      handleMouseMove,
      handleWheel,
      handleMouseDown,
      handleContextMenu,
    };
  });

  // Effect to register all global event listeners - 優化版本
  useEffect(() => {
    if (!enabled) return;

    // 創建穩定的事件處理器包裝
    const stableHandlers = {
      keydown: (e) => eventHandlersRef.current.handleKeyDown(e),
      keyup: (e) => eventHandlersRef.current.handleKeyUp(e),
      mousemove: (e) => eventHandlersRef.current.handleMouseMove(e),
      wheel: (e) => eventHandlersRef.current.handleWheel(e),
      mousedown: (e) => eventHandlersRef.current.handleMouseDown(e),
      contextmenu: (e) => eventHandlersRef.current.handleContextMenu(e),
    };

    document.addEventListener("keydown", stableHandlers.keydown);
    document.addEventListener("keyup", stableHandlers.keyup);
    document.addEventListener("mousemove", stableHandlers.mousemove);
    document.addEventListener("wheel", stableHandlers.wheel, {passive: false});

    // 恢复全局事件监听以确保能捕获到事件
    document.addEventListener("mousedown", stableHandlers.mousedown, true); // 全局capture阶段
    gl.domElement.addEventListener("mousedown", stableHandlers.mousedown, true); // canvas capture阶段
    gl.domElement.addEventListener("contextmenu", stableHandlers.contextmenu);

    return () => {
      document.removeEventListener("keydown", stableHandlers.keydown);
      document.removeEventListener("keyup", stableHandlers.keyup);
      document.removeEventListener("mousemove", stableHandlers.mousemove);
      document.removeEventListener("wheel", stableHandlers.wheel);
      document.removeEventListener("mousedown", stableHandlers.mousedown, true);
      gl.domElement.removeEventListener("mousedown", stableHandlers.mousedown, true);
      gl.domElement.removeEventListener("contextmenu", stableHandlers.contextmenu);
    };
  }, [enabled, gl.domElement]); // 只依賴 enabled 和 gl.domElement

  // 初始化說明顯示和canvas焦点设置
  useEffect(() => {
    if (!shownInstructions.current.has("first")) {
      shownInstructions.current.add("first");
    }

    // 确保canvas可以接收焦点
    if (gl.domElement) {
      gl.domElement.tabIndex = 0; // 使canvas可以接收焦点
      gl.domElement.focus(); // 初始化时给canvas焦点
    }

    // 移除自动焦点恢复，保持自然的焦点行为
  }, [gl.domElement]);

  // Effect to manage the instruction UI element
  useEffect(() => {
    if (!enabled) return;
    const instructions = document.createElement("div");
    instructions.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:18px;text-align:center;background:rgba(0,0,0,0.7);padding:20px;border-radius:10px;z-index:1000;pointer-events:none;transition:opacity 0.3s ease, visibility 0.3s ease;visibility:hidden;`;
    document.body.appendChild(instructions);
    instructionsRef.current = instructions;
    return () => {
      if (instructions.parentNode) instructions.parentNode.removeChild(instructions);
      instructionsRef.current = null;
    };
  }, [enabled]);

  // Effect to update the content of the instruction UI
  useEffect(() => {
    const instructions = instructionsRef.current;
    if (!instructions) return;
    if (showInstructions) {
      const hasHeadBone = playerRef?.current?.hasHeadBone?.() || false;
      const headBoneStatus = hasHeadBone ? "✓ 头部骨骼追踪" : "○ 估算位置";
      const headVisibilityStatus = cameraMode === "first" ? "头部已隐藏" : "头部可见";
      const commonControls = `<div style=\"font-size: 14px; margin-top: 10px;\">WASD - 移動<br>空白鍵 - 跳躍<br>Shift - 衝刺<br>Ctrl - 切換視角 (自由相機/觀戰下返回第三人稱)<br>V - 自由相機循環: 自由相機 → 鏡頭固定 → 第一人稱<br>Z - 坐下/起立<br>X - 椅子坐下<br>C - 蹲下</div>`;
      if (cameraMode === "first") {
        instructions.innerHTML = `<div>右鍵點擊以鎖定游標</div><div style=\"font-size: 12px; color: #aaa;\">${headBoneStatus} | ${headVisibilityStatus}</div>${commonControls}`;
      } else if (cameraMode === "third") {
        instructions.innerHTML = `<div>右鍵點擊以鎖定游標 (第三人稱)</div><div style=\"font-size: 14px; margin-top: 10px;\">滑鼠 - 旋轉視角<br>滾輪 - 平滑縮放</div>${commonControls}`;
      } else if (cameraMode === "free") {
        instructions.innerHTML = `<div>自由相機</div><div style=\"font-size: 14px; margin-top: 10px;\">右鍵鎖定游標<br>滑鼠視角 (Yaw/Pitch)<br>WASD 移動，Shift 加速<br>V 切換下一階段，Ctrl 返回第三人稱</div>${commonControls}`;
      } else if (cameraMode === "spectate") {
        instructions.innerHTML = `<div>鏡頭固定 (觀戰)</div><div style=\"font-size: 14px; margin-top: 10px;\">鏡頭固定，角色可移動<br>V 返回第一人稱，Ctrl 返回第三人稱</div>${commonControls}`;
      }
      instructions.style.visibility = "visible";
      instructions.style.opacity = "1";
    } else {
      instructions.style.visibility = "hidden";
      instructions.style.opacity = "0";
    }
  }, [showInstructions, cameraMode, enabled, playerRef]);

  return (
    <>
      <PointerLockControls
        ref={controlsRef}
        args={[camera, gl.domElement]}
        enabled={true}
        pointerSpeed={cameraMode === "first" || cameraMode === "free" ? 1.0 : 0}
        minPolarAngle={0.01}
        maxPolarAngle={Math.PI - 0.01}
      />
    </>
  );
}

export default CameraController;
