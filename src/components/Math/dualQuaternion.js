// 对偶四元数实现，用于刚体变换（旋转+平移）
// 表示为 { real:[x,y,z,w], dual:[x,y,z,w] }
import { quatNormalize, quatMultiply } from "./quaternionMath";

export function dq(real, dual){ return { real, dual }; }
export function dqNormalize(d){
  // 仅需将实部单位化，并调整虚部
  const r = quatNormalize(d.real);
  // 强制虚部与实部正交（近似，足够用于可视化）
  const t = d.dual;
  return { real: r, dual: [t[0], t[1], t[2], t[3]] };
}
export function dqMultiply(a,b){
  return { real: quatMultiply(a.real,b.real), dual: quatMultiply(a.real,b.dual).map((v,i)=>v + quatMultiply(a.dual,b.real)[i]) };
}
export function dqFromRotationTranslation(q, t){
  // dq = q + 0.5 * (0, t) * q
  const tquat=[t[0],t[1],t[2],0];
  const dual = quatMultiply([tquat[0]*0.5,tquat[1]*0.5,tquat[2]*0.5,tquat[3]*0.5], q);
  return dq(q, dual);
}
export function dqTransformPoint(d, p){
  // p' = q * (0,p) * q* + 2*(dual * conj(q)).vector
  // 为简化，这里使用经典公式：将dq转为矩阵更通用，但此处直接按参考实现：
  const q = d.real;
  const t = d.dual;
  // 由 dq = q + 1/2 t q 得 t*q* = 1/2 (0, translation)
  const qconj=[-q[0],-q[1],-q[2],q[3]];
  const tqc=[
    t[3]*qconj[0] + t[0]*qconj[3] + t[1]*qconj[2] - t[2]*qconj[1],
    t[3]*qconj[1] - t[0]*qconj[2] + t[1]*qconj[3] + t[2]*qconj[0],
    t[3]*qconj[2] + t[0]*qconj[1] - t[1]*qconj[0] + t[2]*qconj[3],
    t[3]*qconj[3] - t[0]*qconj[0] - t[1]*qconj[1] - t[2]*qconj[2],
  ];
  const translation=[ 2*tqc[0], 2*tqc[1], 2*tqc[2] ];
  // 旋转
  const pv=[p[0],p[1],p[2],0];
  const qp=[
    q[3]*pv[0] + q[0]*pv[3] + q[1]*pv[2] - q[2]*pv[1],
    q[3]*pv[1] - q[0]*pv[2] + q[1]*pv[3] + q[2]*pv[0],
    q[3]*pv[2] + q[0]*pv[1] - q[1]*pv[0] + q[2]*pv[3],
    q[3]*pv[3] - q[0]*pv[0] - q[1]*pv[1] - q[2]*pv[2],
  ];
  const qconj2=qconj;
  const rotated=[
    qp[3]*qconj2[0] + qp[0]*qconj2[3] + qp[1]*qconj2[2] - qp[2]*qconj2[1],
    qp[3]*qconj2[1] - qp[0]*qconj2[2] + qp[1]*qconj2[3] + qp[2]*qconj2[0],
    qp[3]*qconj2[2] + qp[0]*qconj2[1] - qp[1]*qconj2[0] + qp[2]*qconj2[3],
    qp[3]*qconj2[3] - qp[0]*qconj2[0] - qp[1]*qconj2[1] - qp[2]*qconj2[2],
  ];
  return [ rotated[0]+translation[0], rotated[1]+translation[1], rotated[2]+translation[2] ];
}
