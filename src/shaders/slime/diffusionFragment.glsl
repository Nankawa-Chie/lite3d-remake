// 擴散和衰減計算片元著色器
uniform sampler2D uTrailMap;
uniform vec2 uResolution;
uniform float uDiffusionRate;
uniform float uDecayRate;
uniform float uDeltaTime;

varying vec2 vUv;

void main() {
    vec2 texelSize = 1.0 / uResolution;
    
    // 檢查是否在培養皿內部
    vec2 center = vec2(0.5, 0.5);
    float distanceFromCenter = length(vUv - center);
    
    if (distanceFromCenter > 0.5) {
        gl_FragColor = vec4(0.0);
        return;
    }
    
    // 當前像素值
    vec4 current = texture2D(uTrailMap, vUv);
    
    // 9點擴散核心
    vec4 sum = vec4(0.0);
    float totalWeight = 0.0;
    
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec2 sampleUv = vUv + offset;
            
            // 檢查採樣點是否在培養皿內
            float sampleDistance = length(sampleUv - center);
            if (sampleDistance <= 0.5) {
                float weight = 1.0;
                if (x == 0 && y == 0) {
                    weight = 4.0; // 中心權重更高
                }
                
                sum += texture2D(uTrailMap, sampleUv) * weight;
                totalWeight += weight;
            }
        }
    }
    
    // 計算平均值（擴散）
    vec4 diffused = sum / totalWeight;
    
    // 混合當前值和擴散值
    vec4 result = mix(current, diffused, uDiffusionRate * uDeltaTime);
    
    // 應用衰減
    result *= uDecayRate;
    
    // 確保值不會變成負數
    result = max(result, vec4(0.0));
    
    gl_FragColor = result;
}