import {useEffect, useRef} from "react";
import {useThree, useFrame} from "@react-three/fiber";
import {CSS3DRenderer, CSS3DSprite} from "three/examples/jsm/renderers/CSS3DRenderer.js";
import * as THREE from "three";

/**
 * @name CSS3DPhone
 * @description 一个特殊的UI组件，它作为 React Three Fiber (WebGL) 世界和
 * 传统 DOM 世界之间的桥梁。它使用 `CSS3DRenderer` 将一个 HTML `<iframe>`
 * 元素渲染成一个可以在3D空间中定位的 `CSS3DSprite`。
 * 这种技术非常适合在3D场景中嵌入复杂的、可交互的网页内容。
 *
 * @returns {null} 此组件不向主 WebGL 场景渲染任何内容。
 */
function CSS3DPhone() {
  const {gl, size} = useThree(); // Get WebGL renderer and viewport size from R3F

  // Refs to hold the CSS3D specific objects
  const cssRendererRef = useRef();
  const cssSceneRef = useRef();
  const cssCameraRef = useRef();
  const cssSpriteRef = useRef();
  const iframeElementRef = useRef();

  // Ref to track the visibility state of the phone
  const isVisible = useRef(false);

  // --- Initialization Effect (runs once) ---
  useEffect(() => {
    // 1. Create a new CSS3DRenderer instance
    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(size.width, size.height);
    // Style it to overlay the main WebGL canvas
    cssRenderer.domElement.style.position = "absolute";
    cssRenderer.domElement.style.top = "0px";
    cssRenderer.domElement.style.pointerEvents = "none"; // Initially no interaction
    cssRenderer.domElement.style.zIndex = "10";

    // Append the CSS renderer's DOM element to the same container as the canvas
    gl.domElement.parentElement.appendChild(cssRenderer.domElement);
    cssRendererRef.current = cssRenderer;

    // 2. Create a dedicated scene for CSS3D objects
    const cssScene = new THREE.Scene();
    cssSceneRef.current = cssScene;

    // 3. Create a dedicated camera for the CSS3D scene.
    // This camera is orthographic-like and remains fixed to render the UI.
    const cssCamera = new THREE.PerspectiveCamera(75, size.width / size.height, 0.1, 1000);
    cssCamera.position.set(0, 0, 1000); // Position it to view the scene
    cssCameraRef.current = cssCamera;

    // 4. Create the HTML iframe element that will be displayed
    const iframe = document.createElement("iframe");
    iframe.src = "/iPhone12/index.html"; // Source of the content
    iframe.style.width = "300px";
    iframe.style.height = "600px";
    iframe.style.border = "none";
    iframe.style.pointerEvents = "auto"; // Allow interaction with the iframe content
    iframeElementRef.current = iframe;

    // 5. Create a CSS3DSprite to wrap the iframe element
    const sprite = new CSS3DSprite(iframe);
    cssSpriteRef.current = sprite;
    cssScene.add(sprite);

    // 6. Initially hide the phone by positioning it off-screen
    sprite.position.y = -2000;

    // 7. Add keyboard listener to toggle phone visibility
    const handleKeyPress = (event) => {
      // 將 "1" 改為 "Tab"
      if (event.key === "Tab") {
        // 阻止 Tab 鍵的預設行為，避免焦點跳轉
        event.preventDefault();

        isVisible.current = !isVisible.current;
        const {width, height} = size;
        const rightOffset = width / 2 - 200;
        const bottomOffset = -(height / 2) + 350;

        // Move sprite into view or hide it
        sprite.position.y = isVisible.current ? bottomOffset : -2000;

        // Critically, toggle pointer-events on the entire CSS renderer.
        // This ensures that when the phone is hidden, it doesn't block interactions with the main canvas.
        cssRenderer.domElement.style.pointerEvents = isVisible.current ? "auto" : "none";
      }
    };
    window.addEventListener("keydown", handleKeyPress);

    // --- Cleanup function ---
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
      if (cssRenderer.domElement.parentElement) {
        cssRenderer.domElement.parentElement.removeChild(cssRenderer.domElement);
      }
    };
  }, [gl, size]); // Depend on gl and size to re-init if they were to change

  // --- Resize Handler ---
  useEffect(() => {
    const cssRenderer = cssRendererRef.current;
    const cssCamera = cssCameraRef.current;
    const sprite = cssSpriteRef.current;
    if (cssRenderer && cssCamera && sprite) {
      // Update renderer and camera on window resize
      cssRenderer.setSize(size.width, size.height);
      cssCamera.aspect = size.width / size.height;
      cssCamera.updateProjectionMatrix();

      // Reposition the sprite to stay in the bottom-right corner
      const rightOffset = size.width / 2 - 200;
      const bottomOffset = -(size.height / 2) + 350;
      sprite.position.x = rightOffset;
      if (isVisible.current) {
        sprite.position.y = bottomOffset;
      }
    }
  }, [size]);

  // --- Render Loop ---
  useFrame(() => {
    // Manually render the CSS3D scene with its dedicated camera each frame
    if (cssRendererRef.current && cssSceneRef.current && cssCameraRef.current) {
      cssRendererRef.current.render(cssSceneRef.current, cssCameraRef.current);
    }
  });

  return null;
}

export default CSS3DPhone;
