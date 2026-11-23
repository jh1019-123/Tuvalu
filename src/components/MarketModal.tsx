import React, { useState } from 'react';
import { X, ShoppingBag } from 'lucide-react';
import { CATEGORY_LABELS, FLAVOR_LABELS, INGREDIENT_CATALOG } from '../data/tuvaluData';
import { IngredientCategory, IngredientItem } from '../types/game';

interface MarketModalProps {
  coins: number;
  pantry: Record<string, number>;
  onBuy: (item: IngredientItem) => void;
  onClose: () => void;
}

const CATEGORIES: ('all' | IngredientCategory)[] = ['all', 'meat', 'vegetable', 'salt', 'spice'];

export const MarketModal: React.FC<MarketModalProps> = ({ coins, pantry, onBuy, onClose }) => {
  const [filter, setFilter] = useState<'all' | IngredientCategory>('all');

  const shopItems = INGREDIENT_CATALOG.filter((i) => !i.isRare);
  const rareItems = INGREDIENT_CATALOG.filter((i) => i.isRare);

  const items =
    filter === 'all'
      ? shopItems
      : shopItems.filter((i) => i.category === filter);

  const islandNames: Record<string, string> = {
    nanumea: '나누메아 섬',
    nukufetau: '누쿠페타우 섬',
    niutao: '니우타오 섬',
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-3xl border border-teal-300/35 bg-[#082936] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-white">
                투발루 식재료 상점 (물고기 제외 식재료)
              </h2>
              <p className="text-xs text-cyan-200/80">
                낚시로 모은 돈으로 고기, 채소, 소금, 향신료를 구입해 요리 대결에 사용하세요.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/15 px-3.5 py-1.5 text-sm font-extrabold tabular-nums text-amber-300">
              보유: {coins} T$
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
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 px-6 py-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                filter === cat
                  ? 'bg-teal-400 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat === 'all' ? '전체' : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Item Grid */}
        <div className="tuvalu-scroll overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => {
              const owned = pantry[item.id] ?? 0;
              const canAfford = coins >= item.price;
              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0c3747] p-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
                          {CATEGORY_LABELS[item.category]} · {item.nameTuvalu}
                        </span>
                        <h3 className="text-base font-extrabold text-white">{item.nameKo}</h3>
                      </div>
                      <span className="rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs font-bold tabular-nums text-cyan-200">
                        보유 {owned}개
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">{item.description}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {item.flavorTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md px-2 py-0.5 text-[11px] font-bold text-slate-950"
                          style={{ backgroundColor: FLAVOR_LABELS[tag].color }}
                        >
                          {FLAVOR_LABELS[tag].ko}
                        </span>
                      ))}
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                        입맛 보너스 +{item.palateBonus}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canAfford}
                    onClick={() => onBuy(item)}
                    className={`mt-4 min-h-[42px] w-full rounded-xl py-2 text-sm font-extrabold tabular-nums transition-colors ${
                      canAfford
                        ? 'bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer'
                        : 'bg-slate-700/70 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {canAfford ? `구매하기 (${item.price} T$)` : `머니 부족 (${item.price} T$)`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Rare Outer-Island Foraging Showcase (Not purchasable in shop) */}
          <div className="rounded-2xl border border-amber-300/30 bg-[#0b2e3d] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-amber-300">
                  외곽 섬 희귀 채집 식재료 (상점 판매 불가 · 선착장 배 항해 전용)
                </h3>
                <p className="text-xs text-slate-300">
                  동쪽 선착장에서 배를 띄워 약 30초 항해하면 채집할 수 있으며, 각 재료마다 10분에 1회 채집 가능합니다.
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {rareItems.map((item) => {
                const owned = pantry[item.id] ?? 0;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-amber-300/20 bg-slate-900/55 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold text-amber-300">
                          {item.islandId ? islandNames[item.islandId] : '외곽 섬'} · {CATEGORY_LABELS[item.category]}
                        </span>
                        <div className="text-xs font-extrabold text-white">{item.nameKo}</div>
                      </div>
                      <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-200">
                        보유 {owned}개
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
