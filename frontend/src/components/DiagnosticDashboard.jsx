import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Layers } from 'lucide-react';
import ScoreCard from './ScoreCard.jsx';
import TimelineBar from './TimelineBar.jsx';
import StickFigureCanvas from '../modules/visualizer/StickFigureCanvas.jsx';
import InfoPopover from './InfoPopover.jsx';

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
      className="max-w-7xl mx-auto px-5 py-5 space-y-4"
    >
      {/* Clean Subheader Bar */}
      <div className="border border-slate-200 bg-white px-4 py-2.5 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToStudio}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>練習へ戻る (Back)</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>ID: {diagnostic?.session_id || 'sample-shukatsu-001'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
          <span>
            目標角:{' '}
            <strong className="font-mono text-emerald-700">{targetBowAngle}°</strong>
          </span>
          <span>
            最大傾斜:{' '}
            <strong className="font-mono text-rose-600 tabular-nums">
              {peakActualAngleDeg.toFixed(1)}°
            </strong>
          </span>
          <span>
            姿勢安定:{' '}
            <strong className="font-mono text-slate-900 tabular-nums">
              {((diagnostic?.posture_summary?.stability_ratio ?? 0.924) * 100).toFixed(1)}%
            </strong>
          </span>
          <InfoPopover title="3D対角線不変解析 (3D Kinematics)">
            カメラに対して斜め30°〜45°で立位した状態から開始1秒間の直立ベクトルを基準とし、3次元内積によってお辞儀角度と語先後礼（発話とお辞儀の分離）を算出しています。
          </InfoPopover>
        </div>
      </div>

      {/* Main 12-Column Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Panel (5 Columns) — Score Card */}
        <div className="lg:col-span-5">
          <ScoreCard
            diagnostic={diagnostic}
            currentTimestampMs={currentMs}
            onSeekToTimestamp={handleSeekToTimestamp}
          />
        </div>

        {/* Right Panel (7 Columns) — Split Stick-Figure Comparison & Timeline */}
        <div className="lg:col-span-7 flex flex-col gap-4">
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
        </div>
      </div>
    </div>
  );
}
