import React from 'react';
import { Bot, Radio, Swords, Users, X } from 'lucide-react';

interface BattleModeModalProps {
  fishCount: number;
  onSelectAI: () => void;
  onSelectRealtime: () => void;
  onClose: () => void;
}

export const BattleModeModal: React.FC<BattleModeModalProps> = ({
  fishCount,
  onSelectAI,
  onSelectRealtime,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-amber-300/45 bg-[#082936] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
              <Swords className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-white">
                투발루 요리 대결 모드 선택
              </h2>
              <p className="text-xs text-cyan-200/80">
                보유한 물고기 {fishCount}마리 · 원하는 대결 방식을 선택하세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* AI Battle Card */}
          <button
            type="button"
            onClick={onSelectAI}
            className="group flex flex-col justify-between rounded-2xl border border-teal-300/35 bg-[#0c3747] p-5 text-left transition-all hover:border-teal-300 hover:bg-[#11465a] cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-400/20 text-teal-300">
                  <Bot className="h-6 w-6" />
                </div>
                <span className="rounded-lg bg-teal-400/20 px-2.5 py-1 text-[11px] font-extrabold text-teal-200">
                  싱글 플레이
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-white group-hover:text-teal-200">
                AI 라이벌과 대결
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                투발루의 숙련된 라이벌 셰프(카이 · 레일라 · 마나)와 대기 시간 없이 바로 요리 대결을 펼칩니다.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-xs font-extrabold text-teal-300">
              <span>즉시 대결 준비</span>
              <span>→</span>
            </div>
          </button>

          {/* Real-Time PvP Card */}
          <button
            type="button"
            onClick={onSelectRealtime}
            className="group flex flex-col justify-between rounded-2xl border border-amber-300/45 bg-gradient-to-br from-[#192841] to-[#0e3447] p-5 text-left transition-all hover:border-amber-300 hover:from-[#213352] hover:to-[#134259] cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
                  <Users className="h-6 w-6" />
                </div>
                <span className="flex items-center gap-1 rounded-lg bg-rose-500/25 px-2.5 py-1 text-[11px] font-extrabold text-rose-200">
                  <Radio className="h-3 w-3" /> 실시간 1:1
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-extrabold text-white group-hover:text-amber-200">
                실시간 1:1 배틀
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                방 만들기(코드 공유), 방 코드 참가, 또는 랜덤 실시간 매칭으로 다른 셰프와 동시에 요리 대결을 겨룹니다!
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-xs font-extrabold text-amber-300">
              <span>방 만들기 / 참가 / 랜덤 매치</span>
              <span>→</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
