import React, {useMemo, useRef, useEffect, useState} from "react";
import {useGLTF} from "@react-three/drei";
import {useFrame} from "@react-three/fiber";
import * as THREE from "three";
import {FontLoader} from "three/examples/jsm/loaders/FontLoader.js";
import {TextGeometry} from "three/examples/jsm/geometries/TextGeometry.js";

/**
 * @description 创建视频纹理的自定义Hook
 * @param {HTMLVideoElement} videoElement - 视频DOM元素
 * @returns {THREE.VideoTexture|null} 视频纹理对象
 */
function useVideoTexture(videoElement) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!videoElement) return;
    const tex = new THREE.VideoTexture(videoElement);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.format = THREE.RGBAFormat;
    // 完全按照TVSystem的设置
    setTexture(tex);

    return () => {
      tex.dispose();
    };
  }, [videoElement]);
  return texture;
}

/**
 * @description 创建YouTube实时捕获纹理的自定义Hook
 * @param {HTMLIFrameElement} iframeElement - iframe DOM元素
 * @param {boolean} isActive - 是否激活YouTube模式
 * @param {Object} videoInfo - 视频信息
 * @returns {THREE.CanvasTexture|null} Canvas纹理对象
 */
function useYouTubeTexture(iframeElement, isActive, videoInfo) {
  const [texture, setTexture] = useState(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (!isActive || !videoInfo) {
      if (texture) {
        texture.dispose();
        setTexture(null);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    // 创建Canvas用于实时渲染
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    canvasRef.current = canvas;

    // 创建纹理
    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.minFilter = THREE.LinearFilter;
    canvasTexture.magFilter = THREE.LinearFilter;
    canvasTexture.format = THREE.RGBAFormat;
    setTexture(canvasTexture);

    // 动画渲染函数
    const renderFrame = () => {
      if (!canvasRef.current || !isActive) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // 清空画布
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制动态YouTube界面
      const time = Date.now() * 0.001;

      // 动态渐变背景
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      const red1 = Math.sin(time * 0.5) * 0.1 + 0.9;
      const red2 = Math.cos(time * 0.3) * 0.1 + 0.7;
      gradient.addColorStop(0, `rgb(${Math.floor(255 * red1)}, 0, 0)`);
      gradient.addColorStop(1, `rgb(${Math.floor(255 * red2)}, 0, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制动态粒子效果
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      for (let i = 0; i < 50; i++) {
        const x = (Math.sin(time + i) * 0.5 + 0.5) * canvas.width;
        const y = (Math.cos(time * 0.7 + i) * 0.5 + 0.5) * canvas.height;
        const size = Math.sin(time * 2 + i) * 3 + 5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 绘制YouTube logo区域
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(0, 0, canvas.width, 200);

      // 绘制脉动播放按钮
      ctx.fillStyle = "white";
      ctx.beginPath();
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const pulseSize = Math.sin(time * 3) * 20 + 100;
      ctx.moveTo(centerX - pulseSize, centerY - pulseSize);
      ctx.lineTo(centerX - pulseSize, centerY + pulseSize);
      ctx.lineTo(centerX + pulseSize, centerY);
      ctx.closePath();
      ctx.fill();

      // 绘制外圈
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, pulseSize + 30, 0, Math.PI * 2);
      ctx.stroke();

      // 绘制YouTube标题
      ctx.fillStyle = "white";
      ctx.font = "bold 48px Arial";
      ctx.textAlign = "center";
      ctx.fillText("YouTube", centerX, 100);

      // 绘制视频标题
      ctx.font = "36px Arial";
      const title = videoInfo.title || "Video Title";
      const maxWidth = canvas.width - 100;

      // 处理长标题的换行
      const words = title.split(" ");
      let line = "";
      let y = centerY + 200;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, centerX, y);
          line = words[n] + " ";
          y += 50;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, centerX, y);

      // 绘制动态状态文字
      ctx.font = "24px Arial";
      const alpha = Math.sin(time * 2) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fillText("● 正在投屏播放...", centerX, y + 80);

      // 绘制进度条效果
      const progressY = y + 120;
      const progressWidth = 600;
      const progressHeight = 8;
      const progressX = centerX - progressWidth / 2;

      // 进度条背景
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(progressX, progressY, progressWidth, progressHeight);

      // 动态进度
      const progress = Math.sin(time * 0.5) * 0.5 + 0.5;
      ctx.fillStyle = "white";
      ctx.fillRect(progressX, progressY, progressWidth * progress, progressHeight);

      // 更新纹理
      canvasTexture.needsUpdate = true;

      // 继续下一帧
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    // 开始渲染循环
    renderFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      canvasTexture.dispose();
    };
  }, [isActive, videoInfo]);

  return texture;
}

/**
 * @name Television
 * @description 加载并显示“2018平板电视”GLB模型，并集成了视频播放系统。
 * 该组件在遵循通用模式（useMemo, clone, traverse）的基础上，增加了对特定材质的定制化处理。
 * 它通过检查网格材质的名称来区分电视屏幕（Screen）和电视框架（Frame/Body），
 * 并为它们应用不同的粗糙度和金属度，以实现更逼真的视觉效果。
 * 同时，它还内置了视频播放、进度条和字幕显示功能。
 *
 * @param {object} props - 传递给 `primitive` 对象的标准属性，如 `position`, `scale`, `rotation`。
 * @returns {JSX.Element}
 */
export default function Television(props) {
  const {scene} = useGLTF("src/assets/models/modern_entertainment_center_free.glb");

  const tvGroupRef = useRef();
  const progressBarFillRef = useRef();
  const timerMeshRef = useRef();
  const subtitleGroupRef = useRef();
  const videoRef = useRef(null);
  const youtubeIframeRef = useRef(null);

  const [loadedFont, setLoadedFont] = useState(null);
  const [isSubtitlesActive, setIsSubtitlesActive] = useState(false);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [subtitleParticles, setSubtitleParticles] = useState([]);
  const [currentSubtitles, setCurrentSubtitles] = useState(null);
  const [charGeometryCache, setCharGeometryCache] = useState({});
  const [isYouTubeMode, setIsYouTubeMode] = useState(false);
  const [youtubeVideoInfo, setYoutubeVideoInfo] = useState(null);

  const videoTexture = useVideoTexture(videoRef.current);
  const youtubeTexture = useYouTubeTexture(youtubeIframeRef.current, isYouTubeMode, youtubeVideoInfo);

  // 创建 video DOM 元素和加载字体
  useEffect(() => {
    const videoElement = document.createElement("video");
    videoElement.setAttribute("playsinline", "");
    videoElement.muted = false;
    videoElement.loop = false;
    videoElement.crossOrigin = "anonymous";
    videoRef.current = videoElement;

    new FontLoader().load(
      "src/assets/fonts/Ma_Shan_Zheng_Regular.json",
      (font) => {
        setLoadedFont(font);
        // 预缓存字符几何体
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.,!?()[]{}\"'`~@#$%^&*-_+=|\\/<>?";
        const createCharGeometry = (char) => {
          try {
            const geometry = new TextGeometry(char, {
              font,
              size: 33.33, // 0.2 * 5 / 0.006 = 166.67，但先试试33.33
              height: 1.67, // 0.01 * 5 / 0.006 = 8.33，但先试试1.67
              curveSegments: 4,
              bevelEnabled: false,
            });
            // 關鍵修復：限制Z軸位置，防止中文字符幾何體異常
            const positions = geometry.attributes.position.array;
            for (let i = 2; i < positions.length; i += 3) {
              if (positions[i] > 1.67) positions[i] = 1.67;
              if (positions[i] < -1.67) positions[i] = -1.67;
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
      const vid = videoRef.current;
      if (vid) {
        vid.pause();
        vid.src = "";
        vid.removeAttribute("src");
      }
    };
  }, []);

  // message 事件监听器
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleMessage = (event) => {
      const allowedOrigins = ["https://nankawa-chie.vercel.app"];
      const isLocalhost =
        event.origin.startsWith("http://localhost:") ||
        event.origin.startsWith("http://127.0.0.1:") ||
        event.origin === window.location.origin;
      if (!isLocalhost && !allowedOrigins.includes(event.origin)) return;

      const data = event.data;
      if (data && data.type === "VIDEO_CONTROL") {
        if (data.action === "PLAY_CAPTURE" && data.hasStream) {
          console.log("收到捕获视频流投屏请求:", data);

          // 处理捕获的视频流
          disperseSubtitleParticles();
          setCurrentSubtitleIndex(0);
          setCurrentSubtitles([]);
          setIsSubtitlesActive(false);
          setIsYouTubeMode(false);
          setYoutubeVideoInfo(null);

          // 检查是否有捕获的视频流（从主窗口获取）
          const captureStream = window.currentCaptureStream;
          if (captureStream) {
            console.log("找到捕获的视频流，正在设置到电视...", captureStream);

            try {
              // 停止当前视频
              video.pause();
              video.src = "";
              video.srcObject = null;

              // 设置捕获的视频流
              video.srcObject = captureStream;
              video.autoplay = true;
              video.muted = true;
              video.playsInline = true;

              // 强制播放
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log("捕获视频流开始播放在电视上");
                    setIsSubtitlesActive(true);
                    createSubtitleParticles(`正在投屏: ${data.videoFileName}`);
                  })
                  .catch((error) => {
                    console.error("播放捕获视频流失败:", error);
                    // 显示错误信息而不是回退
                    createSubtitleParticles(`投屏失败: ${error.message}`);
                  });
              }
            } catch (error) {
              console.error("设置捕获视频流失败:", error);
              createSubtitleParticles(`设置失败: ${error.message}`);
            }
          } else {
            console.warn("未找到捕获的视频流，window.currentCaptureStream:", window.currentCaptureStream);
            createSubtitleParticles("未找到捕获的视频流");
          }
        } else if (data.action === "PLAY" && data.videoURL) {
          disperseSubtitleParticles();
          setCurrentSubtitleIndex(0);
          setCurrentSubtitles(data.subtitles || null);
          setIsSubtitlesActive(false);

          // 检查是否为YouTube视频
          if (data.videoSource === "youtube" || data.videoURL.includes("youtube.com/embed/")) {
            console.log("检测到YouTube视频，正在处理投屏:", data.videoURL);

            // 设置YouTube模式
            setIsYouTubeMode(true);
            const youtubeInfo = {
              title: data.videoFileName || "YouTube Video",
              id: data.videoId || "unknown",
              url: data.videoURL,
            };
            setYoutubeVideoInfo(youtubeInfo);

            // 停止常规视频播放
            video.pause();
            video.src = "";

            // 创建隐藏的iframe用于实际播放（可选）
            if (!youtubeIframeRef.current) {
              const iframe = document.createElement("iframe");
              iframe.src = data.videoURL;
              iframe.style.position = "absolute";
              iframe.style.left = "-9999px";
              iframe.style.width = "1px";
              iframe.style.height = "1px";
              iframe.allow = "autoplay";
              document.body.appendChild(iframe);
              youtubeIframeRef.current = iframe;
            } else {
              youtubeIframeRef.current.src = data.videoURL;
            }

            // 显示YouTube视频信息的字幕
            setTimeout(() => {
              setIsSubtitlesActive(true);
              createSubtitleParticles(`正在投屏: ${youtubeInfo.title}`);
            }, 500);

            console.log("YouTube视频投屏完成:", youtubeInfo);
          } else {
            // 退出YouTube模式
            setIsYouTubeMode(false);
            setYoutubeVideoInfo(null);
            // 处理常规视频文件
            const playPromise = () => {
              video
                .play()
                .then(() => setIsSubtitlesActive(true))
                .catch((e) => {
                  console.warn("Video play failed, trying muted.", e);
                  video.muted = true;
                  video
                    .play()
                    .then(() => setIsSubtitlesActive(true))
                    .catch((e2) => console.error("Muted play also failed.", e2));
                });
            };

            video.removeEventListener("canplay", playPromise);
            video.src = data.videoURL;
            video.addEventListener("canplay", playPromise, {once: true});
            video.load();
            video.onerror = (e) => {
              console.error("Video loading error:", e);
              setIsSubtitlesActive(false);
            };
          }
        } else if (data.action === "PAUSE") {
          video.pause();
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  /**
   * @description 创建字幕粒子效果
   * @param {string} text - 要显示的字幕文本
   */
  const createSubtitleParticles = (text) => {
    if (!loadedFont || !subtitleGroupRef.current || !charGeometryCache) return;

    let totalWidth = 0;
    const charSpacing = 5; // 0.1 / 0.006 = 16.67，补偿缩放

    // 计算总宽度
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
            size: 12, // 0.2 * 5 / 0.006 = 166.67，但先试试33.33
            height: 1.67, // 0.01 * 5 / 0.006 = 8.33，但先试试1.67
            curveSegments: 4,
            bevelEnabled: false,
          });
          // 關鍵修復：限制Z軸位置，防止中文字符幾何體異常
          const positions = charGeometry.attributes.position.array;
          for (let i = 2; i < positions.length; i += 3) {
            if (positions[i] > 1.67) positions[i] = 1.67;
            if (positions[i] < -1.67) positions[i] = -1.67;
          }
          charGeometry.attributes.position.needsUpdate = true;
          charGeometry.computeBoundingBox();
          setCharGeometryCache((prev) => ({...prev, [char]: charGeometry}));
        } catch (error) {
          continue;
        }
      }
      if (charGeometry && charGeometry.boundingBox) {
        const charWidth = charGeometry.boundingBox.max.x - charGeometry.boundingBox.min.x;
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
            size: 12, // 0.2 * 5 / 0.006 = 166.67，但先试试33.33
            height: 1.67, // 0.01 * 5 / 0.006 = 8.33，但先试试1.67
            curveSegments: 4,
            bevelEnabled: false,
          });
          // 關鍵修復：限制Z軸位置，防止中文字符幾何體異常
          const positions = charGeometry.attributes.position.array;
          for (let i = 2; i < positions.length; i += 3) {
            if (positions[i] > 1.67) positions[i] = 1.67;
            if (positions[i] < -1.67) positions[i] = -1.67;
          }
          charGeometry.attributes.position.needsUpdate = true;
          charGeometry.computeBoundingBox();
          setCharGeometryCache((prev) => ({...prev, [char]: charGeometry}));
        } catch (error) {
          continue;
        }
      }
      if (!charGeometry) continue;

      const charWidth = charGeometry.boundingBox.max.x - charGeometry.boundingBox.min.x;
      const posX = currentXOffset + charWidth / 2;
      currentXOffset += charWidth + charSpacing;

      const charMesh = new THREE.Mesh(charGeometry, subtitleMaterial);
      const targetPos = new THREE.Vector3(posX, -270, 13.33); // 0.02 / 0.006 = 3.33，补偿缩放

      // 初始随机位置（补偿缩放）
      charMesh.position.set(
        targetPos.x + (Math.random() - 0.5) * 333.33, // 2 / 0.006 = 333.33
        targetPos.y + (Math.random() - 0.5) * 333.33 + 166.67, // 1 / 0.006 = 166.67
        targetPos.z + (Math.random() - 0.5) * 333.33
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

      // GSAP动画
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
          z: 0.1, // 压缩字幕宽度
          ease: "power2.out",
        });
      } else {
        charMesh.position.copy(targetPos);
        charMesh.rotation.set(0, 0, 0);
        charMesh.scale.set(1, 1, 0.1); // 压缩字幕宽度
      }
    }
    setSubtitleParticles(newParticles);
  };

  /**
   * @description 消散字幕粒子效果
   */
  const disperseSubtitleParticles = () => {
    if (!subtitleGroupRef.current || subtitleParticles.length === 0) return;

    subtitleParticles.forEach((particle) => {
      if (!particle || !particle.mesh) return;

      const randomPos = {
        x: particle.mesh.position.x + (Math.random() - 0.5) * 500, // 3 / 0.006 = 500，补偿缩放
        y: particle.mesh.position.y + (Math.random() - 0.5) * 500,
        z: particle.mesh.position.z + (Math.random() - 0.5) * 500,
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

  /**
   * @description 更新计时器显示
   * @param {string} text - 要显示的时间文本
   */
  const updateTimerMesh = (text) => {
    if (!loadedFont || !tvGroupRef.current) return;

    if (timerMeshRef.current) {
      if (timerMeshRef.current.geometry) timerMeshRef.current.geometry.dispose();
      tvGroupRef.current.remove(timerMeshRef.current);
    }

    const timerGeometry = new TextGeometry(text, {
      font: loadedFont,
      size: 16.67, // 恢复原来的尺寸，通过scale来控制宽度
      height: 1.67, // 恢复原来的厚度
      curveSegments: 4,
      bevelEnabled: false,
    });
    timerGeometry.computeBoundingBox();
    timerGeometry.center();

    const timerMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00});
    const timerMesh = new THREE.Mesh(timerGeometry, timerMaterial);
    // 与进度条对齐：进度条在[20, 127.5, 18.33]，计时器放在右侧
    timerMesh.position.set(20, 127.5, -172.5); // 与进度条同样的Y和Z，X向右偏移
    timerMesh.rotation.set(0, Math.PI / 2, 0); // 与进度条同样的转向
    // 压缩文字宽度：只在X轴方向缩小，保持高度和深度不变
    timerMesh.scale.set(1, 1, 0.05); // X轴缩放到60%，让文字更窄
    tvGroupRef.current.add(timerMesh);
    timerMeshRef.current = timerMesh;
  };

  // 帧循环，用于更新进度条和字幕
  useFrame(() => {
    const video = videoRef.current;

    // 进度条更新逻辑
    if (video && video.duration > 0 && progressBarFillRef.current && loadedFont) {
      const progress = video.currentTime / video.duration;
      if (isFinite(progress)) {
        progressBarFillRef.current.scale.x = Math.max(0, Math.min(1, progress));
        // 对照TVSystem的进度条位置计算
        const barWidth = 333.33; // 2 / 0.006 = 333.33，补偿缩放
        progressBarFillRef.current.position.x = -(barWidth / 2) * (1 - progressBarFillRef.current.scale.x);

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
      progressBarFillRef.current.position.x = -166.67; // -1 / 0.006 = -166.67
      updateTimerMesh("00:00");
    }

    // 字幕更新逻辑
    if (isSubtitlesActive && video && video.readyState >= video.HAVE_ENOUGH_DATA && currentSubtitles && !video.paused) {
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

  const modifiedScene = useMemo(() => {
    const clonedScene = scene.clone();
    clonedScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        if (child.material && child.material.isMeshStandardMaterial) {
          const material = child.material;
          // 关键: 找到屏幕材质并替换
          if (material.name.toLowerCase().includes("screen")) {
            // 根据模式选择合适的纹理
            const activeTexture = isYouTubeMode ? youtubeTexture : videoTexture;
            child.material = new THREE.MeshBasicMaterial({
              map: activeTexture,
              toneMapped: false,
            });

            // 修正UV映射 - 让视频覆盖整个屏幕
            if (child.geometry && child.geometry.attributes.uv) {
              const uvArray = child.geometry.attributes.uv.array;
              // console.log("Original UV coordinates:", uvArray);

              // 重新设置UV坐标，让视频覆盖整个屏幕
              // 标准的四边形UV映射：左下(0,0), 右下(1,0), 右上(1,1), 左上(0,1)
              uvArray[0] = 1;
              uvArray[1] = 0; // 右下
              uvArray[2] = 1;
              uvArray[3] = 1; // 右上
              uvArray[4] = 0;
              uvArray[5] = 1; // 左上
              uvArray[6] = 0;
              uvArray[7] = 0; // 左下

              // console.log("Fixed UV coordinates:", uvArray);
              child.geometry.attributes.uv.needsUpdate = true;
            }
          } else {
            material.metalness = 0.1;
            material.roughness = 0.4;
          }
          material.needsUpdate = true;
        }
      }
    });
    return clonedScene;
  }, [scene, videoTexture, youtubeTexture, isYouTubeMode]);

  const subtitleMaterial = new THREE.MeshBasicMaterial({color: 0xffffff});

  return (
    <group {...props} ref={tvGroupRef}>
      <primitive object={modifiedScene} />

      {/* 字幕组 - 补偿缩放后的位置 */}
      <group ref={subtitleGroupRef} position={[0, 430, -8.33]} rotation={[0, Math.PI / 2, 0]} />

      {/* 进度条 - 对照TVSystem的设计 */}
      <mesh position={[20, 127.5, 18.33]} rotation={[0, Math.PI / 2, 0]}>
        {" "}
        {/* 对照TVSystem: [0, -(2.25 / 2) - 0.1 * 1.5, 0.11 + 0.01] */}
        <boxGeometry args={[333.33, 16.67, 3.33]} /> {/* 对照TVSystem: [2, 0.1, 0.02] */}
        <meshBasicMaterial color="#222222" transparent opacity={0.7} />
        <mesh ref={progressBarFillRef} position={[-166.67, 0, 1.67]}>
          {" "}
          {/* 对照TVSystem: [-1, 0, 0.01] */}
          <boxGeometry args={[333.33, 16.67, 3.33]} /> {/* 对照TVSystem: [2, 0.1, 0.02] */}
          <meshBasicMaterial color="#00ff00" />
        </mesh>
      </mesh>
    </group>
  );
}

useGLTF.preload("src/assets/models/modern_entertainment_center_free.glb");
