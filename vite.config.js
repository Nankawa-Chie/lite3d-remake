import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl"; // <--- 1. 导入插件

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    glsl(), // <--- 2. 将插件添加到 plugins 数组中
  ],
});
