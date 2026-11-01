import React from 'react';
import { Gauge, Pause, Play, RotateCcw } from 'lucide-react';

function formatMmSs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Frame-accurate interactive timeline scrubber with Play/Pause toggle,
 * playback speed selector (1.0x / 0.5x), and clickable diagnostic event markers.
 */
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
  const currentFrame = frames[currentFrameIndex] || { timestamp_ms: 0, torso_angle_deg: 0 };
  const durationMs = frames[frames.length - 1]?.timestamp_ms || 47200;
  const currentMs = currentFrame.timestamp_ms || 0;

  return (
    <div className="border border-zinc-800 bg-zinc-900/60 p-3.5 rounded-sm space-y-3">
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="timeline-play-toggle"
            onClick={onTogglePlay}
            className="px-3 py-1.5 rounded-sm bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors"
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
            className="px-2.5 py-1.5 rounded-sm bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1 transition-colors"
            title="Reset to start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>先頭へ</span>
          </button>

          <button
            type="button"
            data-testid="playback-speed-toggle"
            onClick={onToggleSpeed}
            className="px-2.5 py-1.5 rounded-sm bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono text-xs flex items-center gap-1.5 transition-colors"
          >
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            <span>速度: {playbackSpeed.toFixed(1)}x</span>
          </button>
        </div>

        {/* Frame & Timestamp Readout */}
        <div className="flex items-center gap-3 font-mono tabular-nums text-xs">
          <span className="text-zinc-400">
            FRAME:{' '}
            <strong className="text-zinc-100">
              {String(currentFrameIndex + 1).padStart(2, '0')} / {String(totalFrames).padStart(2, '0')}
            </strong>
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400">
            TIME:{' '}
            <strong className="text-emerald-400">
              {formatMmSs(currentMs)} / {formatMmSs(durationMs)}
            </strong>
          </span>
        </div>
      </div>

      {/* Range Slider Track with Positioned Event Markers */}
      <div className="space-y-2">
        <div className="relative pt-2 pb-1">
          <input
            type="range"
            aria-label="Timeline Frame Scrubber"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={currentFrameIndex}
            onChange={(e) => onSelectFrameIndex(Number(e.target.value))}
            className="w-full accent-emerald-500 bg-zinc-950 h-2 rounded-sm cursor-pointer"
          />

          {/* Event tick pins along track */}
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
                  className={`absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full border transition-transform hover:scale-125 ${
                    isGosenOrBow
                      ? 'bg-rose-500 border-rose-200'
                      : 'bg-amber-500 border-amber-200'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Clickable Event Marker Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/80">
          <span className="text-[11px] font-mono text-zinc-400 mr-1">
            イベントマーカー (Event Scrubber):
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
                className={`px-2 py-1 rounded-sm text-[11px] font-mono tabular-nums border transition-colors ${
                  isActive
                    ? 'bg-rose-600 border-rose-300 text-white font-semibold'
                    : isCritical
                    ? 'bg-rose-950/80 hover:bg-rose-900 border-rose-700/80 text-rose-200'
                    : 'bg-zinc-950 hover:bg-zinc-800 border-zinc-700 text-amber-300'
                }`}
              >
                {ev.label_ja}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

