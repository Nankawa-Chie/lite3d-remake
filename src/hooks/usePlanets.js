// src/hooks/usePlanets.js (建议放在一个新的 hooks 文件夹)
import * as THREE from "three";
import {useLoader} from "@react-three/fiber";

// 纹理基础路径
const textureBasePath = "src/assets/textures/SolarSystem/";

// 星球数据，我们把缩放逻辑直接加在这里
const planetData = [
  {
    name: "Sun",
    radius: 3,
    textureFile: "2k_sun.jpg",
    options: {emissive: 0xffff00, emissiveIntensity: 2, physicsMass: 0},
  },
  {name: "Mercury", radius: 0.383, textureFile: "2k_mercury.jpg"},
  {
    name: "Venus",
    radius: 0.949,
    textureFile: "2k_venus_surface.jpg",
    options: {atmosphere: "2k_venus_atmosphere.jpg"},
  },
  {
    name: "Earth",
    radius: 1,
    textureFile: "2k_earth_daymap.jpg",
    options: {atmosphere: "2k_earth_clouds.jpg"},
  },
  {name: "Moon", radius: 0.27, textureFile: "2k_moon.jpg"},
  {name: "Mars", radius: 0.532, textureFile: "2k_mars.jpg"},
  {name: "Jupiter", radius: 11.209 * 0.2, textureFile: "2k_jupiter.jpg"},
  {
    name: "Saturn",
    radius: 9.449 * 0.2,
    textureFile: "2k_saturn.jpg",
    options: {ring: "2k_saturn_ring_alpha.png"},
  },
  {name: "Uranus", radius: 4.007, textureFile: "2k_uranus.jpg"},
  {name: "Neptune", radius: 3.883, textureFile: "2k_neptune.jpg"},
  {name: "Eris", radius: 0.18, textureFile: "2k_eris_fictional.jpg"},
];

/**
 * @name usePlanets
 * @description 一个自定义 Hook，用于加载所有星球的纹理并返回配置数据。
 * @returns {Array} 一个包含所有星球配置和已加载纹理的数组。
 */
export function usePlanets() {
  // 1. 创建一个包含所有需要加载的纹理的 URL 列表
  const textureUrls = planetData.flatMap((p) => {
    const urls = [textureBasePath + p.textureFile];
    if (p.options?.atmosphere) urls.push(textureBasePath + p.options.atmosphere);
    if (p.options?.normal) urls.push(textureBasePath + p.options.normal);
    if (p.options?.specular) urls.push(textureBasePath + p.options.specular);
    if (p.options?.ring) urls.push(textureBasePath + p.options.ring);
    return urls;
  });

  // 2. 使用 useLoader 一次性加载所有纹理，这会自动触发 Suspense
  const textures = useLoader(THREE.TextureLoader, textureUrls);

  // 3. 将加载好的纹理重新映射回每个星球对象
  let textureIndex = 0;
  const planetsWithTextures = planetData.map((p) => {
    const loadedTextures = {};
    loadedTextures.map = textures[textureIndex++];
    if (p.options?.atmosphere) loadedTextures.atmosphere = textures[textureIndex++];
    if (p.options?.normal) loadedTextures.normal = textures[textureIndex++];
    if (p.options?.specular) loadedTextures.specular = textures[textureIndex++];
    if (p.options?.ring) loadedTextures.ring = textures[textureIndex++];

    return {...p, textures: loadedTextures};
  });

  return planetsWithTextures;
}
