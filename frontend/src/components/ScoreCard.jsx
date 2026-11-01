import React from 'react';
import { Check, MessageSquareWarning, X } from 'lucide-react';

function formatMmSs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Left Panel (5 Columns) of the Post-Session Diagnostic Dashboard.
 * Displays the tabular 100-point score readout, the 4-Point Verification Table,
 * and the interactive Annotated Transcript where filler words are clickable red seek pills.
 */
export default function ScoreCard({
  diagnostic,
  currentTimestampMs,
  onSeekToTimestamp,
}) {
  const {
    total_score = 50,
    grade_label_ja = 'C — 要改善',
    grade_label_en = 'Grade C — Action Required',
    metrics = [],
    words = [],
    filler_occurrences = [],
  } = diagnostic || {};

  const isLowScore = total_score < 70;

  return (
    <div className="flex flex-col gap-3">
      {/* Score Header Card */}
      <div className="border border-zinc-800 bg-zinc-900/60 p-4 rounded-sm flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            総合マナースコア / Session Score
          </div>
          <div
            data-testid="total-score-readout"
            className="text-4xl font-bold font-mono tabular-nums tracking-tight text-zinc-100 mt-1"
          >
            {total_score} <span className="text-xl text-zinc-500">/ 100</span>
          </div>
        </div>

        <div className="text-right space-y-1">
          <span
            className={`inline-block px-2.5 py-1 text-xs font-mono font-semibold rounded-sm border ${
              isLowScore
                ? 'bg-rose-950/80 border-rose-700/80 text-rose-300'
                : 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300'
            }`}
          >
            {grade_label_ja}
          </span>
          <div className="text-[11px] text-zinc-400 font-mono">{grade_label_en}</div>
        </div>
      </div>

      {/* 4-Point Verification Table */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm overflow-hidden">
        <div className="px-3.5 py-2 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-200">
            4項目マナー検証テーブル (4-Point Verification Rubric)
          </span>
          <span className="text-[11px] font-mono text-zinc-400">配点 100 pts</span>
        </div>

        <div className="divide-y divide-zinc-800/80">
          {metrics.map((metric) => {
            const passed = Boolean(metric.passed);
            return (
              <div
                key={metric.key}
                data-testid={`metric-row-${metric.key}`}
                className="px-3.5 py-2.5 space-y-1 hover:bg-zinc-900/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded-sm border ${
                        passed
                          ? 'bg-emerald-950/90 border-emerald-700/80 text-emerald-300'
                          : 'bg-rose-950/90 border-rose-700/80 text-rose-300'
                      }`}
                    >
                      {passed ? (
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      ) : (
                        <X className="w-3 h-3 stroke-[2.5]" />
                      )}
                      {passed ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="text-xs font-semibold text-zinc-100">
                      {metric.title_ja}
                    </span>
                  </div>

                  <span className="font-mono tabular-nums text-xs text-zinc-300">
                    {metric.score} / {metric.max_score} pts
                  </span>
                </div>

                <div
                  className={`text-xs font-mono ${
                    passed ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {metric.summary_ja}
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {metric.detail_ja}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Annotated Transcript Panel with Clickable Filler Timestamp Pills */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm overflow-hidden">
        <div className="px-3.5 py-2 border-b border-zinc-800 bg-zinc-900/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <MessageSquareWarning className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-200">
              音声書き起こし (Annotated Transcript)
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400 whitespace-nowrap">
            フィラー {filler_occurrences.length}件 (クリックで移動)
          </span>
        </div>

        <div className="p-3 space-y-2.5">
          <div className="text-xs leading-6 text-zinc-200 bg-zinc-950 border border-zinc-800/90 p-2.5 rounded-sm">
            {words.map((token, idx) => {
              const isCurrentWord =
                currentTimestampMs >= token.start_ms &&
                currentTimestampMs <= token.end_ms + 300;

              if (token.is_filler) {
                const timeLabel = formatMmSs(token.start_ms);
                return (
                  <button
                    key={`${token.word}-${token.start_ms}-${idx}`}
                    type="button"
                    data-testid={`filler-pill-${idx}`}
                    onClick={() => onSeekToTimestamp(token.start_ms)}
                    className={`inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-sm font-mono text-xs border transition-colors ${
                      isCurrentWord
                        ? 'bg-rose-600 border-rose-400 text-white'
                        : 'bg-rose-950/90 hover:bg-rose-900 border-rose-700 text-rose-200'
                    }`}
                    title={`Seek to ${timeLabel} (${token.word})`}
                  >
                    <span className="tabular-nums font-semibold">{timeLabel}</span>
                    <span>「{token.word}」</span>
                  </button>
                );
              }

              return (
                <span
                  key={`${token.word}-${token.start_ms}-${idx}`}
                  onClick={() => onSeekToTimestamp(token.start_ms)}
                  className={`cursor-pointer rounded-sm px-0.5 transition-colors ${
                    isCurrentWord
                      ? 'bg-emerald-950/90 text-emerald-200 underline decoration-emerald-500'
                      : 'hover:text-white'
                  }`}
                >
                  {token.word}
                </span>
              );
            })}
          </div>

          {/* Quick-Seek Filler Summary Pills */}
          {filler_occurrences.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono text-zinc-400 mr-1">
                検出フィラー一覧:
              </span>
              {filler_occurrences.map((f, i) => (
                <button
                  key={`${f.timestamp_ms}-${i}`}
                  type="button"
                  onClick={() => onSeekToTimestamp(f.timestamp_ms)}
                  className="px-2 py-0.5 text-[11px] font-mono tabular-nums rounded-sm bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 transition-colors"
                >
                  {f.formatted_time}「{f.word}」
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
