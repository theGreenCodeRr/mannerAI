import React from 'react';
import { Gauge, Pause, Play, RotateCcw } from 'lucide-react';

function formatMmSs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function TimelineBar({
  frames = [],
  currentFrameIndex = 0,
  onSelectFrameIndex,
  isPlaying = false,
  onTogglePlay,
  playbackSpeed = 1.0,
  onToggleSpeed,
  timelineEvents = [],
  onSeekToTimestamp,
}) {
  const totalFrames = Math.max(1, frames.length);
  const currentFrame = frames[currentFrameIndex] || { timestamp_ms: 0 };
  const durationMs = frames[frames.length - 1]?.timestamp_ms || 47200;
  const currentMs = currentFrame.timestamp_ms || 0;

  return (
    <div className="border border-slate-200 bg-white p-4 rounded-2xl shadow-sm space-y-3">
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="timeline-play-toggle"
            onClick={onTogglePlay}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>一時停止 (Pause)</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>再生 (Play)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectFrameIndex(0)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors"
            title="Reset to start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>先頭</span>
          </button>

          <button
            type="button"
            data-testid="playback-speed-toggle"
            onClick={onToggleSpeed}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Gauge className="w-3.5 h-3.5 text-emerald-600" />
            <span>{playbackSpeed.toFixed(1)}x</span>
          </button>
        </div>

        {/* Frame & Timestamp Readout */}
        <div className="flex items-center gap-3 font-mono tabular-nums text-xs">
          <span className="text-slate-400">
            FRAME{' '}
            <strong className="text-slate-800">
              {String(currentFrameIndex + 1).padStart(2, '0')}/{String(totalFrames).padStart(2, '0')}
            </strong>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">
            <strong className="text-emerald-700">{formatMmSs(currentMs)}</strong> /{' '}
            {formatMmSs(durationMs)}
          </span>
        </div>
      </div>

      {/* Range Slider Track with Positioned Event Dots */}
      <div className="space-y-2">
        <div className="relative pt-1">
          <input
            type="range"
            aria-label="Timeline Frame Scrubber"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={currentFrameIndex}
            onChange={(e) => onSelectFrameIndex(Number(e.target.value))}
            className="w-full accent-emerald-600 bg-slate-200 h-2 rounded-lg cursor-pointer"
          />

          <div className="relative h-3 w-full mt-1">
            {timelineEvents.map((ev, idx) => {
              const leftPct = Math.min(
                98,
                Math.max(2, (ev.timestamp_ms / Math.max(1, durationMs)) * 100)
              );
              const isGosenOrBow =
                ev.category === 'gosen_reirei' || ev.category === 'bow_angle';
              return (
                <button
                  key={`${ev.timestamp_ms}-${ev.category}-${idx}`}
                  type="button"
                  onClick={() => onSeekToTimestamp(ev.timestamp_ms)}
                  style={{ left: `${leftPct}%` }}
                  title={ev.label_ja}
                  className={`absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-white shadow-sm transition-transform hover:scale-125 ${
                    isGosenOrBow ? 'bg-rose-500' : 'bg-amber-500'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Clickable Event Marker Chips */}
        {timelineEvents.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">
              検出イベント (Events):
            </span>
            {timelineEvents.map((ev, idx) => {
              const isActive = Math.abs(currentMs - ev.timestamp_ms) <= 850;
              const isCritical =
                ev.category === 'gosen_reirei' || ev.category === 'bow_angle';

              return (
                <button
                  key={`${ev.timestamp_ms}-${idx}`}
                  type="button"
                  data-testid={`timeline-event-${idx}`}
                  onClick={() => onSeekToTimestamp(ev.timestamp_ms)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono tabular-nums border transition-all ${
                    isActive
                      ? 'bg-rose-600 border-rose-600 text-white font-semibold shadow-sm'
                      : isCritical
                      ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700 font-medium'
                      : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800 font-medium'
                  }`}
                >
                  {ev.label_ja}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
