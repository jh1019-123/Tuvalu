import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { IngredientItem } from '../types/game';

interface GatherMinigameHUDProps {
  ingredient: IngredientItem;
  islandNameKo: string;
  onHit?: () => void;
  onComplete: (quantity: number) => void;
  onCancel: () => void;
}

export const GatherMinigameHUD: React.FC<GatherMinigameHUDProps> = ({
  ingredient,
  islandNameKo,
  onHit,
  onComplete,
  onCancel,
}) => {
  const [round, setRound] = useState(0);
  const [cursor, setCursor] = useState(15);
  const [feedback, setFeedback] = useState<string>('');
  const dirRef = useRef(1);
  const valRef = useRef(15);
  const hitsRef = useRef(0);
  const targetCenters = [50, 36, 66];

  useEffect(() => {
    setRound(0);
    hitsRef.current = 0;
    setFeedback('');
    valRef.current = 12;
    dirRef.current = 1;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const speed = 102 + hitsRef.current * 14;
      valRef.current += dirRef.current * speed * dt;
      if (valRef.current >= 94) {
        valRef.current = 94;
        dirRef.current = -1;
      } else if (valRef.current <= 6) {
        valRef.current = 6;
        dirRef.current = 1;
      }
      setCursor(valRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ingredient.id]);

  const performHarvest = () => {
    if (round >= 3) return;
    onHit?.();
    const target = targetCenters[round] ?? 50;
    const dist = Math.abs(valRef.current - target);
    if (dist <= 13) {
      hitsRef.current += 1;
      setFeedback('대성공! 최상급 희귀 재료 채취 (+1개)');
      soundEngine.playChop(true);
    } else {
      setFeedback('살짝 빗나갔지만 채집 완료!');
      soundEngine.playScrub();
    }

    const nextRound = round + 1;
    setRound(nextRound);
    if (nextRound >= 3) {
      const qty = Math.max(1, hitsRef.current);
      window.setTimeout(() => onComplete(qty), 450);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault();
        performHarvest();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 sm:bottom-24 z-30 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-amber-300/50 bg-[#072633]/96 p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
              {islandNameKo} · 희귀 채집 미니게임
            </span>
            <h3 className="font-display text-lg font-extrabold text-white">{ingredient.nameKo}</h3>
          </div>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black tabular-nums text-cyan-200">
            채집 {Math.min(round, 3)} / 3
          </span>
        </div>

        <p className="mt-1.5 text-xs text-slate-300">{ingredient.description}</p>

        <div className="relative mt-4 h-10 w-full overflow-hidden rounded-xl border border-white/20 bg-slate-900">
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/35 border-x border-emerald-300"
            style={{ left: `${(targetCenters[round] ?? 50) - 13}%`, width: '26%' }}
          />
          <div
            className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-amber-300"
            style={{ left: `${targetCenters[round] ?? 50}%` }}
          />
          <div
            className="absolute top-1 bottom-1 w-3.5 -translate-x-1/2 rounded-full bg-white shadow"
            style={{ left: `${cursor}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-teal-200">
            {feedback || '황금 구간에 맞춰 채집하면 최대 3개 획득!'}
          </span>
          <button
            type="button"
            onClick={performHarvest}
            className="flex min-h-[46px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2 text-sm font-extrabold text-slate-950 hover:bg-amber-300 active:scale-[0.98] cursor-pointer"
          >
            <Sparkles className="h-4 w-4" /> 채집! (E)
          </button>
        </div>
      </div>
    </div>
  );
};
