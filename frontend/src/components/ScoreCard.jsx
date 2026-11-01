import React from 'react';
import { Check, MessageSquareWarning, X } from 'lucide-react';
import InfoPopover from './InfoPopover.jsx';

function formatMmSs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function ScoreCard({
  diagnostic,
  currentTimestampMs,
  onSeekToTimestamp,
}) {
  const {
    total_score = 50,
    grade_label_ja = 'C — 要改善',
    grade_label_en = 'Action Required',
    metrics = [],
    transcript_text = '',
    words = [],
    filler_occurrences = [],
  } = diagnostic || {};

  const isLowScore = total_score < 70;

  return (
    <div className="flex flex-col gap-4">
      {/* Score Summary Card */}
      <div className="border border-slate-200 bg-white p-5 rounded-2xl shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span>総合スコア (Total Score)</span>
            <InfoPopover title="100点満点評価 (Scoring Rubric)" align="left">
              ①お辞儀角度 (30点)、②語先後礼タイミング (30点)、③立位姿勢の安定 (20点)、④つなぎ言葉・フィラー (20点) の4項目合計です。
            </InfoPopover>
          </div>
          <div
            data-testid="total-score-readout"
            className="text-4xl font-bold font-mono tabular-nums tracking-tight text-slate-900 mt-1"
          >
            {total_score} <span className="text-xl text-slate-400">/ 100</span>
          </div>
        </div>

        <div className="text-right space-y-1">
          <span
            className={`inline-block px-3 py-1 text-xs font-bold rounded-full border ${
              isLowScore
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            {grade_label_ja}
          </span>
          <div className="text-[11px] text-slate-400 font-medium">{grade_label_en}</div>
        </div>
      </div>

      {/* 4-Point Verification Table */}
      <div className="border border-slate-200 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">
            評価項目 (Verification Items)
          </span>
          <span className="text-[11px] font-mono text-slate-400">100 pts</span>
        </div>

        <div className="divide-y divide-slate-100">
          {metrics.map((metric) => {
            const passed = Boolean(metric.passed);
            return (
              <div
                key={metric.key}
                data-testid={`metric-row-${metric.key}`}
                className="px-4 py-3 space-y-1 hover:bg-slate-50/70 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-bold rounded-full border ${
                        passed
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-rose-50 border-rose-200 text-rose-700'
                      }`}
                    >
                      {passed ? (
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      ) : (
                        <X className="w-3 h-3 stroke-[2.5]" />
                      )}
                      {passed ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {metric.title_ja}
                    </span>
                    <InfoPopover title={metric.title_en} align="left">
                      {metric.detail_ja}
                    </InfoPopover>
                  </div>

                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-600">
                    {metric.score} / {metric.max_score}
                  </span>
                </div>

                <div
                  className={`text-xs font-medium pl-1 ${
                    passed ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {metric.summary_ja}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Annotated Transcript Panel */}
      <div className="border border-slate-200 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MessageSquareWarning className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span className="text-xs font-bold text-slate-800">
              音声書き起こし (Transcript)
            </span>
            <InfoPopover title="フィラー検出 (Filler Detection)" align="left">
              赤色のバッジ（あの・えっと等）をクリックすると、その発話時点の骨格フレームへ即座にシークします。
            </InfoPopover>
          </div>
          <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            フィラー {filler_occurrences.length}回
          </span>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs leading-6 text-slate-700 bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
            {words.length > 0 ? (
              words.map((token, idx) => {
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
                      className={`inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full font-mono text-xs border transition-all ${
                        isCurrentWord
                          ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                          : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700 font-semibold'
                      }`}
                    >
                      <span className="tabular-nums">{timeLabel}</span>
                      <span>「{token.word}」</span>
                    </button>
                  );
                }

                return (
                  <span
                    key={`${token.word}-${token.start_ms}-${idx}`}
                    onClick={() => onSeekToTimestamp(token.start_ms)}
                    className={`cursor-pointer rounded px-0.5 transition-colors ${
                      isCurrentWord
                        ? 'bg-emerald-100 text-emerald-900 font-semibold'
                        : 'hover:text-slate-950'
                    }`}
                  >
                    {token.word}
                  </span>
                );
              })
            ) : (
              <span className="text-slate-500">{transcript_text}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
