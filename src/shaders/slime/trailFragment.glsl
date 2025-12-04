// 軌跡圖繪製片元著色器
uniform float uTime;
uniform sampler2D uTrailMap;
uniform float uDishRadius;
uniform vec2 uBrushPosition;
uniform float uBrushSize;
uniform int uBrushType; // 0: nutrient, 1: inhibitor
uniform float uBrushStrength;

varying vec2 vUv;

void main() {
    vec2 center = vec2(0.5, 0.5);
    float distanceFromCenter = length(vUv - center);
    
    // 只在培養皿內部繪製
    if (distanceFromCenter > 0.5) {
        discard;
    }
    
    // 計算到筆刷位置的距離
    float distanceToBrush = length(vUv - uBrushPosition);
    
    // 筆刷影響強度（高斯分布）
    float brushInfluence = exp(-distanceToBrush * distanceToBrush / (uBrushSize * uBrushSize));
    brushInfluence *= uBrushStrength;
    
    // 根據筆刷類型設置顏色
    vec4 brushColor = vec4(0.0);
    
    if (uBrushType == 0) {
        // 營養物 - 綠色通道
        brushColor = vec4(0.0, brushInfluence, 0.0, 1.0);
    } else {
        // 抑制劑 - 藍色通道
        brushColor = vec4(0.0, 0.0, brushInfluence, 1.0);
    }
    
    gl_FragColor = brushColor;
}