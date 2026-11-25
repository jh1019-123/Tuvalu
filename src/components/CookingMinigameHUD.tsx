import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bug, Check, Flame, ShieldAlert, SkipForward, Sparkles, Utensils, Wind } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { FISH_TIERS, INGREDIENT_CATALOG } from '../data/tuvaluData';
import {
  BattlePlan,
  BattlePlayerSlot,
  CookingStage,
  CookingStageScores,
  RealtimePlayerStage,
} from '../types/game';

interface CookingMinigameHUDProps {
  stage: CookingStage;
  plan: BattlePlan;
  realtimePlayers?: {
    self: BattlePlayerSlot;
    opponent: BattlePlayerSlot;
  };
  onStageBurst: (station: 'wash' | 'prep' | 'cook', colorHex: number) => void;
  onPotDrop: (colorHex: number, kind: 'fish' | 'meat' | 'vegetable' | 'salt' | 'spice') => void;
  onFanStroke: () => void;
  onHeatChange: (heat: number) => void;
  onPestReport?: (swatted: number, missed: number) => void;
  onStageComplete: (stage: 'wash' | 'prep' | 'cook', score: number) => void;
  scores: CookingStageScores;
}

const STAGE_LABEL_KO: Record<RealtimePlayerStage, string> = {
  idle: '대기',
  intro: '재료 투입',
  wash: '① 세척 중',
  prep: '② 손질 중',
  cook: '③ 부채질 중',
  done: '요리 완성!',
};

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

interface FlyingPest {
  id: number;
  labelKo: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  progress: number; // 0..1 toward dish
  speed: number;
  wobblePhase: number;
}

const PEST_TYPES = ['라군 날파리', '코코넛 초파리', '바다 모기'];
const FAN_DURATION_MS = 10000;
const FAN_TARGET_FOR_100 = 45;

export const CookingMinigameHUD: React.FC<CookingMinigameHUDProps> = ({
  stage,
  plan,
  realtimePlayers,
  onStageBurst,
  onPotDrop,
  onFanStroke,
  onHeatChange,
  onPestReport,
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
  const onPestReportRef = useRef(onPestReport);
  onPestReportRef.current = onPestReport;
  const onStageCompleteRef = useRef(onStageComplete);
  onStageCompleteRef.current = onStageComplete;

  // Pick a random stage for pest defense per battle
  const pestTargetStage = useMemo<'wash' | 'prep' | 'cook'>(() => {
    const stages: ('wash' | 'prep' | 'cook')[] = ['wash', 'prep', 'cook'];
    return stages[Math.floor(Math.random() * stages.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.fish.uid, plan.fishSpecies.id]);

  const [activePests, setActivePests] = useState<FlyingPest[]>([]);
  const [pestFeedback, setPestFeedback] = useState<string | null>(null);
  const pestStatsRef = useRef({ swatted: 0, missed: 0 });
  const [pestStats, setPestStats] = useState({ swatted: 0, missed: 0 });

  useEffect(() => {
    pestStatsRef.current = { swatted: 0, missed: 0 };
    setPestStats({ swatted: 0, missed: 0 });
    setActivePests([]);
    setPestFeedback(null);
  }, [plan.fish.uid, plan.fishSpecies.id]);

  const applyPestHygieneScore = (baseScore: number, currentStage: 'wash' | 'prep' | 'cook') => {
    if (currentStage !== pestTargetStage) return baseScore;
    const { swatted, missed } = pestStatsRef.current;
    const bonus = swatted > 0 && missed === 0 ? 5 : 0;
    const penalty = missed * 7;
    return Math.max(15, Math.min(100, baseScore + bonus - penalty));
  };

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
      const baseScore = Math.min(100, Math.max(25, washCleanAvg + bonus));
      const finalScore = applyPestHygieneScore(baseScore, 'wash');
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
      const finalScore = applyPestHygieneScore(avg, 'prep');
      window.setTimeout(() => onStageCompleteRef.current('prep', finalScore), 500);
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
        const baseScore = Math.min(
          100,
          Math.max(25, Math.round(25 + (fanCountRef.current / FAN_TARGET_FOR_100) * 75)),
        );
        const finalScore = applyPestHygieneScore(baseScore, 'cook');
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

  // === RANDOM-STAGE FLYING PEST DEFENSE WAVE ===
  const pestWaveActive =
    stage === pestTargetStage &&
    (stage === 'wash' || stage === 'prep' || (stage === 'cook' && cookPhase === 'fan'));

  useEffect(() => {
    if (!pestWaveActive) {
      setActivePests([]);
      return;
    }

    const spawnDelays = [950, 2400, 3900];
    const timers: number[] = [];

    spawnDelays.forEach((delay, i) => {
      const t = window.setTimeout(() => {
        const edgeSide = i % 3;
        const startX = edgeSide === 0 ? 8 + Math.random() * 18 : edgeSide === 1 ? 74 + Math.random() * 18 : 20 + Math.random() * 60;
        const startY = edgeSide === 2 ? 6 : 12 + Math.random() * 25;
        const pest: FlyingPest = {
          id: Date.now() + i * 17,
          labelKo: PEST_TYPES[Math.floor(Math.random() * PEST_TYPES.length)],
          startX,
          startY,
          x: startX,
          y: startY,
          progress: 0,
          speed: 0.23 + Math.random() * 0.05, // ~3.8 - 4.3s to reach dish
          wobblePhase: Math.random() * Math.PI * 2,
        };
        setActivePests((prev) => [...prev, pest]);
      }, delay);
      timers.push(t);
    });

    let rafId = 0;
    let lastTime = performance.now();

    const animatePests = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      let landedCount = 0;
      setActivePests((prev) => {
        if (prev.length === 0) return prev;
        const next: FlyingPest[] = [];
        for (const p of prev) {
          const np = p.progress + p.speed * dt;
          if (np >= 1) {
            landedCount += 1;
            continue;
          }
          const wobble = Math.sin(now * 0.008 + p.wobblePhase) * (1 - np) * 11;
          const nx = Math.max(8, Math.min(92, p.startX + (50 - p.startX) * np + wobble));
          const ny = Math.max(8, Math.min(86, p.startY + (64 - p.startY) * np + Math.cos(now * 0.01 + p.wobblePhase) * 5));
          next.push({ ...p, progress: np, x: nx, y: ny });
        }
        return next;
      });

      if (landedCount > 0) {
        soundEngine.playPestLand();
        pestStatsRef.current.missed += landedCount;
        const snapshot = { ...pestStatsRef.current };
        setPestStats(snapshot);
        onPestReportRef.current?.(snapshot.swatted, snapshot.missed);
        setPestFeedback('으악! 날파리가 음식에 앉았습니다! (-7점)');
        window.setTimeout(() => setPestFeedback(null), 1500);
      }

      rafId = requestAnimationFrame(animatePests);
    };

    rafId = requestAnimationFrame(animatePests);

    return () => {
      timers.forEach((id) => clearTimeout(id));
      cancelAnimationFrame(rafId);
      setActivePests([]);
    };
  }, [pestWaveActive]);

  const handleSwatPest = (pestId: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActivePests((prev) => prev.filter((p) => p.id !== pestId));
    soundEngine.playSwat();
    pestStatsRef.current.swatted += 1;
    const snapshot = { ...pestStatsRef.current };
    setPestStats(snapshot);
    onPestReportRef.current?.(snapshot.swatted, snapshot.missed);
    onStageBurstRef.current(stage as 'wash' | 'prep' | 'cook', 0xfef08a);
    setPestFeedback('짝! 날파리 방해 퇴치 성공!');
    window.setTimeout(() => setPestFeedback(null), 1100);
  };

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
    <>
      {realtimePlayers ? (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center px-4">
          <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-300/40 bg-[#072633]/92 px-4 py-2.5 text-xs shadow-xl">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] font-extrabold text-cyan-200">
                  나
                </span>
                <span className="truncate font-extrabold text-white">
                  {realtimePlayers.self.displayName}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-teal-300">
                {stage === 'wash' ? '① 세척 중' : stage === 'prep' ? '② 손질 중' : '③ 부채질 중'}
              </div>
            </div>

            <div className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-black text-amber-300">
              실시간 VS
            </div>

            <div className="min-w-0 flex-1 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="truncate font-extrabold text-white">
                  {realtimePlayers.opponent.displayName}
                </span>
                <span className="rounded bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-200">
                  상대
                </span>
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-rose-300">
                {STAGE_LABEL_KO[realtimePlayers.opponent.stage]}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <div className="pointer-events-auto relative w-full max-w-xl rounded-3xl border border-amber-300/45 bg-[#072633]/94 p-5 shadow-2xl">
          {/* Interactive Flying Pest Defense Layer */}
          {activePests.length > 0 ? (
            <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
              {activePests.map((pest) => {
                const urgent = pest.progress > 0.65;
                return (
                  <button
                    key={pest.id}
                    type="button"
                    onPointerDown={(e) => handleSwatPest(pest.id, e)}
                    style={{ left: `${pest.x}%`, top: `${pest.y}%` }}
                    className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-full border-2 px-2 py-1 shadow-xl transition-transform active:scale-90 cursor-pointer ${
                      urgent
                        ? 'animate-pulse border-rose-400 bg-rose-600/95 text-white'
                        : 'border-amber-300 bg-slate-900/95 text-amber-200 hover:bg-amber-400 hover:text-slate-950'
                    }`}
                  >
                    <Bug className="h-5 w-5" />
                    <span className="whitespace-nowrap text-[9px] font-black leading-none">
                      {pest.labelKo} 쫓기!
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Pest Alert Banner */}
          {pestWaveActive && (activePests.length > 0 || pestFeedback) ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-rose-400/50 bg-rose-500/20 px-3 py-1.5 text-xs font-extrabold text-rose-100">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
                {pestFeedback || '날파리가 날아옵니다! 터치/클릭해서 쫓아내세요!'}
              </span>
              <span className="tabular-nums text-[11px] text-amber-200">
                퇴치 {pestStats.swatted} · 허용 {pestStats.missed}
              </span>
            </div>
          ) : null}

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
    </>
  );
};

