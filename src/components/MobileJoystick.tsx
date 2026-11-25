import React, { useRef, useState } from 'react';

interface MobileJoystickProps {
  onMove: (x: number, z: number) => void;
}

export const MobileJoystick: React.FC<MobileJoystickProps> = ({ onMove }) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointerRef = useRef<number | null>(null);

  const maxRadius = 34;

  const updateFromClient = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnob({ x: dx, y: dy });
    onMove(dx / maxRadius, dy / maxRadius);
  };

  const resetStick = () => {
    activePointerRef.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div className="pointer-events-auto fixed bottom-24 left-4 z-30 flex flex-col items-center">
      <div
        ref={padRef}
        className="relative flex h-24 w-24 touch-none items-center justify-center rounded-full border-2 border-teal-300/45 bg-[#072633]/85 shadow-xl"
        onPointerDown={(e) => {
          e.preventDefault();
          activePointerRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromClient(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (activePointerRef.current !== e.pointerId) return;
          updateFromClient(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (activePointerRef.current === e.pointerId) {
            resetStick();
          }
        }}
        onPointerCancel={resetStick}
      >
        <div
          className="h-10 w-10 rounded-full border-2 border-amber-200 bg-amber-400/90 shadow-lg"
          style={{
            transform: `translate(${knob.x}px, ${knob.y}px)`,
          }}
        />
      </div>
      <span className="mt-1 text-[10px] font-bold text-cyan-100/80">이동 조이스틱</span>
    </div>
  );
};
