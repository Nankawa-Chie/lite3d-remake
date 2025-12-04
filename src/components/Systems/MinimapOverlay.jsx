import React, { useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import useGameStore from "../../stores/gameStore";
import { PERFORMANCE_CONFIG } from "../../config/PerformanceConfig";

export default function MinimapOverlay({ playerRef, containerRef }) {
  const { gl, scene } = useThree();
  const minimapSettings = useGameStore((state) => state.settings.minimap);
  const { enabled, viewRange, height: cameraHeight, zoom, showCoordinates, coordinatePrecision } = minimapSettings;

  // Top-down orthographic camera for minimap
  const miniCam = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
    cam.up.set(0, 0, -1);
    return cam;
  }, []);

  // Render target
  const rtRef = useRef(null);
  const ensureRT = (w, h) => {
    const width = Math.max(1, Math.floor(w));
    const height = Math.max(1, Math.floor(h));
    const rt = rtRef.current;
    if (!rt || rt.width !== width || rt.height !== height) {
      if (rt) rt.dispose();
      rtRef.current = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
      });
      rtRef.current.texture.generateMipmaps = false;
      rtRef.current.texture.minFilter = THREE.LinearFilter;
      rtRef.current.texture.magFilter = THREE.LinearFilter;
      rtRef.current.width = width;
      rtRef.current.height = height;
    }
    return rtRef.current;
  };

  // Overlay scene (screen-space quad)
  const overlayScene = useMemo(() => new THREE.Scene(), []);
  const overlayCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const quadRef = useRef();
  const quadMatRef = useRef(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
  const quadGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  useMemo(() => {
    const m = new THREE.Mesh(quadGeo, quadMatRef.current);
    quadRef.current = m;
    overlayScene.add(m);
  }, [overlayScene, quadGeo]);

  const lastRefreshRef = useRef(0);
  const lastPosRef = useRef(new THREE.Vector3());

  const lastCoordUpdateRef = useRef(0);

  useFrame(() => {
    if (!enabled || !playerRef.current || !containerRef.current) return;

    const posArr = playerRef.current.position;
    if (!posArr) return;

    // playerRef.current.position 可能是数组或 RigidBody/Vector3
    let pos;
    if (Array.isArray(posArr)) {
      pos = new THREE.Vector3().fromArray(posArr);
    } else if (posArr.isVector3) {
      pos = posArr.clone();
    } else if (typeof posArr.x === 'number' && typeof posArr.y === 'number' && typeof posArr.z === 'number') {
      pos = new THREE.Vector3(posArr.x, posArr.y, posArr.z);
    } else {
      // 兼容 ManukaPlayer 暴露的 getPosition API
      if (playerRef.current.getPosition) {
        const arr = playerRef.current.getPosition();
        if (Array.isArray(arr) && arr.length >= 3) {
          pos = new THREE.Vector3(arr[0], arr[1], arr[2]);
        }
      }
    }
    if (!pos) return;

    // Update minimap camera
    const eff = viewRange / zoom;
    miniCam.left = -eff / 2;
    miniCam.right = eff / 2;
    miniCam.top = eff / 2;
    miniCam.bottom = -eff / 2;
    miniCam.updateProjectionMatrix();
    miniCam.position.set(pos.x, pos.y + cameraHeight, pos.z);
    miniCam.lookAt(pos);

    // Refresh policy: time or movement
    const now = performance.now();
    const moved = pos.distanceToSquared(lastPosRef.current) > (PERFORMANCE_CONFIG.MINIMAP_POSITION_THRESHOLD ** 2);
    const needRefresh = moved || now - lastRefreshRef.current > 400; // 400ms 默认
    if (needRefresh) {
      // 更新坐标显示（若启用）
      if (showCoordinates) {
        const nowTs = performance.now();
        if (nowTs - lastCoordUpdateRef.current >= PERFORMANCE_CONFIG.MINIMAP_COORDINATE_UPDATE_INTERVAL) {
          const el = document.getElementById('player-coordinates');
          if (el) el.textContent = `X: ${pos.x.toFixed(coordinatePrecision)}, Y: ${pos.y.toFixed(coordinatePrecision)}, Z: ${pos.z.toFixed(coordinatePrecision)}`;
          lastCoordUpdateRef.current = nowTs;
        }
      }
      lastRefreshRef.current = now;
      lastPosRef.current.copy(pos);

      // Ensure render target size based on container rect and DPR
      const rect = containerRef.current.getBoundingClientRect();
      const canvasRect = gl.domElement.getBoundingClientRect();
      const dpr = gl.getPixelRatio();
      const scale = PERFORMANCE_CONFIG.MINIMAP_RESOLUTION_SCALE || 1;
      const rtW = rect.width * dpr * scale;
      const rtH = rect.height * dpr * scale;
      const rt = ensureRT(rtW, rtH);

      // Optional: override material for fast pass
      const prevOverride = scene.overrideMaterial;
      // scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

      const prevTarget = gl.getRenderTarget();
      gl.setRenderTarget(rt);
      gl.clear(true, true, true);
      gl.render(scene, miniCam);
      gl.setRenderTarget(prevTarget);

      scene.overrideMaterial = prevOverride;

      // Update quad material map
      quadMatRef.current.map = rt.texture;
      quadMatRef.current.needsUpdate = true;

      // Update quad NDC size/position based on container rect relative to canvas
      const wNdc = (rect.width / canvasRect.width) * 2;
      const hNdc = (rect.height / canvasRect.height) * 2;
      const offsetX = rect.left - canvasRect.left;
      const offsetY = rect.top - canvasRect.top;
      const centerX = offsetX + rect.width / 2;
      const centerY = offsetY + rect.height / 2;
      const xNdc = (centerX / canvasRect.width) * 2 - 1;
      const yNdc = 1 - (centerY / canvasRect.height) * 2;
      quadRef.current.position.set(xNdc, yNdc, 0);
      quadRef.current.scale.set(wNdc, hNdc, 1);
    }

    // Always keep quad aligned with container rect, even when not refreshing RT
    {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasRect = gl.domElement.getBoundingClientRect();
      const wNdc = (rect.width / canvasRect.width) * 2;
      const hNdc = (rect.height / canvasRect.height) * 2;
      const offsetX = rect.left - canvasRect.left;
      const offsetY = rect.top - canvasRect.top;
      const centerX = offsetX + rect.width / 2;
      const centerY = offsetY + rect.height / 2;
      const xNdc = (centerX / canvasRect.width) * 2 - 1;
      const yNdc = 1 - (centerY / canvasRect.height) * 2;
      if (quadRef.current) {
        quadRef.current.position.set(xNdc, yNdc, 0);
        quadRef.current.scale.set(wNdc, hNdc, 1);
      }
    }

    // Render overlay on top of main scene only when RT is ready
    if (quadMatRef.current.map) {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasRect = gl.domElement.getBoundingClientRect();
      const dpr = gl.getPixelRatio();
      const leftPx = (rect.left - canvasRect.left) * dpr;
      const bottomPx = (canvasRect.bottom - rect.bottom) * dpr;
      const widthPx = rect.width * dpr;
      const heightPx = rect.height * dpr;

      const prevAutoClear = gl.autoClear;
      const prevScissor = gl.getScissor(new THREE.Vector4());
      const prevViewport = gl.getViewport(new THREE.Vector4());
      const prevScissorTest = gl.getScissorTest();

      gl.autoClear = false;
      gl.setScissorTest(true);
      gl.setScissor(leftPx, bottomPx, widthPx, heightPx);
      gl.setViewport(0, 0, gl.domElement.width, gl.domElement.height); // full viewport; scissor clips
      gl.clearDepth();
      gl.render(overlayScene, overlayCam);

      gl.setScissorTest(prevScissorTest);
      gl.setScissor(prevScissor);
      gl.setViewport(prevViewport);
      gl.autoClear = prevAutoClear;
    }
  }, 100);

  return null;
}
