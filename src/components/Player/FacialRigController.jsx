import React, {useEffect, useRef} from "react";
import {useFrame} from "@react-three/fiber";

/**
 * FacialRigController
 * - Reusable facial morph controller for glTF/GLB models with morph targets
 * - Also supports VRM models with expressionManager
 * - Features: random blink, numpad key bindings (numpad only), mic-driven mouth, smooth morph transitions
 *
 * Props:
 * - target: THREE.Object3D (required) - the model root to traverse for SkinnedMesh morph targets
 * - vrm?: VRM instance (optional) - if provided, uses VRM expressionManager instead of morphTargets
 * - config?: {
 *     blinkMin?: number;        // min seconds between blinks (default 2)
 *     blinkMax?: number;        // max seconds between blinks (default 4)
 *     blinkDuration?: number;   // total close+open duration (default 0.16)
 *     morphLerpPerSec?: number; // morph smoothing speed (default 12 per second)
 *     mouthOverrideMs?: number; // how long a mouth key override lasts before reverting to mic (default 1200ms)
 *     micProfile?: 'o' | 'open'; // mic-driven mouth style ('o' prefers O-shapes, 'open' prefers open mouth)
 *     micGain?: number;          // mic RMS -> mouth openness gain (default 5)
 *   }
 */
export default function FacialRigController({target, vrm, config = {}}) {
  const CFG = {
    blinkMin: config.blinkMin ?? 3,
    blinkMax: config.blinkMax ?? 5,
    blinkDuration: config.blinkDuration ?? 0.25,
    morphLerpPerSec: config.morphLerpPerSec ?? 12,
    mouthOverrideMs: config.mouthOverrideMs ?? 1200,
    micProfile: config.micProfile ?? "o",
    micGain: config.micGain ?? 3, // default sensitivity
    browSampleIntervalMs: config.browSampleIntervalMs ?? 4000 + Math.random() * 2000, // 4~6s
    browFadeInMs: config.browFadeInMs ?? 600,
    browFadeOutMs: config.browFadeOutMs ?? 400,
  };

  const MOUTH_NAMES = [
    "Mouth_Smile",
    "Mouth_Sad",
    "Mouth_Annoyed",
    "Mouth_A",
    "Mouth_Open",
    "Mouth_O_Small",
    "Mouth_O_Large",
    "Mouth_Omega",
  ];
  const BROW_NAMES = ["Brow_Sad", "Brow_Angry", "Brow_Surprised"];

  // Morph map: name => [{ mesh, index }]
  const morphMapRef = useRef(new Map());

  // Blink state
  const blinkTimerRef = useRef(0);
  const nextBlinkDelayRef = useRef(CFG.blinkMin + Math.random() * (CFG.blinkMax - CFG.blinkMin));
  const blinkProgressRef = useRef(0);
  const isBlinkingRef = useRef(false);

  // Mouth override
  const mouthOverrideNameRef = useRef(null);
  const mouthOverrideUntilRef = useRef(0);

  // Brow state (sticky until cleared)
  const browActiveNameRef = useRef(null);
  const browCycleIndexRef = useRef(-1);

  // Mic
  const micEnabledRef = useRef(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micDataRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // Target values map for smoothing: name => target [0..1]
  const targetValuesRef = useRef(new Map());
  const lastOpenRef = useRef(0);
  // Brow sampling & tween state
  const browCurrentNameRef = useRef(null);
  const browTargetNameRef = useRef(null);
  const browLastSampleRef = useRef(0);
  const browTweenRef = useRef({ phase: 'idle', t: 0 }); // phase: 'fadeIn' | 'fadeOut' | 'idle'


  // VRM expression manager ref
  const vrmExpressionManagerRef = useRef(null);
  const isVrmModeRef = useRef(false);

  // Build morph map when target changes (or detect VRM)
  useEffect(() => {
    morphMapRef.current.clear();
    targetValuesRef.current.clear();

    if (!target) return;
    
    // 检查是否为VRM模式
    if (vrm && vrm.expressionManager) {
      vrmExpressionManagerRef.current = vrm.expressionManager;
      isVrmModeRef.current = true;
      
      const expressionNames = Object.keys(vrm.expressionManager.expressionMap || {});
      console.log("[FacialRigController] ✓ VRM表情模式启用");
      console.log("  可用VRM表情:", expressionNames);
      
      // 检查表情绑定状态
      const blinkExpression = vrm.expressionManager.expressionMap.blink;
      const hasValidBinds = blinkExpression && blinkExpression.binds && blinkExpression.binds.length > 0;
      
      if (!hasValidBinds) {
        console.warn("[FacialRigController] ⚠ 警告: VRM表情未正确绑定到形态键");
        console.warn("  请在Blender中配置VRM Expression Presets，将形态键绑定到VRM标准表情");
      } else {
        console.log("[FacialRigController] ✓ VRM表情绑定正常");
      }
      
      // 为VRM表情初始化目标值 - 使用我们的控制名称
      ["Blink", ...MOUTH_NAMES, ...BROW_NAMES].forEach((n) => {
        targetValuesRef.current.set(n, 0);
      });
      
      return; // VRM模式下不遍历mesh
    }
    
    // GLB模式：遍历查找morphTargets
    isVrmModeRef.current = false;
    const blinkAltEntries = [];
    target.traverse((child) => {
      if (child.isSkinnedMesh || child.type === "SkinnedMesh") {
        const mesh = child;
        const dict = mesh.morphTargetDictionary;
        const infl = mesh.morphTargetInfluences;
        if (!dict || !infl) return;
        for (const [name, index] of Object.entries(dict)) {
          if (!morphMapRef.current.has(name)) morphMapRef.current.set(name, []);
          morphMapRef.current.get(name).push({mesh, index});
          if (!targetValuesRef.current.has(name)) targetValuesRef.current.set(name, 0);

          // Collect alternative blink channels if present
          const lname = name.toLowerCase();
          if (
            lname === "eyeblinkleft" ||
            lname === "eyeblinkright" ||
            lname === "eyeblink_l" ||
            lname === "eyeblink_r" ||
            lname === "blinkleft" ||
            lname === "blinkright" ||
            lname === "blink_l" ||
            lname === "blink_r" ||
            lname === "blinkl" ||
            lname === "blinkr"
          ) {
            blinkAltEntries.push({mesh, index});
          }
        }
      }
    });
    // Ensure named groups exist in target map
    ["Blink", ...MOUTH_NAMES, ...BROW_NAMES].forEach((n) => {
      if (!morphMapRef.current.has(n)) morphMapRef.current.set(n, []);
      if (!targetValuesRef.current.has(n)) targetValuesRef.current.set(n, 0);
    });
    // If "Blink" not found on model, alias it to left/right blink entries
    if ((morphMapRef.current.get("Blink")?.length || 0) === 0 && blinkAltEntries.length > 0) {
      morphMapRef.current.set("Blink", blinkAltEntries);
    }
  }, [target, vrm]);

  // Helpers to set target values for groups
  const setTarget = (name, v) => {
    targetValuesRef.current.set(name, Math.max(0, Math.min(1, v)));
  };
  const resetGroup = (names) => {
    names.forEach((n) => setTarget(n, 0));
  };

  // Keyboard handlers: numpad only
  useEffect(() => {
    const handleDown = async (e) => {
      // Use only Numpad keys; ignore top-row digits by design
      const code = e.code;
      switch (code) {
        case "Numpad0": // toggle mic mouth
          if (!micEnabledRef.current) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({audio: true});
              mediaStreamRef.current = stream;
              const ac = new (window.AudioContext || window.webkitAudioContext)();
              audioContextRef.current = ac;
              const source = ac.createMediaStreamSource(stream);
              const an = ac.createAnalyser();
              an.fftSize = 512;
              analyserRef.current = an;
              micDataRef.current = new Uint8Array(an.frequencyBinCount);
              source.connect(an);
              micEnabledRef.current = true;
            } catch (err) {
              console.warn("无法开启麦克风:", err);
              micEnabledRef.current = false;
            }
          } else {
            micEnabledRef.current = false;
            try {
              if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((t) => t.stop());
                mediaStreamRef.current = null;
              }
              if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
              }
            } catch {}
            analyserRef.current = null;
            micDataRef.current = null;
            // release mouth if no override
            if (!mouthOverrideNameRef.current) {
              resetGroup(MOUTH_NAMES);
            }
          }
          break;
        case "Numpad1":
          return setMouthOverride("Mouth_Smile");
        case "Numpad2":
          return setMouthOverride("Mouth_Sad");
        case "Numpad3":
          return setMouthOverride("Mouth_Annoyed");
        case "Numpad4":
          return setMouthOverride("Mouth_A");
        case "Numpad5":
          return setMouthOverride("Mouth_Open");
        case "Numpad6":
          return setMouthOverride("Mouth_O_Small");
        case "Numpad7":
          return setMouthOverride("Mouth_O_Large");
        case "Numpad8":
          return setMouthOverride("Mouth_Omega");
        case "Numpad9": // cycle brow
          browCycleIndexRef.current = (browCycleIndexRef.current + 1) % BROW_NAMES.length;
          browActiveNameRef.current = BROW_NAMES[browCycleIndexRef.current];
          break;
        case "NumpadDecimal": // clear brow
          browActiveNameRef.current = null;
          resetGroup(BROW_NAMES);
          break;
        case "NumpadAdd": // clear mouth override (return control to mic or neutral)
          mouthOverrideNameRef.current = null;
          mouthOverrideUntilRef.current = 0;
          resetGroup(MOUTH_NAMES);
          break;
        default:
          break;
      }
    };

    const setMouthOverride = (name) => {
      mouthOverrideNameRef.current = name;
      mouthOverrideUntilRef.current = performance.now() + CFG.mouthOverrideMs;
      // set target group instantly; smoothing will lerp visual
      resetGroup(MOUTH_NAMES);
      setTarget(name, 1);
    };

    window.addEventListener("keydown", handleDown);
    return () => {
      window.removeEventListener("keydown", handleDown);
    };
  }, [CFG.mouthOverrideMs]);

  // Cleanup mic on unmount
  useEffect(() => {
    return () => {
      try {
        micEnabledRef.current = false;
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
      } catch {}
      // reset all managed morphs
      setTarget("Blink", 0);
      MOUTH_NAMES.forEach((n) => setTarget(n, 0));
      BROW_NAMES.forEach((n) => setTarget(n, 0));
    };
  }, []);

  useFrame((_, delta) => {
    if (!target) return;
    const dt = Math.min(delta, 1 / 30);

    // 1) Random blink
    blinkTimerRef.current += dt;
    if (!isBlinkingRef.current && blinkTimerRef.current >= nextBlinkDelayRef.current) {
      isBlinkingRef.current = true;
      blinkProgressRef.current = 0;
      blinkTimerRef.current = 0;
      nextBlinkDelayRef.current = CFG.blinkMin + Math.random() * (CFG.blinkMax - CFG.blinkMin);
    }
    if (isBlinkingRef.current) {
      const t = (blinkProgressRef.current += dt / CFG.blinkDuration);
      // inOutExpo easing on 0..1, mirrored for close/open; ensure full close at mid
      const easeInExpo = (x) => (x === 0 ? 0 : Math.pow(2, 10 * (x - 1)));
      const easeOutExpo = (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));
      const inOutExpo = (x) => (x < 0.5 ? 0.5 * easeInExpo(x * 2) : 0.5 * (easeOutExpo((x - 0.5) * 2) + 1));
      let v;
      if (t <= 0.5) {
        v = inOutExpo(t / 0.5);
      } else {
        v = inOutExpo(1 - (t - 0.5) / 0.5);
      }
      if (Math.abs(t - 0.5) < 1e-3) v = 1; // force fully closed near midpoint
      setTarget("Blink", Math.max(0, Math.min(1, v)));
      if (t >= 1) {
        setTarget("Blink", 0);
        isBlinkingRef.current = false;
      }
    }

    // 2) Brow (sampling + tween)
    // If manual override exists, bypass sampling
    if (browActiveNameRef.current) {
      resetGroup(BROW_NAMES);
      setTarget(browActiveNameRef.current, 1);
    } else {
      const nowMs = performance.now();
      // sample every browSampleIntervalMs based on current RMS/open (captured below)
      if (nowMs - browLastSampleRef.current >= CFG.browSampleIntervalMs && micEnabledRef.current && analyserRef.current && micDataRef.current) {
        browLastSampleRef.current = nowMs;
        // decide target brow by thresholds using the latest open value measured this frame (computed below)
        const p = lastOpenRef.current; // 0..1
        let next = null;
        if (p <= 0.05) next = null;
        else if (p <= 0.25) next = "Brow_Sad";
        else if (p <= 0.45) next = "Brow_Angry";
        else next = "Brow_Surprised";
        const current = browCurrentNameRef.current;
        if (next !== current) {
          if (next === null && current) {
            // change to neutral: fade out current
            browTargetNameRef.current = null;
            browTweenRef.current = { phase: 'fadeOut', t: 0 };
          } else if (next) {
            // any -> any: fade in next (no explicit fade-out of previous)
            browTargetNameRef.current = next;
            browTweenRef.current = { phase: 'fadeIn', t: 0 };
          }
        }
      }
      // apply tween to targetValues
      const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const easeOutCubic = (x) => (1 - Math.pow(1 - x, 3));
      const dtMs = dt * 1000;
      resetGroup(BROW_NAMES);
      if (browTweenRef.current.phase === 'fadeIn' && browTargetNameRef.current) {
        browTweenRef.current.t += dtMs / CFG.browFadeInMs;
        const v = easeInOutCubic(Math.min(1, browTweenRef.current.t));
        setTarget(browTargetNameRef.current, v);
        if (browTweenRef.current.t >= 1) {
          browTweenRef.current = { phase: 'idle', t: 0 };
          browCurrentNameRef.current = browTargetNameRef.current;
        }
      } else if (browTweenRef.current.phase === 'fadeOut' && browCurrentNameRef.current) {
        browTweenRef.current.t += dtMs / CFG.browFadeOutMs;
        const v = 1 - easeOutCubic(Math.min(1, browTweenRef.current.t));
        setTarget(browCurrentNameRef.current, v);
        if (browTweenRef.current.t >= 1) {
          browTweenRef.current = { phase: 'fadeIn', t: 0 };
          browCurrentNameRef.current = null;
        }
      } else if (browCurrentNameRef.current) {
        setTarget(browCurrentNameRef.current, 1);
      }
    }

    // 3) Mouth: mic vs override
    const now = performance.now();
    if (mouthOverrideNameRef.current && now < mouthOverrideUntilRef.current) {
      // keep override target at 1, others 0
      resetGroup(MOUTH_NAMES);
      setTarget(mouthOverrideNameRef.current, 1);
    } else {
      // release override
      mouthOverrideNameRef.current = null;
      // mic-driven
      resetGroup(MOUTH_NAMES);
      if (micEnabledRef.current && analyserRef.current && micDataRef.current) {
        analyserRef.current.getByteTimeDomainData(micDataRef.current);
        let sum = 0;
        for (let i = 0; i < micDataRef.current.length; i++) {
          const v = (micDataRef.current[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / micDataRef.current.length);
        const open = Math.min(1, Math.max(0, (rms - 0.02) * CFG.micGain));
        lastOpenRef.current = open;
        if (CFG.micProfile === "o") {
          // Prefer O-shapes: small O dominates, large O at higher volumes; minimal open/A
          const oSmall = Math.min(1, open * 1.0);
          const oLarge = Math.max(0, open - 0.5) * 0.9;
          setTarget("Mouth_O_Small", oSmall);
          setTarget("Mouth_O_Large", oLarge);
          setTarget("Mouth_Open", open * 0.15);
          setTarget("Mouth_A", open * 0.1);
        } else {
          // Legacy open profile
          setTarget("Mouth_A", open * 0.6);
          setTarget("Mouth_Open", open);
          const wobble = Math.max(0, open - 0.6) * 0.5;
          setTarget("Mouth_O_Small", wobble * 0.5);
          setTarget("Mouth_O_Large", wobble);
        }

      }
    }

    // 4) Apply smoothing to actual mesh influences
    const alpha = 1 - Math.exp(-CFG.morphLerpPerSec * dt); // frame-rate independent lerp
    
    if (isVrmModeRef.current && vrmExpressionManagerRef.current) {
      // VRM模式：使用expressionManager
      // 直接使用控制名称，因为VRM模型中已经有对应的自定义表情
      // 如果自定义表情不存在，回退到VRM标准名称
      const vrmMappings = {
        // 这些会优先使用自定义表情（如果存在）
        "Blink": "Blink",           // 自定义优先，回退到 blink
        "Mouth_A": "Mouth_A",       // 自定义优先，回退到 aa
        "Mouth_Open": "Mouth_Open", // 自定义
        "Mouth_O_Small": "Mouth_O_Small", // 自定义
        "Mouth_O_Large": "Mouth_O_Large", // 自定义
        "Mouth_Omega": "Mouth_Omega",     // 自定义
        "Mouth_Smile": "Mouth_Smile",     // 自定义优先，回退到 happy
        "Mouth_Sad": "Mouth_Sad",         // 自定义优先，回退到 sad
        "Mouth_Annoyed": "Mouth_Annoyed", // 自定义
        "Brow_Sad": "Brow_Sad",           // 自定义优先，回退到 sad
        "Brow_Angry": "Brow_Angry",       // 自定义优先，回退到 angry
        "Brow_Surprised": "Brow_Surprised", // 自定义优先，回退到 surprised
      };
      
      // VRM标准名称回退映射
      const standardFallbacks = {
        "Blink": "blink",
        "Mouth_A": "aa",
        "Mouth_Open": "aa",
        "Mouth_O_Small": "oh",
        "Mouth_O_Large": "oh",
        "Mouth_Omega": "oh",
        "Mouth_Smile": "happy",
        "Mouth_Sad": "sad",
        "Mouth_Annoyed": "angry",
        "Brow_Sad": "sad",
        "Brow_Angry": "angry",
        "Brow_Surprised": "surprised",
      };
      
      // 应用表情值到VRM
      targetValuesRef.current.forEach((tVal, name) => {
        const preferredName = vrmMappings[name] || name;
        const fallbackName = standardFallbacks[name];
        
        // 优先使用自定义表情名称，如果不存在则使用标准名称
        let vrmName = preferredName;
        if (!vrmExpressionManagerRef.current.expressionMap[preferredName] && fallbackName) {
          vrmName = fallbackName;
        }
        
        // 获取当前值
        const currentValue = vrmExpressionManagerRef.current.getValue(vrmName) || 0;
        
        // 平滑插值
        const newValue = currentValue + (tVal - currentValue) * alpha;
        
        // 设置到VRM
        if (vrmExpressionManagerRef.current.expressionMap[vrmName]) {
          vrmExpressionManagerRef.current.setValue(vrmName, newValue);
        }
      });
    } else {
      // GLB模式：使用morphTargets
      morphMapRef.current.forEach((entries, name) => {
        const tVal = targetValuesRef.current.get(name) ?? 0;
        for (let i = 0; i < entries.length; i++) {
          const {mesh, index} = entries[i];
          const infl = mesh.morphTargetInfluences;
          if (!infl) continue;
          const cur = infl[index] || 0;
          infl[index] = cur + (tVal - cur) * alpha;
          mesh.needsUpdate = true;
        }
      });
    }
  }, -10); // 高优先级，确保在VRM update之前执行

  return null; // non-visual helper
}
