import {useState, useEffect, useCallback, useRef} from "react";
import AudioSystem from "./AudioSystem";
import "./AudioController.css";

/**
 * @name useAudioController
 * @description 一个 React Hook，作为游戏音频系统的高级控制器。
 * 它封装了底层的 `AudioSystem`，并根据游戏状态（如玩家移动、天气变化）自动触发相应的音效。
 * 同时，它也暴露了完整的控制API，用于UI交互（如音量调节、音效测试）。
 *
 * @param {object} props - Hook 的属性对象
 * @param {function} props.onAudioSystemReady - 当底层音频系统准备就绪时的回调，返回音频API。
 * @param {object} [props.playerMovementState] - 玩家的移动状态。
 * @param {boolean} props.playerMovementState.isMoving - 玩家是否在移动。
 * @param {boolean} props.playerMovementState.isRunning - 玩家是否在奔跑。
 * @param {boolean} props.playerMovementState.isJumping - 玩家是否在跳跃。
 * @param {string} [props.weatherType='clear'] - 当前的天气类型。
 * @param {object} [props.weatherSettings] - 天气的详细设置，如强度。
 * @returns {object} 返回一个包含音频状态和控制API的对象。
 * - `audioEnabled`, `audioReady`, `masterVolume`, `audioSettings`, `currentSurface`: 音频状态。
 * - `enableAudio`, `disableAudio`, `setMasterVolume`, `setAudioSettings`, `setCurrentSurface`: 控制函数。
 * - `testFootstep`, `testRunstep`, `testJump`, `testLand`: 用于UI调试的测试函数。
 * - `audioAPI`: 底层 `AudioSystem` 的完整API，用于高级操作。
 */
function useAudioController({
  onAudioSystemReady,
  playerMovementState = {isMoving: false, isRunning: false, isJumping: false},
  weatherType = "clear",
  weatherSettings = {intensity: 1.0},
}) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.7);
  const [audioReady, setAudioReady] = useState(false);
  const [audioAPI, setAudioAPI] = useState(null);
  const [lastFootstepTime, setLastFootstepTime] = useState(0);
  const [currentSurface, setCurrentSurface] = useState("grass");
  const lastJumpingRef = useRef(false);

  // Audio settings state, can be controlled from UI
  const [audioSettings, setAudioSettings] = useState({
    footstepVolume: 0.8,
    jumpVolume: 0.6,
    ambientVolume: 0.4,
    weatherVolume: 0.5,
    footstepRate: 500, // milliseconds between footsteps when walking
    runstepRate: 300, // milliseconds between footsteps when running
  });

  // Callbacks for the underlying audio system
  const handleAudioReady = useCallback(() => {
    setAudioReady(true);
    console.log("Audio system ready");
  }, []);

  const handleAudioError = useCallback((error) => {
    console.error("Audio system error:", error);
    setAudioReady(false);
  }, []);

  // Initialize the low-level audio system
  const audioSystem = AudioSystem({
    enabled: audioEnabled,
    masterVolume: masterVolume,
    onAudioReady: handleAudioReady,
    onError: handleAudioError,
  });

  // Store the audio API reference once it's ready
  useEffect(() => {
    if (audioSystem && audioReady) {
      setAudioAPI(audioSystem);
      if (onAudioSystemReady) {
        onAudioSystemReady(audioSystem);
      }
    }
  }, [audioSystem, audioReady, onAudioSystemReady]);

  // Effect to handle player movement sounds
  useEffect(() => {
    if (!audioAPI || !audioReady || !playerMovementState) return;

    const now = Date.now();
    const {isMoving, isRunning, isJumping} = playerMovementState;

    // Edge-trigger jump: trigger only on rising edge
    const wasJumping = lastJumpingRef.current;
    if (isJumping && !wasJumping) {
      audioAPI.playJump(audioSettings.jumpVolume);
    }

    // While jumping, suppress footsteps
    if (!isJumping && isMoving) {
      const stepRate = isRunning
        ? audioSettings.runstepRate
        : audioSettings.footstepRate;

      if (now - lastFootstepTime > stepRate) {
        if (isRunning) {
          audioAPI.playRunstep(currentSurface, audioSettings.footstepVolume);
        } else {
          audioAPI.playFootstep(currentSurface, audioSettings.footstepVolume);
        }
        setLastFootstepTime(now);
      }
    }

    // Update jump state memory
    lastJumpingRef.current = isJumping;
  }, [
    audioAPI,
    audioReady,
    playerMovementState,
    audioSettings,
    lastFootstepTime,
    currentSurface,
  ]);

  // Effect to handle weather and ambient sounds
  useEffect(() => {
    if (!audioAPI || !audioReady) return;

    const {intensity} = weatherSettings;

    // Stop all weather sounds first for a clean transition
    audioAPI.stopWind();
    audioAPI.stopRain();

    // Start appropriate weather sounds based on weatherType
    switch (weatherType) {
      case "rainy":
        audioAPI.startRain(intensity, audioSettings.weatherVolume);
        break;
      case "stormy":
        audioAPI.startRain(intensity * 1.5, audioSettings.weatherVolume);
        audioAPI.startWind(intensity * 0.8, audioSettings.ambientVolume);
        break;
      case "windy":
      case "cloudy":
        audioAPI.startWind(intensity * 0.5, audioSettings.ambientVolume);
        break;
      case "foggy":
        audioAPI.startWind(intensity * 0.3, audioSettings.ambientVolume);
        break;
      default:
        // 'clear' weather has no ambient sounds
        break;
    }
  }, [audioAPI, audioReady, weatherType, weatherSettings, audioSettings]);

  // --- Control Functions ---

  /**
   * Enables the audio system. Required for user interaction policies in browsers.
   */
  const enableAudio = useCallback(async () => {
    if (!audioEnabled) {
      setAudioEnabled(true);
      // The AudioSystem will initialize automatically via its useEffect
    } else if (audioAPI) {
      // If already enabled but context is suspended, try to re-initialize
      await audioAPI.initialize();
    }
  }, [audioEnabled, audioAPI]);

  /**
   * Disables the audio system and cleans up resources.
   */
  const disableAudio = useCallback(() => {
    if (audioAPI) {
      audioAPI.stopWind();
      audioAPI.stopRain();
    }
    setAudioEnabled(false);
    setAudioReady(false);
  }, [audioAPI]);

  // --- Test Functions (for UI) ---

  const testFootstep = useCallback(() => {
    if (audioAPI) {
      audioAPI.playFootstep(currentSurface, audioSettings.footstepVolume);
    }
  }, [audioAPI, currentSurface, audioSettings.footstepVolume]);

  const testRunstep = useCallback(() => {
    if (audioAPI) {
      audioAPI.playRunstep(currentSurface, audioSettings.footstepVolume);
    }
  }, [audioAPI, currentSurface, audioSettings.footstepVolume]);

  const testJump = useCallback(() => {
    if (audioAPI) {
      audioAPI.playJump(audioSettings.jumpVolume);
    }
  }, [audioAPI, audioSettings.jumpVolume]);

  const testLand = useCallback(() => {
    if (audioAPI) {
      audioAPI.playLand(currentSurface, 1.0, audioSettings.jumpVolume); // Test with full intensity
    }
  }, [audioAPI, currentSurface, audioSettings.jumpVolume]);

  // The hook returns a comprehensive API for the UI to use
  return {
    // State
    audioEnabled,
    audioReady,
    masterVolume,
    audioSettings,
    currentSurface,

    // Controls
    enableAudio,
    disableAudio,
    setMasterVolume,
    setAudioSettings,
    setCurrentSurface,

    // Test functions
    testFootstep,
    testRunstep,
    testJump,
    testLand,

    // Expose the raw API for advanced usage if needed
    audioAPI,
  };
}

export default useAudioController;
