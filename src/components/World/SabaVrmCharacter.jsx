import React, {useState, useEffect, useRef} from "react";
import {useFrame} from "@react-three/fiber";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {VRMLoaderPlugin, VRMUtils} from "@pixiv/three-vrm";

/**
 * @name SabaVrmCharacter
 * @description
 * A React component for loading and displaying a VRM character model with dynamic spring bone physics.
 * This component integrates the @pixiv/three-vrm library to unlock the full potential of VRM files
 * within a React Three Fiber environment.
 *
 * Features:
 * 1.  Uses `@pixiv/three-vrm`'s `VRMLoaderPlugin` to correctly parse VRM data, including spring bones.
 * 2.  Leverages the `useFrame` hook to update the VRM's physics simulation in each frame,
 *     bringing hair, clothes, and accessories to life.
 * 3.  Applies smart PBR material adjustments for a more realistic look.
 * 4.  Optimizes the model's skeleton using `VRMUtils` for better performance.
 * 5.  Wraps the model in a <group> to ensure that standard props like `position`, `scale`,
 *     and `rotation` are applied correctly.
 *
 * @param {object} props - Standard props for a three.js object, passed to the root <group>.
 *                         Example: <SabaVrmCharacter position={[0, -1, 0]} scale={1.5} />
 * @returns {JSX.Element | null} The rendered character model, or null if loading.
 */
export default function SabaVrmCharacter(props) {
  // State to hold the final, prepared 3D scene of the model.
  const [modelScene, setModelScene] = useState(null);

  // Ref to hold the VRM instance. A ref is used because its value persists across
  // re-renders and is accessible within the `useFrame` render loop.
  const vrmRef = useRef(null);

  useEffect(() => {
    // Instantiate the GLTF loader.
    const loader = new GLTFLoader();

    // Register the VRMLoaderPlugin. This is the crucial step that enables the loader
    // to understand the VRM-specific data within the GLB container.
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    // Load the VRM model file.
    loader.load(
      // IMPORTANT: Replace this path with the correct path to your VRM model.
      "src/assets/models/Saba_1.0.2.vrm",

      // --- onLoad Callback ---
      (gltf) => {
        // The VRMLoaderPlugin stores the VRM instance in the `gltf.userData.vrm` property.
        const vrm = gltf.userData.vrm;

        // Optimize the model's skeleton. This is recommended by the library's official
        // documentation to remove unnecessary bones and improve performance.
        VRMUtils.combineSkeletons(vrm.scene);

        // Store the VRM instance in our ref for access in the render loop.
        vrmRef.current = vrm;

        // Traverse the model to apply optimizations and material enhancements.
        vrm.scene.traverse((child) => {
          if (child.isMesh) {
            // Enable shadows for all meshes in the model.
            child.castShadow = true;
            child.receiveShadow = true;

            // Handle single or multiple materials on a mesh.
            const materials = Array.isArray(child.material) ? child.material : [child.material];

            materials.forEach((material) => {
              // We only care about standard PBR materials.
              if (material.isMeshStandardMaterial) {
                // Adjust material properties based on common naming conventions for a better look.
                const name = material.name.toLowerCase();
                if (name.includes("skin") || name.includes("face")) {
                  material.metalness = 0.0;
                  material.roughness = 0.4;
                } else if (name.includes("hair")) {
                  material.metalness = 0.1;
                  material.roughness = 0.6;
                } else if (name.includes("metal") || name.includes("accessory")) {
                  material.metalness = 0.8;
                  material.roughness = 0.2;
                } else {
                  // For clothes and other general materials
                  material.metalness = 0.0;
                  material.roughness = 0.8;
                }
                material.needsUpdate = true;
              }
            });
          }
        });

        // Set the processed scene to our state, which will trigger a re-render.
        setModelScene(vrm.scene);
      },

      // onProgress callback (optional)
      undefined,

      // --- onError Callback ---
      (error) => {
        console.error("An error happened while loading the VRM model:", error);
      }
    );
  }, []); // The empty dependency array [] ensures this effect runs only once on component mount.

  // The useFrame hook is the heart of the animation. It's called on every single frame.
  useFrame((state, delta) => {
    // `delta` is the time elapsed since the last frame, in seconds.
    // It's crucial for frame-rate independent physics calculations.
    if (vrmRef.current) {
      // If the VRM model is loaded, call its update method.
      // This single line handles all spring bone physics, look-at tracking, blinking, etc.
      vrmRef.current.update(delta);
    }
  });

  // While the model is loading, render nothing.
  if (!modelScene) {
    return null;
  }

  // Once loaded, render the model.
  // It's wrapped in a <group> which receives all the props passed to the component
  // (e.g., position, scale). The <primitive> element is used to render a raw
  // Three.js Object3D instance.
  return (
    <group {...props}>
      <primitive object={modelScene} />
    </group>
  );
}
