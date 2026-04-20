'use client';

import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

// BUSINESS RULE [CDC-2.1 / Vague F3]: Capture signature manuscrite enrichie
// - Lissage quadratique (Bezier) entre 3 points pour trait fluide
// - Epaisseur variable basee sur la vitesse (simule pression)
// - Support mouse + touch (iOS/Android) avec touch-none
// - High-DPI (canvas 2x sur retina)
// - Placeholder "Signez ici" quand vide
// - Bouton effacer integre

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string | null;
}

interface SignaturePadProps {
  width?: number;
  height?: number;
  onChange?: (hasSignature: boolean) => void;
}

interface Stroke { x: number; y: number; t: number }

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ width = 560, height = 180, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const points = useRef<Stroke[]>([]);
    const [isEmpty, setIsEmpty] = useState(true);

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        points.current = [];
        setIsEmpty(true);
        onChange?.(false);
      },
      isEmpty: () => isEmpty,
      toDataURL: () => {
        const canvas = canvasRef.current;
        if (!canvas || isEmpty) return null;
        return canvas.toDataURL('image/png');
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a202c';

      function getPoint(e: MouseEvent | TouchEvent): Stroke {
        if (!canvas) return { x: 0, y: 0, t: Date.now() };
        const rect = canvas.getBoundingClientRect();
        if ('touches' in e) {
          const t = e.touches[0] ?? e.changedTouches[0];
          if (!t) return { x: 0, y: 0, t: Date.now() };
          return { x: t.clientX - rect.left, y: t.clientY - rect.top, t: Date.now() };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: Date.now() };
      }

      function thicknessFromVelocity(prev: Stroke, curr: Stroke): number {
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = Math.max(1, curr.t - prev.t);
        const velocity = dist / dt; // px/ms
        // Plus c'est rapide, plus c'est fin (1 à 3 px)
        return Math.max(1, Math.min(3, 3 - velocity * 1.8));
      }

      function renderStroke() {
        if (!ctx || points.current.length < 2) return;
        const pts = points.current;
        const last = pts.length - 1;
        if (last < 2) return;
        const p0 = pts[last - 2]!;
        const p1 = pts[last - 1]!;
        const p2 = pts[last]!;
        ctx.lineWidth = thicknessFromVelocity(p1, p2);
        ctx.beginPath();
        // Quadratic Bezier avec p1 comme control, de mid01 vers mid12
        const mid01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const mid12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.moveTo(mid01.x, mid01.y);
        ctx.quadraticCurveTo(p1.x, p1.y, mid12.x, mid12.y);
        ctx.stroke();
      }

      function start(e: MouseEvent | TouchEvent) {
        e.preventDefault();
        drawing.current = true;
        points.current = [getPoint(e)];
        if (isEmpty) {
          setIsEmpty(false);
          onChange?.(true);
        }
      }

      function move(e: MouseEvent | TouchEvent) {
        if (!drawing.current) return;
        e.preventDefault();
        points.current.push(getPoint(e));
        renderStroke();
      }

      function end() {
        if (drawing.current && points.current.length === 1 && ctx) {
          // Simple dot (tap sans mouvement)
          const p = points.current[0]!;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        drawing.current = false;
        points.current = [];
      }

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      canvas.addEventListener('mouseup', end);
      canvas.addEventListener('mouseleave', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);

      return () => {
        canvas.removeEventListener('mousedown', start);
        canvas.removeEventListener('mousemove', move);
        canvas.removeEventListener('mouseup', end);
        canvas.removeEventListener('mouseleave', end);
        canvas.removeEventListener('touchstart', start);
        canvas.removeEventListener('touchmove', move);
        canvas.removeEventListener('touchend', end);
      };
    }, [width, height, isEmpty, onChange]);

    function handleClear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      points.current = [];
      setIsEmpty(true);
      onChange?.(false);
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="relative border-2 border-dashed border-gray-300 rounded-md bg-white overflow-hidden" style={{ width, height, maxWidth: '100%' }}>
          <canvas
            ref={canvasRef}
            className="block touch-none cursor-crosshair w-full h-full"
          />
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 text-sm">
              Signez ici avec votre doigt ou la souris
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleClear}
            disabled={isEmpty}
            className="text-gray-500 hover:text-red-600 disabled:opacity-40"
          >
            Effacer
          </button>
          {!isEmpty && <span className="text-green-700">✓ Signature capturée</span>}
        </div>
      </div>
    );
  },
);
