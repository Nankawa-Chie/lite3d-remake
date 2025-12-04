import {useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import {RigidBody, CapsuleCollider, useRapier} from "@react-three/rapier";
import {useGLTF, useAnimations} from "@react-three/drei";
import * as THREE from "three";
import poolManager from "../../utils/ObjectPool";

// 定义玩家所有可能的状态，便于管理和切换
const PLAYER_STATES = {
  IDLE: "idle",
  WALKING: "walking",
  RUNNING: "running",
  JUMPING: "jumping",
  FALLING: "falling",
  CROUCHING: "crouching", // 蹲下状态，按住C键触发
  SITTING: "sitting", // 坐下状态，按Z键切换
  SITTING_WITH_CHAIR: "sitting_with_chair", // 椅子坐下状态，按X键切换
  LANDING: "landing",
  DODGING: "dodging",
};

// 统一管理玩家的物理参数，便于调试和迭代
const PHYSICS_CONFIG = {
  walkForce: 25, // 行走时的施加力
  runForce: 35, // 奔跑时的施加力
  crouchForce: 15, // 蹲下时的施加力 (减速0.6倍)
  airControlForce: 8, // 空中控制力
  jumpImpulse: 6, // 瞬间跳跃冲量
  dodgeImpulse: 12, // 闪避冲量
  dodgeDuration: 0.3, // 闪避动作持续时间 (秒)
  dodgeCooldown: 0.5, // 闪避冷却时间 (秒)
  groundRayDistance: 0.2, // **[關鍵修正 1]**: 缩短射线检测距离，使其更精确
  groundDamping: 0.15, // 在地面上停止时的速度衰减因子
  stopThreshold: 0.1, // 低于此速度阈值时视为停止
  maxWalkSpeed: 4, // 最大行走速度
  maxRunSpeed: 12, // 最大奔跑速度
  maxCrouchSpeed: 2.4, // 最大蹲下速度 (行走速度的0.6倍)
  maxAirSpeed: 6, // 最大空中速度
  turningDrag: 25, // 转向时施加的反向力，以增加操控感
  // **[地形稳定性]**: 防止高分辨率地形上的微小抖动
  verticalVelocityThreshold: 1.5, // 垂直速度阈值，小于此值不认为是真正的下落
  groundedMinDuration: 0.08, // 最小接地持续时间，防止瞬间离地触发下落
  verticalDampingOnGround: 0.3, // 接地时的垂直速度阻尼系数
};

// Player collider parameters (Capsule)
const CAPSULE_HALF_HEIGHT = 0.8; // matches <CapsuleCollider args={[0.8, 0.4]}>
const CAPSULE_RADIUS = 0.4;
const CAPSULE_BOTTOM = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

/**
 * @name MilkPlayer
 * @description 核心玩家角色组件。
 * 这是一个功能完备的角色控制器，集成了物理、动画和状态管理。
 * - 物理: 使用 `@react-three/cannon` 的 `useSphere` 创建胶囊状物理体。
 * - 动画: 使用 `@react-three/drei` 的 `useAnimations` 来控制 GLB 模型中嵌入的动画。
 * - 状态机: 内部维护一个简单的状态机 (PLAYER_STATES) 来切换不同的动画和行为。
 * - 输入: 通过 `useImperativeHandle` 暴露 `updateMovement` 方法，接收来自 CameraController 的输入。
 * - 移动: 实现了一套基于力的物理移动逻辑，包括行走、奔跑、跳跃、空中控制和闪避。
 *
 * @param {object} props - 组件属性
 * @param {Array<THREE.Object3D>} [props.colliders=[]] - 一个可选的碰撞体对象数组，用于地面检测。
 * @param {React.Ref} ref - forwardRef 引用，用于父组件访问此组件的内部方法和属性。
 * @returns {JSX.Element}
 */
const MilkPlayer = forwardRef(({colliders = []}, ref) => {
  // --- Refs for THREE.js objects and state ---
  const groupRef = useRef(); // For the entire player group (visual model)
  const modelRef = useRef(); // For the GLB model itself
  const {scene, camera} = useThree();

  // --- State Management ---
  const [playerState, setPlayerState] = useState(PLAYER_STATES.IDLE);
  const [inputState, setInputState] = useState({}); // Local keyboard state for debugging
  const [isSitting, setIsSitting] = useState(false); // 跟踪坐下状态的切换
  const [isSittingWithChair, setIsSittingWithChair] = useState(false); // 跟踪椅子坐下状态的切换

  // --- 使用 useRef 来存储最新的状态值，供 getCurrentState 使用 ---
  const isSittingRef = useRef(false);
  const isSittingWithChairRef = useRef(false);

  // --- Physics Setup (Rapier) ---
  const rigidRef = useRef(null);
  // Rapier collider ref for self-exclusion in raycasts
  const colliderRef = useRef(null);

  // Refs to store physics data without causing re-renders
  const velocity = useRef([0, 0, 0]);
  const position = useRef([0, 2, 0]);
  const isGrounded = useRef(false);
  const canJump = useRef(true);

  // --- Animation Setup ---
  const gltf = useGLTF("src/assets/models/Milk.glb");
  const {actions, mixer} = useAnimations(gltf.animations, modelRef);
  const currentAction = useRef("idle");

  // --- Input and Movement ---
  const externalInput = useRef({
    keys: {},
    cameraDirection: new THREE.Vector3(),
    cameraMode: "first", // 相机模式：'first' 或 'third'
    cameraToPlayerDistance: 1.0, // 相機到角色的距離
  });
  const moveDirection = useRef(new THREE.Vector3());

  // --- Timers for Actions ---
  const landingTimer = useRef(0);
  const dodgeTimer = useRef(0);
  const dodgeCooldownTimer = useRef(0);
  // **[關鍵修正 2]**: 引入一个跳跃锁计时器，防止刚跳起就错误地检测到地面
  const jumpLockTimer = useRef(0);
  const coyoteTimer = useRef(0); // 短暫離地允許跳躍
  const hasCoyoteJumped = useRef(false); // 土狼時間內是否已經使用過一次跳躍
  const jumpStateTimer = useRef(0); // 起跳後至少維持一段時間的跳躍/下落狀態，避免動畫抖動
  const hasLeftGroundSinceJump = useRef(false); // 自起跳後是否曾經離地
  const prevGrounded = useRef(false);
  // **[地形稳定性]**: 接地持续时间跟踪
  const groundedDuration = useRef(0); // 持续接地的时间
  const lastVerticalVelocity = useRef(0); // 上一帧的垂直速度

  // --- Key Press Tracking ---
  const previousKeys = useRef({}); // 用于检测按键的按下和释放

  // --- Head Bone Tracking ---
  const headBoneRef = useRef(null); // 头部骨骼引用
  const headWorldPosition = useRef(new THREE.Vector3()); // 头部世界坐标
  const smoothedHeadPosition = useRef(new THREE.Vector3()); // 平滑后的头部位置
  const lastHeadPosition = useRef(new THREE.Vector3()); // 上一帧的头部位置

  // --- Head Mesh Visibility ---
  const headMeshes = useRef([]); // 头部相关的网格引用

  // --- Chair System ---
  const chairRef = useRef(); // 椅子对象引用
  const chairAnimationProgress = useRef(0); // 椅子动画进度 (0-1)
  const chairTargetProgress = useRef(0); // 椅子目标进度
  const chairGltf = useGLTF("src/assets/models/plastic_chair.glb"); // 加载椅子模型

  // --- Camera Offset Smoothing ---
  const currentVerticalOffset = useRef(0); // 当前垂直偏移
  const currentForwardOffset = useRef(-0.05); // 当前前向偏移

  // --- Ground Check ---
  const raycaster = useRef(new THREE.Raycaster());
  const rayDirection = useRef(new THREE.Vector3(0, -1, 0));

  // Rapier world access
  const {rapier, world} = useRapier();

  // --- Reusable vectors for performance (優化：添加更多緩存向量) ---
  const _forward = useRef(new THREE.Vector3());
  const _right = useRef(new THREE.Vector3());
  const _currentVelocity = useRef(new THREE.Vector3());
  const _turnVel = useRef(new THREE.Vector3());
  const _tempVector = useRef(new THREE.Vector3()); // 通用臨時向量
  const _groundCheckOrigin = useRef(new THREE.Vector3()); // 地面檢測起點
  const _dodgeDirection = useRef(new THREE.Vector3()); // 閃避方向

  // --- 静止状态检测 ---
  const lastPosition = useRef([0, 0, 0]);
  const isStationary = useRef(false);
  const STATIONARY_THRESHOLD = 0.001; // 静止阈值

  // --- 使用 useCallback 创建稳定的 getCurrentState 方法 ---
  const getCurrentState = useCallback(() => {
    // 使用 ref 值，因为它们是立即更新的
    if (isSittingWithChairRef.current) return PLAYER_STATES.SITTING_WITH_CHAIR;
    if (isSittingRef.current) return PLAYER_STATES.SITTING;
    return playerState;
  }, [playerState]);

  // ---Imperative Handle: Exposing API to Parent---
  useImperativeHandle(ref, () => ({
    physicsRef: rigidRef.current,
    get position() {
      return position.current;
    },
    get velocity() {
      return velocity.current;
    },
    api: undefined,
    updateMovement: (movementData) => {
      externalInput.current.keys = movementData.keys;
      externalInput.current.cameraDirection.copy(movementData.cameraDirection);
      externalInput.current.cameraMode = movementData.cameraMode || "first";
      externalInput.current.cameraToPlayerDistance = movementData.cameraToPlayerDistance || 1.0;
    },
    getRotation: () => (groupRef.current ? groupRef.current.rotation.y : 0),
    /**
     * @description 获取头部骨骼的世界坐标位置（带平滑处理和动态偏移）
     * @returns {THREE.Vector3|null} 头部的世界坐标，如果没有找到头部骨骼则返回null
     */
    getHeadWorldPosition: () => {
      if (headBoneRef.current && groupRef.current) {
        // 更新头部骨骼的世界矩阵
        headBoneRef.current.updateMatrixWorld(true);
        // 获取原始世界坐标
        headWorldPosition.current.setFromMatrixPosition(headBoneRef.current.matrixWorld);

        // 基于移动速度和状态计算目标偏移量
        const horizontalSpeed = Math.sqrt(velocity.current[0] ** 2 + velocity.current[2] ** 2);
        const normalizedSpeed = Math.min(horizontalSpeed / PHYSICS_CONFIG.maxRunSpeed, 1.0);

        // 统一的基础偏移量
        let targetVerticalOffset = 0.03; // 基础垂直偏移
        let targetForwardOffset = -0.05; // 基础前向偏移

        // 基于移动速度的动态调整（平滑变化）
        const speedBasedForwardOffset = normalizedSpeed * -0.35; // 速度越快，向后偏移越多
        const speedBasedVerticalOffset = normalizedSpeed * 0.01; // 速度越快，稍微向上偏移

        // 根据特殊状态进行微调（保持较小的差异）
        switch (playerState) {
          case PLAYER_STATES.CROUCHING:
            // 蹲下时稍微降低
            targetVerticalOffset -= 0.01;
            break;
          case PLAYER_STATES.SITTING:
            // 坐下时稍微调整
            targetVerticalOffset += 0.005;
            targetForwardOffset -= 0.01;
            break;
          case PLAYER_STATES.JUMPING:
          case PLAYER_STATES.FALLING:
            // 跳跃时增加稳定性，但不要太大
            targetVerticalOffset += 0.02;
            targetForwardOffset -= 0.01;
            break;
        }

        // 应用速度基础的动态偏移
        targetForwardOffset += speedBasedForwardOffset;
        targetVerticalOffset += speedBasedVerticalOffset;

        // 平滑过渡到目标偏移量，避免突然变化
        const offsetSmoothingFactor = 0.1; // 偏移量变化的平滑系数
        currentVerticalOffset.current = THREE.MathUtils.lerp(
          currentVerticalOffset.current,
          targetVerticalOffset,
          offsetSmoothingFactor
        );
        currentForwardOffset.current = THREE.MathUtils.lerp(
          currentForwardOffset.current,
          targetForwardOffset,
          offsetSmoothingFactor
        );

        // 应用平滑后的偏移
        const adjustedPosition = headWorldPosition.current.clone();
        adjustedPosition.y += currentVerticalOffset.current;

        // 向前偏移（基于角色朝向）
        if (groupRef.current) {
          const forward = new THREE.Vector3(0, 0, -1);
          forward.applyQuaternion(groupRef.current.quaternion);
          adjustedPosition.add(forward.multiplyScalar(currentForwardOffset.current));
        }

        // 平滑处理，减少剧烈摆动
        const smoothingFactor = 0.85; // 平滑系数，越接近1越平滑
        if (lastHeadPosition.current.length() > 0) {
          smoothedHeadPosition.current.lerpVectors(lastHeadPosition.current, adjustedPosition, 1 - smoothingFactor);
        } else {
          smoothedHeadPosition.current.copy(adjustedPosition);
        }

        lastHeadPosition.current.copy(adjustedPosition);
        return smoothedHeadPosition.current.clone();
      }
      return null;
    },
    /**
     * @description 检查是否有有效的头部骨骼
     * @returns {boolean}
     */
    hasHeadBone: () => !!headBoneRef.current,
    /**
     * @description 设置头部网格的可见性
     * @param {boolean} visible - 是否显示头部
     */
    setHeadVisibility: (visible) => {
      headMeshes.current.forEach((mesh) => {
        mesh.visible = visible;
      });
    },
    /**
     * @description 获取当前玩家状态
     * @returns {string} 当前的玩家状态
     */
    getCurrentState,
    /**
     * @description 设置角色位置（用于角色切换时保持位置）
     * @param {Array<number>} newPosition - 新位置 [x, y, z]
     */
    setPosition: (newPosition) => {
      if (rigidRef.current) {
        rigidRef.current.setTranslation({x: newPosition[0], y: newPosition[1], z: newPosition[2]}, true);
        position.current = [...newPosition];
      }
    },
    /**
     * @description 获取当前角色位置
     * @returns {Array<number>} 当前位置 [x, y, z]
     */
    getPosition: () => {
      console.log("MilkPlayer getPosition called, position.current:", position.current);
      return [...position.current];
    },
  }));

  // --- Effects ---

  // Rapier: we will sample translation and linvel inside useFrame to keep refs up to date.

  // Set up local keyboard listeners (primarily for debugging)
  useEffect(() => {
    const handleKeyDown = (e) =>
      setInputState((s) => ({
        ...s,
        [e.code.replace("Key", "").toLowerCase()]: true,
        [e.code]: true,
      }));
    const handleKeyUp = (e) =>
      setInputState((s) => ({
        ...s,
        [e.code.replace("Key", "").toLowerCase()]: false,
        [e.code]: false,
      }));
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Play the 'idle' animation by default once actions are loaded
  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      const idleAction = actions["idle"] || actions["Idle"] || Object.values(actions)[0];
      if (idleAction) {
        idleAction.play();
        currentAction.current = "idle";
      }
    }
  }, [actions]);

  // 调试：分析模型结构（只在开发环境运行一次）
  useEffect(() => {
    if (!gltf.scene) return;

    console.log("=== MILK模型结构分析 ===");

    // 查找所有骨骼
    const allBones = [];
    const headRelatedBones = [];
    const debugHeadPatterns = ["head", "neck", "eye", "face", "skull"];

    gltf.scene.traverse((child) => {
      if (child.type === "Bone") {
        allBones.push({
          name: child.name,
          object: child,
          position: child.position.clone(),
          worldPosition: new THREE.Vector3(),
        });

        // 检查是否是头部相关骨骼
        const name = child.name.toLowerCase();
        if (debugHeadPatterns.some((pattern) => name.includes(pattern))) {
          headRelatedBones.push({
            name: child.name,
            object: child,
            matchedPattern: debugHeadPatterns.find((pattern) => name.includes(pattern)),
          });
        }
      }
    });

    console.log(`找到 ${allBones.length} 个骨骼:`);
    allBones.forEach((bone, index) => {
      console.log(`  ${index + 1}: "${bone.name}"`);
    });

    if (headRelatedBones.length > 0) {
      console.log("\n头部相关骨骼:");
      headRelatedBones.forEach((bone) => {
        console.log(`  "${bone.name}" (匹配: ${bone.matchedPattern})`);
      });
    } else {
      console.log("\n未找到明显的头部相关骨骼");
    }

    // 查找SkinnedMesh
    const skinnedMeshes = [];
    gltf.scene.traverse((child) => {
      if (child.type === "SkinnedMesh") {
        skinnedMeshes.push(child);
      }
    });

    if (skinnedMeshes.length > 0) {
      console.log(`\n找到 ${skinnedMeshes.length} 个SkinnedMesh:`);
      skinnedMeshes.forEach((mesh, index) => {
        console.log(`  ${index + 1}: "${mesh.name}" (${mesh.skeleton?.bones.length || 0} 骨骼)`);
      });
    }

    // 动画信息
    console.log(`\n动画列表 (${gltf.animations?.length || 0} 个):`);
    gltf.animations?.forEach((anim, index) => {
      console.log(`  ${index + 1}: "${anim.name}"`);
    });

    console.log("=== 分析完成 ===\n");

    // 将骨骼信息存储到组件引用中，供后续使用
    if (modelRef.current) {
      modelRef.current.userData.allBones = allBones;
      modelRef.current.userData.headRelatedBones = headRelatedBones;
    }

    // 查找并缓存头部骨骼引用
    let foundHeadBone = null;

    // 按优先级定义头部骨骼搜索策略
    const headBonePriorities = [
      "ValveBiped.forward", // 最优：视线方向骨骼
      "ValveBiped.Bip01_Head1", // 次优：头部骨骼
      "ValveBipedBip01_Head1", // 备选：头部骨骼（可能的命名变体）
      "ValveBipedBip01_Neck1", // 备选：脖子骨骼
    ];

    // 从SkinnedMesh的骨骼系统中查找头部骨骼
    gltf.scene.traverse((child) => {
      if (child.type === "SkinnedMesh" && child.skeleton && child.skeleton.bones && !foundHeadBone) {
        console.log(`检查SkinnedMesh "${child.name}" 的骨骼系统...`);

        // 按优先级查找骨骼
        for (const targetBoneName of headBonePriorities) {
          const bone = child.skeleton.bones.find((b) => b.name === targetBoneName);
          if (bone) {
            foundHeadBone = bone;
            console.log(`  ✓ 找到优先级骨骼: "${bone.name}"`);
            break;
          }
        }

        // 如果没找到优先级骨骼，使用模糊匹配
        if (!foundHeadBone) {
          const fallbackPatterns = ["forward", "head", "Head", "HEAD"];
          child.skeleton.bones.forEach((bone, index) => {
            const boneName = bone.name.toLowerCase();
            if (!foundHeadBone && fallbackPatterns.some((pattern) => boneName.includes(pattern.toLowerCase()))) {
              foundHeadBone = bone;
              console.log(`  找到备选头部骨骼: "${bone.name}" (索引: ${index})`);
            }
          });
        }

        // 调试：如果是head_1且还没找到，打印所有包含关键词的骨骼
        if (!foundHeadBone && child.name === "head_1") {
          console.log("  未找到目标骨骼，相关骨骼列表:");
          child.skeleton.bones.forEach((bone, index) => {
            const name = bone.name.toLowerCase();
            if (name.includes("head") || name.includes("neck") || name.includes("forward") || name.includes("bip01")) {
              console.log(`    ${index}: "${bone.name}"`);
            }
          });
        }
      }
    });

    if (foundHeadBone) {
      headBoneRef.current = foundHeadBone;
      console.log(`✓ 成功绑定头部骨骼: "${foundHeadBone.name}"`);

      // 尝试查找forward子骨骼
      if (foundHeadBone.children && foundHeadBone.children.length > 0) {
        console.log(`  检查 "${foundHeadBone.name}" 的子骨骼:`);
        foundHeadBone.children.forEach((child, index) => {
          console.log(`    ${index}: "${child.name}" (类型: ${child.type})`);
          if (child.name.toLowerCase().includes("forward")) {
            headBoneRef.current = child;
            console.log(`  ✓ 切换到更精确的forward骨骼: "${child.name}"`);
          }
        });
      }
    } else {
      console.warn("⚠ 未找到头部相关骨骼，将使用估算位置");
    }

    // 收集头部相关的网格，用于第一人称时隐藏
    const headMeshNames = ["head_1", "head_2", "hair_1", "hair_2", "hair_3"];
    const foundHeadMeshes = [];

    // 查找可能的颈部网格名称
    const neckMeshNames = ["neck", "Neck", "NECK"];

    gltf.scene.traverse((child) => {
      if (child.type === "SkinnedMesh") {
        // 检查头部网格
        if (headMeshNames.includes(child.name)) {
          foundHeadMeshes.push(child);
          console.log(`找到头部网格: "${child.name}"`);
        }
        // 检查颈部网格
        else if (neckMeshNames.includes(child.name)) {
          foundHeadMeshes.push(child);
          console.log(`找到颈部网格: "${child.name}"`);
        }
        // 检查名称中包含颈部关键词的网格
        else if (neckMeshNames.some((pattern) => child.name.toLowerCase().includes(pattern.toLowerCase()))) {
          foundHeadMeshes.push(child);
          console.log(`找到颈部相关网格: "${child.name}"`);
        }
      }
    });

    headMeshes.current = foundHeadMeshes;
    console.log(`总共找到 ${foundHeadMeshes.length} 个头部/颈部网格`);
  }, [gltf]);

  // Animation state machine: fade between animations when playerState changes
  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;
    let newAction = "idle";
    switch (playerState) {
      case PLAYER_STATES.IDLE:
        newAction = "idle";
        break;
      case PLAYER_STATES.WALKING:
        newAction = "walk";
        break;
      case PLAYER_STATES.RUNNING:
        newAction = "run";
        break;
      case PLAYER_STATES.JUMPING:
      case PLAYER_STATES.FALLING:
        newAction = "jump";
        break;
      case PLAYER_STATES.CROUCHING:
        newAction = "crouch";
        break;
      case PLAYER_STATES.SITTING:
        newAction = "sit";
        break;
      case PLAYER_STATES.SITTING_WITH_CHAIR:
        newAction = "sit"; // 使用相同的坐下动画
        break;
      case PLAYER_STATES.DODGING:
        newAction = "dodge";
        break;
      default:
        newAction = "idle";
    }
    if (newAction !== currentAction.current) {
      const newAnim = actions[newAction] || actions[newAction.charAt(0).toUpperCase() + newAction.slice(1)];
      if (newAnim) {
        const currentAnim =
          actions[currentAction.current] ||
          actions[currentAction.current?.charAt(0)?.toUpperCase() + currentAction.current?.slice(1)];
        if (currentAnim) currentAnim.fadeOut(0.2);
        newAnim.reset().fadeIn(0.2).play();
        currentAction.current = newAction;
      } else {
        // 目標動畫不存在時，不再對當前動畫做 fadeOut，避免抽搐
        // 可在此記錄一次可用動畫列表，方便對齊命名
        // console.debug('[MilkPlayer] Missing animation clip for', newAction, Object.keys(actions||{}));
      }
    }
  }, [playerState, actions]);

  /**
   * @description 高效地执行向下的射线检测，以判断玩家是否在地面上。
   * **[性能優化]**: 使用更精确的、基于胶囊体尺寸的射线检测，避免复杂Three.js raycasting
   * @returns {{isGrounded: boolean}} 一个包含地面状态的对象。
   */
  const performGroundCheck = () => {
    if (!world || !rigidRef.current) return {isGrounded: false};

    const t = rigidRef.current.translation();
    if (!t) return {isGrounded: false};

    // 射线起点：胶囊体底部半球的中心，稍微向上偏移一点以避免起始点在地面内部
    const origin = {x: t.x, y: t.y - CAPSULE_HALF_HEIGHT + 0.1, z: t.z};
    const dir = {x: 0, y: -1, z: 0};
    // 射线长度：半径长度 + 配置文件中的一个小的容差
    const maxToi = CAPSULE_RADIUS + PHYSICS_CONFIG.groundRayDistance;

    try {
      const ray = new rapier.Ray(origin, dir);
      // 最后一个参数 `rigidRef.current` 是为了排除玩家自己
      // Exclude the player's own collider to avoid self-hits
      const exclude = colliderRef.current || undefined;
      const hit = world.castRay(ray, maxToi, true, undefined, undefined, exclude);
      return {isGrounded: !!hit};
    } catch (e) {
      // If rapier is not available for some reason, safely report not grounded
      return {isGrounded: false};
    }
  };

  /**
   * Updates the player's state based on input and environmental context (like being grounded).
   * This is the core of the player's state machine.
   * @param {object} input - The combined input state.
   * @param {{isGrounded: boolean}} groundInfo - The result from the ground check.
   */
  const updatePlayerState = (input, groundInfo) => {
    const hasMovementInput = input.KeyW || input.KeyS || input.KeyA || input.KeyD;
    const isRunning = input.ShiftLeft;
    const wantsToJump = !!input.JumpJustPressed;
    const wantsToDodge = input.KeyQ;
    const isCrouching = input.KeyC; // 按住C键蹲下

    // 检测Z键的按下（不是按住）来切换坐下状态
    const zKeyPressed = input.KeyZ && !previousKeys.current.KeyZ;
    if (zKeyPressed && groundInfo.isGrounded && (playerState === PLAYER_STATES.IDLE || playerState === PLAYER_STATES.SITTING)) {
      const newSittingState = !isSitting;
      setIsSitting(newSittingState);
      isSittingRef.current = newSittingState;
    }

    // 检测X键的按下（不是按住）来切换椅子坐下状态
    const xKeyPressed = input.KeyX && !previousKeys.current.KeyX;
    if (
      xKeyPressed &&
      groundInfo.isGrounded &&
      (playerState === PLAYER_STATES.IDLE || playerState === PLAYER_STATES.SITTING_WITH_CHAIR)
    ) {
      const newChairSittingState = !isSittingWithChair;
      setIsSittingWithChair(newChairSittingState);
      isSittingWithChairRef.current = newChairSittingState;
      // 设置椅子动画目标
      chairTargetProgress.current = isSittingWithChair ? 0 : 1;
    }

    // Dodge action takes precedence
    if (wantsToDodge && dodgeCooldownTimer.current <= 0 && playerState !== PLAYER_STATES.DODGING) {
      setPlayerState(PLAYER_STATES.DODGING);
      dodgeTimer.current = PHYSICS_CONFIG.dodgeDuration;
      dodgeCooldownTimer.current = PHYSICS_CONFIG.dodgeCooldown;
      // 優化：重用緩存向量，避免創建新對象
      if (moveDirection.current.lengthSq() > 0.01) {
        _dodgeDirection.current.copy(moveDirection.current);
      } else {
        _dodgeDirection.current.set(0, 0, -1).applyQuaternion(groupRef.current.quaternion);
      }
      if (rigidRef.current) {
        rigidRef.current.setLinvel({x: 0, y: 0, z: 0}, true);
        rigidRef.current.applyImpulse(
          {
            x: _dodgeDirection.current.x * PHYSICS_CONFIG.dodgeImpulse,
            y: 0,
            z: _dodgeDirection.current.z * PHYSICS_CONFIG.dodgeImpulse,
          },
          true
        );
      }
      return;
    }

    // State machine logic
    switch (playerState) {
      case PLAYER_STATES.IDLE:
        if (isSittingWithChair && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.SITTING_WITH_CHAIR);
        } else if (isSitting && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.SITTING);
        } else if (isCrouching && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.CROUCHING);
        } else if (wantsToJump && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.JUMPING);
          jumpLockTimer.current = 0.2; // **[關鍵修正 2]** 触发跳跃时，启动计时器
        } else if (hasMovementInput && groundInfo.isGrounded) {
          setPlayerState(isRunning ? PLAYER_STATES.RUNNING : PLAYER_STATES.WALKING);
        } else if (!groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.FALLING);
        }
        break;
      // ... (other states follow a similar pattern of transition logic)
      case PLAYER_STATES.SITTING:
        if (!isSitting) {
          setPlayerState(PLAYER_STATES.IDLE);
        } else if (hasMovementInput || wantsToJump || wantsToDodge) {
          // 如果在坐下状态时有任何移动输入，则退出坐下状态
          setIsSitting(false);
          setPlayerState(PLAYER_STATES.IDLE);
        }
        break;
      case PLAYER_STATES.SITTING_WITH_CHAIR:
        if (!isSittingWithChair) {
          setPlayerState(PLAYER_STATES.IDLE);
        } else if (hasMovementInput || wantsToJump || wantsToDodge) {
          // 如果在椅子坐下状态时有任何移动输入，则退出椅子坐下状态
          setIsSittingWithChair(false);
          chairTargetProgress.current = 0; // 开始椅子消失动画
          setPlayerState(PLAYER_STATES.IDLE);
        }
        break;
      case PLAYER_STATES.CROUCHING:
        if (!isCrouching) {
          setPlayerState(PLAYER_STATES.IDLE);
        } else if (wantsToJump && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.JUMPING);
          jumpLockTimer.current = 0.2; // **[關鍵修正 2]**
        } else if (!groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.FALLING);
        }
        break;
      case PLAYER_STATES.WALKING:
        if (isCrouching && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.CROUCHING);
        } else if (wantsToJump && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.JUMPING);
          jumpLockTimer.current = 0.2; // **[關鍵修正 2]**
        } else if (!hasMovementInput) {
          setPlayerState(PLAYER_STATES.IDLE);
        } else if (isRunning) {
          setPlayerState(PLAYER_STATES.RUNNING);
        } else if (!groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.FALLING);
        }
        break;
      case PLAYER_STATES.RUNNING:
        if (isCrouching && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.CROUCHING);
        } else if (wantsToJump && groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.JUMPING);
          jumpLockTimer.current = 0.2; // **[關鍵修正 2]**
        } else if (!hasMovementInput) {
          setPlayerState(PLAYER_STATES.IDLE);
        } else if (!isRunning) {
          setPlayerState(PLAYER_STATES.WALKING);
        } else if (!groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.FALLING);
        }
        break;
      case PLAYER_STATES.JUMPING:
        // 起跳後最少維持一段時間，避免動畫瞬間恢復
        if (jumpStateTimer.current > 0) {
          // 強制保持跳躍狀態
        } else if (velocity.current[1] <= 0) {
          setPlayerState(PLAYER_STATES.FALLING);
        }
        break;
      case PLAYER_STATES.FALLING:
        if (groundInfo.isGrounded) {
          setPlayerState(PLAYER_STATES.LANDING);
          landingTimer.current = 0.15; // Short landing state duration
        }
        break;
      case PLAYER_STATES.LANDING:
        if (landingTimer.current <= 0) {
          setPlayerState(hasMovementInput ? (isRunning ? PLAYER_STATES.RUNNING : PLAYER_STATES.WALKING) : PLAYER_STATES.IDLE);
        }
        break;
      case PLAYER_STATES.DODGING:
        if (dodgeTimer.current <= 0) {
          setPlayerState(PLAYER_STATES.IDLE);
          // Dampen velocity after dodge to prevent sliding
          if (rigidRef.current) {
            rigidRef.current.setLinvel(
              {x: velocity.current[0] * 0.1, y: velocity.current[1], z: velocity.current[2] * 0.1},
              true
            );
          }
        }
        break;
    }
  };

  /**
   * Applies forces to the physics body based on the current state and input.
   * @param {object} input - The combined input state.
   * @param {{isGrounded: boolean}} groundInfo - The result from the ground check.
   */
  const applyPhysicsBasedMovement = (input, groundInfo) => {
    if (
      playerState === PLAYER_STATES.DODGING ||
      playerState === PLAYER_STATES.SITTING ||
      playerState === PLAYER_STATES.SITTING_WITH_CHAIR
    )
      return; // No movement during dodge or sitting

    const hasAnyInput = input.KeyW || input.KeyS || input.KeyA || input.KeyD;
    moveDirection.current.set(0, 0, 0);

    // Calculate the desired movement direction based on camera orientation
    if (hasAnyInput) {
      _forward.current.set(externalInput.current.cameraDirection.x, 0, externalInput.current.cameraDirection.z).normalize();
      _right.current.crossVectors(camera.up, _forward.current).normalize();

      if (input.KeyW) moveDirection.current.add(_forward.current);
      if (input.KeyS) moveDirection.current.sub(_forward.current);
      if (input.KeyA) moveDirection.current.add(_right.current);
      if (input.KeyD) moveDirection.current.sub(_right.current);
      moveDirection.current.normalize();
    }

    _currentVelocity.current.set(velocity.current[0], 0, velocity.current[2]);

    if (groundInfo.isGrounded) {
      if (hasAnyInput) {
        let forceMultiplier, maxSpeed;
        if (playerState === PLAYER_STATES.CROUCHING) {
          forceMultiplier = PHYSICS_CONFIG.crouchForce;
          maxSpeed = PHYSICS_CONFIG.maxCrouchSpeed;
        } else if (playerState === PLAYER_STATES.RUNNING) {
          forceMultiplier = PHYSICS_CONFIG.runForce;
          maxSpeed = PHYSICS_CONFIG.maxRunSpeed;
        } else {
          forceMultiplier = PHYSICS_CONFIG.walkForce;
          maxSpeed = PHYSICS_CONFIG.maxWalkSpeed;
        }

        // Apply force for turning to make movement more responsive
        const projVel = _currentVelocity.current.dot(moveDirection.current);
        _turnVel.current.copy(moveDirection.current).multiplyScalar(projVel);
        const antiTurnVel = _currentVelocity.current.clone().sub(_turnVel.current);
        if (rigidRef.current) {
          rigidRef.current.applyImpulse(
            {
              x: -antiTurnVel.x * PHYSICS_CONFIG.turningDrag * 0.016,
              y: 0,
              z: -antiTurnVel.z * PHYSICS_CONFIG.turningDrag * 0.016,
            },
            true
          );
        }

        // Apply movement force only if below max speed
        if (rigidRef.current && _currentVelocity.current.length() < maxSpeed) {
          rigidRef.current.applyImpulse(
            {x: moveDirection.current.x * forceMultiplier * 0.016, y: 0, z: moveDirection.current.z * forceMultiplier * 0.016},
            true
          );
        }
      } else {
        // Apply ground damping when there's no input
        if (_currentVelocity.current.length() > PHYSICS_CONFIG.stopThreshold) {
          if (rigidRef.current) {
            rigidRef.current.setLinvel(
              {
                x: velocity.current[0] * PHYSICS_CONFIG.groundDamping,
                y: velocity.current[1],
                z: velocity.current[2] * PHYSICS_CONFIG.groundDamping,
              },
              true
            );
          }
        } else {
          if (rigidRef.current) {
            rigidRef.current.setLinvel({x: 0, y: velocity.current[1], z: 0}, true);
          }
        }
      }
    } else {
      // Apply air control force
      if (hasAnyInput && _currentVelocity.current.length() < PHYSICS_CONFIG.maxAirSpeed) {
        if (rigidRef.current) {
          rigidRef.current.applyImpulse(
            {
              x: moveDirection.current.x * PHYSICS_CONFIG.airControlForce * 0.016,
              y: 0,
              z: moveDirection.current.z * PHYSICS_CONFIG.airControlForce * 0.016,
            },
            true
          );
        }
      }
    }

    // Handle jumping
    const jumpJustPressed = !!input.JumpJustPressed;
    const isCoyoteActive = coyoteTimer.current > 0;
    const mayJump = canJump.current && (groundInfo.isGrounded || (isCoyoteActive && !hasCoyoteJumped.current));
    if (jumpJustPressed && mayJump) {
      // 在施加跳跃冲量前，先将垂直速度归零，确保每次跳跃的起始条件一致
      if (rigidRef.current) {
        // 垂直速度清零 + 水平速度限制，避免空中加速累加
        const horiz = Math.hypot(velocity.current[0], velocity.current[2]);
        const maxHoriz = PHYSICS_CONFIG.maxRunSpeed;
        const scale = horiz > maxHoriz ? maxHoriz / Math.max(horiz, 1e-5) : 1;
        rigidRef.current.setLinvel({x: velocity.current[0] * scale, y: 0, z: velocity.current[2] * scale}, true);
        rigidRef.current.applyImpulse({x: 0, y: PHYSICS_CONFIG.jumpImpulse, z: 0}, true);
      }
      // 起跳後鎖定接地判定一小段時間，並要求離地一次才允許落地
      jumpLockTimer.current = 0.12;
      jumpStateTimer.current = 0.18; // 至少維持 0.18s 的跳躍/下落狀態，保證動畫能播放
      hasLeftGroundSinceJump.current = false;

      if (isCoyoteActive) hasCoyoteJumped.current = true; // 土狼時間僅允許一次
      canJump.current = false; // Prevent double-jumping
    }
  };

  /**
   * Main update loop, called every frame.
   * 優化：重新排序執行順序，確保骨骼更新在相機讀取之前完成
   */
  useFrame((_, delta) => {
    if (!rigidRef.current || !groupRef.current) return;

    const clampedDelta = Math.min(delta, 1 / 60); // Prevent physics glitches with large delta

    // Update timers
    if (landingTimer.current > 0) landingTimer.current -= clampedDelta;
    if (jumpStateTimer.current > 0) jumpStateTimer.current -= clampedDelta;
    if (jumpLockTimer.current > 0) jumpLockTimer.current -= clampedDelta;
    if (dodgeTimer.current > 0) dodgeTimer.current -= clampedDelta;
    if (dodgeCooldownTimer.current > 0) dodgeCooldownTimer.current -= clampedDelta;

    // Update chair animation
    const chairAnimationSpeed = 3.0; // 椅子动画速度
    if (Math.abs(chairAnimationProgress.current - chairTargetProgress.current) > 0.01) {
      const direction = chairTargetProgress.current > chairAnimationProgress.current ? 1 : -1;
      chairAnimationProgress.current += direction * chairAnimationSpeed * clampedDelta;
      chairAnimationProgress.current = Math.max(0, Math.min(1, chairAnimationProgress.current));
    }

    // --- Core Logic Execution Order (優化版) ---
    // 0. 检测静止状态，优化不必要的计算
    const positionDelta =
      Math.abs(position.current[0] - lastPosition.current[0]) +
      Math.abs(position.current[1] - lastPosition.current[1]) +
      Math.abs(position.current[2] - lastPosition.current[2]);
    isStationary.current =
      positionDelta < STATIONARY_THRESHOLD &&
      Math.abs(velocity.current[0]) < STATIONARY_THRESHOLD &&
      Math.abs(velocity.current[2]) < STATIONARY_THRESHOLD;
    lastPosition.current = [...position.current];

    // 1. Check environment
    const groundInfoRaw = performGroundCheck();
    
    // **[地形稳定性]**: 增强的接地判定逻辑
    let isReallyGrounded = groundInfoRaw.isGrounded;
    
    // 如果跳跃锁定计时器激活，强制认为不在地面
    if (jumpLockTimer.current > 0) {
      isReallyGrounded = false;
    } else if (groundInfoRaw.isGrounded) {
      // 接地时，累积接地持续时间
      groundedDuration.current += clampedDelta;
      
      // **[关键]**: 在地面上时，主动抑制微小的垂直速度波动
      const currentVy = velocity.current[1];
      if (Math.abs(currentVy) < PHYSICS_CONFIG.verticalVelocityThreshold && 
          Math.abs(currentVy) < Math.abs(lastVerticalVelocity.current) * 2) {
        // 如果垂直速度很小且没有快速增长，应用强阻尼
        if (rigidRef.current) {
          const dampedVy = currentVy * PHYSICS_CONFIG.verticalDampingOnGround;
          rigidRef.current.setLinvel(
            { x: velocity.current[0], y: dampedVy, z: velocity.current[2] },
            true
          );
          velocity.current[1] = dampedVy;
        }
      }
      lastVerticalVelocity.current = currentVy;
    } else {
      // 离地时，检查是否是真正的离地还是微小抖动
      const wasRecentlyGrounded = groundedDuration.current > PHYSICS_CONFIG.groundedMinDuration;
      const hasSmallVerticalVelocity = Math.abs(velocity.current[1]) < PHYSICS_CONFIG.verticalVelocityThreshold;
      
      // 如果刚刚离地且垂直速度很小，继续认为在地面（宽容处理）
      if (wasRecentlyGrounded && hasSmallVerticalVelocity && coyoteTimer.current > 0) {
        isReallyGrounded = true;
      } else {
        groundedDuration.current = 0; // 重置接地持续时间
      }
    }
    
    isGrounded.current = isReallyGrounded;

    if (isReallyGrounded) {
      // 真的接地：恢復可跳與土狼窗口，重置一次性標記
      canJump.current = true;
      coyoteTimer.current = 0.12;
      hasCoyoteJumped.current = false;
      // 若自起跳後已離地過且維持時間結束，觸發落地
      if (
        (playerState === PLAYER_STATES.JUMPING || playerState === PLAYER_STATES.FALLING) &&
        hasLeftGroundSinceJump.current &&
        jumpStateTimer.current <= 0
      ) {
        setPlayerState(PLAYER_STATES.LANDING);
        landingTimer.current = 0.08;
      }
    } else {
      // 空中：標記已離地，土狼時間倒數
      hasLeftGroundSinceJump.current = true;
      if (coyoteTimer.current > 0) coyoteTimer.current -= clampedDelta;
      else canJump.current = false;
    }

    // 2. Update state based on input and environment (優化：減少對象創建)
    const combinedInput =
      externalInput.current.cameraMode === "free"
        ? {
            // 在自由相機模式下，忽略本地鍵盤輸入，完全不移動角色
            ...externalInput.current.keys,
            JumpJustPressed: false,
            KeyW: false,
            KeyA: false,
            KeyS: false,
            KeyD: false,
            ShiftLeft: false,
            Space: false,
            KeyQ: false,
            KeyE: false,
            KeyC: false,
            KeyZ: false,
            KeyX: false,
          }
        : {
            ...inputState,
            ...externalInput.current.keys,
            // 只在按鍵邊沿觸發
            JumpJustPressed:
              (!!externalInput.current.keys.Space && !previousKeys.current.Space) ||
              (!!inputState.Space && !previousKeys.current.Space),
          };
    updatePlayerState(combinedInput, {isGrounded: isReallyGrounded});

    // 更新按键状态跟踪：只更新會影響邊沿檢測的鍵（跳躍、坐下、椅子坐下）
    previousKeys.current.Space = !!combinedInput.Space;
    previousKeys.current.KeyZ = !!combinedInput.KeyZ;
    previousKeys.current.KeyX = !!combinedInput.KeyX;

    // 3. Apply physics based on the new state
    applyPhysicsBasedMovement(combinedInput, {isGrounded: isReallyGrounded});

    // 4. 读取 rapier 刚体的状态并同步到本地 refs 和可视模型
    if (rigidRef.current) {
      const t = rigidRef.current.translation();
      const v = rigidRef.current.linvel();
      position.current = [t.x, t.y, t.z];
      velocity.current = [v.x, v.y, v.z];
    }

    groupRef.current.position.set(position.current[0], position.current[1] - CAPSULE_BOTTOM, position.current[2]);

    // 5. 更新椅子位置和动画
    if (chairRef.current && chairAnimationProgress.current > 0) {
      // 1. 计算椅子的最终位置偏移量
      const chairOffset = new THREE.Vector3(-4, 0, -0.7);
      chairOffset.applyQuaternion(groupRef.current.quaternion);

      // 2. 定义动画的缓动进程
      const easeProgress = 1 - Math.pow(1 - chairAnimationProgress.current, 3); // easeOutCubic，效果更平滑

      // 3. 定义动画的起始位置和结束位置

      // 起始位置：在角色的正下方，Y轴很低
      const startPosition = new THREE.Vector3(
        position.current[0],
        position.current[1] - 2, // 从更低的位置开始
        position.current[2]
      );

      // 结束位置：在角色屁股后方（应用了偏移量）
      const finalPosition = new THREE.Vector3(
        position.current[0] + chairOffset.x,
        position.current[1] - 2.8, // 坐下的高度
        position.current[2] + chairOffset.z
      );

      // 4. 使用 lerp（线性插值）来计算当前帧的位置
      // chairRef.current.position 会从 startPosition 平滑过渡到 finalPosition
      chairRef.current.position.copy(startPosition).lerp(finalPosition, easeProgress);

      // 椅子朝向与角色相同
      chairRef.current.rotation.y = groupRef.current.rotation.y + Math.PI / 2;

      // 缩放动画
      chairRef.current.scale.setScalar(easeProgress);

      // 设置椅子可见性
      chairRef.current.visible = chairAnimationProgress.current > 0.01;

      // 透明度动画
      chairRef.current.traverse((child) => {
        if (child.material) {
          if (!child.material.transparent) {
            child.material.transparent = true;
          }
          child.material.opacity = easeProgress;
        }
      });
    } else if (chairRef.current) {
      chairRef.current.visible = false;
    }

    // 5. 更新模型旋转和可见性
    const isFirstPersonMode = externalInput.current.cameraMode === "first";

    // 控制头部网格可见性（优化：只在相机模式变化时更新）
    if (headMeshes.current.length > 0) {
      const shouldShowHead = !isFirstPersonMode;
      // 只在可见性需要改变时才更新
      if (headMeshes.current[0].visible !== shouldShowHead) {
        for (let i = 0; i < headMeshes.current.length; i++) {
          headMeshes.current[i].visible = shouldShowHead;
        }
      }
    }

    if (isFirstPersonMode) {
      // 第一人稱：直接設置旋轉，不使用平滑插值避免延遲
      const targetRotationY = Math.atan2(externalInput.current.cameraDirection.x, externalInput.current.cameraDirection.z);
      groupRef.current.rotation.y = targetRotationY;
    } else {
      // In third person, smoothly rotate the model towards the movement direction
      if (moveDirection.current.lengthSq() > 0.01 && playerState !== PLAYER_STATES.DODGING) {
        const targetRotationY = Math.atan2(moveDirection.current.x, moveDirection.current.z);
        let currentRotationY = groupRef.current.rotation.y;
        let deltaRotation = targetRotationY - currentRotationY;
        // Normalize the rotation delta to the shortest path
        while (deltaRotation > Math.PI) deltaRotation -= Math.PI * 2;
        while (deltaRotation < -Math.PI) deltaRotation += Math.PI * 2;
        groupRef.current.rotation.y += deltaRotation * 0.15; // Smooth interpolation
      }
    }

    // 6. 在位置和旋轉更新完成後，才更新動畫（优化：只在需要时更新）
    if (mixer && (!isStationary.current || playerState !== PLAYER_STATES.IDLE)) {
      mixer.update(clampedDelta);
    }

    // 7. **[關鍵修正 3]**: 实时动画控制，覆盖 state machine
    if (actions && Object.keys(actions).length > 0) {
      if (!isReallyGrounded) {
        const vy = velocity.current[1];
        if (vy > 0.1 && currentAction.current !== "jump" && actions.jump) {
          const oldAction = actions[currentAction.current];
          if (oldAction) oldAction.fadeOut(0.1);
          actions.jump.reset().fadeIn(0.1).play();
          currentAction.current = "jump";
        } else if (vy < -0.1 && currentAction.current !== "fall" && actions.fall) {
          const oldAction = actions[currentAction.current];
          if (oldAction) oldAction.fadeOut(0.1);
          actions.fall.reset().fadeIn(0.1).play();
          currentAction.current = "fall";
        }
      } else {
        // 当在地面上时，如果当前是空中动画，则切换回IDLE，让useEffect接管
        if ((currentAction.current === "jump" || currentAction.current === "fall") && actions.idle) {
          const oldAction = actions[currentAction.current];
          if (oldAction) oldAction.fadeOut(0.2);
          actions.idle.reset().fadeIn(0.2).play();
          currentAction.current = "idle";
        }
      }
    }

    // 7. 動畫速度調整 (優化：減少計算頻率)
    const currentHorizontalSpeed = Math.sqrt(velocity.current[0] ** 2 + velocity.current[2] ** 2);
    if (
      playerState === PLAYER_STATES.WALKING ||
      playerState === PLAYER_STATES.RUNNING ||
      playerState === PLAYER_STATES.CROUCHING
    ) {
      let baseSpeed;
      if (playerState === PLAYER_STATES.CROUCHING) {
        baseSpeed = PHYSICS_CONFIG.maxCrouchSpeed;
      } else if (playerState === PLAYER_STATES.RUNNING) {
        baseSpeed = PHYSICS_CONFIG.maxRunSpeed;
      } else {
        baseSpeed = PHYSICS_CONFIG.maxWalkSpeed;
      }
      // 優化：使用更快的插值和更少的計算
      const targetTimeScale = Math.max(0.4, Math.min(0.6, currentHorizontalSpeed / baseSpeed));
      mixer.timeScale += (targetTimeScale - mixer.timeScale) * 0.1; // 更快的插值
    } else {
      // Smoothly return to default animation speed for other states
      mixer.timeScale += (0.5 - mixer.timeScale) * 0.1;
    }

    // 幀結束時清理對象池，減少內存壓力
    poolManager.releaseAllPools();
  }, -1); // 設置較高的優先級，確保在相機更新之前執行

  return (
    <group>
      {/* Rapier rigid body with capsule collider */}
      <RigidBody
        ref={rigidRef}
        mass={1}
        colliders={false}
        enabledTranslations={[true, true, true]}
        enabledRotations={[false, false, false]}
        linearDamping={0.02}
        angularDamping={1.0}
      >
        {/* Capsule: height along Y, radius 0.4, height 0.8 approximates original sphere bottom alignment */}
        <CapsuleCollider ref={colliderRef} args={[0.8, 0.4]} friction={0} restitution={0} />
      </RigidBody>
      {/* Visible character model group */}
      <group ref={groupRef} castShadow receiveShadow>
        <primitive
          ref={modelRef}
          object={gltf.scene}
          scale={[0.03, 0.03, 0.03]}
          // Hide model when camera is too close (first-person view)
          visible={!!groupRef.current && groupRef.current.position.distanceTo(camera.position) > 1.0}
        />
      </group>
      {/* 椅子模型 */}
      <group ref={chairRef} castShadow receiveShadow visible={false}>
        <primitive object={chairGltf.scene.clone()} scale={[0.016, 0.016, 0.016]} />
      </group>
    </group>
  );
});

// 预加载椅子模型
useGLTF.preload("src/assets/models/plastic_chair.glb");

export default MilkPlayer;
