uniform float uTime;
uniform float uSize;

attribute float aScale;
attribute vec3 aRandomness;
attribute vec3 aColor; 

varying vec3 vColor;

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
                
    // 经典的差速旋转算法
    float distanceToCenter = length(modelPosition.xz);
    float angle = atan(modelPosition.x, modelPosition.z);
    float angleOffset = (1.0 / (distanceToCenter + 0.1)) * uTime * 0.2; 
    angle += angleOffset;
    modelPosition.x = cos(angle) * distanceToCenter;
    modelPosition.z = sin(angle) * distanceToCenter;

    // 添加随机扰动
    modelPosition.xyz += aRandomness;

    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    // ==================== 关键修改：恢复深度缩放 ====================
    // 这会让远处的粒子看起来更小，在近距离穿越时产生强烈的透视感
    gl_PointSize = uSize * aScale * 100.0; // 基础大小增大
    gl_PointSize *= (1.0 / - viewPosition.z); // 应用深度缩放
    // ===============================================================

    vColor = aColor;
}