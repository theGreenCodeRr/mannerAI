export const LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const SMOOTHING_WINDOW_SIZE = 5;
export const LATERAL_SHOULDER_TILT_THRESHOLD = 0.035;
export const CERVICAL_FLEXION_LIMIT_DEG = 18.0;

export const TARGET_BOW_MODES = {
  45: {
    angle: 45,
    nameJa: '最敬礼 (45°)',
    nameEn: 'Saikeirei (45° Deep Gratitude)',
    minDeg: 40.0,
    maxDeg: 50.0,
  },
  30: {
    angle: 30,
    nameJa: '敬礼 (30°)',
    nameEn: 'Keirei (30° Standard Formal)',
    minDeg: 25.0,
    maxDeg: 35.0,
  },
  15: {
    angle: 15,
    nameJa: '会釈 (15°)',
    nameEn: 'Eshaku (15° Casual Greeting)',
    minDeg: 11.0,
    maxDeg: 20.0,
  },
};

/**
 * Computes the 3D midpoint of two landmarks.
 * @param {{x: number, y: number, z: number}} a
 * @param {{x: number, y: number, z: number}} b
 * @returns {{x: number, y: number, z: number}}
 */
export function midpoint3D(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
  };
}

/**
 * Subtracts vector b from vector a (a - b).
 * @param {{x: number, y: number, z: number}} a
 * @param {{x: number, y: number, z: number}} b
 * @returns {{x: number, y: number, z: number}}
 */
export function subtract3D(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

/**
 * Computes Euclidean norm of a 3D vector.
 * @param {{x: number, y: number, z: number}} v
 * @returns {number}
 */
export function norm3D(v) {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Computes the 3D angle in degrees between two vectors using clamped dot product.
 * Invariant to horizontal camera rotation (e.g., 30-45 deg diagonal stance).
 * @param {{x: number, y: number, z: number}} v1
 * @param {{x: number, y: number, z: number}} v2
 * @returns {number}
 */
export function computeAngleBetweenVectorsDeg(v1, v2) {
  const n1 = norm3D(v1);
  const n2 = norm3D(v2);
  if (n1 < 1e-8 || n2 < 1e-8) {
    return 0.0;
  }
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const clamped = Math.max(-1.0, Math.min(1.0, dot / (n1 * n2)));
  return (Math.acos(clamped) * 180.0) / Math.PI;
}

/**
 * Extracts torso and neck 3D vectors from a 33-element worldLandmarks array.
 * @param {Array<{x: number, y: number, z: number}>} worldLandmarks
 * @returns {{vTorso: {x: number, y: number, z: number}, vNeck: {x: number, y: number, z: number}}}
 */
export function extractBiomechanicalVectors(worldLandmarks) {
  const shMid = midpoint3D(
    worldLandmarks[LANDMARK_INDEX.LEFT_SHOULDER],
    worldLandmarks[LANDMARK_INDEX.RIGHT_SHOULDER]
  );
  const hipMid = midpoint3D(
    worldLandmarks[LANDMARK_INDEX.LEFT_HIP],
    worldLandmarks[LANDMARK_INDEX.RIGHT_HIP]
  );
  const earMid = midpoint3D(
    worldLandmarks[LANDMARK_INDEX.LEFT_EAR],
    worldLandmarks[LANDMARK_INDEX.RIGHT_EAR]
  );

  return {
    vTorso: subtract3D(shMid, hipMid),
    vNeck: subtract3D(earMid, shMid),
  };
}

/**
 * Computes mean 3D vector across a calibration buffer.
 * @param {Array<{x: number, y: number, z: number}>} vectors
 * @returns {{x: number, y: number, z: number}}
 */
export function averageVector3D(vectors) {
  if (!vectors || vectors.length === 0) {
    return { x: 0.0, y: -1.0, z: 0.0 };
  }
  const sum = vectors.reduce(
    (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y, z: acc.z + v.z }),
    { x: 0.0, y: 0.0, z: 0.0 }
  );
  return {
    x: sum.x / vectors.length,
    y: sum.y / vectors.length,
    z: sum.z / vectors.length,
  };
}

/**
 * Evaluates frame kinematics (torso inclination, neck flexion, lateral shoulder symmetry).
 * @param {Array<{x: number, y: number, z: number, visibility?: number}>} landmarks2D
 * @param {Array<{x: number, y: number, z: number, visibility?: number}>} worldLandmarks3D
 * @param {{x: number, y: number, z: number}} baselineTorsoVector
 * @param {Array<number>} recentAnglesBuffer
 * @returns {{torsoAngleDeg: number, neckAngleDeg: number, shoulderTilt: number, postureOk: boolean}}
 */
export function evaluateFrameKinematics(
  landmarks2D,
  worldLandmarks3D,
  baselineTorsoVector,
  recentAnglesBuffer
) {
  const { vTorso, vNeck } = extractBiomechanicalVectors(worldLandmarks3D);
  const rawTorsoAngle = computeAngleBetweenVectorsDeg(vTorso, baselineTorsoVector);
  const neckAngleDeg = computeAngleBetweenVectorsDeg(vTorso, vNeck);

  recentAnglesBuffer.push(rawTorsoAngle);
  if (recentAnglesBuffer.length > SMOOTHING_WINDOW_SIZE) {
    recentAnglesBuffer.shift();
  }
  const smoothedTorsoAngle =
    recentAnglesBuffer.reduce((sum, val) => sum + val, 0) / recentAnglesBuffer.length;

  const leftShoulder = landmarks2D[LANDMARK_INDEX.LEFT_SHOULDER];
  const rightShoulder = landmarks2D[LANDMARK_INDEX.RIGHT_SHOULDER];
  const shoulderTilt = Math.abs((leftShoulder?.y ?? 0) - (rightShoulder?.y ?? 0));

  const postureOk =
    shoulderTilt < LATERAL_SHOULDER_TILT_THRESHOLD &&
    neckAngleDeg <= CERVICAL_FLEXION_LIMIT_DEG;

  return {
    torsoAngleDeg: Number(smoothedTorsoAngle.toFixed(1)),
    neckAngleDeg: Number(neckAngleDeg.toFixed(1)),
    shoulderTilt: Number(shoulderTilt.toFixed(4)),
    postureOk,
  };
}

/**
 * Synthesizes a 33-landmark skeleton frame for deterministic headless/demo telemetry
 * when physical camera hardware is unavailable or in simulated preview mode.
 * @param {number} timestampMs
 * @param {number} torsoAngleDeg
 * @param {number} [neckFlexionDeg=2.8]
 * @returns {object}
 */
export function buildSimulatedPoseFrame(timestampMs, torsoAngleDeg, neckFlexionDeg = 2.8) {
  const theta = (torsoAngleDeg * Math.PI) / 180.0;
  const neckTheta = ((torsoAngleDeg + neckFlexionDeg) * Math.PI) / 180.0;
  const diagCos = Math.cos((35.0 * Math.PI) / 180.0);
  const diagSin = Math.sin((35.0 * Math.PI) / 180.0);

  const hipX = 0.50;
  const hipY = 0.58;
  const torsoLen2D = 0.23;
  const neckLen2D = 0.105;

  const shX = hipX - torsoLen2D * Math.sin(theta) * 0.86;
  const shY = hipY - torsoLen2D * Math.cos(theta);
  const headX = shX - neckLen2D * Math.sin(neckTheta) * 0.86;
  const headY = shY - neckLen2D * Math.cos(neckTheta);

  const landmarks_2d = Array.from({ length: 33 }, () => ({
    x: Number(headX.toFixed(4)),
    y: Number(headY.toFixed(4)),
    z: 0.0,
    visibility: 0.99,
  }));

  const world_landmarks_3d = Array.from({ length: 33 }, () => ({
    x: 0.0,
    y: 0.0,
    z: 0.0,
    visibility: 0.99,
  }));

  const sh3D = {
    x: -0.48 * Math.sin(theta) * diagCos,
    y: -0.48 * Math.cos(theta),
    z: -0.48 * Math.sin(theta) * diagSin,
  };
  const ear3D = {
    x: sh3D.x - 0.20 * Math.sin(neckTheta) * diagCos,
    y: sh3D.y - 0.20 * Math.cos(neckTheta),
    z: sh3D.z - 0.20 * Math.sin(neckTheta) * diagSin,
  };

  const assign = (idx, x2, y2, x3, y3, z3) => {
    landmarks_2d[idx] = {
      x: Number(Math.max(0.02, Math.min(0.98, x2)).toFixed(4)),
      y: Number(Math.max(0.02, Math.min(0.98, y2)).toFixed(4)),
      z: Number(z3.toFixed(4)),
      visibility: 0.99,
    };
    world_landmarks_3d[idx] = {
      x: Number(x3.toFixed(4)),
      y: Number(y3.toFixed(4)),
      z: Number(z3.toFixed(4)),
      visibility: 0.99,
    };
  };

  assign(0, headX - 0.018, headY, ear3D.x - 0.04, ear3D.y, ear3D.z);
  assign(7, headX - 0.024, headY - 0.008, ear3D.x - 0.03, ear3D.y, ear3D.z + 0.06);
  assign(8, headX + 0.024, headY + 0.006, ear3D.x + 0.03, ear3D.y, ear3D.z - 0.06);

  assign(11, shX - 0.046, shY - 0.004, sh3D.x - 0.09, sh3D.y, sh3D.z + 0.15);
  assign(12, shX + 0.046, shY + 0.004, sh3D.x + 0.09, sh3D.y, sh3D.z - 0.15);

  const armAngle = theta * 0.88;
  assign(13, shX - 0.044 - 0.105 * Math.sin(armAngle), shY + 0.115 * Math.cos(armAngle), sh3D.x - 0.09, sh3D.y + 0.24, sh3D.z + 0.16);
  assign(14, shX + 0.044 - 0.105 * Math.sin(armAngle), shY + 0.115 * Math.cos(armAngle), sh3D.x + 0.09, sh3D.y + 0.24, sh3D.z - 0.16);
  assign(15, shX - 0.056 - 0.195 * Math.sin(armAngle), shY + 0.22 * Math.cos(armAngle), -0.06, -0.02, 0.15);
  assign(16, shX + 0.020 - 0.195 * Math.sin(armAngle), shY + 0.22 * Math.cos(armAngle), 0.06, -0.02, -0.15);

  assign(23, hipX - 0.035, hipY, -0.06, 0.0, 0.11);
  assign(24, hipX + 0.035, hipY, 0.06, 0.0, -0.11);
  assign(25, hipX - 0.035, hipY + 0.175, -0.06, 0.42, 0.11);
  assign(26, hipX + 0.035, hipY + 0.175, 0.06, 0.42, -0.11);
  assign(27, hipX - 0.035, hipY + 0.34, -0.06, 0.82, 0.11);
  assign(28, hipX + 0.035, hipY + 0.34, 0.06, 0.82, -0.11);

  return {
    timestamp_ms: Math.round(timestampMs),
    landmarks_2d,
    world_landmarks_3d,
    torso_angle_deg: Number(torsoAngleDeg.toFixed(1)),
    neck_angle_deg: Number(neckFlexionDeg.toFixed(1)),
    posture_ok: true,
  };
}

