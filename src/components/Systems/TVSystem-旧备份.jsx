import {useRef, useEffect, useState, useCallback} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import {useBox} from "@react-three/cannon";
import {FontLoader} from "three/examples/jsm/loaders/FontLoader.js";
import {TextGeometry} from "three/examples/jsm/geometries/TextGeometry.js";
import * as THREE from "three";

// 我们可以把 VideoTexture 的创建也封装成一个 Hook，使其更可复用
function useVideoTexture(videoElement) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!videoElement) return;
    const tex = new THREE.VideoTexture(videoElement);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.format = THREE.RGBAFormat;
    setTexture(tex);

    return () => {
      tex.dispose();
    };
  }, [videoElement]);
  return texture;
}

function TVSystem({position = [0, 2.5, -3.9]}) {
  const {scene} = useThree();
  const tvGroupRef = useRef();
  const tvMeshRef = useRef();
  const screenRef = useRef();
  const progressBarFillRef = useRef();
  const timerMeshRef = useRef();
  const subtitleGroupRef = useRef();

  // 使用 useRef 存储 DOM 元素和 Three.js 对象，避免不必要的重渲染
  const videoRef = useRef(null);

  const [loadedFont, setLoadedFont] = useState(null);
  const [isSubtitlesActive, setIsSubtitlesActive] = useState(false);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [subtitleParticles, setSubtitleParticles] = useState([]);
  const [currentSubtitles, setCurrentSubtitles] = useState(null);
  const [charGeometryCache, setCharGeometryCache] = useState({});

  // 使用自定义 Hook 创建 video texture
  const videoTexture = useVideoTexture(videoRef.current);

  // 创建 video DOM 元素，只在组件挂载时执行一次
  useEffect(() => {
    const videoElement = document.createElement("video");
    videoElement.setAttribute("playsinline", "");
    videoElement.muted = false; // 为了浏览器自动播放，通常需要静音
    videoElement.loop = false;
    videoElement.crossOrigin = "anonymous";
    videoRef.current = videoElement;

    // Load font for subtitles and timer
    new FontLoader().load(
      "/assets/fonts/Ma_Shan_Zheng_Regular.json",
      (font) => {
        setLoadedFont(font);
        // Pre-cache character geometries
        const chars =
          "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.,!?()[]{}\"'`~@#$%^&*-_+=|\\/<>?";
        const createCharGeometry = (char) => {
          try {
            const geometry = new TextGeometry(char, {
              font,
              size: 0.2,
              height: 0.01,
              curveSegments: 4,
              bevelEnabled: false,
            });
            const positions = geometry.attributes.position.array;
            for (let i = 2; i < positions.length; i += 3) {
              if (positions[i] > 0.01) positions[i] = 0.01;
              if (positions[i] < -0.01) positions[i] = -0.01;
            }
            geometry.attributes.position.needsUpdate = true;
            geometry.computeBoundingBox();
            return geometry;
          } catch (error) {
            return null;
          }
        };
        const cache = {};
        for (let i = 0; i < chars.length; i++) {
          const char = chars[i];
          const geometry = createCharGeometry(char);
          if (geometry) cache[char] = geometry;
        }
        setCharGeometryCache(cache);
      },
      undefined,
      (error) => {
        console.error("Font loading failed:", error);
      }
    );

    return () => {
      // 组件卸载时清理
      const vid = videoRef.current;
      if (vid) {
        vid.pause();
        vid.src = "";
        vid.removeAttribute("src");
      }
    };
  }, []); // 空依赖数组确保只运行一次

  // 重构 message 事件监听器
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return; // 如果 video 元素还未创建，则不添加监听器

    const handleMessage = (event) => {
      const allowedOrigins = ["https://nankawa-chie.vercel.app"];
      const isLocalhost =
        event.origin.startsWith("http://localhost:") ||
        event.origin.startsWith("http://127.0.0.1:") ||
        event.origin === window.location.origin;
      if (!isLocalhost && !allowedOrigins.includes(event.origin)) return;

      const data = event.data;
      if (data && data.type === "VIDEO_CONTROL") {
        if (data.action === "PLAY" && data.videoURL) {
          // Reset subtitle state
          disperseSubtitleParticles();
          setCurrentSubtitleIndex(0);
          setCurrentSubtitles(data.subtitles || null);
          setIsSubtitlesActive(false);

          const playPromise = () => {
            video
              .play()
              .then(() => {
                setIsSubtitlesActive(true);
              })
              .catch((e) => {
                console.warn(
                  "Video play failed, likely due to browser policy. Trying muted.",
                  e
                );
                video.muted = true;
                video
                  .play()
                  .then(() => {
                    setIsSubtitlesActive(true);
                  })
                  .catch((e2) => console.error("Muted play also failed.", e2));
              });
          };

          // 清理旧的监听器以防万一
          video.removeEventListener("canplay", playPromise);

          video.src = data.videoURL;
          video.addEventListener("canplay", playPromise, {once: true});
          video.load();
          video.onerror = (e) => {
            console.error("Video loading error:", e);
            setIsSubtitlesActive(false);
          };
        } else if (data.action === "PAUSE") {
          video.pause();
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []); // 空依赖数组，但内部逻辑依赖于 ref.current 的存在

  // Create subtitle particles
  const createSubtitleParticles = (text) => {
    if (!loadedFont || !subtitleGroupRef.current || !charGeometryCache) return;
    let totalWidth = 0;
    const charSpacing = 0.1;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === " ") {
        totalWidth += charSpacing * 2;
        continue;
      }
      let charGeometry = charGeometryCache[char];
      if (!charGeometry) {
        try {
          charGeometry = new TextGeometry(char, {
            font: loadedFont,
            size: 0.2,
            height: 0.01,
            curveSegments: 4,
            bevelEnabled: false,
          });
          const positions = charGeometry.attributes.position.array;
          for (let i = 2; i < positions.length; i += 3) {
            if (positions[i] > 0.01) positions[i] = 0.01;
            if (positions[i] < -0.01) positions[i] = -0.01;
          }
          charGeometry.attributes.position.needsUpdate = true;
          charGeometry.computeBoundingBox();
          setCharGeometryCache((prev) => ({...prev, [char]: charGeometry}));
        } catch (error) {
          continue;
        }
      }
      if (charGeometry && charGeometry.boundingBox) {
        const charWidth =
          charGeometry.boundingBox.max.x - charGeometry.boundingBox.min.x;
        totalWidth += charWidth + charSpacing;
      }
    }
    let currentXOffset = -totalWidth / 2;
    const newParticles = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === " ") {
        currentXOffset += charSpacing * 2;
        continue;
      }
      let charGeometry = charGeometryCache[char];
      if (!charGeometry) {
        try {
          charGeometry = new TextGeometry(char, {
            font: loadedFont,
            size: 0.2,
            height: 0.01,
            curveSegments: 4,
            bevelEnabled: false,
          });
          const positions = charGeometry.attributes.position.array;
          for (let i = 2; i < positions.length; i += 3) {
            if (positions[i] > 0.01) positions[i] = 0.01;
            if (positions[i] < -0.01) positions[i] = -0.01;
          }
          charGeometry.attributes.position.needsUpdate = true;
          charGeometry.computeBoundingBox();
          setCharGeometryCache((prev) => ({...prev, [char]: charGeometry}));
        } catch (error) {
          continue;
        }
      }
      if (!charGeometry) continue;
      const charWidth =
        charGeometry.boundingBox.max.x - charGeometry.boundingBox.min.x;
      const posX = currentXOffset + charWidth / 2;
      currentXOffset += charWidth + charSpacing;
      const charMesh = new THREE.Mesh(charGeometry, subtitleMaterial);
      const targetPos = new THREE.Vector3(
        position[0] + posX,
        position[1] - 0.5,
        position[2] + 15.8
      );
      charMesh.position.set(
        targetPos.x + (Math.random() - 0.5) * 10,
        targetPos.y + (Math.random() - 0.5) * 10 + 5,
        targetPos.z + (Math.random() - 0.5) * 10
      );
      charMesh.rotation.set(
        (Math.random() - 0.5) * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI * 2
      );
      charMesh.scale.set(0.01, 0.01, 0.01);
      subtitleGroupRef.current.add(charMesh);
      const particle = {
        mesh: charMesh,
        moveTo: targetPos,
        startTime: Date.now(),
      };
      newParticles.push(particle);
      if (typeof window.gsap !== "undefined") {
        window.gsap.to(charMesh.position, {
          duration: 1.5,
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z,
          ease: "power2.out",
        });
        window.gsap.to(charMesh.rotation, {
          duration: 1.5,
          x: 0,
          y: 0,
          z: 0,
          ease: "power2.out",
        });
        window.gsap.to(charMesh.scale, {
          duration: 1.5,
          x: 1,
          y: 1,
          z: 1,
          ease: "power2.out",
        });
      } else {
        charMesh.position.copy(targetPos);
        charMesh.rotation.set(0, 0, 0);
        charMesh.scale.set(1, 1, 1);
      }
    }
    setSubtitleParticles(newParticles);
  };

  // Disperse subtitle particles
  const disperseSubtitleParticles = () => {
    if (!subtitleGroupRef.current || subtitleParticles.length === 0) return;
    subtitleParticles.forEach((particle) => {
      if (!particle || !particle.mesh) return;
      const randomPos = {
        x: particle.mesh.position.x + (Math.random() - 0.5) * 15,
        y: particle.mesh.position.y + (Math.random() - 0.5) * 15,
        z: particle.mesh.position.z + (Math.random() - 0.5) * 15,
      };
      const randomRot = {
        x: (Math.random() - 0.5) * Math.PI * 4,
        y: (Math.random() - 0.5) * Math.PI * 4,
        z: (Math.random() - 0.5) * Math.PI * 4,
      };
      if (typeof window.gsap !== "undefined") {
        window.gsap.to(particle.mesh.position, {
          duration: 1.0,
          x: randomPos.x,
          y: randomPos.y,
          z: randomPos.z,
          ease: "power1.in",
        });
        window.gsap.to(particle.mesh.rotation, {
          duration: 1.0,
          x: randomRot.x,
          y: randomRot.y,
          z: randomRot.z,
          ease: "power1.in",
        });
        window.gsap.to(particle.mesh.scale, {
          duration: 1.0,
          x: 0.01,
          y: 0.01,
          z: 0.01,
          ease: "power1.in",
          onComplete: () => {
            if (particle.mesh.geometry) particle.mesh.geometry.dispose();
            subtitleGroupRef.current?.remove(particle.mesh);
          },
        });
      } else {
        if (particle.mesh.geometry) particle.mesh.geometry.dispose();
        subtitleGroupRef.current.remove(particle.mesh);
      }
    });
    setSubtitleParticles([]);
  };

  // Update timer mesh
  const updateTimerMesh = (text) => {
    if (!loadedFont || !tvMeshRef.current) return;
    if (timerMeshRef.current) {
      if (timerMeshRef.current.geometry)
        timerMeshRef.current.geometry.dispose();
      tvMeshRef.current.remove(timerMeshRef.current);
    }
    const timerGeometry = new TextGeometry(text, {
      font: loadedFont,
      size: 0.1,
      height: 0.01,
      curveSegments: 4,
      bevelEnabled: false,
    });
    const positions = timerGeometry.attributes.position.array;
    for (let i = 2; i < positions.length; i += 3) {
      if (positions[i] > 0.01) positions[i] = 0.01;
      if (positions[i] < -0.01) positions[i] = -0.01;
    }
    timerGeometry.attributes.position.needsUpdate = true;
    timerGeometry.computeBoundingBox();
    timerGeometry.center();
    const timerMesh = new THREE.Mesh(timerGeometry, timerMaterial);
    timerMesh.position.set(1.2, -(2.25 / 2) - 0.1 * 1.5, 0.11 + 0.01);
    tvMeshRef.current.add(timerMesh);
    timerMeshRef.current = timerMesh;
  };

  // Animation loop for subtitles and progress
  useFrame(() => {
    const video = videoRef.current;
    if (
      video &&
      video.duration > 0 &&
      progressBarFillRef.current &&
      loadedFont
    ) {
      const progress = video.currentTime / video.duration;
      if (isFinite(progress)) {
        progressBarFillRef.current.scale.x = Math.max(0, Math.min(1, progress));
        progressBarFillRef.current.position.x =
          -(2 / 2) * (1 - progressBarFillRef.current.scale.x);
        const currentTime = video.currentTime;
        const minutes = Math.floor(currentTime / 60)
          .toString()
          .padStart(2, "0");
        const seconds = Math.floor(currentTime % 60)
          .toString()
          .padStart(2, "0");
        updateTimerMesh(`${minutes}:${seconds}`);
      }
    } else if (progressBarFillRef.current) {
      progressBarFillRef.current.scale.x = 0;
      progressBarFillRef.current.position.x = -1;
      updateTimerMesh("00:00");
    }
    if (
      isSubtitlesActive &&
      video &&
      video.readyState >= video.HAVE_ENOUGH_DATA &&
      currentSubtitles &&
      !video.paused
    ) {
      const elapsedTime = video.currentTime;
      if (currentSubtitleIndex < currentSubtitles.length) {
        const subtitle = currentSubtitles[currentSubtitleIndex];
        const currentlyDisplaying = subtitleParticles.length > 0;
        if (elapsedTime >= subtitle.start && elapsedTime < subtitle.end) {
          if (!currentlyDisplaying) createSubtitleParticles(subtitle.text);
        } else if (elapsedTime >= subtitle.end) {
          if (currentlyDisplaying) disperseSubtitleParticles();
          setCurrentSubtitleIndex((prev) => prev + 1);
        } else if (elapsedTime < subtitle.start && currentlyDisplaying) {
          disperseSubtitleParticles();
        }
      } else {
        if (subtitleParticles.length > 0) disperseSubtitleParticles();
      }
    }
  });

  // TV physics collision
  const [tvPhysicsRef] = useBox(() => ({
    position,
    args: [4, 2.25, 0.2],
    type: "Static",
  }));

  // Materials for subtitles and timer
  const subtitleMaterial = new THREE.MeshBasicMaterial({color: 0xffffff});
  const timerMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00});

  return (
    <group ref={tvGroupRef} position={position}>
      <group ref={subtitleGroupRef} />
      <mesh ref={tvMeshRef} castShadow>
        <boxGeometry args={[4, 2.25, 0.2]} />
        <meshStandardMaterial color="#2a2a2a" />
        <mesh ref={screenRef} position={[0, 0, 0.11]}>
          <planeGeometry args={[3.8, 2.1]} />
          <meshBasicMaterial
            key={videoTexture ? "video-ready" : "video-loading"}
            map={videoTexture}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, -(2.25 / 2) - 0.1 * 1.5, 0.11]}>
          <boxGeometry args={[2, 0.1, 0.02]} />
          <meshBasicMaterial color="#222222" transparent opacity={0.7} />
          <mesh ref={progressBarFillRef} position={[-1, 0, 0.01]}>
            <boxGeometry args={[2, 0.1, 0.02]} />
            <meshBasicMaterial color="#00ff00" />
          </mesh>
        </mesh>
      </mesh>
      <mesh ref={tvPhysicsRef} visible={false}>
        <boxGeometry args={[4, 2.25, 0.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

export default TVSystem;
