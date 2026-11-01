import React, { useEffect, useRef } from 'react';
import { LANDMARK_INDEX, TARGET_BOW_MODES } from '../pose/kinematicsMath.js';
import InfoPopover from '../../components/InfoPopover.jsx';

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
 * Renders skeletal joints, torso inclination vector, and a dynamic hip-pivot
 * angle arc onto an HTML5 `<canvas>`.
 */
export function drawSkeletonOnCanvas(ctx, width, height, frame, options = {}) {
  const {
    mode = 'actual', // 'ideal' | 'actual' | 'live'
    targetAngleDeg = 45,
    hasViolation = false,
    violationLabel = '',
    peakMeasuredDeg = null,
    drawBackground = true,
    mirrorHorizontal = false,
  } = options;

  ctx.clearRect(0, 0, width, height);

  if (drawBackground) {
    ctx.fillStyle = '#f8fafc'; // slate-50 light background
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.lineWidth = 1;
    const step = 28;
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

  let primaryStroke = '#475569'; // slate-600
  let accentFill = 'rgba(71, 85, 105, 0.14)';
  let statusBadgeColor = '#1e293b';

  if (mode === 'ideal') {
    primaryStroke = '#059669'; // emerald-600
    accentFill = 'rgba(16, 185, 129, 0.20)';
    statusBadgeColor = '#047857';
  } else if (mode === 'live') {
    if (angle >= targetWindow.minDeg && angle <= targetWindow.maxDeg) {
      primaryStroke = '#10b981';
      accentFill = 'rgba(16, 185, 129, 0.28)';
      statusBadgeColor = '#059669';
    } else if (angle > targetWindow.maxDeg) {
      primaryStroke = '#e11d48';
      accentFill = 'rgba(225, 29, 72, 0.28)';
      statusBadgeColor = '#be123c';
    } else {
      primaryStroke = '#0284c7';
      accentFill = 'rgba(2, 132, 199, 0.24)';
      statusBadgeColor = drawBackground ? '#0369a1' : '#ffffff';
    }
  } else {
    const isOverBow = angle > targetWindow.maxDeg;
    const isActiveUnderBow =
      angle > 12.0 &&
      angle < targetWindow.minDeg &&
      peakMeasuredDeg !== null &&
      peakMeasuredDeg < targetWindow.minDeg;

    if (isOverBow || hasViolation) {
      primaryStroke = '#e11d48'; // rose-600
      accentFill = 'rgba(225, 29, 72, 0.20)';
      statusBadgeColor = '#be123c';
    } else if (isActiveUnderBow || !frame.posture_ok) {
      primaryStroke = '#d97706'; // amber-600
      accentFill = 'rgba(217, 119, 6, 0.20)';
      statusBadgeColor = '#b45309';
    } else if (angle >= targetWindow.minDeg && angle <= targetWindow.maxDeg) {
      primaryStroke = '#059669';
      accentFill = 'rgba(5, 150, 105, 0.20)';
      statusBadgeColor = '#047857';
    }
  }

  const toCanvasPt = (pt) => ({
    x: (mirrorHorizontal ? 1.0 - pt.x : pt.x) * width,
    y: pt.y * height,
  });

  const lSh = toCanvasPt(lm[LANDMARK_INDEX.LEFT_SHOULDER]);
  const rSh = toCanvasPt(lm[LANDMARK_INDEX.RIGHT_SHOULDER]);
  const lHip = toCanvasPt(lm[LANDMARK_INDEX.LEFT_HIP]);
  const rHip = toCanvasPt(lm[LANDMARK_INDEX.RIGHT_HIP]);
  const lEar = toCanvasPt(lm[LANDMARK_INDEX.LEFT_EAR]);
  const rEar = toCanvasPt(lm[LANDMARK_INDEX.RIGHT_EAR]);

  const shMid = { x: (lSh.x + rSh.x) * 0.5, y: (lSh.y + rSh.y) * 0.5 };
  const hipMid = { x: (lHip.x + rHip.x) * 0.5, y: (lHip.y + rHip.y) * 0.5 };
  const earMid = { x: (lEar.x + rEar.x) * 0.5, y: (lEar.y + rEar.y) * 0.5 };

  // 1. Vertical upright reference line & target angle ray from hip pivot
  const guideRadius = Math.min(width, height) * 0.34;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = drawBackground
    ? 'rgba(100, 116, 139, 0.45)'
    : 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.lineTo(hipMid.x, hipMid.y - guideRadius);
  ctx.stroke();

  const bowDirection = shMid.x <= hipMid.x ? -1 : 1;
  const targetRad = -Math.PI / 2 + bowDirection * ((targetAngleDeg * Math.PI) / 180.0);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.lineTo(
    hipMid.x + guideRadius * Math.cos(targetRad),
    hipMid.y + guideRadius * Math.sin(targetRad)
  );
  ctx.stroke();
  ctx.restore();

  // 2. Dynamic hip-pivot angle gauge arc
  const torsoVecAngle = Math.atan2(shMid.y - hipMid.y, shMid.x - hipMid.x);
  const arcRadius = Math.min(width, height) * 0.16;
  const anticlockwise = shMid.x < hipMid.x;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.arc(hipMid.x, hipMid.y, arcRadius, -Math.PI / 2, torsoVecAngle, anticlockwise);
  ctx.closePath();
  ctx.fillStyle = accentFill;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(hipMid.x, hipMid.y, arcRadius, -Math.PI / 2, torsoVecAngle, anticlockwise);
  ctx.strokeStyle = primaryStroke;
  ctx.lineWidth = 2.25;
  ctx.stroke();
  ctx.restore();

  // 3. Draw anatomical limb connections
  ctx.save();
  ctx.strokeStyle = primaryStroke;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [idxA, idxB] of SKELETAL_CONNECTIONS) {
    const ptA = toCanvasPt(lm[idxA]);
    const ptB = toCanvasPt(lm[idxB]);
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
  }

  // 4. Emphasized central torso & neck spine vector
  ctx.strokeStyle = drawBackground ? '#0f172a' : '#ffffff';
  ctx.lineWidth = 3.25;
  ctx.beginPath();
  ctx.moveTo(hipMid.x, hipMid.y);
  ctx.lineTo(shMid.x, shMid.y);
  ctx.lineTo(earMid.x, earMid.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(earMid.x, earMid.y, Math.min(width, height) * 0.042, 0, Math.PI * 2);
  ctx.strokeStyle = primaryStroke;
  ctx.lineWidth = 2.5;
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
    ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = primaryStroke;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(hipMid.x, hipMid.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = primaryStroke;
  ctx.fill();

  // 6. Angle readout label
  ctx.save();
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = statusBadgeColor;
  ctx.fillText(
    `${angle.toFixed(1)}°`,
    hipMid.x + 14,
    hipMid.y - arcRadius * 0.45
  );

  if (violationLabel) {
    ctx.font = '600 11px "Inter", sans-serif';
    ctx.fillStyle = '#e11d48';
    ctx.fillText(violationLabel, 14, height - 14);
  }
  ctx.restore();
}

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
    const activeBadgeText = activeEvents.map((e) => e.label_ja).join(' · ');

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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Left Canvas: Ideal Reference */}
      <div className="border border-slate-200 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-emerald-50/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-emerald-800">
              お手本 (Ideal {targetBowAngle}°)
            </span>
            <InfoPopover title="Ideal Reference Skeleton" align="left">
              挨拶の発声終了後に腰からまっすぐ {targetBowAngle}°（適正 {targetMeta.minDeg}°〜{targetMeta.maxDeg}°）傾ける理想的な動作モデルです。
            </InfoPopover>
          </div>
          <span className="font-mono tabular-nums text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            {idealAngle.toFixed(1)}°
          </span>
        </div>

        <div className="relative aspect-[4/3] w-full bg-slate-50">
          <canvas
            ref={idealCanvasRef}
            width={420}
            height={315}
            className="w-full h-full block"
          />
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur border border-emerald-200 text-[11px] font-semibold text-emerald-800 rounded-lg shadow-sm">
            Target: {targetBowAngle}° Bow
          </div>
        </div>
      </div>

      {/* Right Canvas: Actual Recorded */}
      <div className="border border-slate-200 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-rose-50/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-800">
              あなたの動作 (Actual)
            </span>
            <InfoPopover title="Actual Recorded Skeleton">
              記録された3D骨格データのリプレイです。目標範囲を超過または同時礼が発生したフレームは赤色で強調表示されます。
            </InfoPopover>
          </div>
          <span
            className={`font-mono tabular-nums text-xs font-bold px-2.5 py-0.5 rounded-full ${
              isActualExcessive
                ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {actualAngle.toFixed(1)}°
          </span>
        </div>

        <div className="relative aspect-[4/3] w-full bg-slate-50">
          <canvas
            ref={actualCanvasRef}
            width={420}
            height={315}
            className="w-full h-full block"
          />
          <div
            className={`absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur border text-[11px] font-semibold rounded-lg shadow-sm ${
              isActualExcessive
                ? 'border-rose-300 text-rose-700'
                : 'border-slate-200 text-slate-700'
            }`}
          >
            Result: {peakActualAngleDeg.toFixed(0)}° Peak (現在 {actualAngle.toFixed(1)}°)
          </div>
        </div>
      </div>
    </div>
  );
}
