import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Compass, Layers } from 'lucide-react';
import ScoreCard from './ScoreCard.jsx';
import TimelineBar from './TimelineBar.jsx';
import StickFigureCanvas from '../modules/visualizer/StickFigureCanvas.jsx';

/**
 * View B: Post-Session Diagnostic Dashboard (12-Column Split Layout).
 * Left 5 Columns: Session Score Card, 4-Point Verification Table, Annotated Transcript.
 * Right 7 Columns: Split-Screen Stick-Figure Comparison (Ideal vs Actual) & Interactive Timeline.
 */
export default function DiagnosticDashboard({
  diagnostic,
  targetBowAngle = 45,
  onBackToStudio,
}) {
  const frames = useMemo(() => diagnostic?.frames || [], [diagnostic]);
  const idealFrames = useMemo(() => diagnostic?.ideal_frames || [], [diagnostic]);
  const timelineEvents = useMemo(
    () => diagnostic?.timeline_events || [],
    [diagnostic]
  );

  // Initialize scrubber at the peak bow frame (e.g., index 21 = 16800ms / 00:17 where 45° Ideal vs 65° Actual is clearly visible)
  const initialPeakIdx = useMemo(() => {
    if (!frames.length) return 0;
    const peakMs = diagnostic?.bow_summary?.peak_ms;
    if (typeof peakMs === 'number') {
      const foundIdx = frames.findIndex((f) => f.timestamp_ms >= peakMs);
      if (foundIdx >= 0) return foundIdx;
    }
    let maxIdx = 0;
    for (let i = 1; i < frames.length; i += 1) {
      if ((frames[i].torso_angle_deg ?? 0) > (frames[maxIdx].torso_angle_deg ?? 0)) {
        maxIdx = i;
      }
    }
    return maxIdx;
  }, [diagnostic, frames]);

  const [currentFrameIndex, setCurrentFrameIndex] = useState(initialPeakIdx);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  useEffect(() => {
    setCurrentFrameIndex(initialPeakIdx);
    setIsPlaying(false);
  }, [initialPeakIdx]);

  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return undefined;
    const intervalMs = Math.round(220 / playbackSpeed);
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        if (prev + 1 >= frames.length) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, frames.length]);

  const handleSeekToTimestamp = useCallback(
    (targetMs) => {
      setIsPlaying(false);
      if (!frames.length) return;
      let closestIdx = 0;
      let minDiff = Math.abs(frames[0].timestamp_ms - targetMs);
      for (let i = 1; i < frames.length; i += 1) {
        const diff = Math.abs(frames[i].timestamp_ms - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      setCurrentFrameIndex(closestIdx);
    },
    [frames]
  );

  const handleToggleSpeed = () => {
    setPlaybackSpeed((prev) => (prev === 1.0 ? 0.5 : 1.0));
  };

  const actualFrame = frames[currentFrameIndex] || frames[0];
  const idealFrame = idealFrames[currentFrameIndex] || idealFrames[0] || actualFrame;
  const currentMs = actualFrame?.timestamp_ms ?? 0;

  const activeEvents = useMemo(
    () =>
      timelineEvents.filter(
        (ev) => Math.abs(ev.timestamp_ms - currentMs) <= 1200
      ),
    [timelineEvents, currentMs]
  );

  const peakActualAngleDeg =
    diagnostic?.bow_summary?.peak_angle_deg ?? actualFrame?.torso_angle_deg ?? 65.0;

  return (
    <div
      data-testid="diagnostic-dashboard"
      className="max-w-[1440px] mx-auto px-4 py-4 space-y-3"
    >
      {/* Top Diagnostic Subheader Bar */}
      <div className="border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 rounded-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToStudio}
            className="px-2.5 py-1 rounded-sm bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>スタジオへ戻る (Back to Live Studio)</span>
          </button>
          <span className="text-zinc-600 text-xs">|</span>
          <div className="flex items-center gap-2 text-xs text-zinc-300 font-mono">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>SESSION ID: {diagnostic?.session_id || 'sample-shukatsu-001'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
          <span>
            目標お辞儀:{' '}
            <strong className="text-emerald-400">{targetBowAngle}°</strong>
          </span>
          <span>
            計測ピーク角:{' '}
            <strong className="text-rose-400 tabular-nums">
              {peakActualAngleDeg.toFixed(1)}°
            </strong>
          </span>
          <span>
            立位安定率:{' '}
            <strong className="text-zinc-200 tabular-nums">
              {((diagnostic?.posture_summary?.stability_ratio ?? 0.924) * 100).toFixed(1)}%
            </strong>
          </span>
        </div>
      </div>

      {/* Main 12-Column Diagnostic Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Panel (5 Columns) — Session Score Card */}
        <div className="lg:col-span-5">
          <ScoreCard
            diagnostic={diagnostic}
            currentTimestampMs={currentMs}
            onSeekToTimestamp={handleSeekToTimestamp}
          />
        </div>

        {/* Right Panel (7 Columns) — Split-Screen Stick-Figure Comparison & Timeline Scrubber */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <StickFigureCanvas
            idealFrame={idealFrame}
            actualFrame={actualFrame}
            targetBowAngle={targetBowAngle}
            peakActualAngleDeg={peakActualAngleDeg}
            activeEvents={activeEvents}
          />

          <TimelineBar
            frames={frames}
            currentFrameIndex={currentFrameIndex}
            onSelectFrameIndex={(idx) => {
              setIsPlaying(false);
              setCurrentFrameIndex(idx);
            }}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            playbackSpeed={playbackSpeed}
            onToggleSpeed={handleToggleSpeed}
            timelineEvents={timelineEvents}
            onSeekToTimestamp={handleSeekToTimestamp}
          />

          {/* Biomechanical Verification Note */}
          <div className="border border-zinc-800 bg-zinc-900/40 p-3 rounded-sm flex items-start gap-2.5 text-[11px] text-zinc-400 leading-relaxed">
            <Compass className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-zinc-200">3D対角線不変ベクトル解析 (Diagonal-Invariant Kinematics):</strong>{' '}
              カメラに対し斜め30°〜45°で立位した状態から、開始1.0秒間の体幹ベクトル{' '}
              <code className="font-mono text-zinc-300">v_base</code>{' '}
              を基準キャリブレーションとし、3次元内積によってカメラ角度に依存しない正確な腰部傾斜角{' '}
              <code className="font-mono text-zinc-300">θ(t)</code>{' '}
              および語先後礼（発話終了時刻とお辞儀開始時刻の交差）を検証しています。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

