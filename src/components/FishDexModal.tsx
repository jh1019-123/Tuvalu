import React, { useState } from 'react';
import { BookOpen, Lock, Scale, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import {
  CATEGORY_LABELS,
  FISH_CATALOG,
  FISH_TIERS,
  FLAVOR_LABELS,
  HIDDEN_RECIPES,
} from '../data/tuvaluData';
import { FishSpecies, FishTier } from '../types/game';

interface FishDexRecord {
  count: number;
  maxWeight: number;
}

interface FishDexModalProps {
  caughtSpeciesIds: string[];
  dexRecords: Record<string, FishDexRecord>;
  discoveredRecipeIds: string[];
  initialTab?: 'fish' | 'recipes';
  onClose: () => void;
}

function toHexColor(num: number): string {
  return `#${num.toString(16).padStart(6, '0')}`;
}

const FishIllustrationSVG: React.FC<{ species: FishSpecies; unlocked: boolean }> = ({
  species,
  unlocked,
}) => {
  const primary = unlocked ? toHexColor(species.primaryColor) : '#334155';
  const secondary = unlocked ? toHexColor(species.secondaryColor) : '#475569';
  const fin = unlocked ? toHexColor(species.finColor) : '#1e293b';

  return (
    <svg width="72" height="44" viewBox="0 0 72 44" fill="none" aria-hidden="true">
      {/* Tail */}
      <path d="M52 22L68 10V34L52 22Z" fill={fin} />
      {/* Dorsal Fin */}
      <path d="M24 14L34 4L42 14Z" fill={fin} />
      {/* Body */}
      <ellipse cx="32" cy="22" rx="22" ry="11" fill={primary} />
      {/* Belly */}
      <path d="M13 24C20 31 40 31 50 24C42 28 22 28 13 24Z" fill={secondary} />
      {/* Bill if marlin/sailfish */}
      {species.id.includes('sailfish') || species.id.includes('marlin') ? (
        <path d="M11 21L1 22L11 23.5Z" fill={unlocked ? '#fef08a' : '#475569'} />
      ) : null}
      {/* Eye */}
      <circle cx="19" cy="19" r="3" fill={unlocked ? '#ffffff' : '#64748b'} />
      <circle cx="18.5" cy="19" r="1.5" fill="#0f172a" />
    </svg>
  );
};

const TIER_FILTERS: ('all' | FishTier)[] = [
  'all',
  'common',
  'uncommon',
  'epic',
  'legendary',
  'mythic',
];

export const FishDexModal: React.FC<FishDexModalProps> = ({
  caughtSpeciesIds,
  dexRecords,
  discoveredRecipeIds,
  initialTab = 'fish',
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'fish' | 'recipes'>(initialTab);
  const [tierFilter, setTierFilter] = useState<'all' | FishTier>('all');

  const filtered =
    tierFilter === 'all'
      ? FISH_CATALOG
      : FISH_CATALOG.filter((f) => f.tier === tierFilter);

  const unlockedCount = caughtSpeciesIds.length;
  const totalCount = FISH_CATALOG.length;
  const pct = Math.round((unlockedCount / totalCount) * 100);

  const unlockedRecipesCount = HIDDEN_RECIPES.filter((r) =>
    discoveredRecipeIds.includes(r.id),
  ).length;
  const recipePct = Math.round((unlockedRecipesCount / HIDDEN_RECIPES.length) * 100);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-3xl border border-cyan-300/40 bg-[#082936] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/20 text-cyan-300">
              {activeTab === 'fish' ? (
                <BookOpen className="h-5 w-5" />
              ) : (
                <UtensilsCrossed className="h-5 w-5 text-amber-300" />
              )}
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-extrabold text-white">
                {activeTab === 'fish' ? '투발루 라군 물고기 도감' : '숨겨진 비밀 레시피 도감'}
              </h2>
              <p className="text-xs text-cyan-200/85 tabular-nums">
                {activeTab === 'fish'
                  ? `발견 어종 ${unlockedCount} / ${totalCount} (${pct}%)`
                  : `해금 레시피 ${unlockedRecipesCount} / ${HIDDEN_RECIPES.length} (${recipePct}%)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-900/90 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('fish')}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
                  activeTab === 'fish'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                물고기 ({unlockedCount}/{totalCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('recipes')}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
                  activeTab === 'recipes'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                비밀 레시피 ({unlockedRecipesCount}/{HIDDEN_RECIPES.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
              aria-label="도감 닫기"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {activeTab === 'fish' ? (
          <>
            {/* Discovery Progress + Tier Filter Tabs */}
            <div className="border-b border-white/10 px-5 py-3 sm:px-6">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-300 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {TIER_FILTERS.map((t) => {
                  const active = tierFilter === t;
                  if (t === 'all') {
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTierFilter('all')}
                        className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                          active ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        전체 ({totalCount})
                      </button>
                    );
                  }
                  const meta = FISH_TIERS[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTierFilter(t)}
                      className={`min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                        active
                          ? 'border-white bg-white text-slate-950'
                          : `${meta.bgClass} ${meta.borderClass} ${meta.textClass}`
                      }`}
                    >
                      {meta.labelKo} {Math.round(meta.probability * 100)}%
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fish Grid */}
            <div className="tuvalu-scroll grid grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
              {filtered.map((sp) => {
                const tier = FISH_TIERS[sp.tier];
                const unlocked = caughtSpeciesIds.includes(sp.id);
                const rec = dexRecords[sp.id];

                return (
                  <div
                    key={sp.id}
                    className={`flex flex-col justify-between rounded-2xl border p-4 ${
                      unlocked
                        ? 'border-white/15 bg-[#0c3747]'
                        : 'border-white/5 bg-slate-900/60 opacity-75'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/55">
                            <FishIllustrationSVG species={sp} unlocked={unlocked} />
                          </div>
                          <div>
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${tier.bgClass} ${tier.borderClass} ${tier.textClass}`}
                            >
                              {tier.labelKo} ({Math.round(tier.probability * 100)}%)
                            </span>
                            <h3 className="mt-1 text-base font-extrabold text-white">
                              {unlocked ? sp.nameKo : '미발견 물고기'}
                            </h3>
                            <p className="text-[11px] font-medium text-teal-300">
                              투발루어: {sp.nameTuvalu}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] font-bold text-amber-300 tabular-nums">
                            +{tier.coinReward} T$
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400 tabular-nums">
                            요리 +{tier.dishQualityBonus}
                          </div>
                        </div>
                      </div>

                      <p className="mt-3 rounded-xl bg-slate-950/45 p-2.5 text-xs leading-relaxed text-slate-200">
                        {unlocked
                          ? sp.tuvaluFact
                          : '푸나푸티 라군 부두에서 E 키 또는 낚시 버튼으로 낚시를 진행해 발견하세요.'}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap gap-1">
                        {sp.flavorTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-950"
                            style={{ backgroundColor: FLAVOR_LABELS[tag].color }}
                          >
                            {FLAVOR_LABELS[tag].ko}
                          </span>
                        ))}
                      </div>

                      {unlocked && rec ? (
                        <div className="flex items-center gap-2 text-[11px] font-bold text-cyan-200 tabular-nums">
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-amber-300" /> {rec.count}마리
                          </span>
                          <span className="flex items-center gap-1">
                            <Scale className="h-3 w-3 text-teal-300" /> 최고 {rec.maxWeight.toFixed(1)}kg
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">미포획</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Hidden Recipes Tab: Strictly hides name, story & bonus until discovered */
          <>
            <div className="border-b border-white/10 px-5 py-3 sm:px-6">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-all"
                  style={{ width: `${recipePct}%` }}
                />
              </div>
              <p className="mt-2.5 text-xs text-amber-200/90">
                비밀 레시피는 <strong>필요한 물고기 등급</strong>과 <strong>식재료 카테고리</strong>만 공개됩니다. 직접 조합해 요리 대결을 마치면 레시피 이름과 보너스 효과가 해금됩니다!
              </p>
            </div>

            <div className="tuvalu-scroll grid grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
              {HIDDEN_RECIPES.map((recipe) => {
                const tier = FISH_TIERS[recipe.requiredFishTier];
                const unlocked = discoveredRecipeIds.includes(recipe.id);

                return (
                  <div
                    key={recipe.id}
                    className={`flex flex-col justify-between rounded-2xl border p-4 ${
                      unlocked
                        ? 'border-amber-300/55 bg-gradient-to-br from-[#0f3b4a] to-[#1a2c3d]'
                        : 'border-white/10 bg-slate-900/75'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              unlocked
                                ? 'bg-amber-400/20 text-amber-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {unlocked ? <Sparkles className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                          </div>
                          <div>
                            <div className="text-[11px] font-bold text-cyan-200/80">
                              {unlocked ? '해금 완료된 비밀 레시피' : '미발견 비밀 레시피'}
                            </div>
                            <h3 className="text-base font-extrabold text-white">
                              {unlocked ? recipe.nameKo : '??? (비밀 레시피)'}
                            </h3>
                          </div>
                        </div>

                        {unlocked ? (
                          <span className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-extrabold text-emerald-200 tabular-nums">
                            완성+{recipe.bonusPerfection} · 입맛+{recipe.bonusPalate}
                          </span>
                        ) : (
                          <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                            효과 비공개 ???
                          </span>
                        )}
                      </div>

                      {/* Always Visible Clue: Required Fish Tier + Required Ingredient Categories */}
                      <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
                        <div className="text-[11px] font-extrabold text-amber-300">
                          조합 조건 힌트
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-extrabold ${tier.bgClass} ${tier.borderClass} ${tier.textClass}`}
                          >
                            {tier.labelKo} 등급 물고기
                          </span>
                          <span className="text-xs font-bold text-slate-400">+</span>
                          {recipe.requiredCategories.map((cat) => (
                            <span
                              key={cat}
                              className="rounded-md border border-teal-300/35 bg-teal-500/15 px-2 py-0.5 text-[11px] font-extrabold text-teal-200"
                            >
                              {CATEGORY_LABELS[cat]}
                            </span>
                          ))}
                        </div>
                      </div>

                      <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                        {unlocked
                          ? recipe.loreKo
                          : '??? (위 등급의 물고기와 해당 카테고리 식재료들을 함께 선택해 요리를 완성하세요)'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

