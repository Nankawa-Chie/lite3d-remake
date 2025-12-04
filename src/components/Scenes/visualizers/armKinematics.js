import * as THREE from "three";
import { quatFromAxisAngle, quatNormalize, quatMultiply, clampTwist } from "../../Math/quaternionMath";

// Compute local joint quaternions for an arm from UI parameters
// params: { clavSwingX, clavSwingZ, clavTwistY, shoulderSwingX, shoulderSwingZ, shoulderTwistY, elbowFlex, enableLimits }
// side: 'L' | 'R' (affects base pre-rotation for T-pose along +X)
export function computeArmLocalQuats(params, side='L'){
  const toRad = THREE.MathUtils.degToRad;
  const {
    clavSwingX=0, clavSwingZ=0, clavTwistY=0,
    shoulderSwingX=0, shoulderSwingZ=0, shoulderTwistY=0,
    elbowFlex=0,
    enableLimits=true,
  } = params || {};

  // Base pre-rotation to align bone along +X in T-pose
  const baseAngle = side === 'R' ? -Math.PI/2 : Math.PI/2; // around Z
  const qBase = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), baseAngle);

  // Clavicle local
  let qClavSX = quatFromAxisAngle([1,0,0], toRad(clavSwingX));
  let qClavSZ = quatFromAxisAngle([0,0,1], toRad(clavSwingZ));
  let qClavSY = quatFromAxisAngle([0,1,0], toRad(clavTwistY));
  let qClav = quatNormalize(quatMultiply(quatNormalize(quatMultiply(qClavSZ, qClavSX)), qClavSY));
  if (enableLimits) qClav = clampTwist(qClav, [0,1,0], -15, 15);

  // Shoulder local (relative to clavicle)
  let qShSX = quatFromAxisAngle([1,0,0], toRad(shoulderSwingX));
  let qShSZ = quatFromAxisAngle([0,0,1], toRad(shoulderSwingZ));
  let qShSY = quatFromAxisAngle([0,1,0], toRad(shoulderTwistY));
  let qShoulder = quatNormalize(quatMultiply(quatNormalize(quatMultiply(qShSZ, qShSX)), qShSY));
  if (enableLimits) qShoulder = clampTwist(qShoulder, [0,1,0], -90, 90);

  // Elbow local: hinge X
  const qElbow = quatFromAxisAngle([1,0,0], toRad(elbowFlex));

  return {
    qBase, // three.js quaternion (for scene pre-rotation only)
    clavicle: qClav, // [x,y,z,w]
    shoulder: qShoulder,
    elbow: qElbow,
  };
}
