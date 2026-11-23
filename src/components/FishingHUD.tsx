import React, { useEffect, useRef, useState } from 'react';
import { FISHING_DIFFICULTY_BY_TIER, FISH_TIERS } from '../data/tuvaluData';
import { FishSpecies, FishTier, FishingPhase } from '../types/game';

interface FishingHUDProps {
  phase: FishingPhase;
  hookedTier: FishTier;
  lastCaught: { species: FishSpecies; weightKg: number; coins: number } | null;
  onCast: () => void;
  onHookBite: () => void;
  onReelComplete: (success: boolean) => void;
  onCloseCatch: () => void;
}

export const FishingHUD: React.FC<FishingHUDProps> = ({
  phase,
  hookedTier,
  lastCaught,
  onCast,
  onHookBite,
  onReelComplete,
  onCloseCatch,
}) => {
  const diff = FISHING_DIFFICULTY_BY_TIER[hookedTier];
  const tierMeta = FISH_TIERS[hookedTier];

  // Reeling tension mini-bar state (0..100)
  // Green box = player-controlled catch zone; Thin marker = fish swimming
  const [progress, setProgress] = useState(diff.startProgress);
  const [boxCenter, setBoxCenter] = useState(50);
  const [fishPos, setFishPos] = useState(52);
  const [isSurging, setIsSurging] = useState(false);

  const holdingRef = useRef(false);
  const stateRef = useRef({
    progress: 40,
    boxCenter: 50,
    boxVel: 0,
    fishPos: 52,
    fishVel: 16,
    flipCooldown: 0.45,
    surgeCooldown: 2.5,
    surgeActiveLeft: 0,
  });

  // 2-second lock when a fish is caught so the player can read the fish description
  const [catchLockRemainingMs, setCatchLockRemainingMs] = useState(2000);
  const catchUnlocked = catchLockRemainingMs <= 0;

  useEffect(() => {
    if (phase !== 'caught') {
      setCatchLockRemainingMs(2000);
      return;
    }
    const start = performance.now();
    setCatchLockRemainingMs(2000);
    const interval = window.setInterval(() => {
      const left = Math.max(0, 2000 - (performance.now() - start));
      setCatchLockRemainingMs(left);
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [phase, lastCaught]);

  useEffect(() => {
    if (phase !== 'reeling') {
      holdingRef.current = false;
      setIsSurging(false);
      return;
    }

    const initSpeed = diff.zoneSpeedMin + Math.random() * (diff.zoneSpeedMax - diff.zoneSpeedMin);
    const startFish = 50 + (Math.random() > 0.5 ? 10 : -10);
    stateRef.current = {
      progress: diff.startProgress,
      boxCenter: 50,
      boxVel: 0,
      fishPos: startFish,
      fishVel: (Math.random() > 0.5 ? 1 : -1) * initSpeed,
      flipCooldown: 0.5,
      surgeCooldown: diff.surgeIntervalSec > 0 ? diff.surgeIntervalSec * 0.8 : 999,
      surgeActiveLeft: 0,
    };
    setProgress(diff.startProgress);
    setBoxCenter(50);
    setFishPos(startFish);
    setIsSurging(false);

    const minBoxCenter = diff.zoneHalfWidth;
    const maxBoxCenter = 100 - diff.zoneHalfWidth;

    let rafId = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const st = stateRef.current;

      // Move green box (player controls: hold Space/Pointer to move right, release to fall left)
      const accel = holdingRef.current ? diff.riseAccel : -diff.fallAccel;
      st.boxVel += accel * dt;
      st.boxVel *= Math.max(0, 1 - diff.drag * dt);
      st.boxVel = Math.max(-diff.maxVel, Math.min(diff.maxVel, st.boxVel));
      st.boxCenter += st.boxVel * dt;
      if (st.boxCenter > maxBoxCenter) {
        st.boxCenter = maxBoxCenter;
        if (st.boxVel > 0) st.boxVel = 0;
      } else if (st.boxCenter < minBoxCenter) {
        st.boxCenter = minBoxCenter;
        if (st.boxVel < 0) st.boxVel = 0;
      }

      // Handle fish surges for Epic / Legendary / Mythic tiers
      if (diff.surgeIntervalSec > 0) {
        if (st.surgeActiveLeft > 0) {
          st.surgeActiveLeft -= dt;
          if (st.surgeActiveLeft <= 0) {
            setIsSurging(false);
          }
        } else {
          st.surgeCooldown -= dt;
          if (st.surgeCooldown <= 0) {
            st.surgeActiveLeft = 0.45;
            st.surgeCooldown = diff.surgeIntervalSec * (0.9 + Math.random() * 0.35);
            const boostSpeed = diff.zoneSpeedMax * diff.surgeSpeedMult;
            const dir = st.fishPos > 50 ? -1 : 1;
            st.fishVel = dir * boostSpeed;
            setIsSurging(true);
          }
        }
      }

      // Organic fish direction changes scaled by tier
      st.flipCooldown -= dt;
      if (st.flipCooldown <= 0 && st.surgeActiveLeft <= 0) {
        if (Math.random() < diff.directionFlipChance * dt * 2.2) {
          const nextSpeed = diff.zoneSpeedMin + Math.random() * (diff.zoneSpeedMax - diff.zoneSpeedMin);
          st.fishVel = (st.fishVel >= 0 ? -1 : 1) * nextSpeed;
          st.flipCooldown = 0.42;
        }
      }

      // Move thin fish marker
      st.fishPos += st.fishVel * dt;
      if (st.fishPos > 95) {
        st.fishPos = 95;
        const speed = diff.zoneSpeedMin + Math.random() * (diff.zoneSpeedMax - diff.zoneSpeedMin);
        st.fishVel = -speed * (st.surgeActiveLeft > 0 ? diff.surgeSpeedMult : 1);
      } else if (st.fishPos < 5) {
        st.fishPos = 5;
        const speed = diff.zoneSpeedMin + Math.random() * (diff.zoneSpeedMax - diff.zoneSpeedMin);
        st.fishVel = speed * (st.surgeActiveLeft > 0 ? diff.surgeSpeedMult : 1);
      }

      const inZone = Math.abs(st.fishPos - st.boxCenter) <= diff.zoneHalfWidth;
      st.progress += (inZone ? diff.gainPerSec : -diff.drainPerSec) * dt;

      setBoxCenter(st.boxCenter);
      setFishPos(st.fishPos);
      setProgress(Math.max(0, Math.min(100, st.progress)));

      if (st.progress >= 100) {
        onReelComplete(true);
        return;
      }
      if (st.progress <= 0) {
        onReelComplete(false);
        return;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [phase, diff, onReelComplete]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (phase === 'reeling') {
          e.preventDefault();
          holdingRef.current = true;
        } else if (phase === 'biting') {
          e.preventDefault();
          onHookBite();
        }
      } else if (e.code === 'KeyE') {
        if (phase === 'biting') {
          e.preventDefault();
          onHookBite();
        } else if (phase === 'caught' && catchUnlocked) {
          e.preventDefault();
          onCloseCatch();
        }
      } else if (e.code === 'Escape' && phase === 'caught' && catchUnlocked) {
        e.preventDefault();
        onCloseCatch();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        holdingRef.current = false;
      }
    };
    const blur = () => {
      holdingRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [phase, catchUnlocked, onHookBite, onCloseCatch]);

  if (phase === 'idle') return null;

  const lockSecondsText = Math.ceil(catchLockRemainingMs / 1000);
  const lockBarPct = Math.max(0, Math.min(100, ((2000 - catchLockRemainingMs) / 2000) * 100));
  const starText = '★'.repeat(diff.stars) + '☆'.repeat(5 - diff.stars);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 sm:bottom-24 z-30 flex justify-center px-3 sm:px-4">
      {phase === 'casting' || phase === 'waiting' ? (
        <div className="pointer-events-auto rounded-2xl border border-cyan-300/35 bg-[#072633]/92 px-5 py-3.5 text-center shadow-xl">
          <p className="text-sm font-bold text-cyan-100">
            찌를 던졌습니다! 물고기가 입질할 때까지 기다리세요...
          </p>
          <p className="mt-1 text-xs text-cyan-300/80">
            일반 30% · 드문 30% · 에픽 25% · 전설 10% · 신화 5%
          </p>
        </div>
      ) : null}

      {phase === 'biting' ? (
        <button
          type="button"
          onClick={onHookBite}
          className="pointer-events-auto min-h-[56px] rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-500 to-orange-500 px-7 py-4 text-base sm:text-lg font-black text-slate-950 shadow-2xl hover:from-amber-400 hover:to-orange-400 active:scale-[0.98] cursor-pointer"
        >
          {diff.biteHintKo} ({tierMeta.labelKo}) 지금 터치 또는 [Space / E]로 챔질!
        </button>
      ) : null}

      {phase === 'reeling' ? (
        <div
          className="pointer-events-auto w-full max-w-md touch-none rounded-2xl border border-teal-300/40 bg-[#072633]/95 p-4 shadow-2xl"
          onPointerDown={(e) => {
            e.preventDefault();
            holdingRef.current = true;
          }}
          onPointerUp={() => {
            holdingRef.current = false;
          }}
          onPointerCancel={() => {
            holdingRef.current = false;
          }}
          onPointerLeave={() => {
            holdingRef.current = false;
          }}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-bold text-cyan-100">
            <span>릴 당기기! (꾹 누르면 초록 박스 우측 이동)</span>
            <div className="flex items-center gap-1.5">
              {isSurging ? (
                <span className="rounded bg-rose-500/85 px-1.5 py-0.5 text-[10px] font-black text-white">
                  몸부림!
                </span>
              ) : null}
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-extrabold ${tierMeta.bgClass} ${tierMeta.borderClass} ${tierMeta.textClass}`}
              >
                {tierMeta.labelKo} {starText}
              </span>
              <span className="tabular-nums text-amber-300">{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Sweet spot track: green box (player) + thin marker (fish) */}
          <div className="relative mt-3 h-8 w-full overflow-hidden rounded-xl bg-slate-900/90 border border-white/15">
            <div
              className="absolute top-0 bottom-0 rounded-lg bg-emerald-400/40 border border-emerald-300/80"
              style={{
                left: `${boxCenter - diff.zoneHalfWidth}%`,
                width: `${diff.zoneHalfWidth * 2}%`,
              }}
            />
            <div
              className="absolute top-0.5 bottom-0.5 w-2.5 -translate-x-1/2 rounded-full bg-amber-300 shadow"
              style={{ left: `${fishPos}%` }}
            />
          </div>

          {/* Catch progress */}
          <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-amber-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              holdingRef.current = true;
            }}
            onPointerUp={() => {
              holdingRef.current = false;
            }}
            onPointerCancel={() => {
              holdingRef.current = false;
            }}
            className="mt-3 min-h-[48px] w-full touch-none rounded-xl bg-teal-500 py-3 text-sm font-extrabold text-slate-950 active:bg-teal-400 cursor-pointer"
          >
            [Space] 또는 여기를 꾹 눌러 초록 박스 이동
          </button>
        </div>
      ) : null}

      {phase === 'caught' && lastCaught ? (
        <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-amber-300/50 bg-[#072633]/96 p-4 sm:p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span
                className={`inline-block rounded-lg border px-2.5 py-0.5 text-xs font-extrabold ${FISH_TIERS[lastCaught.species.tier].bgClass} ${FISH_TIERS[lastCaught.species.tier].borderClass} ${FISH_TIERS[lastCaught.species.tier].textClass}`}
              >
                {FISH_TIERS[lastCaught.species.tier].labelKo} 등급 ({Math.round(FISH_TIERS[lastCaught.species.tier].probability * 100)}%)
              </span>
              <h3 className="mt-1.5 font-display text-xl sm:text-2xl font-extrabold text-white">
                {lastCaught.species.nameKo}
              </h3>
              <p className="text-xs font-medium text-teal-300">
                투발루어: {lastCaught.species.nameTuvalu} · {lastCaught.weightKg.toFixed(1)}kg
              </p>
            </div>
            <div className="rounded-xl bg-amber-400/15 border border-amber-400/40 px-3 py-2 text-right">
              <div className="text-[11px] font-bold text-amber-200">획득 머니</div>
              <div className="tabular-nums text-lg font-black text-amber-300">+{lastCaught.coins} T$</div>
            </div>
          </div>

          <p className="mt-3 rounded-xl bg-slate-900/65 p-3 text-xs sm:text-sm leading-relaxed text-slate-100">
            {lastCaught.species.tuvaluFact}
          </p>

          {!catchUnlocked ? (
            <div className="mt-3">
              <div className="flex justify-between text-[11px] font-bold text-amber-200">
                <span>물고기 설명 확인 중... (화면 전환 보호)</span>
                <span className="tabular-nums">{lockSecondsText}초</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${lockBarPct}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={!catchUnlocked}
              onClick={() => {
                if (!catchUnlocked) return;
                onCloseCatch();
                onCast();
              }}
              className={`min-h-[44px] flex-1 rounded-xl py-2.5 text-sm font-extrabold transition-colors ${
                catchUnlocked
                  ? 'bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              {catchUnlocked ? '한 번 더 낚시하기' : `잠시 대기 (${lockSecondsText}초)`}
            </button>
            <button
              type="button"
              disabled={!catchUnlocked}
              onClick={() => {
                if (!catchUnlocked) return;
                onCloseCatch();
              }}
              className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${
                catchUnlocked
                  ? 'border-white/20 bg-slate-800/90 text-slate-100 hover:bg-slate-700 cursor-pointer'
                  : 'border-white/10 bg-slate-800/50 text-slate-500 cursor-not-allowed'
              }`}
            >
              닫기 (E)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
