import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Flame, SkipForward, Sparkles, Utensils, Wind } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { FISH_TIERS, INGREDIENT_CATALOG } from '../data/tuvaluData';
import { BattlePlan, CookingStage, CookingStageScores } from '../types/game';

interface CookingMinigameHUDProps {
  stage: CookingStage;
  plan: BattlePlan;
  onStageBurst: (station: 'wash' | 'prep' | 'cook', colorHex: number) => void;
  onPotDrop: (colorHex: number, kind: 'fish' | 'meat' | 'vegetable' | 'salt' | 'spice') => void;
  onFanStroke: () => void;
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

interface CutsceneItem {
  id: string;
  label: string;
  colorHexStr: string;
  colorHexNum: number;
  kind: 'fish' | 'meat' | 'vegetable' | 'salt' | 'spice';
}

const FAN_DURATION_MS = 10000;
const FAN_TARGET_FOR_100 = 45;

export const CookingMinigameHUD: React.FC<CookingMinigameHUDProps> = ({
  stage,
  plan,
  onStageBurst,
  onPotDrop,
  onFanStroke,
  onHeatChange,
  onStageComplete,
  scores,
}) => {
  // Keep callback refs fresh so timer/rAF effects never tear down on parent re-render
  const onStageBurstRef = useRef(onStageBurst);
  onStageBurstRef.current = onStageBurst;
  const onPotDropRef = useRef(onPotDrop);
  onPotDropRef.current = onPotDrop;
  const onFanStrokeRef = useRef(onFanStroke);
  onFanStrokeRef.current = onFanStroke;
  const onHeatChangeRef = useRef(onHeatChange);
  onHeatChangeRef.current = onHeatChange;
  const onStageCompleteRef = useRef(onStageComplete);
  onStageCompleteRef.current = onStageComplete;

  // === STAGE 1: WASHING STATE ===
  const [spots, setSpots] = useState<DirtSpot[]>([]);
  const [washTimeLeft, setWashTimeLeft] = useState(14);
  const scrubbingRef = useRef(false);
  const lastScrubSfxRef = useRef(0);
  const washCompletedRef = useRef(false);
  const washFinishTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (stage !== 'wash') return;
    washCompletedRef.current = false;
    if (washFinishTimerRef.current) {
      clearTimeout(washFinishTimerRef.current);
      washFinishTimerRef.current = null;
    }
    setSpots([
      { id: 1, x: 22, y: 36, clean: 0 },
      { id: 2, x: 46, y: 28, clean: 0 },
      { id: 3, x: 70, y: 40, clean: 0 },
      { id: 4, x: 32, y: 65, clean: 0 },
      { id: 5, x: 56, y: 68, clean: 0 },
      { id: 6, x: 78, y: 62, clean: 0 },
    ]);
    setWashTimeLeft(14);
    return () => {
      if (washFinishTimerRef.current) {
        clearTimeout(washFinishTimerRef.current);
        washFinishTimerRef.current = null;
      }
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== 'wash') return;
    const timer = window.setInterval(() => {
      if (washCompletedRef.current) {
        clearInterval(timer);
        return;
      }
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
    if (stage !== 'wash' || washCompletedRef.current) return;
    if (washCleanAvg >= 100 || washTimeLeft === 0) {
      washCompletedRef.current = true;
      const bonus = washCleanAvg >= 100 ? Math.min(10, Math.round(washTimeLeft * 0.8)) : 0;
      const finalScore = Math.min(100, Math.max(25, washCleanAvg + bonus));
      washFinishTimerRef.current = window.setTimeout(() => {
        washFinishTimerRef.current = null;
        onStageCompleteRef.current('wash', finalScore);
      }, 380);
    }
  }, [stage, washCleanAvg, washTimeLeft]);

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
        onStageBurstRef.current('wash', 0x38bdf8);
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

    onStageBurstRef.current('prep', color);
    setCutFeedback(label);
    cutScoresRef.current.push(pts);
    const nextIdx = cutIndex + 1;
    setCutIndex(nextIdx);

    if (nextIdx >= 5) {
      const avg = Math.round(
        cutScoresRef.current.reduce((a, b) => a + b, 0) / cutScoresRef.current.length,
      );
      window.setTimeout(() => onStageCompleteRef.current('prep', avg), 500);
    }
  };

  useEffect(() => {
    if (stage !== 'prep') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        performKnifeSlice();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // === STAGE 3: INGREDIENT DROP CUTSCENE + 10-SECOND HEARTH FANNING ===
  const cutsceneItems: CutsceneItem[] = useMemo(() => {
    const fishCol = FISH_TIERS[plan.fishSpecies.tier].colorHex;
    const items: CutsceneItem[] = [
      {
        id: 'fish',
        label: plan.fishSpecies.nameKo,
        colorHexStr: fishCol,
        colorHexNum: parseInt(fishCol.replace('#', ''), 16),
        kind: 'fish',
      },
    ];
    plan.ingredientIds.forEach((id) => {
      const ing = INGREDIENT_CATALOG.find((i) => i.id === id);
      if (ing) {
        items.push({
          id: ing.id,
          label: ing.nameKo,
          colorHexStr: ing.colorHex,
          colorHexNum: parseInt(ing.colorHex.replace('#', ''), 16),
          kind: ing.category,
        });
      }
    });
    return items;
  }, [plan]);

  const [cookPhase, setCookPhase] = useState<'cutscene' | 'fan'>('cutscene');
  const [droppedCount, setDroppedCount] = useState(0);
  const [fanCount, setFanCount] = useState(0);
  const [fanTimeLeftMs, setFanTimeLeftMs] = useState(FAN_DURATION_MS);
  const [fanFinished, setFanFinished] = useState(false);
  const [fanPulse, setFanPulse] = useState(false);

  const fanCountRef = useRef(0);
  const fanCompletedRef = useRef(false);

  // Initialize Stage 3 Cutscene
  useEffect(() => {
    if (stage !== 'cook') return;
    setCookPhase('cutscene');
    setDroppedCount(0);
    setFanCount(0);
    setFanTimeLeftMs(FAN_DURATION_MS);
    setFanFinished(false);
    setFanPulse(false);
    fanCountRef.current = 0;
    fanCompletedRef.current = false;
    onHeatChangeRef.current(0.25);
  }, [stage, plan]);

  // Automatic sequential ingredient drop cutscene
  useEffect(() => {
    if (stage !== 'cook' || cookPhase !== 'cutscene') return;

    const timers: number[] = [];
    cutsceneItems.forEach((item, idx) => {
      const t = window.setTimeout(() => {
        soundEngine.playDropIngredient();
        onPotDropRef.current(item.colorHexNum, item.kind);
        setDroppedCount(idx + 1);
      }, 380 + idx * 650);
      timers.push(t);
    });

    const endDelay = 380 + cutsceneItems.length * 650 + 620;
    const finishTimer = window.setTimeout(() => {
      setCookPhase('fan');
    }, endDelay);
    timers.push(finishTimer);

    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, [stage, cookPhase, cutsceneItems]);

  // 10-second countdown timer during Hearth Fanning
  useEffect(() => {
    if (stage !== 'cook' || cookPhase !== 'fan') return;

    const endTime = performance.now() + FAN_DURATION_MS;
    setFanTimeLeftMs(FAN_DURATION_MS);
    fanCompletedRef.current = false;

    const iv = window.setInterval(() => {
      const left = Math.max(0, endTime - performance.now());
      setFanTimeLeftMs(left);
      if (left <= 0 && !fanCompletedRef.current) {
        fanCompletedRef.current = true;
        clearInterval(iv);
        setFanFinished(true);
        const finalScore = Math.min(
          100,
          Math.max(25, Math.round(25 + (fanCountRef.current / FAN_TARGET_FOR_100) * 75)),
        );
        window.setTimeout(() => {
          onStageCompleteRef.current('cook', finalScore);
        }, 550);
      }
    }, 40);

    return () => clearInterval(iv);
  }, [stage, cookPhase]);

  const triggerFanAction = () => {
    if (stage !== 'cook' || cookPhase !== 'fan' || fanCompletedRef.current) return;
    const next = fanCountRef.current + 1;
    fanCountRef.current = next;
    setFanCount(next);
    setFanPulse(true);
    window.setTimeout(() => setFanPulse(false), 95);

    soundEngine.playFireFan();
    onFanStrokeRef.current();
    onHeatChangeRef.current(Math.min(1, 0.25 + (next / FAN_TARGET_FOR_100) * 0.75));
  };

  useEffect(() => {
    if (stage !== 'cook') return;
    const onDown = (e: KeyboardEvent) => {
      if (cookPhase === 'fan' && (e.code === 'Space' || e.code === 'KeyE') && !e.repeat) {
        e.preventDefault();
        triggerFanAction();
      } else if (cookPhase === 'cutscene' && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setCookPhase('fan');
      }
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  });

  if (stage !== 'wash' && stage !== 'prep' && stage !== 'cook') return null;

  const currentPerfectionPct = Math.min(
    100,
    Math.max(25, Math.round(25 + (fanCount / FAN_TARGET_FOR_100) * 75)),
  );
  const fanSecondsText = (fanTimeLeftMs / 1000).toFixed(1);
  const fireTierText =
    fanCount >= 45
      ? '투발루 최고 화력! (100%)'
      : fanCount >= 32
        ? '황금빛 불꽃!'
        : fanCount >= 18
          ? '타오르는 숯불!'
          : '불씨를 키우세요!';

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
              ③ 투하 · 화덕 부채질
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
              <div
                className="absolute top-0 bottom-0 bg-emerald-500/35 border-x border-emerald-300"
                style={{ left: `${(targetCenters[cutIndex] ?? 50) - 10}%`, width: '20%' }}
              />
              <div
                className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-amber-300"
                style={{ left: `${targetCenters[cutIndex] ?? 50}%` }}
              />
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

        {/* === STAGE 3: CUTSCENE + 10s HEARTH FANNING === */}
        {stage === 'cook' ? (
          <div className="mt-4">
            {cookPhase === 'cutscene' ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <h3 className="font-display text-lg font-extrabold text-white">
                      3단계 (컷씬): 선택한 재료를 냄비에 넣는 중...
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCookPhase('fan')}
                    className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold text-cyan-200 hover:bg-slate-700 cursor-pointer"
                  >
                    <SkipForward className="h-3.5 w-3.5" /> 바로 부채질
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {cutsceneItems.map((item, idx) => {
                    const dropped = idx < droppedCount;
                    const droppingNow = idx === droppedCount;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                          dropped
                            ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                            : droppingNow
                              ? 'border-amber-300 bg-amber-400/25 text-amber-100 scale-105'
                              : 'border-white/15 bg-slate-900/70 text-slate-400'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.colorHexStr }}
                        />
                        <span>{item.label}</span>
                        {dropped ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-300"
                    style={{
                      width: `${Math.round((droppedCount / Math.max(1, cutsceneItems.length)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-cyan-200">
                  {droppedCount >= cutsceneItems.length
                    ? '모든 재료 투하 완료! 곧 화덕 부채질이 시작됩니다...'
                    : '투발루 전통 냄비에 신선한 재료들이 들어가고 있습니다!'}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-extrabold text-white">
                    3단계: 10초 안에 화덕에 부채질하세요!
                  </h3>
                  <span
                    className={`tabular-nums text-base font-black ${
                      fanTimeLeftMs <= 3000 ? 'text-rose-300' : 'text-amber-300'
                    }`}
                  >
                    {fanSecondsText}초
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1 text-orange-300">
                    <Flame className="h-4 w-4" /> {fireTierText}
                  </span>
                  <span className="tabular-nums text-cyan-100">
                    부채질 <strong className="text-amber-300">{fanCount}회</strong> · 완성도{' '}
                    <strong className="text-emerald-300">{currentPerfectionPct}%</strong>
                  </span>
                </div>

                {/* Fire & Perfection Bar */}
                <div className="mt-2.5 h-5 w-full overflow-hidden rounded-xl border border-white/15 bg-slate-900">
                  <div
                    className="h-full transition-all duration-75"
                    style={{
                      width: `${currentPerfectionPct}%`,
                      background: 'linear-gradient(90deg, #f97316, #fbbf24, #34d399)',
                    }}
                  />
                </div>

                <button
                  type="button"
                  disabled={fanFinished}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    triggerFanAction();
                  }}
                  className={`mt-3 flex min-h-[56px] w-full touch-none items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-black shadow-xl transition-transform cursor-pointer ${
                    fanFinished
                      ? 'bg-emerald-400 text-slate-950'
                      : fanPulse
                        ? 'scale-[0.97] bg-amber-300 text-slate-950'
                        : 'bg-gradient-to-r from-orange-500 to-amber-400 text-slate-950 hover:from-orange-400 hover:to-amber-300'
                  }`}
                >
                  <Wind className="h-5 w-5" />
                  {fanFinished
                    ? `조리 완성! (${fanCount}회 부채질 · ${currentPerfectionPct}점)`
                    : '부채질하기! (연타 / 터치 / Space / E)'}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

