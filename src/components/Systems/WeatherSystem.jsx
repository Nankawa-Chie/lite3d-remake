import {useRef, useMemo, useEffect} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import * as THREE from "three";
import useGameStore from "../../stores/gameStore";

/**
 * @name Lightning
 * @description 一个模拟闪电效果的组件。
 * 它会在特定时间间隔内，随机地将场景的背景和环境光强度瞬间调亮，然后迅速恢复，以模拟闪电。
 * @param {object} props - 组件属性
 * @param {number} props.intensity - 闪电的触发强度/频率。
 */
function Lightning({intensity}) {
  const {scene} = useThree();
  const flashTimer = useRef(0);
  const originalBg = useRef(null);

  useFrame((state, delta) => {
    flashTimer.current -= delta;

    if (flashTimer.current <= 0) {
      // Reset after flash
      if (originalBg.current !== null) {
        scene.background = originalBg.current;
        originalBg.current = null;
      }
      scene.environmentIntensity = 1; // Restore environment intensity

      // Cooldown for next flash
      flashTimer.current = 5 + (Math.random() * 15) / Math.max(0.1, intensity);
      return;
    }

    if (flashTimer.current > 0 && flashTimer.current < 0.15) {
      // During the flash
      if (originalBg.current === null) {
        originalBg.current = scene.background;
      }
      scene.background = new THREE.Color(0.8, 0.8, 1.0);
      scene.environmentIntensity = 10;
    }
  });

  return null;
}

/**
 * @name WeatherParticleSystem
 * @description 一个更通用的天气粒子系统基类，用于渲染雨或雪。
 * - 使用 InstancedMesh 以获得高性能。
 * - 每个粒子都有独立的生命周期、速度和随机性。
 * @param {object} props - 组件属性
 * @param {number} props.count - 粒子总数。
 * @param {number} props.intensity - 当前天气强度 (0-1)，控制活跃粒子数量。
 * @param {number} props.windSpeed - 风速，影响粒子横向移动。
 * @param {string} props.type - 粒子类型 ('rain' 或 'snow')。
 * @returns {JSX.Element}
 */
function WeatherParticleSystem({count, intensity, windSpeed, type = "rain"}) {
  const meshRef = useRef();
  const {camera} = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // [FIX] Create geometry imperatively and memoize it to prevent rendering issues.
  const particleGeom = useMemo(() => {
    return type === "rain"
      ? new THREE.BoxGeometry(0.05, 1.5, 0.05) // Raindrops are thin boxes
      : new THREE.PlaneGeometry(0.1, 0.1); // Snowflakes are simple planes
  }, [type]);

  const particleMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: type === "rain" ? "#87CEEB" : "#FFFFFF",
        transparent: true,
        opacity: type === "rain" ? 0.5 : 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [type]
  );

  // Particle data stored in a ref to avoid re-renders
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 100;
      const y = Math.random() * 50;
      const z = (Math.random() - 0.5) * 100;
      const life = Math.random() * 10;
      temp.push({
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          type === "rain" ? -10 - Math.random() * 5 : -1 - Math.random(),
          (Math.random() - 0.5) * 0.1
        ),
        life: life,
        maxLife: life,
        size:
          type === "rain"
            ? Math.random() * 0.05 + 0.02
            : Math.random() * 0.1 + 0.05,
      });
    }
    return temp;
  }, [count, type]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const activeCount = Math.floor(count * intensity);
    const cameraPosition = camera.position;
    const areaSize = 100; // The area around the camera where particles are active

    particles.forEach((p, i) => {
      if (i < activeCount) {
        p.life -= delta;

        // Reset particle if its life is over or it's out of bounds
        if (p.life <= 0 || p.position.y < -5) {
          p.life = p.maxLife;
          p.position.set(
            cameraPosition.x + (Math.random() - 0.5) * areaSize,
            cameraPosition.y + Math.random() * 20 + 10,
            cameraPosition.z + (Math.random() - 0.5) * areaSize
          );
          p.velocity.y =
            type === "rain" ? -10 - Math.random() * 5 : -1 - Math.random();
        }

        // Apply wind and gravity
        p.position.x += (p.velocity.x + windSpeed * 0.1) * delta;
        p.position.y += p.velocity.y * delta;
        p.position.z += p.velocity.z * delta;

        // For snow, add some gentle swaying motion
        if (type === "snow") {
          p.position.x +=
            Math.sin(state.clock.elapsedTime + i * 0.5) * 0.2 * delta;
        }

        dummy.position.copy(p.position);
        dummy.scale.set(p.size, p.size, p.size);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      } else {
        // Hide inactive particles far away
        dummy.position.set(0, -1000, 0); // Move way off-screen
        dummy.scale.set(0, 0, 0); // Also scale to zero
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
      }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    // [FIX] Disable raycasting on the particle system to prevent player ground check errors.
    <instancedMesh
      ref={meshRef}
      args={[particleGeom, particleMaterial, count]}
      raycast={() => null}
    />
  );
}

/**
 * @name FogEffect
 * @description 一个控制场景雾效的组件。
 * 它会根据传入的强度和可见度动态地更新场景的 `fog` 属性。
 * @param {object} props - 组件属性
 * @param {number} props.intensity - 雾的强度 (0-1)。
 * @param {number} props.visibility - 雾的可见度/密度。
 * @param {THREE.Color} props.color - 雾的颜色。
 */
function FogEffect({intensity, visibility, color}) {
  const {scene} = useThree();

  useEffect(() => {
    if (intensity > 0) {
      scene.fog = new THREE.Fog(color, 1, 150 / (visibility * intensity));
    } else {
      scene.fog = null;
    }

    // Cleanup on unmount
    return () => {
      if (scene.fog) {
        scene.fog = null;
      }
    };
  }, [scene, intensity, visibility, color]);

  return null;
}

/**
 * @name WeatherSystem
 * @description 游戏的天气系统主组件，根据传入的天气类型和设置来渲染不同的天气效果。
 * - **雨 (rainy)**: 渲染高性能的雨滴粒子。
 * - **雪 (snowy)**: 渲染飘落的雪花粒子。
 * - **雾 (foggy)**: 应用场景雾效。
 * - **多云 (cloudy)**: 渲染云层（当前为占位符），并附加少量雾效。
 * - **雷暴 (stormy)**: 渲染大雨、闪电，并附加更浓的雾效。
 * @param {object} props - 组件属性
 * @param {string} [props.weatherType='clear'] - 天气类型。
 * @param {object} [props.settings] - 天气设置对象。
 */
function WeatherSystem() {
  // 只訂閱天氣狀態，避免其他狀態變化導致重新渲染
  const weather = useGameStore((state) => state.weather);
  const {type: weatherType, settings} = weather;
  const {intensity, windSpeed, visibility} = settings;

  // Use useMemo to prevent re-rendering the entire component tree on every settings change.
  // The key prop ensures that when the weatherType changes, React creates a new component instance.
  const weatherEffects = useMemo(() => {
    switch (weatherType) {
      case "rainy":
        return (
          <group key="rainy">
            <WeatherParticleSystem
              count={2000}
              intensity={intensity}
              windSpeed={windSpeed}
              type="rain"
            />
            <FogEffect
              intensity={intensity * 0.2}
              visibility={visibility * 0.8}
              color={new THREE.Color(0x778899)}
            />
          </group>
        );

      case "snowy":
        return (
          <group key="snowy">
            <WeatherParticleSystem
              count={1500}
              intensity={intensity}
              windSpeed={windSpeed}
              type="snow"
            />
            <FogEffect
              intensity={intensity * 0.4}
              visibility={visibility * 0.9}
              color={new THREE.Color(0xeeeeff)}
            />
          </group>
        );

      case "foggy":
        return (
          <group key="foggy">
            <FogEffect
              intensity={intensity}
              visibility={visibility}
              color={new THREE.Color(0xcccccc)}
            />
          </group>
        );

      case "cloudy":
        return (
          <group key="cloudy">
            <FogEffect
              intensity={intensity * 0.3}
              visibility={visibility}
              color={new THREE.Color(0xb0c4de)}
            />
          </group>
        );

      case "stormy":
        return (
          <group key="stormy">
            <WeatherParticleSystem
              count={3000}
              intensity={intensity * 1.5}
              windSpeed={windSpeed * 1.5}
              type="rain"
            />
            <Lightning intensity={intensity} />
            <FogEffect
              intensity={intensity * 0.6}
              visibility={visibility * 0.7}
              color={new THREE.Color(0x4d535e)}
            />
          </group>
        );

      case "clear":
      default:
        return null;
    }
  }, [weatherType, intensity, windSpeed, visibility]);

  return <group name="weather-system">{weatherEffects}</group>;
}

export default WeatherSystem;
