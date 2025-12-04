// 黏菌粒子片元著色器
uniform vec3 uSpeciesColor;
uniform float uTime;

varying float vLife;
varying float vAge;
varying vec3 vVelocity;

void main() {
    // 計算到點中心的距離
    vec2 coord = gl_PointCoord - vec2(0.5);
    float distance = length(coord);
    
    // 創建圓形粒子
    if (distance > 0.5) {
        discard;
    }
    
    // 根據生命值調整透明度和亮度
    float lifeRatio = vLife / 100.0;
    float alpha = lifeRatio * 0.8;
    
    // 根據速度添加動態效果
    float speed = length(vVelocity);
    float intensity = 0.5 + speed * 0.5;
    
    // 根據年齡添加閃爍效果
    float flicker = 0.8 + 0.2 * sin(uTime * 10.0 + vAge);
    
    // 最終顏色
    vec3 finalColor = uSpeciesColor * intensity * flicker;
    
    // 邊緣軟化
    float softEdge = 1.0 - smoothstep(0.3, 0.5, distance);
    alpha *= softEdge;
    
    gl_FragColor = vec4(finalColor, alpha);
}