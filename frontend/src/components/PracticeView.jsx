import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Mic,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import { usePoseTracker } from '../modules/pose/usePoseTracker.js';
import { TARGET_BOW_MODES } from '../modules/pose/kinematicsMath.js';
import { useAudioRecorder } from '../modules/audio/useAudioRecorder.js';
import { drawSkeletonOnCanvas } from '../modules/visualizer/StickFigureCanvas.jsx';
import { evaluateSessionClientSide } from '../modules/scoring/clientScorer.js';
import InfoPopover from './InfoPopover.jsx';

function formatElapsedMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  const tenths = String(Math.floor((ms % 1000) / 100));
  return `${m}:${s}.${tenths}`;
}

export default function PracticeView({
  targetBowAngle = 45,
  onSessionAnalyzed,
}) {
  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  const {
    trackerStatus,
    statusDetail,
    cameraError,
    liveTelemetry,
    initializeTracker,
    recalibrateUprightBaseline,
    startSessionCapture,
    stopSessionCapture,
  } = usePoseTracker({ videoRef });

  const {
    isRecordingAudio,
    audioLevel,
    startAudioRecording,
    stopAudioRecording,
  } = useAudioRecorder();

  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const targetMeta = TARGET_BOW_MODES[targetBowAngle] || TARGET_BOW_MODES[45];

  useEffect(() => {
    if (!isSessionRunning) return undefined;
    const startTs = performance.now();
    const timer = setInterval(() => {
      setElapsedMs(Math.round(performance.now() - startTs));
    }, 100);
    return () => clearInterval(timer);
  }, [isSessionRunning]);

  // Render live skeletal overlay over webcam video (mirrored when real camera is active)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !liveTelemetry.currentFrame) return;
    const ctx = canvas.getContext('2d');
    const isCameraLive = trackerStatus === 'camera_active';
    drawSkeletonOnCanvas(
      ctx,
      canvas.width,
      canvas.height,
      liveTelemetry.currentFrame,
      {
        mode: 'live',
        targetAngleDeg: targetBowAngle,
        drawBackground: !isCameraLive,
        mirrorHorizontal: isCameraLive,
      }
    );
  }, [liveTelemetry, targetBowAngle, trackerStatus]);

  const handleStartSession = async () => {
    setElapsedMs(0);
    setIsSessionRunning(true);
    await Promise.all([startSessionCapture(), startAudioRecording()]);
  };

  const handleFinishAndAnalyze = async () => {
    setIsSessionRunning(false);
    setIsAnalyzing(true);

    const capturedFrames = stopSessionCapture();
    const audioBlob = await stopAudioRecording();

    const framesToSend =
      capturedFrames.length > 0
        ? capturedFrames
        : [liveTelemetry.currentFrame].filter(Boolean);

    try {
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'session.webm');
      formData.append('frames_json', JSON.stringify(framesToSend));
      formData.append('target_bow_angle', String(targetBowAngle));

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const diagnosticPayload = await response.json();
      onSessionAnalyzed(diagnosticPayload);
    } catch (_err) {
      // Evaluate the user's actual recorded frames directly in the browser
      // so every test produces genuine results even if the backend is offline.
      const localResult = evaluateSessionClientSide(framesToSend, targetBowAngle);
      onSessionAnalyzed(localResult);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isAngleInTargetWindow =
    liveTelemetry.torsoAngleDeg >= targetMeta.minDeg &&
    liveTelemetry.torsoAngleDeg <= targetMeta.maxDeg;

  const isCameraActive = trackerStatus === 'camera_active';

  return (
    <div className="max-w-7xl mx-auto px-5 py-5 space-y-4">
      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Primary Camera & Skeletal Viewport (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {/* Viewport Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  isCameraActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isCameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {statusDetail}
              </span>

              <InfoPopover title="カメラ立ち位置ガイド (Stance Guide)" align="left">
                カメラに対して<strong>斜め30°〜45°</strong>の角度で立ち、頭から腰までが枠内に入るようにしてください。開始後1秒間の直立姿勢を基準（0°）として自動キャリブレーションします。
              </InfoPopover>
            </div>

            <div className="flex items-center gap-2">
              {!isCameraActive && (
                <button
                  type="button"
                  onClick={initializeTracker}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>カメラを有効化 (Enable Camera)</span>
                </button>
              )}

              <button
                type="button"
                onClick={recalibrateUprightBaseline}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors"
                title="現在の直立姿勢を0°としてリセット"
              >
                <RefreshCw className="w-3 h-3" />
                <span>0°基準リセット</span>
              </button>
            </div>
          </div>

          {/* Camera & Canvas Stage */}
          <div className="relative aspect-[16/10] w-full bg-slate-900 overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${
                isCameraActive ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <canvas
              ref={overlayCanvasRef}
              width={880}
              height={550}
              className="relative z-10 w-full h-full block"
            />

            {/* Minimal Floating Pill Overlay */}
            <div className="absolute bottom-3 left-3 z-20 bg-white/90 backdrop-blur border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-3 text-xs">
              <span className="text-slate-600 font-medium">
                斜め30°〜45°で立位 (Stand 30°–45° diagonally)
              </span>
              {cameraError && (
                <span className="text-amber-600 font-medium">
                  · デモ骨格表示中
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Clean Telemetry Sidebar (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Card 1: Bow Angle Gauge */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">
                  お辞儀角度 (Bow Angle)
                </span>
                <InfoPopover title="3D傾斜角の計測 (3D Torso Angle)">
                  両肩と両腰の中点を結ぶ3次元ベクトルから、カメラの向きに左右されない正確な前傾角度をリアルタイム算出します。
                </InfoPopover>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                目標 {targetBowAngle}°
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400 font-medium">現在角度</span>
              <div
                data-testid="live-torso-angle"
                className={`text-4xl font-bold font-mono tabular-nums tracking-tight ${
                  isAngleInTargetWindow
                    ? 'text-emerald-600'
                    : liveTelemetry.torsoAngleDeg > targetMeta.maxDeg
                    ? 'text-rose-600'
                    : 'text-slate-900'
                }`}
              >
                {liveTelemetry.torsoAngleDeg.toFixed(1)}°
              </div>
            </div>

            {/* Clean Progress Bar */}
            <div className="space-y-1.5">
              <div className="relative h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 bg-emerald-500/20 border-x-2 border-emerald-500"
                  style={{
                    left: `${(targetMeta.minDeg / 75) * 100}%`,
                    width: `${((targetMeta.maxDeg - targetMeta.minDeg) / 75) * 100}%`,
                  }}
                />
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    isAngleInTargetWindow
                      ? 'bg-emerald-500'
                      : liveTelemetry.torsoAngleDeg > targetMeta.maxDeg
                      ? 'bg-rose-500'
                      : 'bg-sky-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (liveTelemetry.torsoAngleDeg / 75) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-medium text-slate-400 tabular-nums">
                <span>0°</span>
                <span className="text-emerald-700">
                  適正: {targetMeta.minDeg}°–{targetMeta.maxDeg}°
                </span>
                <span>75°</span>
              </div>
            </div>
          </div>

          {/* Card 2: Posture Status */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">
                  姿勢バランス (Posture)
                </span>
                <InfoPopover title="姿勢・首お辞儀チェック (Posture & Neck)">
                  左右の肩の傾き（0.035未満）と、頭だけを下げる「首お辞儀」（頸椎変位 18°以下）を同時判定します。
                </InfoPopover>
              </div>

              {liveTelemetry.postureOk ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  良好 (Good)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  <AlertCircle className="w-3.5 h-3.5" />
                  傾き注意 (Tilt)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                <div className="text-[11px] text-slate-500">肩の水平 (Shoulders)</div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-800 mt-0.5">
                  {liveTelemetry.shoulderTilt < 0.035 ? '水平 (OK)' : '傾きあり'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                <div className="text-[11px] text-slate-500">首の角度 (Neck)</div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-800 mt-0.5">
                  {liveTelemetry.neckAngleDeg.toFixed(1)}°
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Session Timer & Mic Level */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                音声・タイマー (Mic & Time)
              </span>
              <span className="font-mono tabular-nums text-sm text-slate-900 font-bold">
                {formatElapsedMs(elapsedMs)}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-emerald-600" />
                  マイク入力 (Voice Level)
                </span>
                <span className="font-mono tabular-nums text-slate-700 font-medium">
                  {Math.round((isRecordingAudio ? audioLevel : 0.18) * 100)}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-100"
                  style={{
                    width: `${Math.min(100, Math.round((isRecordingAudio ? audioLevel : 0.18) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Primary Action Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 mt-auto">
            {!isSessionRunning ? (
              <button
                type="button"
                data-testid="start-session-btn"
                disabled={isAnalyzing}
                onClick={handleStartSession}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>練習開始 (Start Session)</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="finish-session-btn"
                onClick={handleFinishAndAnalyze}
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>練習終了・解析 (Finish & Analyze)</span>
              </button>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>挨拶を言い終えてからお辞儀（語先後礼）</span>
              <InfoPopover title="語先後礼 (Gosen-reirei Rule)">
                「よろしくお願いいたします」と最後まで発声し終えてからお辞儀を始めると高評価になります。話しながら頭を下げる「同時礼」は減点対象です。
              </InfoPopover>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
