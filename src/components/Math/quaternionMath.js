import * as THREE from "three";
// 基础四元数数学工具（不依赖 three.js 的 Quaternion）
// 四元数以 [x, y, z, w] 表示

export function quat(x=0,y=0,z=0,w=1){return [x,y,z,w];}
export function quatClone(q){return [q[0],q[1],q[2],q[3]]}
export function quatLength(q){return Math.hypot(q[0],q[1],q[2],q[3]);}
export function quatNormalize(q){const l=quatLength(q)||1;return [q[0]/l,q[1]/l,q[2]/l,q[3]/l];}
export function quatConjugate(q){return [-q[0],-q[1],-q[2],q[3]]}
export function quatMultiply(a,b){
  const ax=a[0], ay=a[1], az=a[2], aw=a[3];
  const bx=b[0], by=b[1], bz=b[2], bw=b[3];
  return [
    aw*bx + ax*bw + ay*bz - az*by,
    aw*by - ax*bz + ay*bw + az*bx,
    aw*bz + ax*by - ay*bx + az*bw,
    aw*bw - ax*bx - ay*by - az*bz,
  ];
}
export function quatFromAxisAngle(axis, angle){
  let [x,y,z]=axis; const len=Math.hypot(x,y,z)||1; x/=len; y/=len; z/=len;
  const s=Math.sin(angle/2); const c=Math.cos(angle/2);
  return [x*s,y*s,z*s,c];
}
export function quatToAxisAngle(q){
  const nq=quatNormalize(q); const w=nq[3];
  const angle=2*Math.acos(Math.max(-1,Math.min(1,w)));
  const s=Math.sqrt(1-w*w);
  if (s<1e-8) return [[1,0,0],0];
  return [[nq[0]/s,nq[1]/s,nq[2]/s], angle];
}
export function quatInverse(q){const c=quatConjugate(q); const l2=quatLength(q); const d=l2*l2||1; return [c[0]/d,c[1]/d,c[2]/d,c[3]/d];}
export function quatDelta(a,b){ // a->b : b * inverse(a)
  return quatNormalize(quatMultiply(b, quatInverse(a)));
}
export function quatRotateVector(q, v){
  const p=[v[0],v[1],v[2],0];
  const qi=quatInverse(q); const qp=quatMultiply(quatMultiply(q,p),qi);
  return [qp[0],qp[1],qp[2]];
}
export function slerp(a,b,t){
  let ax=a[0],ay=a[1],az=a[2],aw=a[3];
  let bx=b[0],by=b[1],bz=b[2],bw=b[3];
  // 夹角余弦
  let cosom=ax*bx+ay*by+az*bz+aw*bw;
  if (cosom<0){ cosom=-cosom; bx=-bx; by=-by; bz=-bz; bw=-bw; }
  let scale0, scale1;
  if ((1-cosom)>1e-6){
    const omega=Math.acos(cosom);
    const sinom=Math.sin(omega);
    scale0=Math.sin((1-t)*omega)/sinom;
    scale1=Math.sin(t*omega)/sinom;
  } else {
    // 角度很小，退化到线性插值
    scale0=1-t; scale1=t;
  }
  return quatNormalize([
    scale0*ax + scale1*bx,
    scale0*ay + scale1*by,
    scale0*az + scale1*bz,
    scale0*aw + scale1*bw,
  ]);
}

export function nlerp(a,b,t){
  return quatNormalize([
    a[0]*(1-t)+b[0]*t,
    a[1]*(1-t)+b[1]*t,
    a[2]*(1-t)+b[2]*t,
    a[3]*(1-t)+b[3]*t,
  ]);
}

// 欧拉角到四元数（默认 ZYX）
export function eulerToQuat(rx, ry, rz, order = "ZYX"){
  const cx=Math.cos(rx/2), sx=Math.sin(rx/2);
  const cy=Math.cos(ry/2), sy=Math.sin(ry/2);
  const cz=Math.cos(rz/2), sz=Math.sin(rz/2);
  let qx=[sx,0,0,cx], qy=[0,sy,0,cy], qz=[0,0,sz,cz];
  const map={X:qx,Y:qy,Z:qz};
  let q=[0,0,0,1];
  for(const ch of order){ q = quatMultiply(map[ch], q); }
  return quatNormalize(q);
}

// Quaternion to Euler (order='XYZ'), returns [rx, ry, rz] in radians
export function quatToEuler(q, order='XYZ'){
  // Convert to three Quaternion and use Euler to avoid reimplementing
  const tq = new THREE.Quaternion(q[0],q[1],q[2],q[3]);
  const e = new THREE.Euler();
  e.setFromQuaternion(tq, order);
  return [e.x, e.y, e.z];
}

// Swing-Twist decomposition around given axis (unit axis in local space)
export function swingTwistDecompose(q, axis=[0,1,0]){
  // Normalize axis
  let ax = axis[0], ay = axis[1], az = axis[2];
  const al = Math.hypot(ax,ay,az) || 1; ax/=al; ay/=al; az/=al;
  const vx = q[0], vy = q[1], vz = q[2], w = q[3];
  // Project vector part onto axis to get twist vector part
  const dot = vx*ax + vy*ay + vz*az;
  const tx = ax*dot, ty = ay*dot, tz = az*dot;
  const twist = quatNormalize([tx, ty, tz, w]);
  // swing = q * inverse(twist)
  const swing = quatMultiply(q, quatInverse(twist));
  return { swing, twist };
}

export function twistAngleDeg(q, axis=[0,1,0]){
  const { twist } = swingTwistDecompose(q, axis);
  // angle = 2*atan2(|v|, w)
  const vlen = Math.hypot(twist[0],twist[1],twist[2]);
  const ang = 2*Math.atan2(vlen, twist[3]);
  // sign by axis dot v
  const sign = (twist[0]*axis[0] + twist[1]*axis[1] + twist[2]*axis[2]) >= 0 ? 1 : -1;
  return THREE.MathUtils.radToDeg(ang) * sign;
}

export function clampTwist(q, axis=[0,1,0], minDeg=-180, maxDeg=180){
  const { swing, twist } = swingTwistDecompose(q, axis);
  const vlen = Math.hypot(twist[0],twist[1],twist[2]);
  const ang = 2*Math.atan2(vlen, twist[3]);
  const angDegSigned = THREE.MathUtils.radToDeg(ang) * ((twist[0]*axis[0] + twist[1]*axis[1] + twist[2]*axis[2])>=0?1:-1);
  const clampedDeg = Math.min(maxDeg, Math.max(minDeg, angDegSigned));
  const clampedRad = THREE.MathUtils.degToRad(clampedDeg);
  const s = Math.sin(clampedRad/2), c=Math.cos(clampedRad/2);
  let ax = axis[0], ay = axis[1], az = axis[2];
  const al = Math.hypot(ax,ay,az) || 1; ax/=al; ay/=al; az/=al;
  const twistClamped = [ax*s, ay*s, az*s, c];
  return quatNormalize(quatMultiply(swing, twistClamped));
}

export function swingAngleDeg(q, axis=[0,1,0]){
  const { swing } = swingTwistDecompose(q, axis);
  const vlen = Math.hypot(swing[0],swing[1],swing[2]);
  const ang = 2*Math.atan2(vlen, swing[3]);
  return THREE.MathUtils.radToDeg(ang);
}
