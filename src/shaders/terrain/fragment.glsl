// **[次世代卡通优化]** 完整PBR纹理集
uniform sampler2D sandColor;
uniform sampler2D sandNormal;
uniform sampler2D sandRoughness;

uniform sampler2D grassColor;
uniform sampler2D grassNormal;
uniform sampler2D grassRoughness;

uniform sampler2D rockColor;
uniform sampler2D rockNormal;
uniform sampler2D rockRoughness;

uniform sampler2D snowColor;
uniform sampler2D snowNormal;
uniform sampler2D snowRoughness;

// 混合控制参数
uniform float sandHeight;
uniform float grassHeight;
uniform float rockHeight;
uniform float snowHeight;
uniform float blendSharpness;
uniform float textureScale;


varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
varying float vHeight;

/**
 * @description 计算基于高度的纹理混合权重
 * @param height 当前顶点高度
 * @param targetHeight 目标纹理的理想高度
 * @param blendRange 混合范围
 * @returns 该纹理的混合权重 (0-1)
 */
float calculateHeightBlend(float height, float targetHeight, float blendRange) {
    float distance = abs(height - targetHeight);
    return 1.0 - smoothstep(0.0, blendRange, distance);
}

/**
 * @description 计算坡度因子，用于岩石纹理的坡度修正
 * @param normal 表面法向量
 * @returns 坡度因子 (0-1，0为水平，1为垂直)
 */
float calculateSlopeFactor(vec3 normal) {
    return 1.0 - abs(dot(normal, vec3(0.0, 1.0, 0.0)));
}


/**
 * @description 简化版环境光遮蔽计算，基于表面法向量和高度
 * @param normal 表面法向量
 * @param height 顶点高度
 * @returns AO因子 (0-1)
 */
float calculateSimpleAO(vec3 normal, float height) {
    // 基于法向量的简单AO：向上的面更亮
    float normalAO = dot(normal, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    
    // 基于高度的AO：低洼处更暗
    float heightAO = smoothstep(-5.0, 15.0, height);
    
    return mix(normalAO, 1.0, heightAO * 0.7);
}

void main() {
    vec2 scaledUv = vUv * textureScale;
    
    // 计算坡度因子
    float slopeFactor = calculateSlopeFactor(vNormal);
    
    // 计算各纹理的基础权重
    float sandWeight = calculateHeightBlend(vHeight, sandHeight, blendSharpness);
    float grassWeight = calculateHeightBlend(vHeight, grassHeight, blendSharpness);
    float rockWeight = calculateHeightBlend(vHeight, rockHeight, blendSharpness);
    float snowWeight = calculateHeightBlend(vHeight, snowHeight, blendSharpness);
    
    // 坡度修正：陡峭的地方增加岩石权重
    rockWeight = mix(rockWeight, 1.0, slopeFactor * 0.6);
    
    // 归一化权重
    float totalWeight = sandWeight + grassWeight + rockWeight + snowWeight;
    if (totalWeight > 0.0) {
        sandWeight /= totalWeight;
        grassWeight /= totalWeight;
        rockWeight /= totalWeight;
        snowWeight /= totalWeight;
    }
    
    // 采样所有纹理
    vec3 sandCol = texture2D(sandColor, scaledUv).rgb;
    vec3 grassCol = texture2D(grassColor, scaledUv).rgb;
    vec3 rockCol = texture2D(rockColor, scaledUv).rgb;
    vec3 snowCol = texture2D(snowColor, scaledUv).rgb;
    
    vec3 sandNorm = texture2D(sandNormal, scaledUv).rgb;
    vec3 grassNorm = texture2D(grassNormal, scaledUv).rgb;
    vec3 rockNorm = texture2D(rockNormal, scaledUv).rgb;
    vec3 snowNorm = texture2D(snowNormal, scaledUv).rgb;
    
    float sandRough = texture2D(sandRoughness, scaledUv).r;
    float grassRough = texture2D(grassRoughness, scaledUv).r;
    float rockRough = texture2D(rockRoughness, scaledUv).r;
    float snowRough = texture2D(snowRoughness, scaledUv).r;
    
    // 混合颜色
    vec3 finalColor = sandCol * sandWeight + 
                      grassCol * grassWeight + 
                      rockCol * rockWeight + 
                      snowCol * snowWeight;
    
    // 混合法线（简化处理）
    vec3 finalNormal = sandNorm * sandWeight + 
                       grassNorm * grassWeight + 
                       rockNorm * rockWeight + 
                       snowNorm * snowWeight;
    
    // 混合粗糙度
    float finalRoughness = sandRough * sandWeight + 
                           grassRough * grassWeight + 
                           rockRough * rockWeight + 
                           snowRough * snowWeight;
    
    // 计算简化AO
    float ao = calculateSimpleAO(vNormal, vHeight);
    
    // 应用AO到最终颜色
    finalColor *= ao;
    
    gl_FragColor = vec4(finalColor, 1.0);
}