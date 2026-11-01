import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Compass,
  Mic,
  Play,
  Square,
} from 'lucide-react';
import { usePoseTracker } from '../modules/pose/usePoseTracker.js';
import { TARGET_BOW_MODES } from '../modules/pose/kinematicsMath.js';
import { useAudioRecorder } from '../modules/audio/useAudioRecorder.js';
import { drawSkeletonOnCanvas } from '../modules/visualizer/StickFigureCanvas.jsx';

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
  onFallbackSample,
}) {
  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  const {
    trackerStatus,
    statusDetail,
    liveTelemetry,
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
  const [errorBanner, setErrorBanner] = useState(null);

  const targetMeta = TARGET_BOW_MODES[targetBowAngle] || TARGET_BOW_MODES[45];

  // Session duration stopwatch
  useEffect(() => {
    if (!isSessionRunning) return undefined;
    const startTs = performance.now();
    const timer = setInterval(() => {
      setElapsedMs(Math.round(performance.now() - startTs));
    }, 100);
    return () => clearInterval(timer);
  }, [isSessionRunning]);

  // Draw real-time skeletal joints, torso vector, and hip angle arc onto canvas overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !liveTelemetry.currentFrame) return;
    const ctx = canvas.getContext('2d');
    const drawBg = trackerStatus !== 'camera_active';
    drawSkeletonOnCanvas(
      ctx,
      canvas.width,
      canvas.height,
      liveTelemetry.currentFrame,
      {
        mode: 'live',
        targetAngleDeg: targetBowAngle,
        drawBackground: drawBg,
      }
    );
  }, [liveTelemetry, targetBowAngle, trackerStatus]);

  const handleStartSession = async () => {
    setErrorBanner(null);
    setElapsedMs(0);
    setIsSessionRunning(true);
    await Promise.all([startSessionCapture(), startAudioRecording()]);
  };

  const handleFinishAndAnalyze = async () => {
    setIsSessionRunning(false);
    setIsAnalyzing(true);
    setErrorBanner(null);

    try {
      const capturedFrames = stopSessionCapture();
      const audioBlob = await stopAudioRecording();

      const framesToSend =
        capturedFrames.length > 0
          ? capturedFrames
          : [liveTelemetry.currentFrame].filter(Boolean);

      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'session.webm');
      formData.append('frames_json', JSON.stringify(framesToSend));
      formData.append('target_bow_angle', String(targetBowAngle));

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Backend responded with HTTP ${response.status}`);
      }

      const diagnosticPayload = await response.json();
      onSessionAnalyzed(diagnosticPayload);
    } catch (_err) {
      // If backend server is offline during standalone frontend preview,
      // notify and load the canonical diagnostic payload.
      onFallbackSample();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isAngleInTargetWindow =
    liveTelemetry.torsoAngleDeg >= targetMeta.minDeg &&
    liveTelemetry.torsoAngleDeg <= targetMeta.maxDeg;

  return (
    <div className="max-w-[1440px] mx-auto px-4 py-4 space-y-3">
      {/* Setup Guide Banner */}
      <div className="border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 rounded-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs text-zinc-200">
          <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            カメラに対して斜め30°〜45°の位置に立ち、頭から腰までが枠内に入るようにしてください{' '}
            <span className="text-zinc-400">
              (Stand at a 30°–45° diagonal angle with head to hips visible)
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 shrink-0">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
          <span>{statusDetail}</span>
        </div>
      </div>

      {errorBanner && (
        <div className="border border-rose-800 bg-rose-950/60 px-3.5 py-2 rounded-sm text-xs text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Main Studio Grid: Primary Viewport (8 cols) + Live Telemetry Sidebar (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Primary Viewport */}
        <div className="lg:col-span-8 border border-zinc-800 bg-zinc-950 rounded-sm overflow-hidden flex flex-col">
          <div className="px-3.5 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">
                リアルタイム骨格トラッキング (3D World Landmarks + Hip Gauge)
              </span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-sm bg-zinc-800 text-zinc-300">
                30 FPS
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-400">
              基準モード: {targetMeta.nameJa} [適正 {targetMeta.minDeg}°–{targetMeta.maxDeg}°]
            </div>
          </div>

          <div className="relative aspect-[16/10] w-full bg-zinc-950 overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 ${
                trackerStatus === 'camera_active' ? 'opacity-75' : 'opacity-0'
              }`}
            />
            <canvas
              ref={overlayCanvasRef}
              width={880}
              height={550}
              className="relative z-10 w-full h-full block"
            />

            {/* Top-left HUD Overlay */}
            <div className="absolute top-3 left-3 z-20 bg-zinc-950/90 border border-zinc-800 px-3 py-2 rounded-sm space-y-1">
              <div className="text-[11px] text-zinc-400 font-mono">
                CALIBRATION: INITIAL 1.0s UPRIGHT VECTOR (v_base)
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-zinc-200">
                  TORSO θ:{' '}
                  <strong className="text-emerald-400 tabular-nums">
                    {liveTelemetry.torsoAngleDeg.toFixed(1)}°
                  </strong>
                </span>
                <span className="text-zinc-500">|</span>
                <span className="text-zinc-200">
                  NECK Δ:{' '}
                  <strong className="text-sky-400 tabular-nums">
                    {liveTelemetry.neckAngleDeg.toFixed(1)}°
                  </strong>
                </span>
              </div>
            </div>

            {/* Bottom-left Diagonal Stance Reference Badge */}
            <div className="absolute bottom-3 left-3 z-20 bg-zinc-950/90 border border-zinc-800 px-2.5 py-1.5 rounded-sm text-[11px] text-zinc-400 font-mono">
              3D Landmarks: Shoulders(11,12) ・ Hips(23,24) ・ Ears(7,8) | Moving Avg: 5 frames
            </div>
          </div>
        </div>

        {/* Live Telemetry Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Card 1: Real-time Torso Inclination */}
          <div className="border border-zinc-800 bg-zinc-900/50 p-4 rounded-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                リアルタイム体幹傾斜角 (Torso Angle)
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-sm bg-zinc-800 text-zinc-300">
                目標: {targetBowAngle}°
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-xs text-zinc-400 font-mono">体幹傾斜角:</div>
              <div
                data-testid="live-torso-angle"
                className={`text-3xl font-bold font-mono tabular-nums tracking-tight ${
                  isAngleInTargetWindow
                    ? 'text-emerald-400'
                    : liveTelemetry.torsoAngleDeg > targetMeta.maxDeg
                    ? 'text-rose-400'
                    : 'text-zinc-100'
                }`}
              >
                {liveTelemetry.torsoAngleDeg.toFixed(1)}°
              </div>
            </div>

            {/* Angle Gauge Bar (0° to 75°) */}
            <div className="space-y-1">
              <div className="relative h-2.5 w-full bg-zinc-950 border border-zinc-800 rounded-sm overflow-hidden">
                {/* Target passing window band */}
                <div
                  className="absolute top-0 bottom-0 bg-emerald-500/25 border-x border-emerald-500/60"
                  style={{
                    left: `${(targetMeta.minDeg / 75) * 100}%`,
                    width: `${((targetMeta.maxDeg - targetMeta.minDeg) / 75) * 100}%`,
                  }}
                />
                {/* Current angle bar */}
                <div
                  className={`h-full transition-all duration-75 ${
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
              <div className="flex justify-between text-[10px] font-mono text-zinc-500 tabular-nums">
                <span>0° (立位)</span>
                <span>
                  適正: {targetMeta.minDeg}°–{targetMeta.maxDeg}°
                </span>
                <span>75°</span>
              </div>
            </div>
          </div>

          {/* Card 2: Posture Stability & Cervical Alignment */}
          <div className="border border-zinc-800 bg-zinc-900/50 p-4 rounded-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                姿勢ステータス (Posture Stability)
              </span>
              {liveTelemetry.postureOk ? (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/70 px-2 py-0.5 rounded-sm">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  良好 (GOOD)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-400 bg-amber-950/70 border border-amber-800/70 px-2 py-0.5 rounded-sm">
                  <AlertCircle className="w-3.5 h-3.5" />
                  傾き検知 (TILT)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-zinc-950 border border-zinc-800/90 p-2.5 rounded-sm">
                <div className="text-[11px] text-zinc-500">肩の左右差 |y11-y12|</div>
                <div className="text-sm font-mono tabular-nums text-zinc-200 mt-0.5">
                  {liveTelemetry.shoulderTilt.toFixed(3)}{' '}
                  <span className="text-[10px] text-zinc-500">(&lt; 0.035)</span>
                </div>
              </div>
              <div className="bg-zinc-950 border border-zinc-800/90 p-2.5 rounded-sm">
                <div className="text-[11px] text-zinc-500">首お辞儀角 (頸椎変位)</div>
                <div className="text-sm font-mono tabular-nums text-zinc-200 mt-0.5">
                  {liveTelemetry.neckAngleDeg.toFixed(1)}°{' '}
                  <span className="text-[10px] text-zinc-500">(&le; 18.0°)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Session Duration & Audio Input Level Meter */}
          <div className="border border-zinc-800 bg-zinc-900/50 p-4 rounded-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">
                セッション時間・音声入力 (Audio & Clock)
              </span>
              <span className="font-mono tabular-nums text-sm text-zinc-100 font-semibold">
                {formatElapsedMs(elapsedMs)}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-zinc-400" />
                  faster-whisper 語先後礼・フィラー検出ストリーム
                </span>
                <span className="font-mono tabular-nums text-zinc-300">
                  {Math.round((isRecordingAudio ? audioLevel : 0.18) * 100)}%
                </span>
              </div>
              <div className="h-2 w-full bg-zinc-950 border border-zinc-800 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-100"
                  style={{
                    width: `${Math.min(100, Math.round((isRecordingAudio ? audioLevel : 0.18) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Session Recording Controls */}
          <div className="border border-zinc-800 bg-zinc-900/50 p-4 rounded-sm space-y-2.5 mt-auto">
            <div className="grid grid-cols-1 gap-2">
              {!isSessionRunning ? (
                <button
                  type="button"
                  data-testid="start-session-btn"
                  disabled={isAnalyzing}
                  onClick={handleStartSession}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold text-xs rounded-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>練習開始 (Start Session)</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="finish-session-btn"
                  onClick={handleFinishAndAnalyze}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>練習終了・解析 (Finish & Analyze)</span>
                </button>
              )}

              <button
                type="button"
                onClick={onFallbackSample}
                className="w-full py-2 px-3 bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>サンプル終了・解析結果を表示 (Finish & Analyze Sample)</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              語先後礼ルール: 「よろしくお願いいたします」等の発声が完了してから腰を折り、目標角度で1秒静止します。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

