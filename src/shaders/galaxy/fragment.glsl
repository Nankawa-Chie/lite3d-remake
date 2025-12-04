varying vec3 vColor;

void main()
{
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    
    // 使用 smoothstep 创建一个从中心到边缘平滑过渡的 alpha 值
    float strength = 1.0 - smoothstep(0.0, 0.5, distanceToCenter);

    // ==================== 关键修复 #3: 输出带有透明度的颜色 ====================
    // vColor 提供了基础颜色，strength 控制了透明度
    gl_FragColor = vec4(vColor, strength);
}