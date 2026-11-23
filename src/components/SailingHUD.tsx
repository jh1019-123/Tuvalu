import React from 'react';
import { Anchor, Compass, Navigation } from 'lucide-react';
import { OUTER_ISLANDS } from '../data/tuvaluData';
import { IslandId } from '../types/game';

interface SailingHUDProps {
  targetIsland: IslandId;
  distanceRemaining: number;
  etaSeconds: number;
  autoSail: boolean;
  onSelectTarget: (id: IslandId) => void;
  onToggleAutoSail: () => void;
  onReturnDock: () => void;
}

export const SailingHUD: React.FC<SailingHUDProps> = ({
  targetIsland,
  distanceRemaining,
  etaSeconds,
  autoSail,
  onSelectTarget,
  onToggleAutoSail,
  onReturnDock,
}) => {
  const targetLabel =
    targetIsland === 'funafuti'
      ? '푸나푸티 본섬 선착장'
      : OUTER_ISLANDS.find((i) => i.id === targetIsland)?.nameKo ?? '외곽 섬';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-3">
      {/* Navigation Info Card */}
      <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-cyan-300/40 bg-[#072633]/94 p-3.5 sm:p-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-cyan-300" />
            <div>
              <div className="text-[11px] font-bold text-cyan-200">목적지 항로</div>
              <div className="text-sm font-extrabold text-white">{targetLabel}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[11px] text-slate-300">남은 거리 · 예상 항해</div>
              <div className="tabular-nums text-sm font-black text-amber-300">
                {Math.max(0, Math.round(distanceRemaining))}m · 약 {Math.max(0, Math.ceil(etaSeconds))}초
              </div>
            </div>
          </div>
        </div>

        {/* Island Destination Selector */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectTarget('funafuti')}
            className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
              targetIsland === 'funafuti'
                ? 'bg-cyan-400 text-slate-950'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            푸나푸티 본섬
          </button>
          {OUTER_ISLANDS.map((isl) => (
            <button
              key={isl.id}
              type="button"
              onClick={() => onSelectTarget(isl.id)}
              className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                targetIsland === isl.id
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {isl.nameKo}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
          <span className="text-[11px] text-slate-300">
            WASD/조이스틱 조종 또는 자동 항해 · 섬 남쪽 선착장에 정박해야 상륙할 수 있습니다
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleAutoSail}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold cursor-pointer ${
                autoSail
                  ? 'bg-emerald-400 text-slate-950'
                  : 'border border-cyan-300/40 bg-slate-800 text-cyan-100'
              }`}
            >
              <Navigation className="h-3.5 w-3.5" />
              {autoSail ? '자동 항해 ON' : '자동 항해 켜기'}
            </button>

            <button
              type="button"
              onClick={onReturnDock}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <Anchor className="h-3.5 w-3.5" /> 본섬 선착장으로
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
