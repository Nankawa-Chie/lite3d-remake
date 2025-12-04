import {useRef, useEffect, useCallback, useMemo} from "react";
import * as Tone from "tone";

/**
 * @name useAudioSystem
 * @description 一個高級的、基於 Tone.js 物理建模合成的音頻管理系統。
 * 採用多層音頻合成技術，模擬真實世界的聲學物理特性，為每種材質和動作
 * 創建獨特的、動態的、程序化生成的音效。無需任何音頻樣本文件。
 * 
 * 核心特性：
 * - 物理建模合成：基於材質密度、彈性等物理參數生成聲音
 * - 多層音頻架構：每個音效由多個聲音層(基音、泛音、噪聲)組成
 * - 動態參數調製：根據速度、強度、環境實時調整音頻參數
 * - 空間化處理：模擬不同環境的聲學反射和吸收特性
 *
 * @param {object} props - Hook 的屬性對象
 * @param {boolean} [props.enabled=true] - 是否啟用此音頻系統
 * @param {number} [props.masterVolume=0.7] - 主音量 (0.0 to 1.0)
 * @param {function} props.onAudioReady - 音頻上下文成功初始化後的回調
 * @param {function} props.onError - 初始化或操作過程中發生錯誤時的回調
 * @returns {object|null} 返回一個包含所有音頻播放和控制方法的API對象，如果未啟用則返回null
 */
function useAudioSystem({enabled = true, masterVolume = 0.7, onAudioReady, onError}) {
  const isInitializedRef = useRef(false);
  const audioContextRef = useRef(null);
  const synthsRef = useRef({});
  const sequencersRef = useRef({});
  const effectsRef = useRef({});
  const materialPropertiesRef = useRef({});

  /**
   * 材質聲學特性定義
   * 基於真實材質的物理聲學參數，用於動態生成對應的音頻特性
   */
  const MATERIAL_ACOUSTICS = {
    grass: {
      density: 0.3,        // 材質密度 (影響低頻響應)
      hardness: 0.2,       // 硬度 (影響攻擊時間和尖銳度)
      absorption: 0.7,     // 吸音係數 (影響混響時長)
      roughness: 0.8,      // 表面粗糙度 (影響高頻噪聲)
      resonance: 200,      // 共振頻率
      dampening: 0.9,      // 阻尼係數
    },
    stone: {
      density: 0.9,
      hardness: 0.9,
      absorption: 0.1,
      roughness: 0.3,
      resonance: 400,
      dampening: 0.3,
    },
    wood: {
      density: 0.6,
      hardness: 0.6,
      absorption: 0.4,
      roughness: 0.5,
      resonance: 300,
      dampening: 0.6,
    },
    sand: {
      density: 0.4,
      hardness: 0.1,
      absorption: 0.8,
      roughness: 0.9,
      resonance: 150,
      dampening: 0.95,
    },
    metal: {
      density: 1.0,
      hardness: 1.0,
      absorption: 0.05,
      roughness: 0.1,
      resonance: 800,
      dampening: 0.1,
    },
    water: {
      density: 0.2,
      hardness: 0.0,
      absorption: 0.9,
      roughness: 0.1,
      resonance: 100,
      dampening: 0.95,
    }
  };

  /**
   * 創建多層脚步聲合成器
   * 使用物理建模方法，為每種材質創建獨特的聲音特徵
   */
  const createFootstepSynth = useCallback((materialProps) => {
    const isWater = materialProps.hardness <= 0.01 && materialProps.absorption >= 0.85;

    // Impact layer config
    const impactConfig = isWater
      ? {
          noise: { type: "white" },
          envelope: { attack: 0.003, decay: 0.06, sustain: 0, release: 0.18 },
          filterEnvelope: {
            attack: 0.003,
            decay: 0.06,
            sustain: 0,
            release: 0.15,
            baseFrequency: 1400,
            octaves: 2.5,
          },
        }
      : {
          noise: {
            type: materialProps.hardness > 0.6 ? "white" : "brown",
          },
          envelope: {
            attack: 0.001,
            decay: 0.015 + materialProps.hardness * 0.01,
            sustain: 0,
            release: 0.02 + materialProps.dampening * 0.03,
          },
          filterEnvelope: {
            attack: 0.001,
            decay: 0.02,
            sustain: 0,
            release: 0.05,
            baseFrequency: 800 + materialProps.hardness * 1200,
            octaves: 1 + materialProps.roughness * 2,
          },
        };

    // Friction layer config
    const frictionConfig = isWater
      ? {
          noise: { type: "pink" },
          envelope: { attack: 0.01, decay: 0.18, sustain: 0, release: 0.28 },
          filterEnvelope: {
            attack: 0.01,
            decay: 0.16,
            sustain: 0,
            release: 0.24,
            baseFrequency: 240,
            octaves: 1.5,
          },
        }
      : {
          noise: {
            type: materialProps.roughness > 0.7 ? "brown" : "pink",
          },
          envelope: {
            attack: 0.005,
            decay: 0.03 + materialProps.roughness * 0.07,
            sustain: 0,
            release: 0.08 + materialProps.absorption * 0.12,
          },
          filterEnvelope: {
            attack: 0.005,
            decay: 0.04,
            sustain: 0,
            release: 0.1,
            baseFrequency: 200 + materialProps.roughness * 400,
            octaves: 2,
          },
        };

    // Create layers
    const impactLayer = new Tone.NoiseSynth(impactConfig);
    const frictionLayer = new Tone.NoiseSynth(frictionConfig);

    // Tiny resonance only for hard materials
    const resonanceLayer = materialProps.hardness > 0.5 ? new Tone.Filter({
      frequency: materialProps.resonance,
      type: "bandpass",
      Q: 2 + materialProps.hardness * 3,
    }) : null;

    const resonanceNoise = materialProps.hardness > 0.5 ? new Tone.NoiseSynth({
      noise: {type: "white"},
      envelope: {
        attack: 0.01,
        decay: 0.05,
        sustain: 0,
        release: 0.03 * (1 - materialProps.absorption),
      },
    }) : null;

    if (resonanceNoise && resonanceLayer) {
      resonanceNoise.connect(resonanceLayer);
    }

    return {
      impact: impactLayer,
      friction: frictionLayer,
      resonance: resonanceNoise ? {synth: resonanceNoise, filter: resonanceLayer} : null
    };
  }, []);

  /**
   * 創建跳躍聲合成器
   * 模擬衣物擺動和輕微的肌肉用力聲
   */
  const createJumpSynth = useCallback(() => {
    // 輕微的用力聲 - 短促且柔和
    const effortLayer = new Tone.NoiseSynth({
      noise: {type: "pink"}, // 溫暖的粉噪聲
      envelope: {
        attack: 0.01,
        decay: 0.08,
        sustain: 0,
        release: 0.12,
      },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
        baseFrequency: 300, // 低頻為主
        octaves: 1.5,
      },
    });

    // 衣物/空氣微擾層 - 非常輕微的高頻成分
    const airLayer = new Tone.NoiseSynth({
      noise: {type: "white"},
      envelope: {
        attack: 0.005,
        decay: 0.06,
        sustain: 0,
        release: 0.1,
      },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.08,
        sustain: 0,
        release: 0.12,
        baseFrequency: 1500,
        octaves: 1,
      },
    });

    return {
      effort: effortLayer, 
      air: airLayer
    };
  }, []);

  /**
   * 創建落地聲合成器
   * 根據落地強度動態調整衝擊特性
   */
  const createLandingSynth = useCallback((materialProps) => {
    const isWater = materialProps.hardness <= 0.01 && materialProps.absorption >= 0.85;
    if (isWater) {
      // Water landing: splash + body slosh (both noise-based)
      const splash = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.45 },
        filterEnvelope: {
          attack: 0.005, decay: 0.2, sustain: 0, release: 0.35,
          baseFrequency: 1300, octaves: 2.4,
        },
      });
      const slosh = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.02, decay: 0.5, sustain: 0, release: 0.7 },
        filterEnvelope: {
          attack: 0.015, decay: 0.3, sustain: 0, release: 0.4,
          baseFrequency: 260, octaves: 1.6,
        },
      });
      return { isWater: true, splash, slosh };
    }

    // Solid surface landing: membrane + secondary resonance
    const mainImpactLayer = new Tone.MembraneSynth({
      pitchDecay: 0.05 + materialProps.hardness * 0.1,
      octaves: 2 + materialProps.density * 2,
      oscillator: {type: "sine"},
      envelope: {
        attack: 0.001,
        decay: 0.3 + materialProps.hardness * 0.5,
        sustain: 0.05 * (1 - materialProps.absorption),
        release: 1.0 + materialProps.dampening * 3,
      },
    });

    const secondaryLayer = new Tone.Synth({
      oscillator: {type: "triangle"},
      envelope: {
        attack: 0.02,
        decay: 0.4,
        sustain: 0.2,
        release: 2.0 + materialProps.dampening * 2,
      },
    });

    return {mainImpact: mainImpactLayer, secondary: secondaryLayer};
  }, []);

  /**
   * 初始化整個音頻系統
   * 為每種材質創建對應的合成器組合
   */
  const initializeAudio = useCallback(async () => {
    if (isInitializedRef.current) return;

    try {
      await Tone.start();
      console.log("Advanced Audio System: Tone.js context started");

      Tone.getDestination().volume.value = Tone.gainToDb(masterVolume);

      // 創建高級音效處理鏈
      const effects = {
        // 動態EQ - 根據材質自動調整頻率響應
        dynamicEQ: new Tone.MultibandCompressor({
          lowFrequency: 250,
          highFrequency: 2000,
          low: {threshold: -20, ratio: 2},
          mid: {threshold: -15, ratio: 3},
          high: {threshold: -10, ratio: 4},
        }),
        
        // 空間混響 - 模擬不同環境的聲學特性
        spatialReverb: new Tone.Reverb({
          roomSize: 0.8,
          decay: 3,
          wet: 0.2,
        }),
        
        // 延遲效果 - 增加空間深度感
        spatialDelay: new Tone.PingPongDelay({
          delayTime: "8n",
          feedback: 0.15,
          wet: 0.08,
        }),
        
        // 動態濾波 - 根據環境自動調整
        environmentalFilter: new Tone.Filter({
          frequency: 8000,
          type: "lowpass",
          rolloff: -24,
        }),
        
        // 最終壓縮器 - 確保音量一致性
        masterCompressor: new Tone.Compressor({
          threshold: -18,
          ratio: 6,
          attack: 0.003,
          release: 0.1,
        }),
      };

      // 構建音頻信號鏈
      effects.dynamicEQ.connect(effects.environmentalFilter);
      effects.environmentalFilter.connect(effects.spatialDelay);
      effects.spatialDelay.connect(effects.spatialReverb);
      effects.spatialReverb.connect(effects.masterCompressor);
      effects.masterCompressor.toDestination();

      // 為每種材質創建專門的合成器
      const synths = {};
      const materialProperties = {};

      Object.entries(MATERIAL_ACOUSTICS).forEach(([material, props]) => {
        materialProperties[material] = props;
        synths[`footstep_${material}`] = createFootstepSynth(props);
        synths[`landing_${material}`] = createLandingSynth(props);
      });

      // 創建通用合成器
      synths.jump = createJumpSynth();
      
      // 高級環境音效
      synths.wind = {
        base: new Tone.Noise("pink"),
        gusts: new Tone.Noise("brown"),
        oscillator: new Tone.Oscillator(0.1, "sine"),
      };

      synths.rain = {
        drops: new Tone.MetalSynth({
          frequency: 400,
          envelope: {attack: 0.001, decay: 0.05, release: 0.01},
          harmonicity: 3.1,
          modulationIndex: 20,
          resonance: 2000,
          octaves: 1,
        }),
        ambient: new Tone.NoiseSynth({
          noise: {type: "white"},
          envelope: {attack: 2, decay: 1, sustain: 1, release: 2},
          filterEnvelope: {
            attack: 0.1,
            decay: 0.2,
            sustain: 0.8,
            release: 0.1,
            baseFrequency: 1000,
            octaves: 3,
          },
        }),
      };

      // 連接所有合成器到效果鏈
      const connectSynthToChain = (node) => {
        if (!node) return; // guard null/undefined

        // If this is a composite group like { synth, filter }, connect only the terminal stage
        if (typeof node === 'object' && node.synth && node.filter) {
          if (typeof node.filter.connect === 'function') {
            node.filter.connect(effects.dynamicEQ);
          }
          return; // avoid double-connecting the inner synth
        }

        // Direct Tone node
        if (typeof node.connect === 'function') {
          node.connect(effects.dynamicEQ);
          return;
        }

        // Recurse into plain objects to find connectable children
        if (typeof node === 'object') {
          Object.values(node).forEach((child) => connectSynthToChain(child));
        }
      };

      Object.values(synths).forEach(connectSynthToChain);

      // 存儲引用
      synthsRef.current = synths;
      effectsRef.current = effects;
      materialPropertiesRef.current = materialProperties;
      audioContextRef.current = Tone.getContext();
      isInitializedRef.current = true;

      console.log("Advanced Audio System: Initialization complete");
      if (onAudioReady) onAudioReady();

    } catch (error) {
      console.error("Advanced Audio System: Initialization failed:", error);
      if (onError) onError(error);
    }
  }, [masterVolume, onAudioReady, onError, createFootstepSynth, createJumpSynth, createLandingSynth]);

  /**
   * 清理函數 - 正確釋放所有音頻資源
   */
  const cleanup = useCallback(() => {
    if (!isInitializedRef.current) return;
    
    try {
      // 停止所有序列器
      Object.values(sequencersRef.current).forEach((seq) => {
        if (seq?.stop) seq.stop();
        if (seq?.dispose) seq.dispose();
      });

      // 釋放所有合成器（包括多層合成器）
      Object.values(synthsRef.current).forEach((synth) => {
        if (synth?.dispose) {
          synth.dispose();
        } else if (typeof synth === 'object') {
          Object.values(synth).forEach(subSynth => {
            if (subSynth?.dispose) subSynth.dispose();
          });
        }
      });

      // 釋放所有效果器
      Object.values(effectsRef.current).forEach((effect) => {
        if (effect?.dispose) effect.dispose();
      });

      sequencersRef.current = {};
      synthsRef.current = {};
      effectsRef.current = {};
      materialPropertiesRef.current = {};
      isInitializedRef.current = false;
      
      console.log("Advanced Audio System: Cleanup complete");
    } catch (error) {
      console.error("Advanced Audio System: Cleanup error:", error);
    }
  }, []);

  // 系統生命週期管理
  useEffect(() => {
    if (enabled) {
      initializeAudio();
    } else {
      cleanup();
    }
    return cleanup;
  }, [enabled, initializeAudio, cleanup]);

  // 主音量動態更新
  useEffect(() => {
    if (isInitializedRef.current && Tone.getDestination()) {
      Tone.getDestination().volume.value = Tone.gainToDb(masterVolume);
    }
  }, [masterVolume]);

  /**
   * 音頻API - 提供所有音效播放和控制功能
   */
  const audioAPI = useMemo(() => {
    if (!enabled) return null;

    return {
      /**
       * 播放高級脚步聲 - 多層合成，材質敏感
       */
      playFootstep: (surface = "grass", volume = 1.0, speed = 1.0) => {
        if (!isInitializedRef.current) return;
        
        const material = MATERIAL_ACOUSTICS[surface] || MATERIAL_ACOUSTICS.grass;
        const synthGroup = synthsRef.current[`footstep_${surface}`] || synthsRef.current.footstep_grass;
        
        if (!synthGroup) return;

        const speedModulation = Math.max(0.5, Math.min(2.0, speed));
        const baseVol = volume * (0.3 + material.density * 0.2);

        // Impact noise burst
        if (synthGroup.impact) {
          synthGroup.impact.volume.value = Tone.gainToDb(baseVol * (0.6 + material.hardness * 0.6));
          synthGroup.impact.triggerAttackRelease(`${Math.round(64 / (speedModulation * 3))}n`);
        }

        // Friction swish
        if (synthGroup.friction) {
          const frictionVol = baseVol * (0.4 + material.roughness * 0.6);
          synthGroup.friction.volume.value = Tone.gainToDb(frictionVol);
          synthGroup.friction.triggerAttackRelease(`${Math.round(32 / speedModulation)}n`);
        }

        // Tiny resonance only for hard materials
        if (synthGroup.resonance && material.hardness > 0.5) {
          const {synth, filter} = synthGroup.resonance;
          if (synth && filter) {
            filter.frequency.value = material.resonance;
            synth.volume.value = Tone.gainToDb(baseVol * (0.08 * (1 - material.absorption)));
            synth.triggerAttackRelease("64n");
          }
        }
      },

      playRunstep: (surface = "grass", volume = 1.0, speed = 1.5) => {
        audioAPI.playFootstep(surface, volume * 1.15, speed * 1.35);
      },

      playJump: (volume = 1.0, effort = 1.0) => {
        if (!isInitializedRef.current || !synthsRef.current.jump) return;

        const jumpSynth = synthsRef.current.jump;
        const vol = volume * (0.25 + effort * 0.25);

        if (jumpSynth.effort) {
          jumpSynth.effort.volume.value = Tone.gainToDb(vol);
          jumpSynth.effort.triggerAttackRelease("32n");
        }

        if (jumpSynth.air) {
          jumpSynth.air.volume.value = Tone.gainToDb(vol * 0.6);
          jumpSynth.air.triggerAttackRelease("16n");
        }
      },

      /**
       * 播放落地聲 - 雙層衝擊效果
       */
      playLand: (surface = "grass", intensity = 1.0, volume = 1.0) => {
        if (!isInitializedRef.current) return;

        const material = MATERIAL_ACOUSTICS[surface] || MATERIAL_ACOUSTICS.grass;
        const synthGroup = synthsRef.current[`landing_${surface}`] || synthsRef.current.landing_grass;
        
        if (!synthGroup) return;

        const volumeLevel = volume * intensity * (0.3 + material.density * 0.4);
        const impactFreq = material.resonance * 0.8 * (0.8 + intensity * 0.4);

        // 主衝擊層
        if (synthGroup.mainImpact) {
          synthGroup.mainImpact.volume.value = Tone.gainToDb(volumeLevel);
          synthGroup.mainImpact.triggerAttackRelease(impactFreq, "4n");
        }

        // 次級振動層（硬質表面）
        if (synthGroup.secondary && material.hardness > 0.3 && intensity > 0.5) {
          const secondaryVolume = volumeLevel * (1 - material.absorption) * 0.6;
          synthGroup.secondary.volume.value = Tone.gainToDb(secondaryVolume);
          synthGroup.secondary.triggerAttackRelease(impactFreq * 0.6, "2n");
        }
      },

      /**
       * 高級風聲系統 - 多層大氣效果
       */
      startWind: (intensity = 0.5, volume = 1.0) => {
        if (!isInitializedRef.current || !synthsRef.current.wind) return;

        const windSynth = synthsRef.current.wind;
        const baseVolume = volume * intensity * 0.25;

        // 基礎風聲層
        if (windSynth.base) {
          windSynth.base.volume.value = Tone.gainToDb(baseVolume);
          if (windSynth.base.state !== "started") {
            windSynth.base.start();
          }
        }

        // 陣風層（高強度時）
        if (windSynth.gusts && intensity > 0.6) {
          const gustVolume = baseVolume * (intensity - 0.6) * 2;
          windSynth.gusts.volume.value = Tone.gainToDb(gustVolume);
          if (windSynth.gusts.state !== "started") {
            windSynth.gusts.start();
          }
        }

        // 低頻震盪層（模擬遠距離風聲）
        if (windSynth.oscillator && intensity > 0.3) {
          windSynth.oscillator.volume.value = Tone.gainToDb(baseVolume * 0.3);
          if (windSynth.oscillator.state !== "started") {
            windSynth.oscillator.start();
          }
        }
      },

      /**
       * 停止風聲
       */
      stopWind: () => {
        if (!isInitializedRef.current || !synthsRef.current.wind) return;
        
        const windSynth = synthsRef.current.wind;
        Object.values(windSynth).forEach(layer => {
          if (layer?.state === "started") {
            layer.stop();
          }
        });
      },

      /**
       * 高級雨聲系統 - 雨滴 + 環境音
       */
      startRain: (intensity = 0.5, volume = 1.0) => {
        if (!isInitializedRef.current || !synthsRef.current.rain) return;
        
        // 停止現有雨聲
        audioAPI.stopRain();

        const rainSynth = synthsRef.current.rain;
        const baseVolume = volume * 0.15;

        // 雨滴序列
        if (rainSynth.drops) {
          const dropRate = Math.max(1, Math.round(16 / intensity));
          const rainSequence = new Tone.Sequence(
            (time) => {
              if (Math.random() < intensity) {
                const freq = 300 + Math.random() * 1500;
                const dropVolume = baseVolume * (0.5 + Math.random() * 0.5);
                rainSynth.drops.volume.value = Tone.gainToDb(dropVolume);
                rainSynth.drops.triggerAttackRelease(freq, "64n", time);
              }
            },
            Array(16).fill(0),
            `${dropRate}n`
          );
          rainSequence.start(0);
          sequencersRef.current.rainDrops = rainSequence;
        }

        // 環境雨聲層
        if (rainSynth.ambient && intensity > 0.3) {
          const ambientVolume = baseVolume * intensity * 0.6;
          rainSynth.ambient.volume.value = Tone.gainToDb(ambientVolume);
          rainSynth.ambient.triggerAttack();
          sequencersRef.current.rainAmbient = rainSynth.ambient;
        }
      },

      /**
       * 停止雨聲
       */
      stopRain: () => {
        if (sequencersRef.current.rainDrops) {
          sequencersRef.current.rainDrops.stop();
          sequencersRef.current.rainDrops.dispose();
          delete sequencersRef.current.rainDrops;
        }
        
        if (sequencersRef.current.rainAmbient) {
          sequencersRef.current.rainAmbient.triggerRelease();
          delete sequencersRef.current.rainAmbient;
        }
      },

      /**
       * 動態設置混響參數
       */
      setReverb: (roomSize = 0.8, decay = 3, wet = 0.2) => {
        if (effectsRef.current.spatialReverb) {
          effectsRef.current.spatialReverb.roomSize = roomSize;
          effectsRef.current.spatialReverb.decay = decay;
          effectsRef.current.spatialReverb.wet.value = wet;
        }
      },

      /**
       * 設置環境濾波（模擬不同環境的聲學特性）
       */
      setEnvironmentalFilter: (frequency = 8000, resonance = 1) => {
        if (effectsRef.current.environmentalFilter) {
          effectsRef.current.environmentalFilter.frequency.value = frequency;
          effectsRef.current.environmentalFilter.Q.value = resonance;
        }
      },

      /**
       * 獲取系統狀態
       */
      getState: () => ({
        initialized: isInitializedRef.current,
        contextState: audioContextRef.current?.state || "suspended",
        masterVolume,
        supportedMaterials: Object.keys(MATERIAL_ACOUSTICS),
      }),

      /**
       * 手動初始化（用於響應用戶交互）
       */
      initialize: initializeAudio,
    };
  }, [enabled, masterVolume, initializeAudio]);

  return audioAPI;
}

export default useAudioSystem;
