'use client';

/**
 * AsciiBackground — sub-archivo del organismo LandingHero.
 * Excepción Atomic Design justificada: usa canvas nativo con RAF,
 * detecta posición del mouse en toda la ventana y solo tiene sentido
 * dentro del hero. No es reutilizable en otros contextos.
 */

import { useEffect, useRef } from 'react';

interface Cell {
  char: string;
  targetChar: string;
  decoding: boolean;
  timer: number;
}

const CHARS =
  '!@#$%^&*()_+{}|<>?~`-=[]\\ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const GRID_SIZE = 28;
const MOUSE_RADIUS = 210;
const BASE_OPACITY = 0.067;
const DECODE_CYCLES = 12;

function rndChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export function AsciiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellsRef = useRef<Cell[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buildGrid = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * window.devicePixelRatio);
      canvas.height = Math.round(h * window.devicePixelRatio);
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

      const cols = Math.ceil(w / GRID_SIZE) + 1;
      const rows = Math.ceil(h / GRID_SIZE) + 1;
      cellsRef.current = Array.from({ length: rows * cols }, () => {
        const ch = rndChar();
        return { char: ch, targetChar: ch, decoding: false, timer: 0 };
      });
    };

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      ctx.font = `${GRID_SIZE * 0.52}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const cols = Math.ceil(w / GRID_SIZE) + 1;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const [idx, cell] of cellsRef.current.entries()) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx = col * GRID_SIZE + GRID_SIZE / 2;
        const cy = row * GRID_SIZE + GRID_SIZE / 2;

        const dx = cx - mx;
        const dy = cy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const inRadius = dist < MOUSE_RADIUS;

        if (inRadius) {
          if (!cell.decoding) {
            cell.decoding = true;
            cell.timer = 0;
          }
          cell.timer++;
          const proximity = 1 - dist / MOUSE_RADIUS;

          if (cell.timer < DECODE_CYCLES) {
            cell.char = rndChar();
          } else {
            cell.char = cell.targetChar;
          }

          ctx.globalAlpha = BASE_OPACITY + proximity * 0.24;
          const hue = Math.round(243 + proximity * 28);
          const lum = Math.round(55 + proximity * 28);
          ctx.fillStyle = `hsl(${hue}, 75%, ${lum}%)`;
        } else {
          if (cell.decoding) {
            cell.decoding = false;
            cell.timer = 0;
          }
          ctx.globalAlpha = BASE_OPACITY;
          ctx.fillStyle = '#9AA0B4';
        }

        ctx.fillText(cell.char, cx, cy);
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onDocLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    buildGrid();
    draw();

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onDocLeave);
    window.addEventListener('resize', buildGrid, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onDocLeave);
      window.removeEventListener('resize', buildGrid);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
