import React from "react";
import LivingRoom from "./LivingRoom"; // 请确保路径正确
import Television from "./Television_sms"; // 请确保路径正确

/**
 * @name LivingRoomWithTV
 * @description 一个组合组件，将LivingRoom和Television模型封装在一起。
 * 这个组件解决了在场景中分别管理和定位多个相关模型的问题。它将电视的
 * 位置、旋转和缩放硬编码为相对于客厅模型的正确值。
 *
 * 所有UI（进度条、计时器、字幕）现在都在Television组件内部处理，
 * 这样它们会一起受到缩放影响并进行相应的尺寸补偿。
 *
 * 这样做的好处是：
 * 1. **简化场景**: 在主场景中，你只需要放置这一个组件，而不是两个。
 * 2. **可复用性**: 可以在任何地方轻松地复用这个带有电视的完整客厅布局。
 * 3. **易于管理**: 如果要移动整个客厅，只需移动这个组合组件即可，电视会自动跟随。
 * 4. **UI一致性**: 所有UI元素都与电视模型保持一致的缩放和变换。
 *
 * @param {object} props - 传递给外部<group>的属性，如 position, scale, rotation。
 * @returns {JSX.Element}
 */
export default function LivingRoomWithTV(props) {
  return (
    // 这个group代表了整个组合体。所有外部传入的props（如position, scale）
    // 都会应用到这个group上，从而统一影响其内部的所有子模型。
    <group {...props}>
      {/* 
        客厅模型作为基准，放置在组合体的原点(0,0,0)。
        它的缩放值是固定的。
      */}
      <LivingRoom scale={1.5} />

      {/* 
        电视模型根据我们计算出的相对位置、旋转和它自己的缩放值进行放置。
        它的变换是相对于父group（也就是相对于客厅）的。
        现在Television组件内部包含了所有UI元素（进度条、计时器、字幕）。
      */}
      <Television position={[3.15, 0.65, -1.0]} rotation={[0, -Math.PI, 0]} scale={0.006} />
    </group>
  );
}
