import { useRef, useEffect, useCallback, ReactNode } from 'react';

interface LiquidButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  width?: number;
  height?: number;
  color1?: string;
  color2?: string;
  colorBg?: string;
}

interface Pt {
  x: number; y: number;
  ix: number; iy: number;
  vx: number; vy: number;
  cx1: number; cy1: number;
  cx2: number; cy2: number;
  level: number;
}

function createPoint(x: number, y: number, level: number): Pt {
  return { x: 50 + x, y: 50 + y, ix: 50 + x, iy: 50 + y, vx: 0, vy: 0, cx1: 0, cy1: 0, cx2: 0, cy2: 0, level };
}

export function LiquidButton({
  children,
  onClick,
  className = '',
  width = 240,
  height = 56,
  color1 = '#102ce5',
  color2 = '#E406D6',
  colorBg = '#1CE2D8',
}: LiquidButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, relX: 0, relY: 0, lastX: 0, lastY: 0, dirX: 0, dirY: 0, speedX: 0, speedY: 0 });
  const pointsARef = useRef<Pt[]>([]);
  const pointsBRef = useRef<Pt[]>([]);

  const viscosity = 20;
  const mouseDist = 70;
  const damping = 0.05;
  const numPoints = 8;

  const init = useCallback(() => {
    const pA: Pt[] = [];
    const pB: Pt[] = [];

    function add(x: number, y: number) {
      pA.push(createPoint(x, y, 1));
      pB.push(createPoint(x, y, 2));
    }

    const x = height / 2;
    for (let j = 1; j < numPoints; j++) {
      add(x + ((width - height) / numPoints) * j, 0);
    }
    add(width - height / 5, 0);
    add(width + height / 10, height / 2);
    add(width - height / 5, height);
    for (let j = numPoints - 1; j > 0; j--) {
      add(x + ((width - height) / numPoints) * j, height);
    }
    add(height / 5, height);
    add(-height / 10, height / 2);
    add(height / 5, 0);

    pointsARef.current = pA;
    pointsBRef.current = pB;
  }, [width, height]);

  useEffect(() => {
    init();
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width + 100;
    canvas.height = height + 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const m = mouseRef.current;

    // Mouse tracking
    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      m.dirX = e.clientX > m.x ? 1 : e.clientX < m.x ? -1 : 0;
      m.dirY = e.clientY > m.y ? 1 : e.clientY < m.y ? -1 : 0;
      m.x = e.clientX;
      m.y = e.clientY;
      m.relX = m.x - rect.left;
      m.relY = m.y - rect.top;
    }

    // Touch tracking
    function onTouchMove(e: TouchEvent) {
      const rect = canvas!.getBoundingClientRect();
      const t = e.touches[0];
      m.dirX = t.clientX > m.x ? 1 : t.clientX < m.x ? -1 : 0;
      m.dirY = t.clientY > m.y ? 1 : t.clientY < m.y ? -1 : 0;
      m.x = t.clientX;
      m.y = t.clientY;
      m.relX = m.x - rect.left;
      m.relY = m.y - rect.top;
    }

    let speedInterval: ReturnType<typeof setInterval>;
    speedInterval = setInterval(() => {
      m.speedX = m.x - m.lastX;
      m.speedY = m.y - m.lastY;
      m.lastX = m.x;
      m.lastY = m.y;
    }, 50);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onTouchMove, { passive: true });

    function movePoint(p: Pt) {
      p.vx += (p.ix - p.x) / (viscosity * p.level);
      p.vy += (p.iy - p.y) / (viscosity * p.level);

      const dx = p.ix - m.relX;
      const dy = p.iy - m.relY;
      const relDist = 1 - Math.sqrt(dx * dx + dy * dy) / mouseDist;

      if ((m.dirX > 0 && m.relX > p.x) || (m.dirX < 0 && m.relX < p.x)) {
        if (relDist > 0 && relDist < 1) p.vx = (m.speedX / 4) * relDist;
      }
      p.vx *= (1 - damping);
      p.x += p.vx;

      if ((m.dirY > 0 && m.relY > p.y) || (m.dirY < 0 && m.relY < p.y)) {
        if (relDist > 0 && relDist < 1) p.vy = (m.speedY / 4) * relDist;
      }
      p.vy *= (1 - damping);
      p.y += p.vy;
    }

    function render() {
      rafRef.current = requestAnimationFrame(render);
      const pA = pointsARef.current;
      const pB = pointsBRef.current;
      if (!pA.length) return;

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      for (let i = 0; i < pA.length; i++) {
        movePoint(pA[i]);
        movePoint(pB[i]);
      }

      const gx = Math.min(Math.max(m.relX, 0), canvas!.width);
      const gy = Math.min(Math.max(m.relY, 0), canvas!.height);
      const dist = Math.sqrt((gx - canvas!.width / 2) ** 2 + (gy - canvas!.height / 2) ** 2) /
        Math.sqrt((canvas!.width / 2) ** 2 + (canvas!.height / 2) ** 2);

      const grad = ctx!.createRadialGradient(gx, gy, 300 + 300 * dist, gx, gy, 0);
      grad.addColorStop(0, color1);
      grad.addColorStop(1, color2);

      const groups = [pA, pB];
      for (let j = 0; j <= 1; j++) {
        const pts = groups[j];
        ctx!.fillStyle = j === 0 ? colorBg : grad;
        ctx!.beginPath();
        ctx!.moveTo(pts[0].x, pts[0].y);

        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const next = pts[i + 1] || pts[0];
          p.cx1 = (p.x + next.x) / 2;
          p.cy1 = (p.y + next.y) / 2;
          ctx!.bezierCurveTo(p.x, p.y, p.cx1, p.cy1, p.cx1, p.cy1);
        }
        ctx!.fill();
      }
    }

    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(speedInterval);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [init, width, height, color1, color2, colorBg]);

  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width, height, borderRadius: height / 2 }}
    >
      <canvas
        ref={canvasRef}
        className="absolute pointer-events-none"
        style={{ top: -50, right: -50, bottom: -50, left: -50, zIndex: 1 }}
      />
      <span className="relative z-[2] text-white font-bold text-sm uppercase tracking-wider">
        {children}
      </span>
    </button>
  );
}
