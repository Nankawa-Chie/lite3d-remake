import React, {useEffect, useMemo} from "react";
import "./styles/QuaternionUI.css";

export default function QuaternionUI({
  axis,
  angleDeg,
  quaternion,
  onAxisChange,
  onAngleChange,
  slerpMethod,
  onSlerpMethodChange,
  slerpT,
  onSlerpTChange,
  slerpPlaying,
  onTogglePlay,
  arm,
  onArmChange,
  onRecordPoseA,
  onRecordPoseB,
  poseADefined,
  poseBDefined,
  deltasThree,
  deltasUnity,
  abT,
  onAbTChange,
  abPlaying,
  onAbToggle,
  abPreview,
  onAbPreviewToggle,
  onExportWarudo, // 导出Warudo JSON
  unityMode,
  onUnityModeToggle,
  axisMap,
  onAxisMapChange,
  unityEulerOrder,
  onUnityEulerOrderChange,
  unityCompose,
  onUnityComposeChange,

}) {
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    const saved = localStorage.getItem("quaternionUI_collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);
  const toggleCollapse = () => {
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem("quaternionUI_collapsed", n ? "1" : "0");
      return n;
    });
  };
  useEffect(() => {
    // 动态加载 MathJax（仅一次）
    if (!window.MathJax) {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    // 公式内容是静态的，仅在初次加载或内容变化时渲染即可
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise();
    }
  }, []);

  const q = quaternion;
  const hasUnity = !!(unityMode && poseADefined && poseBDefined && deltasUnity && deltasUnity.L && deltasUnity.R);
  const safeDeltasUnity = deltasUnity || { L: {}, R: {} };
  const axisStr = `(${axis.map((v) => v.toFixed(3)).join(", ")})`;

  return (
    <div className="quaternion-ui" style={{position: "fixed", top: 12, left: 12, zIndex: 4000, pointerEvents: "auto"}}>
      <button className="collapse-btn" onClick={toggleCollapse} title={collapsed ? "展开面板" : "折叠面板"}>
        {collapsed ? "▶" : "▼"}
      </button>
      <div className="panel" style={collapsed ? {display: "none"} : undefined}>
        <h3>四元数可视化（入门）</h3>
        <div className="row">
          <label>轴向 x:</label>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={axis[0]}
            onChange={(e) => onAxisChange([parseFloat(e.target.value), axis[1], axis[2]])}
          />
          <span>{axis[0].toFixed(2)}</span>
        </div>
        <div className="row">
          <label>轴向 y:</label>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={axis[1]}
            onChange={(e) => onAxisChange([axis[0], parseFloat(e.target.value), axis[2]])}
          />
          <span>{axis[1].toFixed(2)}</span>
        </div>
        <div className="row">
          <label>轴向 z:</label>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={axis[2]}
            onChange={(e) => onAxisChange([axis[0], axis[1], parseFloat(e.target.value)])}
          />
          <span>{axis[2].toFixed(2)}</span>
        </div>
        <div className="row">
          <label>角度 (°):</label>
          <input
            type="range"
            min="-180"
            max="180"
            step="1"
            value={angleDeg}
            onChange={(e) => onAngleChange(parseFloat(e.target.value))}
          />
          <span>{angleDeg.toFixed(0)}</span>
        </div>

        <div className="row mono">
          <div>单位轴: {axisStr}</div>
          <div>四元数: [{q.map((v) => v.toFixed(4)).join(", ")}]</div>
        </div>

        <div className="divider" />

        <h4>手臂（MMD风格简化）</h4>
        <div className="row">
          <label>镜像双臂:</label>
          <input type="checkbox" checked={arm.mirror} onChange={(e) => onArmChange({...arm, mirror: e.target.checked})} />
        </div>
        <div className="row mono" style={{marginTop: 6}}>
          人物右臂（屏幕左侧）
        </div>
        <div className="row">
          <label>锁骨 Swing X:</label>
          <input
            type="range"
            min={-25}
            max={25}
            step={0.1}
            value={arm.left.clavSwingX}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, clavSwingX: parseFloat(e.target.value)}})}
          />
          <span>{arm.left.clavSwingX.toFixed(1)}°</span>
        </div>
        <div className="row">
          <label>锁骨 Swing Z:</label>
          <input
            type="range"
            min={-25}
            max={25}
            step={0.1}
            value={arm.left.clavSwingZ}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, clavSwingZ: parseFloat(e.target.value)}})}
          />
          <span>{arm.left.clavSwingZ.toFixed(1)}°</span>
        </div>
        <div className="row">
          <label>锁骨 Twist Y:</label>
          <input
            type="range"
            min={-15}
            max={15}
            step={0.1}
            value={arm.left.clavTwistY}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, clavTwistY: parseFloat(e.target.value)}})}
          />
          <span>{arm.left.clavTwistY.toFixed(1)}°</span>
        </div>
        <div className="row">
          <label>肩 Swing X:</label>
          <input
            type="range"
            min={-180}
            max={180}
            step={0.1}
            value={arm.left.shoulderSwingX}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, shoulderSwingX: parseFloat(e.target.value)}})}
          />
          <span>{arm.left.shoulderSwingX.toFixed(1)}°</span>
        </div>
        <div className="row">
          <label>肩 Swing Z:</label>
          <input
            type="range"
            min={-180}
            max={180}
            step={0.1}
            value={arm.left.shoulderSwingZ}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, shoulderSwingZ: parseFloat(e.target.value)}})}
          />
          <span>{arm.left.shoulderSwingZ.toFixed(1)}°</span>
        </div>
        <div className="row">
          <label>肩 Twist Y:</label>
          <input
            type="range"
            min={-180}
            max={180}
            step={0.1}
            value={arm.left.shoulderTwistY}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, shoulderTwistY: parseFloat(e.target.value)}})}
          />
          <span>{arm.left.shoulderTwistY.toFixed(1)}°</span>
        </div>
        <div className="row">
          <label>肘 屈伸 X:</label>
          <input
            type="range"
            min={0}
            max={160}
            step={0.1}
            value={arm.left.elbowFlex}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, elbowFlex: parseFloat(e.target.value)}})}
          />
          <span>{arm.left.elbowFlex.toFixed(1)}°</span>
        </div>
        <div className="row">
          <label>关节限制:</label>
          <input
            type="checkbox"
            checked={arm.left.enableLimits}
            onChange={(e) => onArmChange({...arm, left: {...arm.left, enableLimits: e.target.checked}})}
          />
        </div>

        {!arm.mirror && (
          <>
            <div className="row mono" style={{marginTop: 6}}>
              人物左臂（屏幕右侧）
            </div>
            <div className="row">
              <label>锁骨 Swing X:</label>
              <input
                type="range"
                min={-25}
                max={25}
                step={0.1}
                value={arm.right.clavSwingX}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, clavSwingX: parseFloat(e.target.value)}})}
              />
              <span>{arm.right.clavSwingX.toFixed(1)}°</span>
            </div>
            <div className="row">
              <label>锁骨 Swing Z:</label>
              <input
                type="range"
                min={-25}
                max={25}
                step={0.1}
                value={arm.right.clavSwingZ}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, clavSwingZ: parseFloat(e.target.value)}})}
              />
              <span>{arm.right.clavSwingZ.toFixed(1)}°</span>
            </div>
            <div className="row">
              <label>锁骨 Twist Y:</label>
              <input
                type="range"
                min={-15}
                max={15}
                step={0.1}
                value={arm.right.clavTwistY}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, clavTwistY: parseFloat(e.target.value)}})}
              />
              <span>{arm.right.clavTwistY.toFixed(1)}°</span>
            </div>
            <div className="row">
              <label>肩 Swing X:</label>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.1}
                value={arm.right.shoulderSwingX}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, shoulderSwingX: parseFloat(e.target.value)}})}
              />
              <span>{arm.right.shoulderSwingX.toFixed(1)}°</span>
            </div>
            <div className="row">
              <label>肩 Swing Z:</label>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.1}
                value={arm.right.shoulderSwingZ}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, shoulderSwingZ: parseFloat(e.target.value)}})}
              />
              <span>{arm.right.shoulderSwingZ.toFixed(1)}°</span>
            </div>
            <div className="row">
              <label>肩 Twist Y:</label>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.1}
                value={arm.right.shoulderTwistY}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, shoulderTwistY: parseFloat(e.target.value)}})}
              />
              <span>{arm.right.shoulderTwistY.toFixed(1)}°</span>
            </div>
            <div className="row">
              <label>肘 屈伸 X:</label>
              <input
                type="range"
                min={0}
                max={160}
                step={0.1}
                value={arm.right.elbowFlex}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, elbowFlex: parseFloat(e.target.value)}})}
              />
              <span>{arm.right.elbowFlex.toFixed(1)}°</span>
            </div>
            <div className="row">
              <label>关节限制:</label>
              <input
                type="checkbox"
                checked={arm.right.enableLimits}
                onChange={(e) => onArmChange({...arm, right: {...arm.right, enableLimits: e.target.checked}})}
              />
            </div>
          </>
        )}

        <div className="divider" />

        <h4>动作（记录与对比）</h4>
       <div className="row" style={{opacity: (poseADefined && poseBDefined)? 1: 0.6, flexWrap:'wrap', gap:8}}>
         <label>Unity/Warudo 模式:</label>
         <input type="checkbox" checked={!!unityMode} onChange={onUnityModeToggle} />
         <label>轴映射 Xw:</label>
         <select value={axisMap.Xw} onChange={e=>onAxisMapChange({...axisMap, Xw: e.target.value})}>
           {['+Xp','-Xp','+Yp','-Yp','+Zp','-Zp'].map(v=><option key={v} value={v}>{v}</option>)}
         </select>
         <label>Yw:</label>
         <select value={axisMap.Yw} onChange={e=>onAxisMapChange({...axisMap, Yw: e.target.value})}>
           {['+Xp','-Xp','+Yp','-Yp','+Zp','-Zp'].map(v=><option key={v} value={v}>{v}</option>)}
         </select>
         <label>Zw:</label>
         <select value={axisMap.Zw} onChange={e=>onAxisMapChange({...axisMap, Zw: e.target.value})}>
           {['+Xp','-Xp','+Yp','-Yp','+Zp','-Zp'].map(v=><option key={v} value={v}>{v}</option>)}
         </select>
         <label>欧拉:</label>
         <select value={unityEulerOrder} onChange={e=>onUnityEulerOrderChange(e.target.value)}>
           {['ZXY','XYZ','ZYX','YXZ','XZY','YZX'].map(v=><option key={v} value={v}>{v}</option>)}
         </select>
         <label>组合:</label>
         <select value={unityCompose} onChange={e=>onUnityComposeChange(e.target.value)}>
           {['right','left'].map(v=><option key={v} value={v}>{v}</option>)}
         </select>
         <span style={{color:'#9aa0a6'}}>预旋转剥离: 开 / twist重指派: 开</span>
         <button style={{marginLeft:8}} onClick={onExportWarudo} disabled={!(poseADefined && poseBDefined)}>导出 JSON</button>
       </div>

       {(poseADefined && poseBDefined) && (
         <div className="row mono" style={{flexDirection:'column',alignItems:'stretch'}}>
           <div style={{display:'flex', gap:16}}>
             <div style={{flex:1}}>
               <div>Three 模式差异（Euler XYZ 度）</div>
               {['L','R'].map(side => (
                 <div key={'t'+side} style={{marginTop:6}}>
                   <div>{side==='L'?'人物右臂（屏幕左侧）':'人物左臂（屏幕右侧）'}</div>
                   {['clavicle','shoulder','elbow'].map(j => (
                     <div key={j}>
                       {j}: {(deltasThree && deltasThree[side] && deltasThree[side][j] && Array.isArray(deltasThree[side][j].eulerXYZDeg)) ? deltasThree[side][j].eulerXYZDeg.map(v=>v.toFixed(1)).join(', ') : '--'}
                     </div>
                   ))}
                 </div>
               ))}
             </div>
             <div style={{flex:1, opacity: unityMode?1:0.6}}>
               <div>Unity 模式差异（Euler ZXY 度，映射后）</div>
               {hasUnity ? (
                 ['L','R'].map(side => (
                   <div key={'u'+side} style={{marginTop:6}}>
                     <div>{side==='L'?'人物右臂（屏幕左侧）':'人物左臂（屏幕右侧）'}</div>
                     {['clavicle','shoulder','elbow'].map(j => (
                       <div key={j}>
                         {j}: {(safeDeltasUnity[side] && safeDeltasUnity[side][j] && Array.isArray(safeDeltasUnity[side][j].eulerZXYDeg)) ? safeDeltasUnity[side][j].eulerZXYDeg.map(v=> (typeof v==='number'? v.toFixed(1): String(v))).join(', ') : '--'}
                       </div>
                     ))}
                   </div>
                 ))
               ) : (
                 <div style={{color:'#9aa0a6'}}>请先记录 A 和 B，再勾选 Unity 模式</div>
               )}
             </div>
           </div>
         </div>
       )}
        <div className="row">
          <button onClick={onRecordPoseA}>记录为 A</button>
          <button onClick={onRecordPoseB} style={{marginLeft: 8}}>
            记录为 B
          </button>
          <span style={{marginLeft: 8, color: "#9aa0a6"}}>
            A:{poseADefined ? "✓" : "×"} B:{poseBDefined ? "✓" : "×"}
          </span>
        </div>
        {deltasThree && (
          <div className="row mono" style={{flexDirection: "column", alignItems: "flex-start"}}>
            <div>差异（Euler XYZ 度，局部）：</div>
            {["L", "R"].map((side) => (
              <div key={side} style={{marginTop: 6}}>
                <div> {side === "L" ? "人物右臂（屏幕左侧）" : "人物左臂（屏幕右侧）"} </div>
                {["clavicle", "shoulder", "elbow"].map((j) => (
                  <div key={j}>
                    {j}: {(deltasThree && deltasThree[side] && deltasThree[side][j] && Array.isArray(deltasThree[side][j].eulerXYZDeg)) ? deltasThree[side][j].eulerXYZDeg.map((v) => v.toFixed(1)).join(", ") : "--"}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="row">
          <label>A→B 预览:</label>
          <input type="checkbox" checked={!!abPreview} onChange={onAbPreviewToggle} />
          <label style={{marginLeft: 10}}>t:</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={abT ?? 0}
            onChange={(e) => onAbTChange(parseFloat(e.target.value))}
            disabled={!abPreview}
          />
          <span>{(abT ?? 0).toFixed(2)}</span>
          <button onClick={onAbToggle} style={{marginLeft: 8}} disabled={!abPreview}>
            {abPlaying ? "暂停" : "播放"}
          </button>
        </div>

        <div className="divider" />

        <h4>插值（SLERP / NLERP）</h4>
        <div className="row">
          <label>方法:</label>
          <select value={slerpMethod} onChange={(e) => onSlerpMethodChange(e.target.value)}>
            <option value="SLERP">SLERP</option>
            <option value="NLERP">NLERP</option>
          </select>
        </div>
        <div className="row">
          <label>t:</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={slerpT}
            onChange={(e) => onSlerpTChange(parseFloat(e.target.value))}
          />
          <span>{slerpT.toFixed(2)}</span>
          <button onClick={onTogglePlay} style={{marginLeft: 8}}>
            {slerpPlaying ? "暂停" : "播放"}
          </button>
        </div>

        <div className="math">
          <div>
            公式（轴-角到四元数）:
            <div>{String.raw`\[ q = \left(\, \sin(\tfrac{\theta}{2})\,\hat{u}_x,\; \sin(\tfrac{\theta}{2})\,\hat{u}_y,\; \sin(\tfrac{\theta}{2})\,\hat{u}_z,\; \cos(\tfrac{\theta}{2}) \right) \]`}</div>
          </div>
          <div style={{marginTop: "8px"}}>
            旋转向量 v:
            <div>{String.raw`\[ v' = q\,v\,q^{-1} \]`}</div>
          </div>
        </div>

        <div className="note">
          - 右键锁定鼠标，WASD/空格/Shift 自由移动相机。
          <br />- 当前仅展示轴-角与基础旋转，可逐步加入 SLERP、组合顺序、对偶四元数等模块。
        </div>
      </div>
    </div>
  );
}
