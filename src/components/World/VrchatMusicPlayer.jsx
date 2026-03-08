import React, {useEffect, useMemo, useRef, useState} from "react";
import * as THREE from "three";
import {useFrame, useThree} from "@react-three/fiber";
import {Text, useTexture} from "@react-three/drei";

// Playlist is loaded from /assets/music/playlist.json by default.
const DEFAULT_PLAYLIST = [];

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

// Loop modes: all (顺序连播) -> one (单曲循环) -> shuffle (随机) -> off (不循环)
const LOOP_MODES = ["all", "one", "shuffle", "off"];

/**
 * VrchatMusicPlayer
 * - In-world panel UI (mesh hit areas) like VRChat.
 * - Interacts via R3F pointer events, which become crosshair-driven when pointer-lock is active
 *   thanks to CenterAimRaycast.
 * - Uses THREE.Audio + AudioAnalyser (WebAudio) for playback/FFT.
 */
export default function VrchatMusicPlayer({
  position = [0, 1.1, 0],
  rotation = [0, 0, 0],
  scale = 1,
  playlistUrl = "/assets/music/playlist.json",
  coverUrl = "/assets/music/Cover.png",
  volumeDefault = 0.7,
  analyserFftSize = 128,
}) {
  const groupRef = useRef();
  const discRef = useRef();
  const barsRef = useRef([]);

  // Use one AudioListener attached to the main camera.
  const {camera} = useThree();

  // UI state: keep minimal state, use refs for per-frame values
  const [playlist, setPlaylist] = useState(DEFAULT_PLAYLIST);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [title, setTitle] = useState("Music Player");
  const [timeText, setTimeText] = useState("00:00 / 00:00");
  const [loopMode, setLoopMode] = useState("all"); // Default: all (顺序连播)
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const draggingRef = useRef(null); // 'volume' | 'seek' | null
  const volumeRef = useRef(volumeDefault);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const lastTimeUiUpdateRef = useRef(0);

  const listenerRef = useRef(null);
  const soundRef = useRef(null); // THREE.Audio
  const analyserRef = useRef(null);

  const coverTex = useTexture(coverUrl);

  // Load all icon textures
  const iconTex = useTexture({
    play: "/assets/icons/music-icon/play-circle.svg",
    pause: "/assets/icons/music-icon/pause-circle-o.svg",
    next: "/assets/icons/music-icon/next.svg",
    prev: "/assets/icons/music-icon/prev.svg",
    repeat: "/assets/icons/music-icon/repeat.svg",
    repeatOne: "/assets/icons/music-icon/repeat-one.svg",
    shuffle: "/assets/icons/music-icon/random.svg",
    playlist: "/assets/icons/music-icon/playlist.svg",
    volumeHigh: "/assets/icons/music-icon/audio-volume-high.svg",
    volumeNone: "/assets/icons/music-icon/audio-none.svg",
  });

  useMemo(() => {
    if (coverTex) {
      coverTex.colorSpace = THREE.SRGBColorSpace;
      coverTex.anisotropy = 8;
      coverTex.needsUpdate = true;
    }
    // Configure icon textures
    Object.values(iconTex).forEach((t) => {
      if (!t) return;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
    });
  }, [coverTex, iconTex]);

  const mats = useMemo(() => {
    // Main panel: semi-transparent dark
    const panelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#12181f"),
      roughness: 0.9,
      metalness: 0.02,
      transparent: true,
      opacity: 0.92,
      emissive: new THREE.Color("#0a0e14"),
      emissiveIntensity: 0.3,
    });

    // Border/accent glow
    const borderMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1e2a36"),
      roughness: 0.75,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7,
      emissive: new THREE.Color("#0e3b5c"),
      emissiveIntensity: 0.4,
    });

    // Icon button base
    const iconButtonMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#dde8f0"),
      transparent: true,
      opacity: 0.85,
    });

    // Icon button hover/active
    const iconButtonActiveMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#6dd7ff"),
      transparent: true,
      opacity: 1.0,
    });

    // Cover disc
    const coverMat = new THREE.MeshBasicMaterial({map: coverTex});

    // Spectrum bars (vertical now)
    const barMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#b0d9f2"),
      transparent: true,
      opacity: 0.8,
    });

    // Progress/Volume bars
    const trackBgMat = new THREE.MeshBasicMaterial({color: new THREE.Color("#2a3844")});
    const trackFillMat = new THREE.MeshBasicMaterial({color: new THREE.Color("#e8f4fb")});
    const knobMat = new THREE.MeshBasicMaterial({color: new THREE.Color("#d6f3ff")});

    return {panelMat, borderMat, iconButtonMat, iconButtonActiveMat, coverMat, barMat, trackBgMat, trackFillMat, knobMat};
  }, [coverTex]);

  const geo = useMemo(() => {
    // Portrait panel: ~1.2 x 2.4 (3:5 aspect)
    const panel = new THREE.PlaneGeometry(1.2, 2.4);
    const border = new THREE.PlaneGeometry(1.24, 2.44);
    const coverDisc = new THREE.CircleGeometry(0.38, 64);
    // Spectrum bars: vertical now
    const bar = new THREE.BoxGeometry(0.02, 0.2, 0.02);
    // Icon buttons: small squares for hit area
    const iconBtn = new THREE.PlaneGeometry(0.16, 0.16);

    return {panel, border, coverDisc, bar, iconBtn};
  }, []);

  const ensureListener = () => {
    if (listenerRef.current) return listenerRef.current;
    const listener = new THREE.AudioListener();
    camera.add(listener);
    listenerRef.current = listener;
    return listener;
  };

  const audioElRef = useRef(null); // HTMLAudioElement

  const createSound = async (url) => {
    const listener = ensureListener();
    // Use PositionalAudio for distance attenuation
    const sound = new THREE.PositionalAudio(listener);

    // Configure distance model (like VRChat)
    sound.setRefDistance(3);        // Full volume within 3 units
    sound.setRolloffFactor(1.5);    // How fast it attenuates
    sound.setDistanceModel('inverse'); // 'linear' | 'inverse' | 'exponential'
    sound.setMaxDistance(20);       // Max audible distance

    // Use MediaElementAudioSourceNode so we can reliably pause/seek and read currentTime.
    const audioEl = new Audio(url);
    audioEl.crossOrigin = "anonymous";
    audioEl.loop = false;
    audioEl.preload = "auto";
    audioEl.volume = volumeRef.current;

    sound.setMediaElementSource(audioEl);
    audioElRef.current = audioEl;

    // duration is available after metadata
    await new Promise((resolve) => {
      const onMeta = () => resolve();
      audioEl.addEventListener("loadedmetadata", onMeta, {once: true});
      // If cached
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) resolve();
    });

    durationRef.current = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;

    // analyser
    analyserRef.current = new THREE.AudioAnalyser(sound, analyserFftSize);

    soundRef.current = sound;
    
    // Attach to the player group so position moves with it
    if (groupRef.current) {
      groupRef.current.add(sound);
    }

    return sound;
  };

  const stopAndDisposeSound = () => {
    try {
      const el = audioElRef.current;
      if (el) {
        el.pause();
        el.src = "";
      }
    } catch {}

    // Remove sound from group
    if (soundRef.current && groupRef.current) {
      groupRef.current.remove(soundRef.current);
    }

    audioElRef.current = null;
    soundRef.current = null;
    analyserRef.current = null;
    durationRef.current = 0;
    currentTimeRef.current = 0;
  };

  const loadTrack = async (index, {autoplay = false} = {}) => {
    const wasPlaying = autoplay; // Remember if we should play
    stopAndDisposeSound();
    
    const track = playlist[index];
    if (!track?.url) {
      setTitle("Music Player (no tracks)");
      setIsPlaying(false);
      return;
    }

    setTitle(track.title ?? `Track ${index + 1}`);

    try {
      await createSound(track.url);
      
      if (wasPlaying) {
        const el = audioElRef.current;
        if (el) {
          await el.play();
          setIsPlaying(true);
        }
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.warn("MusicPlayer: failed to load track", track?.url, e);
      setIsPlaying(false);
    }
  };

  // Load playlist.json
  useEffect(() => {
    let cancelled = false;

    const loadPlaylist = async () => {
      try {
        const res = await fetch(playlistUrl, {cache: "no-store"});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const tracks = Array.isArray(json?.tracks) ? json.tracks : [];
        if (!cancelled) {
          setPlaylist(tracks);
          setTrackIndex(0);
        }
      } catch (e) {
        console.warn("MusicPlayer: failed to load playlist", playlistUrl, e);
        if (!cancelled) setPlaylist([]);
      }
    };

    loadPlaylist();
    return () => {
      cancelled = true;
    };
  }, [playlistUrl]);

  // Load first track when playlist becomes available
  useEffect(() => {
    loadTrack(0, {autoplay: false});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist?.length]);

  // Handle track end (auto-next based on loop mode)
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;

    const onEnded = () => {
      if (loopMode === "one") {
        // Repeat current track
        el.currentTime = 0;
        el.play().catch(() => {});
        return;
      }

      if (loopMode === "all" || loopMode === "shuffle") {
        // Mark that we should autoplay next track
        shouldAutoplayRef.current = true;
        next();
        return;
      }

      // loopMode === "off": stop
      setIsPlaying(false);
      shouldAutoplayRef.current = false;
    };

    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [loopMode, playlist?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref to track if we should autoplay on next load
  const shouldAutoplayRef = useRef(false);

  // reload when track changes
  useEffect(() => {
    loadTrack(trackIndex, {autoplay: shouldAutoplayRef.current});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex]);

  const togglePlay = async () => {
    const el = audioElRef.current;
    if (!el) return;

    try {
      if (!el.paused) {
        el.pause();
        setIsPlaying(false);
        return;
      }

      await el.play();
      setIsPlaying(true);
    } catch (e) {
      console.warn("MusicPlayer: play failed", e);
      setIsPlaying(false);
    }
  };

  const next = () => {
    if (!playlist?.length) return;
    shouldAutoplayRef.current = isPlaying; // Remember current play state
    
    if (loopMode === "shuffle") {
      const rand = Math.floor(Math.random() * playlist.length);
      setTrackIndex(rand);
    } else {
      setTrackIndex((i) => (i + 1) % playlist.length);
    }
  };

  const prev = () => {
    if (!playlist?.length) return;
    shouldAutoplayRef.current = isPlaying; // Remember current play state
    
    if (loopMode === "shuffle") {
      const rand = Math.floor(Math.random() * playlist.length);
      setTrackIndex(rand);
    } else {
      setTrackIndex((i) => (i - 1 + playlist.length) % playlist.length);
    }
  };

  const toggleLoopMode = () => {
    const idx = LOOP_MODES.indexOf(loopMode);
    const next = LOOP_MODES[(idx + 1) % LOOP_MODES.length];
    setLoopMode(next);
  };

  const getLoopIcon = () => {
    if (loopMode === "one") return iconTex.repeatOne;
    if (loopMode === "shuffle") return iconTex.shuffle;
    if (loopMode === "all") return iconTex.repeat;
    return null; // off
  };

  const toggleMute = () => {
    const el = audioElRef.current;
    if (!el) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    el.muted = newMuted;
  };

  const formatTime = (sec) => {
    if (!Number.isFinite(sec)) sec = 0;
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // UI helper: map pointer x (local) to [0..1]
  const barValueFromEvent = (e, barWidth, centerX = 0) => {
    // e.point is in world coords; convert to local.
    const p = e.point.clone();
    groupRef.current?.worldToLocal(p);
    // bar local x: centerX +/- barWidth/2
    const v = (p.x - centerX + barWidth / 2) / barWidth;
    return clamp01(v);
  };

  const seekKnobRef = useRef();

  useFrame(() => {
    // rotate disc
    if (discRef.current && isPlaying) {
      discRef.current.rotation.z -= 0.02;
    }

    // analyser bars (vertical scale)
    const analyser = analyserRef.current;
    if (analyser && barsRef.current.length) {
      const data = analyser.getFrequencyData();
      const n = Math.min(data.length, barsRef.current.length);
      for (let i = 0; i < n; i++) {
        const v = data[i] / 255;
        const mesh = barsRef.current[i];
        if (!mesh) continue;
        mesh.scale.y = 0.3 + v * 2.5; // taller vertical stretch
      }
    }

    // time/progress
    const el = audioElRef.current;
    const dur = durationRef.current;
    if (el && Number.isFinite(el.currentTime)) {
      currentTimeRef.current = el.currentTime;
    }

    // Update seek knob via refs (no react state)
    if (seekKnobRef.current && dur > 0) {
      const p = clamp01(currentTimeRef.current / dur);
      seekKnobRef.current.position.x = -0.5 + 1.0 * p;
    }
    
    // Update volume knob
    if (volumeKnobRef.current) {
      volumeKnobRef.current.position.x = -0.4 + 0.9 * volumeRef.current;
    }

    // update time text at low frequency (avoid rerenders)
    const now = performance.now();
    if (now - lastTimeUiUpdateRef.current > 200) {
      lastTimeUiUpdateRef.current = now;
      const t = currentTimeRef.current;
      setTimeText(`${formatTime(t)} / ${formatTime(dur)}`);
    }
  });

  // Pointer handlers (crosshair-driven under pointer-lock)
  const onVolumeDown = (e) => {
    e.stopPropagation();
    draggingRef.current = "volume";
    const v = barValueFromEvent(e, 0.9, 0.05);
    volumeRef.current = v;
    const el = audioElRef.current;
    if (el) el.volume = v;
  };
  const onSeekDown = (e) => {
    e.stopPropagation();
    draggingRef.current = "seek";
    const v = barValueFromEvent(e, 1.0, 0);
    const el = audioElRef.current;
    const dur = durationRef.current;
    if (el && dur > 0) {
      el.currentTime = v * dur;
    }
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    e.stopPropagation();

    if (draggingRef.current === "volume") {
      const v = barValueFromEvent(e, 0.9, 0.05);
      volumeRef.current = v;
      const el = audioElRef.current;
      if (el) el.volume = v;
      return;
    }

    if (draggingRef.current === "seek") {
      const v = barValueFromEvent(e, 1.0, 0);
      const el = audioElRef.current;
      const dur = durationRef.current;
      if (el && dur > 0) {
        el.currentTime = v * dur;
      }
    }
  };
  const onPointerUp = (e) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = null;
  };

  // While holding, keep dragging
  const onSeekDragStart = (e) => {
    e.stopPropagation();
    draggingRef.current = "seek";
    onSeekDown(e);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopAndDisposeSound();
      if (listenerRef.current && camera) {
        camera.remove(listenerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build FFT ring bars (vertical now)
  const barMeshes = useMemo(() => {
    const count = 64;
    const radius = 0.48;
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      out.push({
        key: i,
        pos: [x, y, 0.02],
        rot: [0, 0, a + Math.PI / 2], // rotate so bar points outward vertically
      });
    }
    return out;
  }, []);

  const volumeKnobRef = useRef();

  const IconButton = ({position, iconMap, onClick, active = false}) => {
    if (!iconMap) {
      // Loop off: show placeholder or empty
      return (
        <group position={position}>
          <mesh geometry={geo.iconBtn} material={mats.iconButtonMat} onPointerDown={onClick}>
            <meshBasicMaterial color="#3a4a57" transparent opacity={0.5} />
          </mesh>
        </group>
      );
    }
    return (
      <group position={position}>
        <mesh geometry={geo.iconBtn} material={active ? mats.iconButtonActiveMat : mats.iconButtonMat} onPointerDown={onClick}>
          <meshBasicMaterial map={iconMap} transparent />
        </mesh>
      </group>
    );
  };

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {/* Border glow */}
      <mesh geometry={geo.border} material={mats.borderMat} position={[0, 0, -0.005]} />

      {/* Main panel */}
      <mesh geometry={geo.panel} material={mats.panelMat} />

      {/* === Top: Title + Volume === */}
      <group position={[0, 1.0, 0.02]}>
        <Text position={[0, 0, 0]} fontSize={0.11} color="#e8f4fb" anchorX="center" anchorY="middle" maxWidth={1.0} overflowWrap="break-word">
          {title}
        </Text>
      </group>

      {/* Volume bar */}
      <group position={[0, 0.75, 0.02]}>
        <mesh
          position={[-0.55, 0, 0]}
          onPointerDown={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
        >
          <planeGeometry args={[0.08, 0.08]} />
          <meshBasicMaterial map={isMuted ? iconTex.volumeNone : iconTex.volumeHigh} transparent />
        </mesh>
        <mesh position={[0.05, 0, 0]} onPointerDown={onVolumeDown} onPointerUp={onPointerUp}>
          <planeGeometry args={[0.9, 0.06]} />
          <primitive object={mats.trackBgMat} attach="material" />
        </mesh>
        {/* Volume knob */}
        <mesh ref={volumeKnobRef} position={[-0.4 + 0.9 * volumeRef.current, 0, 0.01]}>
          <circleGeometry args={[0.035, 16]} />
          <primitive object={mats.knobMat} attach="material" />
        </mesh>
      </group>

      {/* === Center: Cover + FFT ring === */}
      <group position={[0, 0.15, 0.03]} ref={discRef}>
        <mesh geometry={geo.coverDisc} material={mats.coverMat} />
        {/* FFT ring (vertical bars) */}
        {barMeshes.map((b, idx) => (
          <mesh
            key={b.key}
            geometry={geo.bar}
            material={mats.barMat}
            position={b.pos}
            rotation={b.rot}
            ref={(el) => {
              barsRef.current[idx] = el;
            }}
          />
        ))}
      </group>

      {/* === Bottom: Progress + Time + Buttons === */}
      <group position={[0, -0.5, 0.02]}>
        <Text position={[0, 0.0, 0]} fontSize={0.08} color="#b5c9d6" anchorX="center" anchorY="middle">
          {timeText}
        </Text>
      </group>

      {/* Seek bar */}
      <group position={[0, -0.65, 0.02]}>
        <mesh position={[0, 0, 0]} onPointerDown={onSeekDragStart} onPointerUp={onPointerUp}>
          <planeGeometry args={[1.0, 0.06]} />
          <primitive object={mats.trackBgMat} attach="material" />
        </mesh>
        <mesh ref={seekKnobRef} position={[-0.5, 0, 0.01]}>
          <circleGeometry args={[0.035, 16]} />
          <primitive object={mats.knobMat} attach="material" />
        </mesh>
      </group>

      {/* 5 Buttons: Loop | Prev | Play/Pause | Next | Playlist */}
      <group position={[0, -0.95, 0.03]}>
        {/* Loop mode */}
        <IconButton
          position={[-0.32, 0, 0]}
          iconMap={getLoopIcon()}
          onClick={(e) => {
            e.stopPropagation();
            toggleLoopMode();
          }}
          active={loopMode !== "off"}
        />

        {/* Prev */}
        <IconButton
          position={[-0.16, 0, 0]}
          iconMap={iconTex.prev}
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
        />

        {/* Play/Pause */}
        <IconButton
          position={[0.0, 0, 0]}
          iconMap={isPlaying ? iconTex.pause : iconTex.play}
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          active={isPlaying}
        />

        {/* Next */}
        <IconButton
          position={[0.16, 0, 0]}
          iconMap={iconTex.next}
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
        />

        {/* Playlist */}
        <IconButton
          position={[0.32, 0, 0]}
          iconMap={iconTex.playlist}
          onClick={(e) => {
            e.stopPropagation();
            setShowPlaylist((s) => !s);
          }}
          active={showPlaylist}
        />
      </group>

      {/* Playlist modal (top-right corner) */}
      {showPlaylist && playlist?.length > 0 && (
        <group position={[0.62, 0.6, 0.05]}>
          <mesh>
            <planeGeometry args={[0.56, 1.2]} />
            <meshStandardMaterial color="#0e1419" transparent opacity={0.95} />
          </mesh>
          {/* List items */}
          {playlist.slice(0, 8).map((track, i) => (
            <Text
              key={i}
              position={[0, 0.52 - i * 0.14, 0.01]}
              fontSize={0.07}
              color={i === trackIndex ? "#6dd7ff" : "#b5c9d6"}
              anchorX="center"
              anchorY="middle"
              maxWidth={0.5}
              overflowWrap="break-word"
              onPointerDown={(e) => {
                e.stopPropagation();
                setTrackIndex(i);
              }}
            >
              {track.title || `Track ${i + 1}`}
            </Text>
          ))}
        </group>
      )}
    </group>
  );
}
