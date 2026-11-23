import React, { useEffect } from 'react';

interface TitleScreenProps {
  onStart: () => void;
  onOpenRank: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onOpenRank }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 md:p-10">
      {/* Top Left Bespoke Brand Lockup over open lagoon sky */}
      <div className="pointer-events-auto max-w-xl rounded-3xl border border-teal-300/30 bg-[#072633]/88 p-5 sm:p-6 md:p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          {/* Bespoke Tuvalu Lagoon & Fork-Hook SVG Emblem */}
          <svg width="48" height="48" viewBox="0 0 64 64" fill="none" aria-hidden="true" className="shrink-0 sm:h-[52px] sm:w-[52px]">
            <circle cx="32" cy="32" r="30" fill="#0D9488" stroke="#FDE047" strokeWidth="2.5" />
            <path
              d="M12 38C18 33 25 33 32 38C39 43 46 43 52 38"
              stroke="#A5F3FC"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M16 46C22 42 27 42 32 46C37 50 42 50 48 46"
              stroke="#67E8F9"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M21 26C25 20 35 20 41 26C35 32 25 32 21 26Z"
              fill="#FBBF24"
            />
            <path d="M41 26L48 21V31L41 26Z" fill="#F59E0B" />
            <circle cx="26" cy="25" r="1.8" fill="#0F172A" />
            <path
              d="M26 14L29 18L32 13L35 18L38 14"
              stroke="#FEF08A"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-[11px] sm:text-xs font-bold tracking-[0.2em] text-amber-300 uppercase">
              Funafuti Atoll · Tuvalu
            </p>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              투발루: 라구나 셰프
            </h1>
          </div>
        </div>

        <p className="mt-3 sm:mt-4 text-xs sm:text-sm md:text-base leading-relaxed text-cyan-50/90">
          남태평양 산호 환초 <strong className="text-amber-300">투발루</strong>의 푸나푸티 라군에서
          5등급(일반~신화) 물고기를 낚고, 섬 식재료를 모아 3단계 요리 대결로 현지인 심사위원의
          입맛을 사로잡으세요.
        </p>

        <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onStart}
            className="min-h-[48px] rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-6 sm:px-7 py-3 text-sm sm:text-base font-extrabold text-slate-950 shadow-lg hover:from-amber-300 hover:to-orange-300 active:scale-[0.98] transition-transform cursor-pointer"
          >
            라군으로 출발하기
          </button>
          <button
            type="button"
            onClick={onOpenRank}
            className="min-h-[48px] rounded-2xl border border-teal-300/40 bg-[#0b3a4a]/90 px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold text-cyan-100 hover:bg-[#114d62] transition-colors cursor-pointer"
          >
            명예 셰프 랭킹 보기
          </button>
        </div>
      </div>

      {/* Bottom single flat control-hint line */}
      <div className="pointer-events-auto self-center rounded-full border border-white/15 bg-[#06222d]/85 px-4 sm:px-5 py-2 text-center text-[11px] sm:text-xs font-medium text-cyan-100/90">
        WASD / 조이스틱 이동 · Space 점프 · E 낚시/채집 · 선착장 배 항해 · 조리실 대결
      </div>
    </div>
  );
};
