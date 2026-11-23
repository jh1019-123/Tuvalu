import React, { useEffect, useRef, useState } from 'react';
import { Flame, Sparkles, Utensils } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { INGREDIENT_CATALOG } from '../data/tuvaluData';
import { BattlePlan, CookingStage, CookingStageScores } from '../types/game';

interface CookingMinigameHUDProps {
  stage: CookingStage;
  plan: BattlePlan;
  onStageBurst: (station: 'wash' | 'prep' | 'cook', colorHex: number) => void;
  onHeatChange: (heat: number) => void;
  onStageComplete: (stage: 'wash' | 'prep' | 'cook', score: number) => void;
  scores: CookingStageScores;
}

interface DirtSpot {
  id: number;
  x: number;
  y: number;
  clean: number; // 0..100
}

export const CookingMinigameHUD: React.FC<CookingMinigameHUDProps> = ({
  stage,
  plan,
  onStageBurst,
  onHeatChange,
  onStageComplete,
  scores,
}) => {
  // === STAGE 1: WASHING STATE ===
  const [spots, setSpots] = useState<DirtSpot[]>([]);
  const [washTimeLeft, setWashTimeLeft] = useState(14);
  const scrubbingRef = useRef(false);
  const lastScrubSfxRef = useRef(0);

  useEffect(() => {
    if (stage !== 'wash') return;
    setSpots([
      { id: 1, x: 22, y: 36, clean: 0 },
      { id: 2, x: 46, y: 28, clean: 0 },
      { id: 3, x: 70, y: 40, clean: 0 },
      { id: 4, x: 32, y: 65, clean: 0 },
      { id: 5, x: 56, y: 68, clean: 0 },
      { id: 6, x: 78, y: 62, clean: 0 },
    ]);
    setWashTimeLeft(14);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'wash') return;
    const timer = window.setInterval(() => {
      setWashTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [stage]);

  const washCleanAvg = spots.length
    ? Math.round(spots.reduce((acc, s) => acc + s.clean, 0) / spots.length)
    : 0;

  useEffect(() => {
    if (stage !== 'wash') return;
    if (washCleanAvg >= 100 || washTimeLeft === 0) {
      const bonus = washCleanAvg >= 100 ? Math.min(10, Math.round(washTimeLeft * 0.8)) : 0;
      const finalScore = Math.min(100, Math.max(25, washCleanAvg + bonus));
      const t = window.setTimeout(() => onStageComplete('wash', finalScore), 450);
      return () => clearTimeout(t);
    }
  }, [stage, washCleanAvg, washTimeLeft, onStageComplete]);

  const scrubAt = (clientX: number, clientY: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * 100;
    const py = ((clientY - rect.top) / rect.height) * 100;
    let touched = false;
    setSpots((prev) =>
      prev.map((s) => {
        const dist = Math.hypot(s.x - px, s.y - py);
        if (dist < 18 && s.clean < 100) {
          touched = true;
          return { ...s, clean: Math.min(100, s.clean + 22) };
        }
        return s;
      }),
    );
    if (touched) {
      const now = performance.now();
      if (now - lastScrubSfxRef.current > 120) {
        lastScrubSfxRef.current = now;
        soundEngine.playScrub();
        onStageBurst('wash', 0x38bdf8);
      }
    }
  };

  // === STAGE 2: FISH FILLETING (KNIFE PREP) ===
  const [cutIndex, setCutIndex] = useState(0);
  const [bladePos, setBladePos] = useState(10);
  const [cutFeedback, setCutFeedback] = useState<string>('');
  const cutScoresRef = useRef<number[]>([]);
  const bladeDirRef = useRef(1);
  const bladeValRef = useRef(10);
  const targetCenters = [50, 38, 64, 48, 55];

  useEffect(() => {
    if (stage !== 'prep') return;
    setCutIndex(0);
    cutScoresRef.current = [];
    setCutFeedback('');
    bladeValRef.current = 12;
    bladeDirRef.current = 1;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const speed = 95 + cutScoresRef.current.length * 16;
      bladeValRef.current += bladeDirRef.current * speed * dt;
      if (bladeValRef.current >= 94) {
        bladeValRef.current = 94;
        bladeDirRef.current = -1;
      } else if (bladeValRef.current <= 6) {
        bladeValRef.current = 6;
        bladeDirRef.current = 1;
      }
      setBladePos(bladeValRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  const performKnifeSlice = () => {
    if (stage !== 'prep' || cutIndex >= 5) return;
    const target = targetCenters[cutIndex] ?? 50;
    const dist = Math.abs(bladeValRef.current - target);
    let pts = 45;
    let label = '아슬아슬! (+45)';
    let color = 0xfbbf24;
    if (dist <= 7.5) {
      pts = 100;
      label = '완벽한 칼질! (+100)';
      color = 0x34d399;
      soundEngine.playChop(true);
    } else if (dist <= 16) {
      pts = 80;
      label = '깔끔한 손질! (+80)';
      color = 0x38bdf8;
      soundEngine.playChop(false);
    } else {
      soundEngine.playChop(false);
    }

    onStageBurst('prep', color);
    setCutFeedback(label);
    cutScoresRef.current.push(pts);
    const nextIdx = cutIndex + 1;
    setCutIndex(nextIdx);

    if (nextIdx >= 5) {
      const avg = Math.round(
        cutScoresRef.current.reduce((a, b) => a + b, 0) / cutScoresRef.current.length,
      );
      window.setTimeout(() => onStageComplete('prep', avg), 500);
    }
  };

  useEffect(() => {
    if (stage !== 'prep') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        performKnifeSlice();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // === STAGE 3: POT COOKING (DROP INGREDIENTS + HEAT CONTROL + DEVOTION STIR) ===
  const potQueue = useRef<{ id: string; label: string }[]>([]);
  const [droppedCount, setDroppedCount] = useState(0);
  const [cookPhase, setCookPhase] = useState<'drop' | 'simmer'>('drop');
  const [heat, setHeat] = useState(55);
  const [devotionScore, setDevotionScore] = useState(0);
  const [stirPromptActive, setStirPromptActive] = useState(false);
  const [simmerTimeLeft, setSimmerTimeLeft] = useState(12);

  const fanHeldRef = useRef(false);
  const heatRef = useRef(55);
  const devotionRef = useRef(0);
  const sweetTicksRef = useRef(0);
  const totalTicksRef = useRef(0);

  useEffect(() => {
    if (stage !== 'cook') return;
    const ings = plan.ingredientIds
      .map((id) => INGREDIENT_CATALOG.find((i) => i.id === id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((i) => ({ id: i.id, label: i.nameKo }));
    potQueue.current = [{ id: 'fish', label: plan.fishSpecies.nameKo }, ...ings];
    setDroppedCount(0);
    setCookPhase('drop');
    heatRef.current = 55;
    devotionRef.current = 0;
    sweetTicksRef.current = 0;
    totalTicksRef.current = 0;
    setHeat(55);
    setDevotionScore(0);
    setStirPromptActive(false);
    setSimmerTimeLeft(12);
  }, [stage, plan]);

  const handleDropNext = () => {
    if (stage !== 'cook' || cookPhase !== 'drop') return;
    soundEngine.playDropIngredient();
    onStageBurst('cook', 0xfbbf24);
    const next = droppedCount + 1;
    setDroppedCount(next);
    if (next >= potQueue.current.length) {
      window.setTimeout(() => setCookPhase('simmer'), 280);
    }
  };

  useEffect(() => {
    if (stage !== 'cook' || cookPhase !== 'simmer') return;
    let raf = 0;
    let last = performance.now();
    let timerAcc = 0;
    let stirAcc = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Heat drifts down unless fanning
      const deltaHeat = fanHeldRef.current ? 46 * dt : -22 * dt;
      heatRef.current = Math.max(5, Math.min(98, heatRef.current + deltaHeat));
      setHeat(heatRef.current);
      onHeatChange(heatRef.current / 100);

      totalTicksRef.current += dt;
      if (heatRef.current >= 42 && heatRef.current <= 78) {
        sweetTicksRef.current += dt;
      }

      stirAcc += dt;
      if (stirAcc > 2.8) {
        stirAcc = 0;
        setStirPromptActive(true);
      }

      timerAcc += dt;
      if (timerAcc >= 1) {
        timerAcc -= 1;
        setSimmerTimeLeft((prev) => {
          if (prev <= 1) {
            const heatRatio = sweetTicksRef.current / Math.max(1, totalTicksRef.current);
            const heatPts = Math.round(heatRatio * 70);
            const finalCookScore = Math.min(100, Math.max(30, heatPts + devotionRef.current));
            window.setTimeout(() => onStageComplete('cook', finalCookScore), 350);
            return 0;
          }
          return prev - 1;
        });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage, cookPhase, onHeatChange, onStageComplete]);

  const handleStirDevotion = () => {
    if (!stirPromptActive) return;
    setStirPromptActive(false);
    devotionRef.current = Math.min(35, devotionRef.current + 12);
    setDevotionScore(devotionRef.current);
    soundEngine.playStir();
    onStageBurst('cook', 0xfef08a);
  };

  useEffect(() => {
    if (stage !== 'cook') return;
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (cookPhase === 'drop') handleDropNext();
        else {
          if (!fanHeldRef.current) soundEngine.playFireFan();
          fanHeldRef.current = true;
        }
      } else if (e.code === 'KeyE' && cookPhase === 'simmer') {
        e.preventDefault();
        handleStirDevotion();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') fanHeldRef.current = false;
    };
    const onBlur = () => {
      fanHeldRef.current = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  });

  if (stage !== 'wash' && stage !== 'prep' && stage !== 'cook') return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl rounded-3xl border border-amber-300/45 bg-[#072633]/94 p-5 shadow-2xl">
        {/* Progress Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <span className={stage === 'wash' ? 'text-amber-300' : 'text-teal-300'}>
              ① 세척 {scores.wash > 0 ? `(${scores.wash})` : ''}
            </span>
            <span className="text-slate-500">→</span>
            <span className={stage === 'prep' ? 'text-amber-300' : 'text-teal-300'}>
              ② 손질 {scores.prep > 0 ? `(${scores.prep})` : ''}
            </span>
            <span className="text-slate-500">→</span>
            <span className={stage === 'cook' ? 'text-amber-300' : 'text-teal-300'}>
              ③ 냄비 조리
            </span>
          </div>
          <span className="rounded-lg bg-slate-900/90 px-2.5 py-1 text-xs font-bold text-cyan-200">
            {plan.fishSpecies.nameKo}
          </span>
        </div>

        {/* === STAGE 1: WASH === */}
        {stage === 'wash' ? (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white">
                1단계: 재료 세척 — 모래와 물기를 문질러 닦아주세요!
              </h3>
              <span className="tabular-nums text-sm font-black text-amber-300">
                {washTimeLeft}초 · {washCleanAvg}%
              </span>
            </div>

            <div
              className="relative mt-3 h-40 w-full touch-none overflow-hidden rounded-2xl border border-cyan-300/40 bg-gradient-to-br from-cyan-900/70 to-teal-950/90 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                scrubbingRef.current = true;
                scrubAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
              }}
              onPointerMove={(e) => {
                if (!scrubbingRef.current && e.pointerType === 'mouse' && e.buttons === 0) return;
                scrubAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
              }}
              onPointerUp={() => {
                scrubbingRef.current = false;
              }}
            >
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold text-cyan-200/55">
                마우스나 손가락으로 얼룩 위를 쓱쓱 문지르세요!
              </div>
              {spots.map((s) => (
                <div
                  key={s.id}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150"
                  style={{
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    width: '44px',
                    height: '44px',
                    opacity: Math.max(0.12, 1 - s.clean / 100),
                    transform: `translate(-50%, -50%) scale(${1 - s.clean / 160})`,
                    backgroundColor: s.clean >= 100 ? '#34d399' : '#92400e',
                    border: s.clean >= 100 ? '2px solid #a7f3d0' : '2px dashed #fbbf24',
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* === STAGE 2: PREP === */}
        {stage === 'prep' ? (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white">
                2단계: 물고기 손질 — 정확한 타이밍에 칼질하세요!
              </h3>
              <span className="tabular-nums text-sm font-black text-amber-300">
                손질 {Math.min(cutIndex, 5)} / 5
              </span>
            </div>

            <div className="relative mt-4 h-10 w-full overflow-hidden rounded-xl border border-white/20 bg-slate-900">
              {/* Target Cut Zone */}
              <div
                className="absolute top-0 bottom-0 bg-emerald-500/35 border-x border-emerald-300"
                style={{ left: `${(targetCenters[cutIndex] ?? 50) - 10}%`, width: '20%' }}
              />
              <div
                className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-amber-300"
                style={{ left: `${targetCenters[cutIndex] ?? 50}%` }}
              />
              {/* Moving Knife Marker */}
              <div
                className="absolute top-1 bottom-1 w-3 -translate-x-1/2 rounded-full bg-white shadow-lg"
                style={{ left: `${bladePos}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-teal-200">
                {cutFeedback || '초록 구간 중앙에 맞춰 칼질하세요!'}
              </span>
              <button
                type="button"
                onClick={performKnifeSlice}
                className="flex min-h-[46px] items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-amber-300 active:scale-[0.98] cursor-pointer"
              >
                <Utensils className="h-4 w-4" /> 썰기! (Space)
              </button>
            </div>
          </div>
        ) : null}

        {/* === STAGE 3: COOK === */}
        {stage === 'cook' ? (
          <div className="mt-4">
            {cookPhase === 'drop' ? (
              <div>
                <h3 className="font-display text-lg font-extrabold text-white">
                  3단계 (준비): 냄비에 재료 넣기 ({droppedCount}/{potQueue.current.length})
                </h3>
                <p className="mt-1 text-xs text-cyan-200">
                  다음 재료: <strong className="text-amber-300">{potQueue.current[droppedCount]?.label ?? '완료'}</strong>
                </p>
                <button
                  type="button"
                  onClick={handleDropNext}
                  className="mt-3 min-h-[48px] w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 py-3 text-sm font-extrabold text-slate-950 hover:from-amber-300 hover:to-orange-300 active:scale-[0.98] cursor-pointer"
                >
                  냄비에 재료 투하! (터치 또는 Space)
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-extrabold text-white">
                    3단계 (조리): 불 조절 &amp; 정성 담기!
                  </h3>
                  <span className="tabular-nums text-sm font-black text-amber-300">
                    {simmerTimeLeft}초 · 정성 +{devotionScore}
                  </span>
                </div>

                {/* Fire Heat Bar */}
                <div className="relative mt-3 h-7 w-full overflow-hidden rounded-xl border border-white/15 bg-slate-900">
                  <div
                    className="absolute top-0 bottom-0 bg-emerald-500/35 border-x border-emerald-300"
                    style={{ left: '42%', width: '36%' }}
                  />
                  <div
                    className="h-full transition-colors"
                    style={{
                      width: `${heat}%`,
                      backgroundColor:
                        heat >= 42 && heat <= 78 ? '#fbbf24' : heat > 78 ? '#ef4444' : '#38bdf8',
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-300">
                  <span>약불</span>
                  <span className="text-emerald-300">최적 화력 (42%~78%)</span>
                  <span>강불</span>
                </div>

                <div className="mt-3 flex gap-2.5">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      fanHeldRef.current = true;
                      soundEngine.playFireFan();
                    }}
                    onPointerUp={() => {
                      fanHeldRef.current = false;
                    }}
                    onPointerCancel={() => {
                      fanHeldRef.current = false;
                    }}
                    onPointerLeave={() => {
                      fanHeldRef.current = false;
                    }}
                    className="flex min-h-[48px] flex-1 touch-none items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-extrabold text-slate-950 active:bg-orange-400 cursor-pointer"
                  >
                    <Flame className="h-4 w-4" /> 불 키우기 (꾹 누르기)
                  </button>

                  <button
                    type="button"
                    disabled={!stirPromptActive}
                    onClick={handleStirDevotion}
                    className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${
                      stirPromptActive
                        ? 'bg-amber-300 text-slate-950 hover:bg-amber-200 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                    {stirPromptActive ? '정성 담기! (E)' : '보글보글...'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
