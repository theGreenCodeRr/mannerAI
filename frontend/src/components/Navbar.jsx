import React from 'react';
import { Activity, Database, ShieldCheck, Video } from 'lucide-react';
import InfoPopover from './InfoPopover.jsx';

export default function Navbar({
  activeView,
  onSelectView,
  targetBowAngle,
  onChangeTargetBowAngle,
  onLoadSampleData,
}) {
  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        {/* Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-sm">
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-slate-900 text-base">
                MannerAI
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                面接マナー解析
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-full bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>No Video Saved</span>
            <InfoPopover title="Privacy Mode (動画非保存)" align="left">
              カメラ映像はブラウザ内での3D骨格座標抽出にのみ使用され、動画ファイルは一切保存・送信されません。
            </InfoPopover>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          {/* Target Bow Selector */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <label
              htmlFor="target-bow-select"
              className="text-xs text-slate-500 font-medium whitespace-nowrap"
            >
              目標 (Target):
            </label>
            <select
              id="target-bow-select"
              aria-label="Target Bow Angle"
              value={targetBowAngle}
              onChange={(e) => onChangeTargetBowAngle(Number(e.target.value))}
              className="bg-white border border-slate-200 text-slate-800 text-xs font-semibold px-2 py-1 rounded-lg focus:outline-none focus:border-emerald-500"
            >
              <option value={45}>最敬礼 (45°)</option>
              <option value={30}>敬礼 (30°)</option>
              <option value={15}>会釈 (15°)</option>
            </select>
            <InfoPopover title="お辞儀の角度基準 (Bow Angles)">
              <ul className="space-y-1 text-[11px]">
                <li>
                  <strong>最敬礼 (45°):</strong> 深い感謝・謝罪（適正 40°〜50°）
                </li>
                <li>
                  <strong>敬礼 (30°):</strong> 入退室時の標準挨拶（適正 25°〜35°）
                </li>
                <li>
                  <strong>会釈 (15°):</strong> 軽い挨拶・すれ違い（適正 11°〜20°）
                </li>
              </ul>
            </InfoPopover>
          </div>

          {/* Live Studio Button */}
          <button
            type="button"
            onClick={() => onSelectView('practice')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-all ${
              activeView === 'practice'
                ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>実践 (Studio)</span>
          </button>

          {/* Load Sample Data Button */}
          <button
            type="button"
            data-testid="load-sample-btn"
            onClick={onLoadSampleData}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-all ${
              activeView === 'diagnostic'
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>サンプル結果を表示 (Sample)</span>
          </button>
        </div>
      </div>
    </header>
  );
}
