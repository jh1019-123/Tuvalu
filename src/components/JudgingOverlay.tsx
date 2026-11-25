import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Clock, Loader2, RotateCcw, Trophy } from 'lucide-react';
import { FISH_CATALOG, INGREDIENT_CATALOG } from '../data/tuvaluData';
import { BattlePlan, BattlePlayerSlot, BattleVerdict, RealtimePlayerStage } from '../types/game';
import { DishIllustrationSVG } from './DishIllustrationSVG';

interface JudgingOverlayProps {
  phase: 'waiting_opponent' | 'judging' | 'result';
  plan: BattlePlan;
  verdict: BattleVerdict | null;
  realtimePlayers?: {
    self: BattlePlayerSlot;
    opponent: BattlePlayerSlot;
    roomCode: string;
  };
  isSignedIn: boolean;
  rankPublished: boolean;
  publishingRank: boolean;
  onForceTimeoutFinish?: () => void;
  onPublishRank: () => void;
  onSignInAndPublish: () => void;
  onFinish: () => void;
}

const OPP_STAGE_TEXT: Record<RealtimePlayerStage, string> = {
  idle: '준비 중',
  intro: '재료 냄비 투입 중',
  wash: '1단계: 재료 세척 중',
  prep: '2단계: 물고기 손질 중',
  cook: '3단계: 화덕 부채질 중',
  done: '요리 완성!',
};

export const JudgingOverlay: React.FC<JudgingOverlayProps> = ({
  phase,
  plan,
  verdict,
  realtimePlayers,
  isSignedIn,
  rankPublished,
  publishingRank,
  onForceTimeoutFinish,
  onPublishRank,
  onSignInAndPublish,
  onFinish,
}) => {
  const [waitedSec, setWaitedSec] = useState(0);

  useEffect(() => {
    if (phase !== 'waiting_opponent') {
      setWaitedSec(0);
      return;
    }
    const iv = window.setInterval(() => {
      setWaitedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [phase]);

  if (phase === 'waiting_opponent' && realtimePlayers) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-30 flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-xl rounded-3xl border border-amber-300/45 bg-[#072633]/95 p-6 text-center shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-extrabold text-emerald-200">
            <CheckCircle2 className="h-4 w-4" /> 내 요리 조리 완료! ({realtimePlayers.self.totalScore}점)
          </div>
          <h3 className="mt-2 font-display text-xl font-extrabold text-white">
            {realtimePlayers.opponent.displayName}님의 요리가 완성되기를 기다리는 중...
          </h3>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-cyan-200">
            <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
            <span>상대 현재 진행: {OPP_STAGE_TEXT[realtimePlayers.opponent.stage]}</span>
            <span className="text-slate-400 tabular-nums">({waitedSec}초 대기)</span>
          </div>
          {waitedSec >= 26 && onForceTimeoutFinish ? (
            <button
              type="button"
              onClick={onForceTimeoutFinish}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-300 cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5" /> 상대 응답 지연 — 현재 점수로 판정 마감하기
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (phase === 'judging') {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-30 flex justify-center px-4">
        <div className="pointer-events-auto rounded-3xl border border-amber-300/45 bg-[#072633]/94 px-8 py-5 text-center shadow-2xl">
          <div className="text-xs font-extrabold uppercase tracking-widest text-amber-300">
            투발루 현지인 심사 진행 중
          </div>
          <h3 className="mt-1 font-display text-2xl font-extrabold text-white">
            {plan.judge.nameKo}님이 두 셰프의 요리를 시식하고 있습니다...
          </h3>
          <p className="mt-1.5 text-xs text-cyan-200">
            "{plan.judge.tuvaluIntroKo}"
          </p>
        </div>
      </div>
    );
  }

  if (!verdict) return null;

  const isRealtime = Boolean(realtimePlayers);
  const opponentSlot = realtimePlayers?.opponent;
  const selfSlot = realtimePlayers?.self;

  const rivalFish = isRealtime && opponentSlot
    ? FISH_CATALOG.find((f) => f.id === opponentSlot.fishSpeciesId) ?? FISH_CATALOG[0]
    : FISH_CATALOG.find((f) => f.id === plan.rival.specialtyFishId) ?? FISH_CATALOG[5];

  const playerIngredients = plan.ingredientIds
    .map((id) => INGREDIENT_CATALOG.find((i) => i.id === id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const opponentIngredientIds = isRealtime && opponentSlot
    ? opponentSlot.ingredientIds
    : plan.rival.specialtyIngredientIds;

  const rivalIngredients = opponentIngredientIds
    .map((id) => INGREDIENT_CATALOG.find((i) => i.id === id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const opponentDisplayName = isRealtime && opponentSlot ? opponentSlot.displayName : plan.rival.nameKo;
  const opponentDishTitle = isRealtime && opponentSlot
    ? opponentSlot.dishNameKo || `${rivalFish.nameKo} 투발루 특선 요리`
    : plan.rival.specialtyDishKo;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4">
      <div className="tuvalu-scroll max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-amber-300/50 bg-[#082936] p-5 sm:p-6 shadow-2xl">
        {/* Banner */}
        <div className="flex flex-col items-center text-center">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
              verdict.won
                ? 'bg-amber-400/20 text-amber-300'
                : 'bg-slate-700/70 text-slate-300'
            }`}
          >
            {verdict.won ? <Trophy className="h-7 w-7" /> : <Award className="h-7 w-7" />}
          </div>
          <span className="mt-1.5 text-xs font-extrabold uppercase tracking-widest text-teal-300">
            {isRealtime
              ? `실시간 1:1 배틀 결과 (${realtimePlayers?.roomCode}) · ${plan.judge.nameKo} 심사`
              : `${plan.judge.nameKo}의 심사 결과 · 완성 요리 공개`}
          </span>
          <h2 className="mt-0.5 font-display text-2xl sm:text-3xl font-extrabold text-white">
            {verdict.won ? '요리 대결 승리!' : verdict.isDraw ? '무승부 명승부!' : '아쉬운 패배!'}
          </h2>
        </div>

        {/* Dish Showcase Comparison Grid */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Player Dish Card */}
          <div
            className={`flex flex-col justify-between rounded-2xl border p-4 ${
              verdict.won
                ? 'border-amber-300/60 bg-amber-400/10'
                : 'border-white/15 bg-[#0c3747]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg bg-cyan-400/20 px-2.5 py-0.5 text-xs font-extrabold text-cyan-200">
                  {isRealtime && selfSlot ? `${selfSlot.displayName} (나)` : '나의 완성 요리'}
                </span>
                <span className="text-xs font-bold text-amber-200">{plan.fishSpecies.nameKo}</span>
              </div>
              {isRealtime && selfSlot ? (
                <div className="mt-1 text-[11px] text-teal-200">
                  {selfSlot.chefTitle} · {selfSlot.wins}승 {selfSlot.losses}패
                </div>
              ) : null}
              <h3 className="mt-1.5 text-base font-extrabold text-white">{verdict.dishNameKo}</h3>

              <div className="mt-2 flex justify-center rounded-2xl border border-white/10 bg-slate-900/55 py-2">
                <DishIllustrationSVG
                  fishSpecies={plan.fishSpecies}
                  ingredientIds={plan.ingredientIds}
                  perfection={verdict.playerPerfection}
                  size="lg"
                />
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {playerIngredients.length > 0 ? (
                  playerIngredients.map((ing) => (
                    <span
                      key={ing.id}
                      className="rounded-md border border-white/15 bg-slate-900/70 px-2 py-0.5 text-[11px] font-bold text-teal-200"
                    >
                      + {ing.nameKo}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400">추가 식재료 없이 순수 생선 구이로 조리됨</span>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-1 border-t border-white/15 pt-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-300">현지인 입맛 적합도</span>
                <span className="font-bold tabular-nums text-white">{verdict.playerPalateMatch}점</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">음식 완성도</span>
                <span className="font-bold tabular-nums text-white">{verdict.playerPerfection}점</span>
              </div>
              <div className="flex justify-between border-t border-white/15 pt-1 text-base font-black text-amber-300">
                <span>최종 점수</span>
                <span className="tabular-nums">{verdict.playerTotal}점</span>
              </div>
            </div>
          </div>

          {/* Opponent / Rival Dish Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-rose-400/35 bg-[#1a2234] p-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg bg-rose-500/20 px-2.5 py-0.5 text-xs font-extrabold text-rose-200">
                  {isRealtime ? `${opponentDisplayName} (상대)` : `${opponentDisplayName}의 완성 요리`}
                </span>
                <span className="text-xs font-bold text-rose-200">{rivalFish.nameKo}</span>
              </div>
              {isRealtime && opponentSlot ? (
                <div className="mt-1 text-[11px] text-rose-200/80">
                  {opponentSlot.chefTitle} · {opponentSlot.wins}승 {opponentSlot.losses}패
                </div>
              ) : null}
              <h3 className="mt-1.5 text-base font-extrabold text-white">{opponentDishTitle}</h3>

              <div className="mt-2 flex justify-center rounded-2xl border border-white/10 bg-slate-900/55 py-2">
                <DishIllustrationSVG
                  fishSpecies={rivalFish}
                  ingredientIds={opponentIngredientIds}
                  perfection={verdict.rivalPerfection}
                  size="lg"
                />
              </div>

              {!isRealtime ? (
                <p className="mt-2.5 rounded-xl bg-slate-900/65 p-2.5 text-xs leading-relaxed text-rose-100/90">
                  {plan.rival.specialtyDescriptionKo}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {rivalIngredients.length > 0 ? (
                  rivalIngredients.map((ing) => (
                    <span
                      key={ing.id}
                      className="rounded-md border border-rose-300/20 bg-slate-900/70 px-2 py-0.5 text-[11px] font-bold text-rose-200"
                    >
                      + {ing.nameKo}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400">추가 식재료 없이 순수 생선 요리로 출전</span>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-1 border-t border-white/15 pt-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-300">현지인 입맛 적합도</span>
                <span className="font-bold tabular-nums text-white">{verdict.rivalPalateMatch}점</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">음식 완성도</span>
                <span className="font-bold tabular-nums text-white">{verdict.rivalPerfection}점</span>
              </div>
              <div className="flex justify-between border-t border-white/15 pt-1 text-base font-black text-rose-300">
                <span>최종 점수</span>
                <span className="tabular-nums">{verdict.rivalTotal}점</span>
              </div>
            </div>
          </div>
        </div>

        {/* Judge Comment & Reward */}
        <div className="mt-4 rounded-2xl bg-slate-900/75 p-4 text-sm leading-relaxed text-slate-200">
          "{verdict.judgeCommentKo}"
          <div className="mt-1.5 text-xs font-bold text-amber-300 tabular-nums">
            상금 획득: +{verdict.rewardCoins} T$
          </div>
        </div>

        {/* Rank Upload & Continue Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {isSignedIn ? (
            rankPublished ? (
              <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 px-3.5 py-2 text-xs font-bold text-emerald-200">
                <CheckCircle2 className="h-4 w-4" /> 승리 수가 개인정보 및 랭킹에 반영되었습니다!
              </div>
            ) : (
              <button
                type="button"
                disabled={publishingRank}
                onClick={onPublishRank}
                className="min-h-[44px] rounded-xl bg-teal-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-teal-300 cursor-pointer"
              >
                {publishingRank ? '랭킹 등록 중...' : '승리 수 투발루 랭킹에 올리기'}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onSignInAndPublish}
              className="min-h-[44px] rounded-xl border border-amber-300/50 bg-amber-400/15 px-4 py-2.5 text-xs font-extrabold text-amber-200 hover:bg-amber-400/25 cursor-pointer"
            >
              Google 로그인 후 승리 수 저장 &amp; 랭킹 올리기
            </button>
          )}

          <button
            type="button"
            onClick={onFinish}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-amber-300 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> 조리실로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};
