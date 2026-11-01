import React from 'react';
import { Activity, Database, ShieldCheck, Video } from 'lucide-react';

/**
 * Top navigation and control header.
 * Provides Target Bow mode selection (45°, 30°, 15°), view switching,
 * and instant loading of `shared/sample_diagnostic.json`.
 */
export default function Navbar({
  activeView,
  onSelectView,
  targetBowAngle,
  onChangeTargetBowAngle,
  onLoadSampleData,
}) {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-[1440px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-zinc-900 border border-zinc-700 flex items-center justify-center">
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2.5 shrink-0">
            <span className="font-semibold tracking-tight text-zinc-100 text-base whitespace-nowrap">
              MannerAI
            </span>
            <span className="text-zinc-600 text-xs">|</span>
            <span className="text-xs text-zinc-400 font-medium whitespace-nowrap">
              面接マナー・姿勢解析システム
            </span>
          </div>
          <div className="hidden xl:flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-sm bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 whitespace-nowrap shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Privacy: No Raw Video Saved (3D座標のみ記録)</span>
          </div>
        </div>

        {/* Controls: Target Bow Selector + View Switcher + Sample Diagnostic Loader */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-sm">
            <label
              htmlFor="target-bow-select"
              className="text-[11px] text-zinc-400 font-medium whitespace-nowrap"
            >
              目標角度 (Target Bow):
            </label>
            <select
              id="target-bow-select"
              aria-label="Target Bow Angle"
              value={targetBowAngle}
              onChange={(e) => onChangeTargetBowAngle(Number(e.target.value))}
              className="bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs font-mono px-2 py-0.5 rounded-sm focus:outline-none focus:border-emerald-500"
            >
              <option value={45}>最敬礼 (45°)</option>
              <option value={30}>敬礼 (30°)</option>
              <option value={15}>会釈 (15°)</option>
            </select>
          </div>

          <div className="flex items-center border border-zinc-800 rounded-sm overflow-hidden bg-zinc-900">
            <button
              type="button"
              onClick={() => onSelectView('practice')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeView === 'practice'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Video className="w-3.5 h-3.5 shrink-0" />
              <span>実践スタジオ (Live Studio)</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="load-sample-btn"
            onClick={onLoadSampleData}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm border flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeView === 'diagnostic'
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-200'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>サンプル結果を表示 (Load Sample Data)</span>
          </button>
        </div>
      </div>
    </header>
  );
}
