import React, { useMemo, useState } from 'react';
import { Flame, ShoppingBag, Swords, X } from 'lucide-react';
import {
  CATEGORY_LABELS,
  FISH_CATALOG,
  FISH_TIERS,
  FLAVOR_LABELS,
  INGREDIENT_CATALOG,
} from '../data/tuvaluData';
import {
  BattlePlan,
  CaughtFish,
  RivalChef,
  TuvaluJudge,
} from '../types/game';

interface BattlePrepModalProps {
  fishInventory: CaughtFish[];
  pantry: Record<string, number>;
  judge: TuvaluJudge;
  rival: RivalChef;
  onStartBattle: (plan: BattlePlan) => void;
  onOpenMarket: () => void;
  onGoFishing: () => void;
  onClose: () => void;
}

export const BattlePrepModal: React.FC<BattlePrepModalProps> = ({
  fishInventory,
  pantry,
  judge,
  rival,
  onStartBattle,
  onOpenMarket,
  onGoFishing,
  onClose,
}) => {
  const [selectedFishUid, setSelectedFishUid] = useState<string>(fishInventory[0]?.uid ?? '');
  const [selectedIngIds, setSelectedIngIds] = useState<string[]>(() => {
    const owned = INGREDIENT_CATALOG.filter((i) => (pantry[i.id] ?? 0) > 0).map((i) => i.id);
    return owned.slice(0, 3);
  });

  const selectedFish = fishInventory.find((f) => f.uid === selectedFishUid) ?? fishInventory[0];
  const selectedSpecies = selectedFish
    ? FISH_CATALOG.find((s) => s.id === selectedFish.speciesId)
    : undefined;

  const ownedIngredients = useMemo(
    () => INGREDIENT_CATALOG.filter((item) => (pantry[item.id] ?? 0) > 0),
    [pantry],
  );

  const toggleIngredient = (id: string) => {
    setSelectedIngIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  // Live preview of palate synergy
  const palatePreviewScore = useMemo(() => {
    if (!selectedSpecies) return 0;
    let score = 35;
    selectedSpecies.flavorTags.forEach((tag) => {
      if (judge.preferredFlavors.includes(tag)) score += 12;
    });
    selectedIngIds.forEach((id) => {
      const ing = INGREDIENT_CATALOG.find((i) => i.id === id);
      if (!ing) return;
      score += Math.round(ing.palateBonus * 0.65);
      ing.flavorTags.forEach((t) => {
        if (judge.preferredFlavors.includes(t)) score += 9;
      });
    });
    return Math.min(100, score);
  }, [selectedSpecies, selectedIngIds, judge]);

  const handleLaunch = () => {
    if (!selectedFish || !selectedSpecies) return;
    onStartBattle({
      fish: selectedFish,
      fishSpecies: selectedSpecies,
      ingredientIds: selectedIngIds,
      judge,
      rival,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-3xl border border-amber-300/40 bg-[#082936] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-white">
                투발루 요리 대결 준비
              </h2>
              <p className="text-xs text-cyan-200/80">
                심사위원의 입맛에 맞는 물고기 1마리와 식재료(최대 3개)를 조합하세요.
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

        <div className="tuvalu-scroll grid grid-cols-1 gap-5 overflow-y-auto p-6 lg:grid-cols-12">
          {/* Left Column: Judge & Rival Card */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-amber-300/35 bg-[#0d394a] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                오늘의 투발루 현지인 심사위원
              </div>
              <h3 className="mt-1 font-display text-lg font-extrabold text-white">
                {judge.nameKo} <span className="text-xs font-medium text-cyan-200">({judge.roleKo})</span>
              </h3>
              <p className="mt-2 rounded-xl bg-slate-900/60 p-3 text-xs leading-relaxed text-amber-100">
                "{judge.palatePromptKo}"
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-300">선호 입맛:</span>
                {judge.preferredFlavors.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md px-2 py-0.5 text-[11px] font-extrabold text-slate-950"
                    style={{ backgroundColor: FLAVOR_LABELS[tag].color }}
                  >
                    {FLAVOR_LABELS[tag].ko}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-xs text-teal-200">
                추천 생선 등급: <strong>{FISH_TIERS[judge.preferredTierMin].labelKo}</strong> 이상
              </div>
            </div>

            <div className="rounded-2xl border border-rose-400/30 bg-[#1a2234] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                대결 상대
              </div>
              <div className="mt-1 flex items-center justify-between">
                <h4 className="font-bold text-white">{rival.nameKo}</h4>
                <span className="rounded-lg bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-200">
                  {rival.titleKo}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-300">
                주특기 요리: <strong className="text-rose-200">{rival.specialtyDishKo}</strong>
              </p>
            </div>

            {selectedSpecies ? (
              <div className="rounded-2xl border border-teal-400/35 bg-[#093242] p-4">
                <div className="flex items-center justify-between text-xs font-bold text-cyan-100">
                  <span>예상 입맛 궁합</span>
                  <span className="tabular-nums text-base font-black text-amber-300">
                    {palatePreviewScore}점 / 100
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full bg-gradient-to-r from-teal-400 to-amber-300"
                    style={{ width: `${palatePreviewScore}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Right Column: Pick Fish & Ingredients */}
          <div className="space-y-5 lg:col-span-7">
            {/* Step A: Pick Caught Fish */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white">1. 주재료 물고기 선택 ({fishInventory.length}마리 보유)</h3>
                {fishInventory.length === 0 ? (
                  <button
                    type="button"
                    onClick={onGoFishing}
                    className="rounded-lg bg-cyan-400 px-3 py-1 text-xs font-extrabold text-slate-950 cursor-pointer"
                  >
                    낚시터로 가기
                  </button>
                ) : null}
              </div>

              {fishInventory.length === 0 ? (
                <div className="mt-2 rounded-2xl border border-dashed border-cyan-400/40 bg-slate-900/50 p-5 text-center text-sm text-slate-300">
                  보유한 물고기가 없습니다! 먼저 외부 낚시터에서 물고기를 낚아오세요.
                </div>
              ) : (
                <div className="mt-2 grid max-h-44 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 tuvalu-scroll">
                  {fishInventory.map((f) => {
                    const sp = FISH_CATALOG.find((c) => c.id === f.speciesId);
                    if (!sp) return null;
                    const tier = FISH_TIERS[sp.tier];
                    const active = selectedFish?.uid === f.uid;
                    return (
                      <button
                        key={f.uid}
                        type="button"
                        onClick={() => setSelectedFishUid(f.uid)}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-amber-300 bg-amber-400/15'
                            : 'border-white/10 bg-[#0c3747] hover:border-teal-300/40'
                        }`}
                      >
                        <div>
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-extrabold ${tier.bgClass} ${tier.textClass}`}
                          >
                            {tier.labelKo}
                          </span>
                          <div className="mt-0.5 text-sm font-bold text-white">{sp.nameKo}</div>
                          <div className="text-[11px] text-slate-300">
                            {f.weightKg.toFixed(1)}kg · 완성도 +{tier.dishQualityBonus}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {sp.flavorTags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-950"
                              style={{ backgroundColor: FLAVOR_LABELS[tag].color }}
                            >
                              {FLAVOR_LABELS[tag].ko}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step B: Pick Non-Fish Ingredients */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white">
                  2. 추가 식재료 선택 ({selectedIngIds.length}/3 선택됨)
                </h3>
                <button
                  type="button"
                  onClick={onOpenMarket}
                  className="flex items-center gap-1 rounded-lg bg-amber-400/20 border border-amber-400/40 px-2.5 py-1 text-xs font-bold text-amber-200 hover:bg-amber-400/30 cursor-pointer"
                >
                  <ShoppingBag className="h-3.5 w-3.5" /> 상점에서 더 사기
                </button>
              </div>

              {ownedIngredients.length === 0 ? (
                <div className="mt-2 rounded-2xl border border-dashed border-amber-400/35 bg-slate-900/50 p-4 text-center text-xs text-slate-300">
                  구입한 식재료가 없습니다. 상점에서 고기·채소·소금·향신료를 사면 입맛 점수가 크게 오릅니다!
                </div>
              ) : (
                <div className="mt-2 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 tuvalu-scroll">
                  {ownedIngredients.map((item) => {
                    const count = pantry[item.id] ?? 0;
                    const selected = selectedIngIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleIngredient(item.id)}
                        className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                          selected
                            ? 'border-teal-300 bg-teal-400/20'
                            : item.isRare
                              ? 'border-amber-300/45 bg-amber-500/10 hover:border-amber-300'
                              : 'border-white/10 bg-[#0c3747] hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-teal-200">
                          <span className="flex items-center gap-1">
                            {CATEGORY_LABELS[item.category]}
                            {item.isRare ? (
                              <span className="rounded bg-amber-400 px-1 py-0.2 text-[9px] font-black text-slate-950">
                                희귀
                              </span>
                            ) : null}
                          </span>
                          <span className="tabular-nums">x{count}</span>
                        </div>
                        <div className="mt-0.5 text-xs font-extrabold text-white">{item.nameKo}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.flavorTags.map((t) => (
                            <span
                              key={t}
                              className="rounded px-1 py-0.5 text-[9px] font-bold text-slate-950"
                              style={{ backgroundColor: FLAVOR_LABELS[t].color }}
                            >
                              {FLAVOR_LABELS[t].ko}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <div className="text-xs text-slate-300">
            총 3단계 미니게임: ① 재료 세척 → ② 물고기 손질 → ③ 냄비 조리(불 조절·정성)
          </div>
          <button
            type="button"
            disabled={!selectedFish}
            onClick={handleLaunch}
            className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold transition-colors ${
              selectedFish
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400 cursor-pointer'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Flame className="h-4 w-4" />
            요리 대결 시작하기!
          </button>
        </div>
      </div>
    </div>
  );
};
