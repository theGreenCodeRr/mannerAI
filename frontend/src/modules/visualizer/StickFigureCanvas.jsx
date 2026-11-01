import React, { useEffect, useRef } from 'react';
import { LANDMARK_INDEX, TARGET_BOW_MODES } from '../pose/kinematicsMath.js';

const SKELETAL_CONNECTIONS = [
  [LANDMARK_INDEX.LEFT_SHOULDER, LANDMARK_INDEX.RIGHT_SHOULDER],
  [LANDMARK_INDEX.LEFT_HIP, LANDMARK_INDEX.RIGHT_HIP],
  [LANDMARK_INDEX.LEFT_SHOULDER, LANDMARK_INDEX.LEFT_HIP],
  [LANDMARK_INDEX.RIGHT_SHOULDER, LANDMARK_INDEX.RIGHT_HIP],
  [LANDMARK_INDEX.LEFT_SHOULDER, LANDMARK_INDEX.LEFT_ELBOW],
  [LANDMARK_INDEX.LEFT_ELBOW, LANDMARK_INDEX.LEFT_WRIST],
  [LANDMARK_INDEX.RIGHT_SHOULDER, LANDMARK_INDEX.RIGHT_ELBOW],
  [LANDMARK_INDEX.RIGHT_ELBOW, LANDMARK_INDEX.RIGHT_WRIST],
  [LANDMARK_INDEX.LEFT_HIP, LANDMARK_INDEX.LEFT_KNEE],
  [LANDMARK_INDEX.LEFT_KNEE, LANDMARK_INDEX.LEFT_ANKLE],
  [LANDMARK_INDEX.RIGHT_HIP, LANDMARK_INDEX.RIGHT_KNEE],
  [LANDMARK_INDEX.RIGHT_KNEE, LANDMARK_INDEX.RIGHT_ANKLE],
];

/**
 * Renders a technical grid, skeletal limbs, spinal/cervical alignment vectors,
 * and a dynamic hip-pivot inclination arc on a 2D HTML5 canvas.
 */
export function drawSkeletonOnCanvas(ctx, width, height, frame, options = {}) {
  const {
    mode = 'actual', // 'ideal' | 'actual' | 'live'
    targetAngleDeg = 45,
    hasViolation = false,
    violationLabel = '',
    peakMeasuredDeg = null,
    drawBackground = true,
  } = options;

  ctx.clearRect(0, 0, width, height);

  if (drawBackground) {
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, width, height);

    // Subtle 24px technical coordinate grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const step = 24;
    for (let x = 0; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  if (!frame || !frame.landmarks_2d || frame.landmarks_2d.length < 29) {
    return;
  }

  const lm = frame.landmarks_2d;
  const angle = frame.torso_angle_deg ?? 0.0;
  const targetWindow = TARGET_BOW_MODES[targetAngleDeg] || TARGET_BOW_MODES[45];

  // Determine stroke palette based on viewport mode and biometric threshold compliance
  let primaryStroke = '#94a3b8'; // neutral slate-400 for normal upright stance
  let accentFill = 'rgba(148, 163, 184, 0.16)';
  let statusBadgeColor = '#e4e4e7';

  if (mode === 'ideal') {
    primaryStroke = '#10b981'; // emerald-500
    accentFill = 'rgba(16, 185, 129, 0.18)';
    statusBadgeColor = '#34d399';
  } else if (mode === 'live') {
    if (angle >= targetWindow.minDeg && angle <= targetWindow.maxDeg) {
      primaryStroke = '#10b981';
      accentFill = 'rgba(16, 185, 129, 0.20)';
      statusBadgeColor = '#34d399';
    } else if (angle > targetWindow.maxDeg) {
      primaryStroke = '#f43f5e';
      accentFill = 'rgba(244, 63, 94, 0.22)';
      statusBadgeColor = '#fb7185';
    } else {
      primaryStroke = '#38bdf8';
      accentFill = 'rgba(56, 189, 248, 0.18)';
      statusBadgeColor = '#7dd3fc';
    }
  } else {
    // 'actual' diagnostic replay mode
    const isOverBow = angle > targetWindow.maxDeg;
    const isActiveUnderBow =
      angle > 12.0 &&
      angle < targetWindow.minDeg &&
      peakMeasuredDeg !== null &&
      peakMeasuredDeg < targetWindow.minDeg;

    if (isOverBow || hasViolation) {
      primaryStroke = '#f43f5e'; // rose-500 for over-bow / Gosen-reirei violation
      accentFill = 'rgba(244, 63, 94, 0.22)';
      statusBadgeColor = '#fda4af';
    } else if (isActiveUnderBow || !frame.posture_ok) {
      primaryStroke = '#f59e0b'; // amber-500
      accentFill = 'rgba(245, 158, 11, 0.20)';
      statusBadgeColor = '#fcd34d';
    } else if (angle >= targetWindow.minDeg && angle <= targetWindow.maxDeg) {
      primaryStroke = '#10b981';
      accentFill = 'rgba(16, 185, 129, 0.18)';
      statusBadgeColor = '#6ee7b7';
    }
  }

  const toCanvasPt = (pt) => ({
    x: pt.x * width,
    y: pt.y * height,
  });

  const lSh = toCanvasPt(lm[LANDMARK_INDEX.LEFT_SHOULDER]);
  const rSh = toCanvasPt(lm[LANDMARK_INDEX.RIGHT_SHOULDER]);
  const lHip = toCanvasPt(lm[LANDMARK_INDEX.LEFT_HIP]);
  const rHip = toCanvasPt(lm[LANDMARK_INDEX.RIGHT_HIP]);
  const lEar = toCanvasPt(lm[LANDMARK_INDEX.LEFT_EAR]);
  const rEar = toCanvasPt(lm[LANDMARK_INDEX.RIGHT_EAR]);

  const shMid = { x: (lSh.x + rSh.x) * 0.5, y: (lSh.y + rSh.y) * 0.5 };
  const hipMid = { x: (lHip.x + rHip.y * 0 + rHip.x) * 0.5, y: (lHip.y + rHip.y) * 0.5 };
  const earMid = { x: (lEar.x + rEar.x) * 0.5, y: (lEar.y + rEar.y) * 0.5 };

  // 1. Vertical upright reference axis & target angle guide ray from hip pivot
  const guideRadius = Math.min(width, height) * 0.34;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(161, 161, 170, 0.35)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.lineTo(hipMid.x, hipMid.y - guideRadius);
  ctx.stroke();

  // Target inclination reference ray (-targetAngleDeg from vertical upward)
  const targetRad = -Math.PI / 2 - (targetAngleDeg * Math.PI) / 180.0;
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.lineTo(
    hipMid.x + guideRadius * Math.cos(targetRad),
    hipMid.y + guideRadius * Math.sin(targetRad)
  );
  ctx.stroke();
  ctx.restore();

  // 2. Dynamic hip-pivot angle gauge arc between vertical axis (-PI/2) and current torso vector
  const torsoVecAngle = Math.atan2(shMid.y - hipMid.y, shMid.x - hipMid.x);
  const arcRadius = Math.min(width, height) * 0.16;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.arc(hipMid.x, hipMid.y, arcRadius, -Math.PI / 2, torsoVecAngle, true);
  ctx.closePath();
  ctx.fillStyle = accentFill;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(hipMid.x, hipMid.y, arcRadius, -Math.PI / 2, torsoVecAngle, true);
  ctx.strokeStyle = primaryStroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 3. Draw anatomical limb connections
  ctx.save();
  ctx.strokeStyle = primaryStroke;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const [idxA, idxB] of SKELETAL_CONNECTIONS) {
    const ptA = toCanvasPt(lm[idxA]);
    const ptB = toCanvasPt(lm[idxB]);
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
  }

  // 4. Emphasized central torso vector & cervical spine vector
  ctx.strokeStyle = '#fafafa';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.lineTo(shMid.x, shMid.y);
  ctx.lineTo(earMid.x, earMid.y);
  ctx.stroke();

  // Head circle around ear midpoint
  ctx.beginPath();
  ctx.arc(earMid.x, earMid.y, Math.min(width, height) * 0.042, 0, Math.PI * 2);
  ctx.strokeStyle = primaryStroke;
  ctx.lineWidth = 2.25;
  ctx.stroke();
  ctx.restore();

  // 5. Draw joint nodes
  const keyIndices = [
    LANDMARK_INDEX.LEFT_SHOULDER,
    LANDMARK_INDEX.RIGHT_SHOULDER,
    LANDMARK_INDEX.LEFT_ELBOW,
    LANDMARK_INDEX.RIGHT_ELBOW,
    LANDMARK_INDEX.LEFT_WRIST,
    LANDMARK_INDEX.RIGHT_WRIST,
    LANDMARK_INDEX.LEFT_HIP,
    LANDMARK_INDEX.RIGHT_HIP,
    LANDMARK_INDEX.LEFT_KNEE,
    LANDMARK_INDEX.RIGHT_KNEE,
    LANDMARK_INDEX.LEFT_ANKLE,
    LANDMARK_INDEX.RIGHT_ANKLE,
  ];

  for (const idx of keyIndices) {
    const pt = toCanvasPt(lm[idx]);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#09090b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = primaryStroke;
    ctx.stroke();
  }

  // Emphasize hip pivot point
  ctx.beginPath();
  ctx.arc(hipMid.x, hipMid.y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = primaryStroke;
  ctx.fill();

  // 6. Angle readout label near hip pivot
  ctx.save();
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillStyle = statusBadgeColor;
  ctx.fillText(
    `θ = ${angle.toFixed(1)}°`,
    hipMid.x + 14,
    hipMid.y - arcRadius * 0.45
  );

  if (violationLabel) {
    ctx.font = '600 11px "Inter", sans-serif';
    ctx.fillStyle = '#fda4af';
    ctx.fillText(violationLabel, 14, height - 14);
  }
  ctx.restore();
}

/**
 * Split-screen dual-canvas skeletal comparison component for the Post-Session Diagnostic Dashboard.
 * Renders the Ideal Target skeleton on the left and the User's Actual recorded skeleton on the right.
 */
export default function StickFigureCanvas({
  idealFrame,
  actualFrame,
  targetBowAngle = 45,
  peakActualAngleDeg = 65.0,
  activeEvents = [],
}) {
  const idealCanvasRef = useRef(null);
  const actualCanvasRef = useRef(null);

  useEffect(() => {
    const canvas = idealCanvasRef.current;
    if (!canvas || !idealFrame) return;
    const ctx = canvas.getContext('2d');
    drawSkeletonOnCanvas(ctx, canvas.width, canvas.height, idealFrame, {
      mode: 'ideal',
      targetAngleDeg: targetBowAngle,
      drawBackground: true,
    });
  }, [idealFrame, targetBowAngle]);

  useEffect(() => {
    const canvas = actualCanvasRef.current;
    if (!canvas || !actualFrame) return;
    const ctx = canvas.getContext('2d');
    const hasGosenOrBowViolation = activeEvents.some(
      (ev) => ev.category === 'gosen_reirei' || ev.category === 'bow_angle'
    );
    const activeBadgeText = activeEvents.map((e) => e.label_ja).join(' / ');

    drawSkeletonOnCanvas(ctx, canvas.width, canvas.height, actualFrame, {
      mode: 'actual',
      targetAngleDeg: targetBowAngle,
      hasViolation: hasGosenOrBowViolation,
      violationLabel: activeBadgeText,
      peakMeasuredDeg: peakActualAngleDeg,
      drawBackground: true,
    });
  }, [actualFrame, targetBowAngle, peakActualAngleDeg, activeEvents]);

  const idealAngle = idealFrame?.torso_angle_deg ?? 0.0;
  const actualAngle = actualFrame?.torso_angle_deg ?? 0.0;
  const targetMeta = TARGET_BOW_MODES[targetBowAngle] || TARGET_BOW_MODES[45];
  const isActualExcessive = actualAngle > targetMeta.maxDeg;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Left Canvas: Ideal Reference Motion */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/70 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-emerald-400 tracking-tight">
              目標の動作 / What SHOULD be performed — Ideal
            </div>
            <div className="text-[11px] text-zinc-400">
              Target: {targetBowAngle}° Bow ({targetMeta.nameJa}) ・ 頸椎直線維持
            </div>
          </div>
          <span className="font-mono tabular-nums text-xs px-2 py-0.5 rounded-sm bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
            {idealAngle.toFixed(1)}°
          </span>
        </div>
        <div className="relative aspect-[4/3] w-full bg-zinc-950">
          <canvas
            ref={idealCanvasRef}
            width={420}
            height={315}
            className="w-full h-full block"
          />
          <div className="absolute top-2.5 left-2.5 px-2 py-1 bg-zinc-900/90 border border-emerald-800/60 text-[11px] font-mono text-emerald-300 rounded-sm">
            Target: {targetBowAngle}° Bow (適正範囲 {targetMeta.minDeg}°–{targetMeta.maxDeg}°)
          </div>
        </div>
      </div>

      {/* Right Canvas: User's Actual Recorded Motion */}
      <div className="border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/70 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-rose-400 tracking-tight">
              実施した動作 / What WAS performed — Actual
            </div>
            <div className="text-[11px] text-zinc-400">
              Result: {peakActualAngleDeg.toFixed(0)}° Peak Bow ・ 3D骨格リプレイ (動画非保存)
            </div>
          </div>
          <span
            className={`font-mono tabular-nums text-xs px-2 py-0.5 rounded-sm border ${
              isActualExcessive
                ? 'bg-rose-950/80 border-rose-700/70 text-rose-300'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200'
            }`}
          >
            {actualAngle.toFixed(1)}°
          </span>
        </div>
        <div className="relative aspect-[4/3] w-full bg-zinc-950">
          <canvas
            ref={actualCanvasRef}
            width={420}
            height={315}
            className="w-full h-full block"
          />
          <div
            className={`absolute top-2.5 left-2.5 px-2 py-1 border text-[11px] font-mono rounded-sm ${
              isActualExcessive
                ? 'bg-rose-950/90 border-rose-700 text-rose-200'
                : 'bg-zinc-900/90 border-zinc-700 text-zinc-300'
            }`}
          >
            Result: {peakActualAngleDeg.toFixed(0)}° Bow (現在角 {actualAngle.toFixed(1)}°)
          </div>
        </div>
      </div>
    </div>
  );
}

