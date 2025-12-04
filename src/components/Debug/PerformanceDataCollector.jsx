import {useFrame, useThree} from "@react-three/fiber";
import {useRef, useCallback} from "react";
import * as THREE from "three";

/**
 * @description Canvas内部性能数据收集器 - 提供真实的Three.js渲染统计
 * @author 南川千繪 (Nankawa Chie)
 *
 * 这个组件必须放在Canvas内部，用于收集真实的Three.js渲染数据
 * 然后通过回调函数将数据传递给外部的性能监视器
 */
function PerformanceDataCollector({onDataUpdate, updateInterval = 1000}) {
  const {gl, scene, camera} = useThree();
  const lastUpdateRef = useRef(performance.now());
  const renderCallsRef = useRef(0);
  const triangleCountRef = useRef(0);

  /**
   * @description 递归统计场景中的真实资源数量
   * @param {Object} object - Three.js对象
   * @returns {Object} 资源统计
   */
  const countRealSceneResources = useCallback(
    (object = scene) => {
      let geometries = new Set();
      let textures = new Set();
      let materials = new Set();
      let triangles = 0;

      object.traverse((child) => {
        // 统计几何体
        if (child.geometry) {
          geometries.add(child.geometry.uuid);

          // 计算三角形数量
          if (child.geometry.index) {
            triangles += child.geometry.index.count / 3;
          } else if (child.geometry.attributes.position) {
            triangles += child.geometry.attributes.position.count / 3;
          }
        }

        // 统计材质和纹理
        if (child.material) {
          const materials_array = Array.isArray(child.material) ? child.material : [child.material];

          materials_array.forEach((mat) => {
            materials.add(mat.uuid);

            // 统计各种纹理
            if (mat.map) textures.add(mat.map.uuid);
            if (mat.normalMap) textures.add(mat.normalMap.uuid);
            if (mat.roughnessMap) textures.add(mat.roughnessMap.uuid);
            if (mat.metalnessMap) textures.add(mat.metalnessMap.uuid);
            if (mat.envMap) textures.add(mat.envMap.uuid);
            if (mat.emissiveMap) textures.add(mat.emissiveMap.uuid);
            if (mat.aoMap) textures.add(mat.aoMap.uuid);
            if (mat.lightMap) textures.add(mat.lightMap.uuid);
            if (mat.bumpMap) textures.add(mat.bumpMap.uuid);
            if (mat.displacementMap) textures.add(mat.displacementMap.uuid);
          });
        }
      });

      // 尝试获取真实的程序数量
      let realPrograms = 0;
      try {
        // 从Three.js renderer获取程序信息
        const info = gl.info || {};
        realPrograms = info.programs?.length || info.memory?.programs || 0;

        // 如果无法获取，基于材质数量和场景复杂度智能估算
        if (realPrograms === 0) {
          // 基础程序：每种材质类型通常需要一个程序
          let estimatedPrograms = Math.max(1, materials.size);

          // 额外程序：基于场景特征
          if (textures.size > 3) estimatedPrograms += 1; // 多纹理可能需要额外程序
          if (geometries.size > 5) estimatedPrograms += 1; // 复杂场景可能有阴影程序
          if (object.children.length > 10) estimatedPrograms += 1; // 大场景可能有后处理程序

          realPrograms = Math.min(8, estimatedPrograms); // 限制最大值
        }
      } catch (e) {
        realPrograms = Math.max(1, Math.min(materials.size + 1, 3));
      }

    // console.log('📊 真实场景资源统计:', {
    //   geometries: geometries.size,
    //   textures: textures.size,
    //   materials: materials.size,
    //   programs: realPrograms,
    //   triangles: Math.round(triangles),
    //   objects: object.children.length,
    //   glInfo: gl.info?.memory || 'No info available'
    // });

      return {
        geometries: geometries.size,
        textures: textures.size,
        materials: materials.size,
        programs: realPrograms,
        triangles: Math.round(triangles),
        objects: object.children.length,
      };
    },
    [scene]
  );

  /**
   * @description 获取真实的WebGL渲染信息
   * @returns {Object} 渲染统计数据
   */
  const getRealRenderInfo = useCallback(() => {
    try {
      // Three.js WebGLRenderer有一个info属性
      const info = gl.info || {};

      return {
        calls: info.render?.calls || renderCallsRef.current,
        triangles: info.render?.triangles || triangleCountRef.current,
        points: info.render?.points || 0,
        lines: info.render?.lines || 0,
        frame: info.render?.frame || 0,
        // 添加内存信息
        memory: {
          geometries: info.memory?.geometries || 0,
          textures: info.memory?.textures || 0,
        },
        // 尝试获取真实的程序数量
        programs: info.programs?.length || info.memory?.programs || 0,
      };
    } catch (error) {
      console.warn("无法获取渲染信息:", error);
      return {
        calls: renderCallsRef.current,
        triangles: triangleCountRef.current,
        points: 0,
        lines: 0,
        frame: 0,
        memory: {
          geometries: 0,
          textures: 0,
        },
        programs: 0,
      };
    }
  }, [gl]);

  /**
   * @description 获取WebGL扩展和能力信息
   * @returns {Object} WebGL能力信息
   */
  const getWebGLCapabilities = useCallback(() => {
    try {
      // 使用Three.js renderer的capabilities对象
      const capabilities = gl.capabilities || {};
      const context = gl.getContext
        ? gl.getContext()
        : gl.domElement?.getContext("webgl2") || gl.domElement?.getContext("webgl");

      if (!context) {
        return {
          capabilities: {
            maxTextures: 16,
            maxVertexAttribs: 16,
            maxTextureSize: 2048,
          },
          extensions: {},
        };
      }

      const webglCapabilities = {
        maxTextures: capabilities.maxTextures || context.getParameter(context.MAX_TEXTURE_IMAGE_UNITS),
        maxVertexAttribs: capabilities.maxVertexAttribs || context.getParameter(context.MAX_VERTEX_ATTRIBS),
        maxVaryingVectors: capabilities.maxVaryingVectors || context.getParameter(context.MAX_VARYING_VECTORS),
        maxFragmentUniforms: capabilities.maxFragmentUniforms || context.getParameter(context.MAX_FRAGMENT_UNIFORM_VECTORS),
        maxVertexUniforms: capabilities.maxVertexUniforms || context.getParameter(context.MAX_VERTEX_UNIFORM_VECTORS),
        maxTextureSize: capabilities.maxTextureSize || context.getParameter(context.MAX_TEXTURE_SIZE),
        maxCubeMapTextureSize: capabilities.maxCubeMapTextureSize || context.getParameter(context.MAX_CUBE_MAP_TEXTURE_SIZE),
        maxRenderbufferSize: capabilities.maxRenderbufferSize || context.getParameter(context.MAX_RENDERBUFFER_SIZE),
        precision: capabilities.precision || "highp",
      };

      // 检查扩展支持
      const extensions = {
        anisotropic: !!context.getExtension("EXT_texture_filter_anisotropic"),
        depthTexture: !!context.getExtension("WEBGL_depth_texture"),
        drawBuffers: !!context.getExtension("WEBGL_draw_buffers"),
        vertexArrayObject: !!context.getExtension("OES_vertex_array_object"),
        instancing: !!context.getExtension("ANGLE_instanced_arrays"),
        floatTextures: !!context.getExtension("OES_texture_float"),
        halfFloatTextures: !!context.getExtension("OES_texture_half_float"),
      };

      return {capabilities: webglCapabilities, extensions};
    } catch (error) {
      console.warn("无法获取WebGL能力信息:", error);
      return {
        capabilities: {
          maxTextures: 16,
          maxVertexAttribs: 16,
          maxTextureSize: 2048,
        },
        extensions: {},
      };
    }
  }, [gl]);

  /**
   * @description 获取相机和视口信息
   * @returns {Object} 相机统计信息
   */
  const getCameraInfo = useCallback(() => {
    try {
      // 从Three.js renderer获取视口信息
      const size = gl.getSize ? gl.getSize(new THREE.Vector2()) : {width: 1920, height: 1080};
      const pixelRatio = gl.getPixelRatio ? gl.getPixelRatio() : 1;

      return {
        type: camera.type,
        fov: camera.fov || "N/A",
        aspect: camera.aspect || "N/A",
        near: camera.near,
        far: camera.far,
        position: {
          x: Math.round(camera.position.x * 100) / 100,
          y: Math.round(camera.position.y * 100) / 100,
          z: Math.round(camera.position.z * 100) / 100,
        },
        viewport: {
          width: size.width,
          height: size.height,
          pixelRatio: pixelRatio,
        },
      };
    } catch (error) {
      console.warn("无法获取相机信息:", error);
      return {
        type: camera.type || "PerspectiveCamera",
        fov: camera.fov || 75,
        aspect: camera.aspect || 1.77,
        near: camera.near || 0.1,
        far: camera.far || 1000,
        position: {
          x: Math.round((camera.position?.x || 0) * 100) / 100,
          y: Math.round((camera.position?.y || 0) * 100) / 100,
          z: Math.round((camera.position?.z || 0) * 100) / 100,
        },
        viewport: {
          width: 1920,
          height: 1080,
          pixelRatio: 1,
        },
      };
    }
  }, [gl, camera]);

  // 優化：降低更新頻率，避免每幀執行昂貴的場景遍歷
  useFrame(() => {
    const now = performance.now();

    // 更新渲染调用计数（这是一个粗略的估算）
    renderCallsRef.current++;

    // 按指定间隔发送数据更新 - 大幅降低更新頻率
    if (now - lastUpdateRef.current >= updateInterval && onDataUpdate) {
      // 使用 requestIdleCallback 在瀏覽器空閒時執行昂貴的統計操作
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          const sceneResources = countRealSceneResources();
          const renderInfo = getRealRenderInfo();
          const webglInfo = getWebGLCapabilities();
          const cameraInfo = getCameraInfo();

          // 重置计数器
          renderCallsRef.current = 0;
          triangleCountRef.current = sceneResources.triangles;

          // 发送数据给外部监视器
          onDataUpdate({
            scene: sceneResources,
            render: renderInfo,
            webgl: webglInfo,
            camera: cameraInfo,
            timestamp: now,
          });
        });
      } else {
        // 降級方案：使用 setTimeout 延遲執行
        setTimeout(() => {
          const sceneResources = countRealSceneResources();
          const renderInfo = getRealRenderInfo();
          const webglInfo = getWebGLCapabilities();
          const cameraInfo = getCameraInfo();

          renderCallsRef.current = 0;
          triangleCountRef.current = sceneResources.triangles;

          onDataUpdate({
            scene: sceneResources,
            render: renderInfo,
            webgl: webglInfo,
            camera: cameraInfo,
            timestamp: now,
          });
        }, 0);
      }

      lastUpdateRef.current = now;
    }
  });

  // 这个组件不渲染任何内容
  return null;
}

export default PerformanceDataCollector;
