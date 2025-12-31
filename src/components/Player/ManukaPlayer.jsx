import {useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import {RigidBody, CapsuleCollider, useRapier} from "@react-three/rapier";
import {useGLTF, useAnimations} from "@react-three/drei";
import {VRMLoaderPlugin} from "@pixiv/three-vrm";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import FacialRigController from "./FacialRigController.jsx";
import * as THREE from "three";
import poolManager from "../../utils/ObjectPool";

// ============================================================================
// 模型配置 - 在文件开头定义，方便切换
// ============================================================================
const MODEL_CONFIG = {
  modelType: "vrm", // 'vrm' 或 'glb'
  modelPath: "/assets/models/Manuka_mix-1.vrm", // VRM模型路径
  animationPath: "/assets/models/Manuka.glb", // GLB动画文件路径（仅VRM模式需要）
};

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
  walkForce: 30,
  runForce: 40,
  crouchForce: 18,
  airControlForce: 12,
  jumpImpulse: 8,
  dodgeImpulse: 18,
  dodgeDuration: 1,
  dodgeCooldown: 2.5,
  groundRayDistance: 0.2,
  groundDamping: 0.15,
  stopThreshold: 0.1,
  maxWalkSpeed: 4,
  maxRunSpeed: 15,
  maxCrouchSpeed: 2.4,
  maxAirSpeed: 7.2,
  turningDrag: 35,
  // New stability parameters (kept consistent with Milk tuning)
  enableGroundSnap: true,
  groundSnapDistance: 0.12, // meters
  groundedGraceTime: 0.08, // seconds of hysteresis
  // **[地形稳定性]**: 防止高分辨率地形上的微小抖动
  verticalVelocityThreshold: 1.5, // 垂直速度阈值，小于此值不认为是真正的下落
  groundedMinDuration: 0.08, // 最小接地持续时间，防止瞬间离地触发下落
  verticalDampingOnGround: 0.3, // 接地时的垂直速度阻尼系数
};

// Player collider parameters (Capsule)
const CAPSULE_HALF_HEIGHT = 0.8;
const CAPSULE_RADIUS = 0.4;
const CAPSULE_BOTTOM = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

/**
 * @name ManukaPlayer
 * @description Manuka角色控制器组件。
 * 基于MilkPlayer的架构，使用Manuka.glb模型和长方体物理体。
 * - 物理: 使用 `@react-three/cannon` 的 `useBox` 创建长方体物理体。
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
const ManukaPlayer = forwardRef(({colliders = []}, ref) => {
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

  // --- Physics Setup ---
  // 使用球体物理体，与MilkPlayer保持一致以确保稳定性
  // --- Physics Setup (Rapier) ---
  const rigidRef = useRef(null);
  const {rapier, world} = useRapier();
  // Rapier collider ref for self-exclusion in raycasts
  const colliderRef = useRef(null);
  // (replaces cannon useSphere)

  // Refs to store physics data without causing re-renders
  const velocity = useRef([0, 0, 0]);
  const position = useRef([0, 2, 0]);
  const isGrounded = useRef(false);
  const canJump = useRef(true);

  // --- Animation Setup ---
  // VRM模型和动画数据的引用
  const vrmRef = useRef(null);
  const modelSceneRef = useRef(null); // 统一的场景引用
  const animationsRef = useRef([]); // 统一的动画数组引用

  // 根据配置加载模型和动画
  const [modelLoaded, setModelLoaded] = useState(false);
  const [animationsLoaded, setAnimationsLoaded] = useState(false);

  // GLB兼容模式：使用useGLTF加载（仅在GLB模式下）
  const glbData = MODEL_CONFIG.modelType === "glb" ? useGLTF("/assets/models/Manuka_2.glb") : null;

  // 使用useAnimations管理动画
  const {actions, mixer} = useAnimations(animationsRef.current, modelRef);
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
  const suppressJumpUntil = useRef(0);
  const landingTimer = useRef(0);
  const dodgeTimer = useRef(0);
  const dodgeCooldownTimer = useRef(0);
  // **[關鍵修正 2]**: 引入一个跳跃锁计时器，防止刚跳起就错误地检测到地面
  const jumpLockTimer = useRef(0);
  // New timers to stabilize grounding
  const groundedGraceTimer = useRef(0);
  const lastGroundY = useRef(null);
  // Jump/grounding stability timers (minimal, aligned with Milk)
  const coyoteTimer = useRef(0);
  const hasCoyoteJumped = useRef(false);
  const jumpStateTimer = useRef(0);
  const hasLeftGroundSinceJump = useRef(false);
  // **[地形稳定性]**: 接地持续时间跟踪
  const groundedDurationManuka = useRef(0); // 持续接地的时间
  const lastVerticalVelocityManuka = useRef(0); // 上一帧的垂直速度

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
  const chairGltf = useGLTF("/assets/models/plastic_chair.glb"); // 加载椅子模型

  // --- Camera Offset Smoothing ---
  const currentVerticalOffset = useRef(0); // 当前垂直偏移
  const currentForwardOffset = useRef(-0.05); // 当前前向偏移

  // --- Ground Check ---
  const raycaster = useRef(new THREE.Raycaster());
  const rayDirection = useRef(new THREE.Vector3(0, -1, 0));

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
        // 更新头部骨骼的世界矩阵（VRM模式下特别重要）
        if (MODEL_CONFIG.modelType === "vrm") {
          // VRM模式：确保父级所有节点都更新
          groupRef.current.updateMatrixWorld(true);
        }
        headBoneRef.current.updateMatrixWorld(true);
        // 获取原始世界坐标
        headWorldPosition.current.setFromMatrixPosition(headBoneRef.current.matrixWorld);

        // 基于移动速度和状态计算目标偏移量
        const horizontalSpeed = Math.sqrt(velocity.current[0] ** 2 + velocity.current[2] ** 2);
        const normalizedSpeed = Math.min(horizontalSpeed / PHYSICS_CONFIG.maxRunSpeed, 1.0);

        // 统一的基础偏移量
        let targetVerticalOffset = 0.08; // 基础垂直偏移
        let targetForwardOffset = -0.22; // 基础前向偏移

        // 基于移动速度的动态调整（平滑变化）
        const speedBasedForwardOffset = normalizedSpeed * -0.45; // 速度越快，向后偏移越多
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
      console.log("ManukaPlayer getPosition called, position.current:", position.current);
      return [...position.current];
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
    resetState: () => {
      try {
        // Reset physics velocities
        if (rigidRef.current) {
          rigidRef.current.setLinvel({x: 0, y: 0, z: 0}, true);
          if (rigidRef.current.setAngvel) rigidRef.current.setAngvel({x: 0, y: 0, z: 0}, true);
        }
        // Reset timers and flags
        suppressJumpUntil.current = performance.now() + 600; // block jump briefly after scene switch
        landingTimer.current = 0;
        dodgeTimer.current = 0;
        dodgeCooldownTimer.current = 0;
        jumpLockTimer.current = 0;
        groundedGraceTimer.current = 0;
        groundedDurationManuka.current = 0;
        lastVerticalVelocityManuka.current = 0;
        coyoteTimer.current = 0;
        hasCoyoteJumped.current = false;
        jumpStateTimer.current = 0;
        hasLeftGroundSinceJump.current = false;
        isGrounded.current = false;
        canJump.current = true;
        // Reset sitting/chair state
        isSittingRef.current = false;
        isSittingWithChairRef.current = false;
        setIsSitting(false);
        setIsSittingWithChair(false);
        chairTargetProgress.current = 0;
        chairAnimationProgress.current = 0;
        // Clear input edges to avoid stuck JumpJustPressed
        previousKeys.current = {Space: false, KeyZ: false, KeyX: false};
        // Reset state
        setPlayerState(PLAYER_STATES.IDLE);
      } catch (e) {
        console.warn("resetState failed:", e);
      }
    },
    hardResetPhysics: (spawn) => {
      try {
        if (rigidRef.current) {
          if (spawn) rigidRef.current.setTranslation({x: spawn[0], y: spawn[1], z: spawn[2]}, true);
          rigidRef.current.setLinvel({x: 0, y: 0, z: 0}, true);
          if (rigidRef.current.setAngvel) rigidRef.current.setAngvel({x: 0, y: 0, z: 0}, true);
          if (rigidRef.current.wakeUp) rigidRef.current.wakeUp();
        }
        suppressJumpUntil.current = performance.now() + 600;
        previousKeys.current = {Space: false, KeyZ: false, KeyX: false};
      } catch (e) {
        console.warn("hardResetPhysics failed", e);
      }
    },
  })); // 移除依赖数组

  // Rapier: sample translation/linvel in useFrame; remove cannon subscriptions.

  // ============================================================================
  // 模型和动画加载逻辑
  // ============================================================================
  // 临时存储原始动画数据（等待VRM模型加载完成后再处理）
  const rawAnimationsRef = useRef(null);

  useEffect(() => {
    if (MODEL_CONFIG.modelType === "vrm") {
      // VRM模式：加载VRM模型
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      loader.load(
        MODEL_CONFIG.modelPath,
        (gltf) => {
          const vrm = gltf.userData.vrm;
          if (vrm) {
            console.log("✓ VRM模型加载成功:", MODEL_CONFIG.modelPath);
            vrmRef.current = vrm;
            modelSceneRef.current = vrm.scene;
            setModelLoaded(true);

            // 打印VRM信息
            console.log("VRM版本:", vrm.meta?.metaVersion || "unknown");
            console.log("VRM SpringBone:", vrm.springBoneManager ? "已启用" : "未启用");

            // 打印VRM表情信息
            if (vrm.expressionManager) {
              const expressionNames = vrm.expressionManager.expressionMap
                ? Object.keys(vrm.expressionManager.expressionMap)
                : [];
              console.log("VRM表情系统:", expressionNames.length > 0 ? "已启用" : "未启用");
              if (expressionNames.length > 0) {
                console.log("可用表情:", expressionNames);

                // 测试表情功能
                console.log("==== VRM表情测试 ====");
                window.testVRMExpression = (name, value) => {
                  if (vrm.expressionManager.expressionMap[name]) {
                    vrm.expressionManager.setValue(name, value);
                    console.log(`设置表情 ${name} = ${value}`);
                    console.log(`当前值: ${vrm.expressionManager.getValue(name)}`);
                  } else {
                    console.error(`表情不存在: ${name}`);
                  }
                };
                console.log("在控制台输入以下命令测试表情:");
                console.log("  testVRMExpression('blink', 1)  // 闭眼");
                console.log("  testVRMExpression('happy', 1)  // 微笑");
                console.log("  testVRMExpression('blink', 0)  // 睁眼");

                // 暴露VRM实例到window方便调试
                window.debugVRM = vrm;
                console.log("VRM实例已暴露为 window.debugVRM");
              }
            } else {
              console.log("VRM表情系统: 未找到");
            }
          } else {
            console.error("✗ 加载的文件不包含VRM数据");
          }
        },
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`VRM模型加载中: ${percent.toFixed(1)}%`);
        },
        (error) => {
          console.error("✗ VRM模型加载失败:", error);
        }
      );

      // VRM模式：加载GLB动画文件
      const animLoader = new GLTFLoader();
      animLoader.load(
        MODEL_CONFIG.animationPath,
        (gltf) => {
          console.log("✓ 动画文件加载成功:", MODEL_CONFIG.animationPath);
          console.log(
            `找到 ${gltf.animations.length} 个动画:`,
            gltf.animations.map((a) => a.name)
          );

          // 动画已在 Blender 中修正起始帧为0，直接使用原生循环即可

          // 暂存原始动画数据
          rawAnimationsRef.current = gltf.animations;
          setAnimationsLoaded(true);
        },
        undefined,
        (error) => {
          console.error("✗ 动画文件加载失败:", error);
        }
      );
    } else {
      // GLB模式：使用已通过useGLTF加载的数据（向下兼容）
      if (glbData) {
        modelSceneRef.current = glbData.scene;
        animationsRef.current = glbData.animations;
        setModelLoaded(true);
        setAnimationsLoaded(true);
        console.log("✓ GLB模型加载成功（兼容模式）");
      }
    }
  }, [glbData]);

  // VRM模式：当模型和动画都加载完成后，进行动画重定向
  useEffect(() => {
    if (MODEL_CONFIG.modelType === "vrm" && modelLoaded && animationsLoaded && rawAnimationsRef.current && vrmRef.current) {
      console.log("开始动画重定向...");

      // 重定向动画：移除VRM模型中不存在的轨道，避免警告
      const cleanedAnimations = rawAnimationsRef.current.map((animation) => {
        const cleanedTracks = animation.tracks.filter((track) => {
          // 提取轨道的骨骼名称
          // 轨道名称格式: "BoneName.property" 或 "Parent.BoneName.property"
          // 需要提取最后一个属性之前的所有部分作为骨骼名称
          const parts = track.name.split(".");
          const property = parts[parts.length - 1]; // 最后一部分是属性（position/quaternion/scale）
          const trackName = parts.slice(0, -1).join("."); // 移除属性，重新组合骨骼名称

          // 检查VRM模型中是否存在该骨骼
          let boneExists = false;
          vrmRef.current.scene.traverse((node) => {
            if (node.name === trackName) {
              boneExists = true;
            }
          });

          return boneExists;
        });

        // 创建新的动画剪辑，仅包含有效轨道
        return new THREE.AnimationClip(animation.name, animation.duration, cleanedTracks);
      });

      const totalTracks = rawAnimationsRef.current.reduce((sum, anim) => sum + anim.tracks.length, 0);
      const cleanedTracks = cleanedAnimations.reduce((sum, anim) => sum + anim.tracks.length, 0);
      console.log(
        `✓ 动画重定向完成：${totalTracks} 轨道 -> ${cleanedTracks} 轨道（过滤了 ${totalTracks - cleanedTracks} 个不兼容轨道）`
      );

      animationsRef.current = cleanedAnimations;
    }
  }, [modelLoaded, animationsLoaded]);

  // Set up local keyboard listeners (movement only)
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
        console.log("Started idle animation for Manuka");
      }
    }
  }, [actions]);

  // 调试：分析模型结构（只在开发环境运行一次）
  useEffect(() => {
    if (!modelLoaded || !modelSceneRef.current) return;

    console.log("=== MANUKA模型结构分析 ===");
    console.log("模型类型:", MODEL_CONFIG.modelType.toUpperCase());

    // 查找所有骨骼
    const allBones = [];
    const headRelatedBones = [];
    const debugHeadPatterns = ["head", "neck", "eye", "face", "skull"];

    modelSceneRef.current.traverse((child) => {
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
    modelSceneRef.current.traverse((child) => {
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
    console.log(`\n动画列表 (${animationsRef.current?.length || 0} 个):`);
    animationsRef.current?.forEach((anim, index) => {
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

    // 按优先级定义头部骨骼搜索策略（兼容GLB和VRM）
    const headBonePriorities = [
      // GLB骨骼名称
      "ValveBiped.forward", // 最优：视线方向骨骼
      "ValveBiped.Bip01_Head1", // 次优：头部骨骼
      "ValveBipedBip01_Head1", // 备选：头部骨骼（可能的命名变体）
      "ValveBipedBip01_Neck1", // 备选：脖子骨骼
      // VRM标准骨骼名称 (humanoid)
      "head", // VRM标准头部骨骼
      "neck", // VRM标准颈部骨骼
      "Head", // 首字母大写变体
      "Neck", // 首字母大写变体
    ];

    // 从SkinnedMesh的骨骼系统中查找头部骨骼
    modelSceneRef.current.traverse((child) => {
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

    // 收集頭/髮/臉/眼/頸 等相關網格（大小寫不敏感，支援更寬鬆匹配）
    const headMeshKeywords = ["head", "hair", "face", "eye", "neck", "skull", "brow"];
    const foundHeadMeshes = [];

    modelSceneRef.current.traverse((child) => {
      if (child.type === "SkinnedMesh") {
        const name = (child.name || "").toLowerCase();
        const materialNames = [];
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => materialNames.push((m?.name || "").toLowerCase()));
        } else if (child.material) {
          materialNames.push((child.material.name || "").toLowerCase());
        }
        const combined = `${name} ${materialNames.join(" ")}`;
        if (headMeshKeywords.some((kw) => combined.includes(kw))) {
          foundHeadMeshes.push(child);
          console.log(`找到頭部相關網格: "${child.name}" (材質: ${materialNames.join(", ")})`);
        }
      }
    });

    headMeshes.current = foundHeadMeshes;
    console.log(`總共找到 ${foundHeadMeshes.length} 個頭/頸/臉/眼相關網格`);
  }, [modelLoaded]);

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
        newAction = "jump";
        break;
      case PLAYER_STATES.FALLING:
        newAction = "fall";
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
      const currentAnim =
        actions[currentAction.current] ||
        actions[currentAction.current.charAt(0).toUpperCase() + currentAction.current.slice(1)];
      if (currentAnim) currentAnim.fadeOut(0.2);
      const newAnim = actions[newAction] || actions[newAction.charAt(0).toUpperCase() + newAction.slice(1)];
      if (newAnim) {
        // VRM模式：改回使用 LoopRepeat
        if (MODEL_CONFIG.modelType === "vrm") {
          newAnim.setLoop(THREE.LoopRepeat, Infinity);
          newAnim.clampWhenFinished = false;
        } else {
          // GLB模式：使用标准循环
          newAnim.setLoop(THREE.LoopRepeat, Infinity);
        }
        newAnim.reset().fadeIn(0.2).play();
      }
      currentAction.current = newAction;
    }
  }, [playerState, actions]);

  // --- Animation Management ---
  const playAnimation = (animationName, loop = true, fadeTime = 0.2) => {
    if (!actions || !actions[animationName]) {
      console.warn(`Animation "${animationName}" not found. Available animations:`, Object.keys(actions || {}));
      return;
    }

    if (currentAction.current === animationName) return;

    const newAction = actions[animationName];
    const oldAction = actions[currentAction.current];

    if (oldAction) {
      oldAction.fadeOut(fadeTime);
    }

    newAction
      .reset()
      .setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
      .fadeIn(fadeTime)
      .play();

    currentAction.current = animationName;
  };

  // 優化：緩存地面檢測目標，避免每幀重新篩選
  const groundCheckTargets = useRef([]);
  const lastGroundCheckUpdate = useRef(0);
  const GROUND_CHECK_CACHE_DURATION = 1000; // 1秒更新一次檢測目標

  /**
   * @description 高效地执行向下的射线检测，以判断玩家是否在地面上。
   * **[關鍵修正 3]**: 使用更精确的、基于胶囊体尺寸的射线检测
   * @returns {{isGrounded: boolean}} 一个包含地面状态的对象。
   */
  const performGroundCheck = () => {
    if (!world || !rigidRef.current) return {isGrounded: false, distance: Infinity, groundY: null};
    const t = rigidRef.current.translation();
    if (!t) return {isGrounded: false, distance: Infinity, groundY: null};
    const originY = t.y - CAPSULE_HALF_HEIGHT + 0.1; // center of bottom hemisphere, slightly up
    const rayLength = CAPSULE_RADIUS + PHYSICS_CONFIG.groundRayDistance;
    const offsets = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(CAPSULE_RADIUS * 0.6, 0, 0),
      new THREE.Vector3(-CAPSULE_RADIUS * 0.6, 0, 0),
      new THREE.Vector3(0, 0, CAPSULE_RADIUS * 0.6),
      new THREE.Vector3(0, 0, -CAPSULE_RADIUS * 0.6),
    ];
    // Forward-biased ray at speed to anticipate ground changes
    const vxzLen = Math.hypot(velocity.current[0], velocity.current[2]);
    if (vxzLen > 0.01) {
      const fx = velocity.current[0] / vxzLen;
      const fz = velocity.current[2] / vxzLen;
      offsets.push(new THREE.Vector3(fx * CAPSULE_RADIUS * 0.8, 0, fz * CAPSULE_RADIUS * 0.8));
    }
    let anyHit = false;
    let minToi = Infinity;
    for (let i = 0; i < offsets.length; i++) {
      const o = offsets[i];
      const origin = {x: t.x + o.x, y: originY, z: t.z + o.z};
      const dir = {x: 0, y: -1, z: 0};
      const ray = new rapier.Ray(origin, dir);
      // Exclude the player's own collider if available to avoid self-hits
      const exclude = colliderRef.current || undefined;
      const hit = world.castRay(ray, rayLength, true, undefined, undefined, exclude);
      if (hit) {
        anyHit = true;
        if (hit.toi < minToi) minToi = hit.toi;
      }
    }
    const distance = anyHit ? Math.max(0, minToi - CAPSULE_RADIUS) : Infinity;
    const groundY = anyHit ? originY - minToi : null; // since dir is (0,-1,0)
    return {isGrounded: anyHit, distance, groundY};
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
      if (rigidRef.current) rigidRef.current.setLinvel({x: 0, y: 0, z: 0}, true); // Reset velocity for a clean impulse
      if (rigidRef.current)
        rigidRef.current.applyImpulse(
          {
            x: _dodgeDirection.current.x * PHYSICS_CONFIG.dodgeImpulse,
            y: 0,
            z: _dodgeDirection.current.z * PHYSICS_CONFIG.dodgeImpulse,
          },
          true
        );
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
        if (velocity.current[1] <= 0) {
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
          if (rigidRef.current)
            rigidRef.current.setLinvel(
              {x: velocity.current[0] * 0.1, y: velocity.current[1], z: velocity.current[2] * 0.1},
              true
            );
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
        if (_currentVelocity.current.length() < maxSpeed) {
          if (rigidRef.current)
            rigidRef.current.applyImpulse(
              {
                x: moveDirection.current.x * forceMultiplier * 0.016,
                y: 0,
                z: moveDirection.current.z * forceMultiplier * 0.016,
              },
              true
            );
        }
      } else {
        // Apply ground damping when there's no input
        if (_currentVelocity.current.length() > PHYSICS_CONFIG.stopThreshold) {
          if (rigidRef.current)
            rigidRef.current.setLinvel(
              {
                x: velocity.current[0] * PHYSICS_CONFIG.groundDamping,
                y: velocity.current[1],
                z: velocity.current[2] * PHYSICS_CONFIG.groundDamping,
              },
              true
            );
        } else {
          if (rigidRef.current) rigidRef.current.setLinvel({x: 0, y: velocity.current[1], z: 0}, true);
        }
      }
    } else {
      // Apply air control force (Rapier impulse approx)
      if (hasAnyInput && _currentVelocity.current.length() < PHYSICS_CONFIG.maxAirSpeed) {
        if (rigidRef.current)
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

    // Handle jumping
    if (input.JumpJustPressed && groundInfo.isGrounded && canJump.current && performance.now() > suppressJumpUntil.current) {
      // 在施加跳跃冲量前，先将垂直速度归零，确保每次跳跃的起始条件一致
      if (rigidRef.current) rigidRef.current.setLinvel({x: velocity.current[0], y: 0, z: velocity.current[2]}, true);
      if (rigidRef.current) rigidRef.current.applyImpulse({x: 0, y: PHYSICS_CONFIG.jumpImpulse, z: 0}, true);
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

    // Sample Rapier rigid body state early so ground check uses fresh position
    if (rigidRef.current) {
      const t = rigidRef.current.translation();
      const v = rigidRef.current.linvel();
      position.current = [t.x, t.y, t.z];
      velocity.current = [v.x, v.y, v.z];
    }

    // Update timers
    if (landingTimer.current > 0) landingTimer.current -= clampedDelta;
    if (dodgeTimer.current > 0) dodgeTimer.current -= clampedDelta;
    if (dodgeCooldownTimer.current > 0) dodgeCooldownTimer.current -= clampedDelta;
    if (jumpLockTimer.current > 0) jumpLockTimer.current -= clampedDelta; // **[關鍵修正 2]**

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
    const horizSpeed = Math.hypot(velocity.current[0], velocity.current[2]);
    const snapBase = PHYSICS_CONFIG.groundSnapDistance ?? 0.12;
    const snapMax = snapBase + 0.08; // expand up to +8cm at high speed
    const speedT = Math.min(
      1,
      Math.max(
        0,
        (horizSpeed - (PHYSICS_CONFIG.maxWalkSpeed || 4)) /
          ((PHYSICS_CONFIG.maxRunSpeed || 12) - (PHYSICS_CONFIG.maxWalkSpeed || 4) + 1e-5)
      )
    );
    const dynamicSnap = snapBase + (snapMax - snapBase) * speedT;
    const graceBase = PHYSICS_CONFIG.groundedGraceTime ?? 0.08;
    const graceMax = graceBase + 0.06; // up to +60ms at high speed
    const dynamicGrace = graceBase + (graceMax - graceBase) * speedT;
    const withinSnap = groundInfoRaw.distance <= dynamicSnap;
    const fallingVyThreshold = -0.5;
    const baseGrounded = groundInfoRaw.isGrounded || (groundedGraceTimer.current > 0 && withinSnap);
    // If not clearly grounded, only consider falling when moving downward fast enough and far from ground
    const preferGrounded = false; // remove soft-grounding to avoid false grounded on scene switches

    // **[地形稳定性]**: 增强的接地判定逻辑
    let isReallyGrounded = baseGrounded || preferGrounded;

    // 如果跳跃锁定计时器激活，强制认为不在地面
    if (jumpLockTimer.current > 0) {
      isReallyGrounded = false;
    } else if (groundInfoRaw.isGrounded) {
      // 接地时，累积接地持续时间
      groundedDurationManuka.current += clampedDelta;

      // **[关键]**: 在地面上时，主动抑制微小的垂直速度波动
      const currentVy = velocity.current[1];
      if (
        Math.abs(currentVy) < PHYSICS_CONFIG.verticalVelocityThreshold &&
        Math.abs(currentVy) < Math.abs(lastVerticalVelocityManuka.current) * 2
      ) {
        // 如果垂直速度很小且没有快速增长，应用强阻尼
        if (rigidRef.current) {
          const dampedVy = currentVy * PHYSICS_CONFIG.verticalDampingOnGround;
          rigidRef.current.setLinvel({x: velocity.current[0], y: dampedVy, z: velocity.current[2]}, true);
          velocity.current[1] = dampedVy;
        }
      }
      lastVerticalVelocityManuka.current = currentVy;
    } else {
      // 离地时，检查是否是真正的离地还是微小抖动
      const wasRecentlyGrounded = groundedDurationManuka.current > PHYSICS_CONFIG.groundedMinDuration;
      const hasSmallVerticalVelocity = Math.abs(velocity.current[1]) < PHYSICS_CONFIG.verticalVelocityThreshold;

      // 如果刚刚离地且垂直速度很小，继续认为在地面（宽容处理）
      if (wasRecentlyGrounded && hasSmallVerticalVelocity && coyoteTimer.current > 0) {
        isReallyGrounded = true;
      } else {
        groundedDurationManuka.current = 0; // 重置接地持续时间
      }
    }

    isGrounded.current = isReallyGrounded;

    if (groundInfoRaw.isGrounded) {
      groundedGraceTimer.current = dynamicGrace;
    } else if (groundedGraceTimer.current > 0) {
      groundedGraceTimer.current -= clampedDelta;
    }

    if (isReallyGrounded) {
      canJump.current = true;
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
            JumpJustPressed:
              (!!externalInput.current.keys.Space && !previousKeys.current.Space) ||
              (!!inputState.Space && !previousKeys.current.Space),
          };
    updatePlayerState(combinedInput, {isGrounded: isReallyGrounded});

    // 更新按键状态跟踪 (優化：直接賦值而非展開)
    previousKeys.current.Space = !!combinedInput.Space;
    previousKeys.current.KeyZ = !!combinedInput.KeyZ;
    previousKeys.current.KeyX = !!combinedInput.KeyX;

    // 3. Apply physics based on the new state
    applyPhysicsBasedMovement(combinedInput, {isGrounded: isReallyGrounded});

    // 4. 立即同步視覺模型位置 (在動畫更新之前)
    // Vertical position low-pass filter against ground to suppress high-frequency jitter (REMOVED by rollback)
    if (rigidRef.current) {
      const v = rigidRef.current.linvel();
      const tNow = rigidRef.current.translation();
      // (Rollback) Remove vertical clamping and filtered ground logic
      // Keep original simpler behavior: only nullify vertical velocity when grounded and near ground
      const snapDist = PHYSICS_CONFIG.groundSnapDistance ?? 0.12;
      if (isGrounded.current && v.y <= 0 && groundInfoRaw.distance <= snapDist) {
        rigidRef.current.setLinvel({x: v.x, y: 0, z: v.z}, true);
        const tn = rigidRef.current.translation();
        const vn = rigidRef.current.linvel();
        position.current = [tn.x, tn.y, tn.z];
        velocity.current = [vn.x, vn.y, vn.z];
      }
    }
    groupRef.current.position.set(
      position.current[0],
      position.current[1] - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS),
      position.current[2]
    );

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

    // 6. 在位置和旋轉更新完成後，才更新動畫
    // 注意：VRM模式下必须每帧都更新mixer，否则会导致T-Pose闪烁
    if (mixer) {
      mixer.update(clampedDelta);
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

    // ============================================================================
    // VRM 更新（仅VRM模式）- 放在最后，确保所有表情值都已设置
    // ============================================================================
    if (MODEL_CONFIG.modelType === "vrm" && vrmRef.current) {
      vrmRef.current.update(clampedDelta);
    }
  }, -1); // 設置較高的優先級，確保在相機更新之前執行

  // 如果模型未加载完成，返回占位符
  if (!modelLoaded || !modelSceneRef.current) {
    return (
      <group>
        <RigidBody
          ref={rigidRef}
          mass={1}
          colliders={false}
          enabledTranslations={[true, true, true]}
          enabledRotations={[false, false, false]}
          linearDamping={0.02}
          angularDamping={1.0}
        >
          <CapsuleCollider ref={colliderRef} args={[0.8, 0.4]} friction={0} restitution={0} />
        </RigidBody>
        <group ref={groupRef}>
          {/* 加载中占位符 */}
          <mesh position={[0, 1, 0]}>
            <capsuleGeometry args={[0.4, 0.8]} />
            <meshStandardMaterial color="gray" wireframe />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group>
      {/* Physics body (Rapier) */}
      <RigidBody
        ref={rigidRef}
        mass={1}
        colliders={false}
        enabledTranslations={[true, true, true]}
        enabledRotations={[false, false, false]}
        linearDamping={0.02}
        angularDamping={1.0}
      >
        <CapsuleCollider ref={colliderRef} args={[0.8, 0.4]} friction={0} restitution={0} />
      </RigidBody>

      {/* Visible character model group */}
      <group ref={groupRef} castShadow receiveShadow>
        <primitive
          ref={modelRef}
          object={modelSceneRef.current}
          scale={MODEL_CONFIG.modelType === "vrm" ? [1.18, 1.18, 1.18] : [0.03, 0.03, 0.03]}
          // Hide model when camera is too close (first-person view)
          visible={!!groupRef.current && groupRef.current.position.distanceTo(camera.position) > 1.0}
        />
      </group>

      {/* Facial rig controller (reusable) */}
      {modelSceneRef.current && (
        <FacialRigController target={modelSceneRef.current} vrm={MODEL_CONFIG.modelType === "vrm" ? vrmRef.current : null} />
      )}

      {/* 椅子模型 */}
      <group ref={chairRef} castShadow receiveShadow visible={false}>
        <primitive object={chairGltf.scene.clone()} scale={[0.016, 0.016, 0.016]} />
      </group>
    </group>
  );
});

// 预加载模型（仅GLB模式需要）
if (MODEL_CONFIG.modelType === "glb") {
  useGLTF.preload("/assets/models/Manuka_2.glb");
}
useGLTF.preload("/assets/models/plastic_chair.glb");

export default ManukaPlayer;
