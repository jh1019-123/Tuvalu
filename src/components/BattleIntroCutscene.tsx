import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Beef, Check, Flame, Gem, Leaf, SkipForward, Sparkles, Swords } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { FISH_TIERS, FLAVOR_LABELS, INGREDIENT_CATALOG } from '../data/tuvaluData';
import { BattlePlan, BattlePlayerSlot, IngredientCategory } from '../types/game';

interface BattleIntroCutsceneProps {
  plan: BattlePlan;
  realtimePlayers?: {
    self: BattlePlayerSlot;
    opponent: BattlePlayerSlot;
    roomCode: string;
  };
  onTriggerItemDrop: (index: number) => void;
  onComplete: () => void;
}

interface IntroEntry {
  key: string;
  label: string;
  subLabel: string;
  colorHex: string;
  kind: 'fish' | IngredientCategory;
}

function renderKindIcon(kind: 'fish' | IngredientCategory, colorHex: string) {
  if (kind === 'fish') {
    return (
      <svg viewBox="0 0 36 24" className="h-6 w-8">
        <path d="M26 12L34 5V19L26 12Z" fill={colorHex} opacity="0.85" />
        <ellipse cx="16" cy="12" rx="12" ry="7.5" fill={colorHex} />
        <circle cx="9.5" cy="10.5" r="1.6" fill="#0f172a" />
      </svg>
    );
  }
  if (kind === 'meat') return <Beef className="h-6 w-6" style={{ color: colorHex }} />;
  if (kind === 'vegetable') return <Leaf className="h-6 w-6" style={{ color: colorHex }} />;
  if (kind === 'salt') return <Gem className="h-6 w-6" style={{ color: colorHex }} />;
  return <Flame className="h-6 w-6" style={{ color: colorHex }} />;
}

export const BattleIntroCutscene: React.FC<BattleIntroCutsceneProps> = ({
  plan,
  realtimePlayers,
  onTriggerItemDrop,
  onComplete,
}) => {
  const onDropRef = useRef(onTriggerItemDrop);
  onDropRef.current = onTriggerItemDrop;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);

  const items: IntroEntry[] = useMemo(() => {
    const tierMeta = FISH_TIERS[plan.fishSpecies.tier];
    const list: IntroEntry[] = [
      {
        key: 'fish',
        label: plan.fishSpecies.nameKo,
        subLabel: `${tierMeta.labelKo} · ${plan.fish.weightKg.toFixed(1)}kg`,
        colorHex: tierMeta.colorHex,
        kind: 'fish',
      },
    ];
    plan.ingredientIds.forEach((id) => {
      const ing = INGREDIENT_CATALOG.find((i) => i.id === id);
      if (ing) {
        list.push({
          key: ing.id,
          label: ing.nameKo,
          subLabel: ing.nameTuvalu,
          colorHex: ing.colorHex,
          kind: ing.category,
        });
      }
    });
    return list;
  }, [plan]);

  const [droppedCount, setDroppedCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    completedRef.current = false;
    setDroppedCount(0);
    setActiveIndex(null);

    const timers: number[] = [];
    items.forEach((_, idx) => {
      const stepTime = 600 + idx * 650;
      const t = window.setTimeout(() => {
        setActiveIndex(idx);
        onDropRef.current(idx);
        soundEngine.playDropIngredient();
        setDroppedCount(idx + 1);
      }, stepTime);
      timers.push(t);
    });

    const endTime = 600 + items.length * 650 + 850;
    const endTimer = window.setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
      }
    }, endTime);
    timers.push(endTimer);

    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSkip = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-4">
      {/* Top VS & Judge Banner (leaves center 3D pot & flying icons unobstructed) */}
      {realtimePlayers ? (
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300/45 bg-[#072633]/94 px-4 py-3 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 text-[11px]">
            <span className="font-extrabold text-amber-300">
              실시간 1:1 요리 대결 개시 · 방 {realtimePlayers.roomCode}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-cyan-200">{plan.judge.nameKo} 선호:</span>
              {plan.judge.preferredFlavors.map((f) => (
                <span
                  key={f}
                  className="rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-bold text-teal-200 border border-white/10"
                >
                  {FLAVOR_LABELS[f].ko}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-11 items-center gap-2">
            {/* Self Profile */}
            <div className="col-span-5 rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-3 py-2">
              <div className="flex items-center justify-between gap-1">
                <span className="rounded bg-cyan-400/25 px-1.5 py-0.5 text-[10px] font-extrabold text-cyan-200">
                  나
                </span>
                <span className="text-[10px] font-bold text-amber-300 tabular-nums">
                  {realtimePlayers.self.wins}승 {realtimePlayers.self.losses}패
                </span>
              </div>
              <div className="mt-1 truncate text-sm font-black text-white">
                {realtimePlayers.self.displayName}
              </div>
              <div className="flex items-center justify-between text-[10px] text-teal-200">
                <span className="truncate">{realtimePlayers.self.chefTitle}</span>
                <span className="tabular-nums font-bold">최고 {realtimePlayers.self.bestDishScore}점</span>
              </div>
            </div>

            <div className="col-span-1 text-center font-display text-base font-black text-amber-300">
              VS
            </div>

            {/* Opponent Profile */}
            <div className="col-span-5 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-right">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold text-amber-300 tabular-nums">
                  {realtimePlayers.opponent.wins}승 {realtimePlayers.opponent.losses}패
                </span>
                <span className="rounded bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-200">
                  상대
                </span>
              </div>
              <div className="mt-1 truncate text-sm font-black text-white">
                {realtimePlayers.opponent.displayName}
              </div>
              <div className="flex items-center justify-between text-[10px] text-rose-200">
                <span className="tabular-nums font-bold">최고 {realtimePlayers.opponent.bestDishScore}점</span>
                <span className="truncate">{realtimePlayers.opponent.chefTitle}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/45 bg-[#072633]/92 px-5 py-3 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-extrabold text-amber-300">투발루 요리 대결 개시!</div>
              <div className="text-sm font-black text-white">
                나 <span className="text-amber-300">VS</span> {plan.rival.nameKo}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-cyan-200">{plan.judge.nameKo} 선호:</span>
            {plan.judge.preferredFlavors.map((f) => (
              <span
                key={f}
                className="rounded-md bg-slate-900/90 px-2 py-0.5 text-[11px] font-bold text-teal-200 border border-white/10"
              >
                {FLAVOR_LABELS[f].ko}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Selected Ingredients Cutscene Showcase */}
      <div className="pointer-events-auto mx-auto w-full max-w-2xl rounded-3xl border border-teal-300/40 bg-[#072633]/94 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <h3 className="font-display text-base sm:text-lg font-extrabold text-white">
              선택한 주재료 &amp; 식재료 냄비 투입 컷씬
            </h3>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-extrabold text-cyan-200 hover:bg-slate-700 cursor-pointer"
          >
            <SkipForward className="h-3.5 w-3.5" /> 바로 요리 시작 (Space)
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {items.map((item, idx) => {
            const dropped = idx < droppedCount;
            const launching = activeIndex === idx;
            return (
              <div
                key={item.key}
                className={`relative flex flex-col items-center rounded-2xl border p-3 text-center transition-all duration-300 ${
                  launching
                    ? 'scale-105 -translate-y-2 border-amber-300 bg-amber-400/20 shadow-lg'
                    : dropped
                      ? 'border-emerald-400/50 bg-emerald-500/15 opacity-80'
                      : 'border-white/15 bg-slate-900/75'
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950/60">
                  {renderKindIcon(item.kind, item.colorHex)}
                </div>
                <div className="mt-1.5 line-clamp-1 text-xs font-extrabold text-white">
                  {item.label}
                </div>
                <div className="mt-0.5 text-[10px] font-medium text-cyan-200/80">
                  {item.subLabel}
                </div>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] font-black">
                  {dropped ? (
                    <span className="flex items-center gap-0.5 text-emerald-300">
                      <Check className="h-3 w-3" /> 냄비 투입!
                    </span>
                  ) : (
                    <span className="text-amber-300">대기 중</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${Math.round((droppedCount / Math.max(1, items.length)) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-cyan-100">
          {droppedCount >= items.length
            ? '모든 재료 준비 완료! 곧 1단계 재료 세척이 시작됩니다...'
            : '선택한 물고기와 식재료가 조리실 냄비로 들어가고 있습니다!'}
        </p>
      </div>
    </div>
  );
};
