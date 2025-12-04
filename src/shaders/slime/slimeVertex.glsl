// 黏菌粒子頂點著色器 - 實現智能行為
uniform float uTime;
uniform sampler2D uTrailMap;
uniform float uDishRadius;
uniform float uDeltaTime;
uniform float uSensorDistance;
uniform float uSensorAngle;
uniform float uTurnSpeed;
uniform float uMoveSpeed;
uniform int uSpeciesId;

// 粒子屬性
attribute vec3 velocity;
attribute vec4 attributes; // [life, age, species_id, random_seed]

// 傳遞給片元著色器
varying float vLife;
varying float vAge;
varying vec3 vVelocity;

// 偽隨機數生成器
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 將3D位置轉換為軌跡圖UV座標
vec2 worldToUV(vec3 worldPos) {
    return (worldPos.xz + uDishRadius) / (2.0 * uDishRadius);
}

// 從軌跡圖採樣氣味資訊
vec4 sampleTrail(vec2 uv) {
    // 確保UV在有效範圍內
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        return vec4(0.0);
    }
    
    // 檢查是否在培養皿內
    vec2 center = vec2(0.5, 0.5);
    if (length(uv - center) > 0.5) {
        return vec4(0.0);
    }
    
    return texture2D(uTrailMap, uv);
}

// 計算感知器位置
vec2 getSensorPosition(vec3 pos, vec3 dir, float angle, float distance) {
    // 計算感知器方向
    float cosA = cos(angle);
    float sinA = sin(angle);
    
    // 旋轉方向向量
    vec3 sensorDir = vec3(
        dir.x * cosA - dir.z * sinA,
        dir.y,
        dir.x * sinA + dir.z * cosA
    );
    
    // 計算感知器位置
    vec3 sensorPos = pos + normalize(sensorDir) * distance;
    
    return worldToUV(sensorPos);
}

// 黏菌智能行為邏輯
vec3 updateVelocity(vec3 currentPos, vec3 currentVel, float randomSeed) {
    vec3 newVel = currentVel;
    float life = attributes.x;
    float species = attributes.z;
    
    // 如果生命值過低，減少活動
    if (life < 10.0) {
        return newVel * 0.1;
    }
    
    // 當前方向
    vec3 forward = normalize(newVel);
    if (length(newVel) < 0.001) {
        // 如果沒有方向，隨機選擇一個
        float angle = random(vec2(randomSeed, uTime)) * 6.28318;
        forward = vec3(cos(angle), 0.0, sin(angle));
    }
    
    // 三個感知器：前方、左前、右前
    vec2 frontSensor = getSensorPosition(currentPos, forward, 0.0, uSensorDistance);
    vec2 leftSensor = getSensorPosition(currentPos, forward, -uSensorAngle, uSensorDistance);
    vec2 rightSensor = getSensorPosition(currentPos, forward, uSensorAngle, uSensorDistance);
    
    // 採樣氣味
    vec4 frontTrail = sampleTrail(frontSensor);
    vec4 leftTrail = sampleTrail(leftSensor);
    vec4 rightTrail = sampleTrail(rightSensor);
    
    // 計算各種氣味的強度
    float frontNutrient = frontTrail.g; // 營養物在綠色通道
    float frontInhibitor = frontTrail.b; // 抑制劑在藍色通道
    float frontSelf = frontTrail.r * (species == 1.0 ? 1.0 : 0.0) + 
                      frontTrail.g * (species == 2.0 ? 1.0 : 0.0) + 
                      frontTrail.b * (species == 3.0 ? 1.0 : 0.0) + 
                      frontTrail.a * (species == 4.0 ? 1.0 : 0.0);
    
    float leftNutrient = leftTrail.g;
    float leftInhibitor = leftTrail.b;
    float leftSelf = leftTrail.r * (species == 1.0 ? 1.0 : 0.0) + 
                     leftTrail.g * (species == 2.0 ? 1.0 : 0.0) + 
                     leftTrail.b * (species == 3.0 ? 1.0 : 0.0) + 
                     leftTrail.a * (species == 4.0 ? 1.0 : 0.0);
    
    float rightNutrient = rightTrail.g;
    float rightInhibitor = rightTrail.b;
    float rightSelf = rightTrail.r * (species == 1.0 ? 1.0 : 0.0) + 
                      rightTrail.g * (species == 2.0 ? 1.0 : 0.0) + 
                      rightTrail.b * (species == 3.0 ? 1.0 : 0.0) + 
                      rightTrail.a * (species == 4.0 ? 1.0 : 0.0);
    
    // 決策邏輯
    float turnAngle = 0.0;
    float speedMultiplier = 1.0;
    
    // 規則1: 營養物吸引
    if (frontNutrient > leftNutrient && frontNutrient > rightNutrient) {
        // 直行向營養物
        speedMultiplier = 1.5;
    } else if (leftNutrient > rightNutrient) {
        turnAngle = -uTurnSpeed * uDeltaTime;
    } else if (rightNutrient > leftNutrient) {
        turnAngle = uTurnSpeed * uDeltaTime;
    }
    
    // 規則2: 抑制劑迴避
    if (frontInhibitor > 0.1) {
        // 隨機轉向避開抑制劑
        turnAngle += (random(vec2(randomSeed + uTime, species)) - 0.5) * 3.14159 * uDeltaTime;
        speedMultiplier = 0.5;
    }
    
    // 規則3: 同類聚集
    if (frontSelf > 0.05) {
        speedMultiplier *= 1.2;
    }
    
    // 規則4: 隨機探索
    if (frontNutrient < 0.01 && frontSelf < 0.01) {
        turnAngle += (random(vec2(randomSeed + uTime * 0.1, species)) - 0.5) * 0.5 * uDeltaTime;
    }
    
    // 應用轉向
    if (abs(turnAngle) > 0.001) {
        float cosT = cos(turnAngle);
        float sinT = sin(turnAngle);
        
        newVel = vec3(
            forward.x * cosT - forward.z * sinT,
            forward.y,
            forward.x * sinT + forward.z * cosT
        );
    }
    
    // 應用速度
    newVel = normalize(newVel) * uMoveSpeed * speedMultiplier;
    
    return newVel;
}

void main() {
    vec3 currentPos = position;
    vec3 currentVel = velocity;
    float randomSeed = attributes.w;
    
    // 更新速度（智能行為）
    vec3 newVel = updateVelocity(currentPos, currentVel, randomSeed);
    
    // 更新位置
    vec3 newPos = currentPos + newVel * uDeltaTime;
    
    // 邊界約束（保持在培養皿內）
    float distanceFromCenter = length(newPos.xz);
    if (distanceFromCenter > uDishRadius - 0.5) {
        // 反彈或轉向
        vec2 normal = normalize(newPos.xz);
        newVel.xz = reflect(newVel.xz, -normal);
        newPos = currentPos; // 不移動，只改變方向
    }
    
    // 傳遞給片元著色器
    vLife = attributes.x;
    vAge = attributes.y;
    vVelocity = newVel;
    
    // 設置點大小（根據生命值）
    gl_PointSize = 2.0 + (vLife / 100.0) * 3.0;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}