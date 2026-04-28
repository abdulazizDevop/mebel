import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LiquidButton } from '../components/LiquidButton';
import { useStore } from '../store/useStore';
import { useTheme } from '../context/ThemeContext';

function getPositionClass(offset: number, total: number): string {
  if (offset === 0) return 'center';
  if (offset === 1) return 'right-1';
  if (offset === 2) return 'right-2';
  if (offset === total - 1) return 'left-1';
  if (offset === total - 2) return 'left-2';
  return 'hidden-card';
}

function getStyle(pos: string, mobile: boolean) {
  const dx = mobile ? 0.6 : 1;
  switch (pos) {
    case 'center':
      return { x: 0, scale: 1.08, z: 0, opacity: 1, gray: false };
    case 'left-1':
      return { x: -185 * dx, scale: 0.88, z: -100, opacity: 0.9, gray: true };
    case 'left-2':
      return { x: -345 * dx, scale: 0.73, z: -250, opacity: 0.55, gray: true };
    case 'right-1':
      return { x: 185 * dx, scale: 0.88, z: -100, opacity: 0.9, gray: true };
    case 'right-2':
      return { x: 345 * dx, scale: 0.73, z: -250, opacity: 0.55, gray: true };
    default:
      return { x: 0, scale: 0.5, z: -400, opacity: 0, gray: true };
  }
}

export function Home() {
  const { allProducts } = useStore();
  // Pull the carousel from the live, API-backed catalog so the home page
  // reflects whatever the admin has uploaded — not the static seed file.
  const carouselItems = useMemo(() => allProducts.slice(0, 8), [allProducts]);

  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [mobile, setMobile] = useState(false);
  const touchX = useRef(0);
  const total = carouselItems.length;
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const titleText = 'Rooomebel';
  const [typedCount, setTypedCount] = useState(0);

  useEffect(() => {
    setTypedCount(0);
    const interval = setInterval(() => {
      setTypedCount(prev => {
        if (prev >= titleText.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 120);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const goTo = useCallback((idx: number) => {
    if (animating) return;
    setAnimating(true);
    setCurrent((idx + total) % total);
    setTimeout(() => setAnimating(false), 700);
  }, [animating, total]);

  const next = useCallback(() => goTo(current + 1), [goTo, current]);
  const prev = useCallback(() => goTo(current - 1), [goTo, current]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev]);

  // If the catalog shrinks (admin deletes a product), keep the active index in range.
  useEffect(() => {
    if (total > 0 && current >= total) setCurrent(0);
  }, [total, current]);

  const active = carouselItems[current];
  const cardW = mobile ? 175 : 260;
  const cardH = mobile ? 250 : 360;

  // Guard the carousel render until the API populates the catalog. The
  // `active.name` / `active.image` accesses below would crash on first paint
  // before /products has resolved.
  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-sm opacity-50">Загружаем каталог…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-[80vh] pt-2 overflow-hidden">
      {/* SVG liquid filter */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="liquid-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015"
              numOctaves="3"
              seed="2"
              result="turbulence"
            >
              <animate
                attributeName="baseFrequency"
                values="0.015;0.025;0.015"
                dur="4s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="turbulence"
              scale="12"
              xChannelSelector="R"
              yChannelSelector="G"
            >
              <animate
                attributeName="scale"
                values="8;14;8"
                dur="3s"
                repeatCount="indefinite"
              />
            </feDisplacementMap>
          </filter>
        </defs>
      </svg>

      {/* Big liquid gradient title — ROOOMEBEL with typing effect */}
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[2.25rem] sm:text-[3.5rem] md:text-[7rem] font-black tracking-tight !uppercase text-center pointer-events-none select-none leading-none mb-2 animate-title-gradient"
        style={{
          // Use the longhand `backgroundImage` so it never conflicts with the
          // longhand `backgroundSize` / `backgroundClip` siblings during
          // re-renders (React warns about shorthand+longhand collisions).
          backgroundImage: isDark
            ? 'linear-gradient(315deg, #FFD700 0%, #FFFFFF 20%, #FF6B6B 40%, #FFD700 60%, #FFFFFF 80%, #FF6B6B 100%)'
            : 'linear-gradient(315deg, #1a1a2e 0%, #c0392b 20%, #2c3e50 40%, #c0392b 60%, #1a1a2e 80%, #8e44ad 100%)',
          backgroundSize: '400% 400%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          fontFamily: '"Arial Black", "Arial Bold", Arial, sans-serif',
          letterSpacing: '-0.02em',
          filter: 'url(#liquid-filter)',
        }}
      >
        {titleText.slice(0, typedCount)}
        {typedCount < titleText.length && (
          <span className="inline-block w-[3px] md:w-[5px] h-[2rem] sm:h-[3rem] md:h-[6rem] align-middle ml-1 animate-blink-cursor" style={{
            backgroundColor: isDark ? '#FFD700' : '#c0392b',
          }} />
        )}
        <span className="invisible">{titleText.slice(typedCount)}</span>
      </motion.h1>

      {/* 3D Carousel */}
      <div
        className="relative w-full max-w-[1200px] mx-auto"
        style={{ height: mobile ? 290 : 400, perspective: '1000px' }}
        onTouchStart={(e) => { touchX.current = e.changedTouches[0].screenX; }}
        onTouchEnd={(e) => {
          const diff = touchX.current - e.changedTouches[0].screenX;
          if (Math.abs(diff) > 50) { diff > 0 ? next() : prev(); }
        }}
      >
        <div className="relative w-full h-full flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
          {carouselItems.map((p, i) => {
            const offset = (i - current + total) % total;
            const pos = getPositionClass(offset, total);
            const s = getStyle(pos, mobile);
            const isHidden = pos === 'hidden-card';

            return (
              <div
                key={p.id}
                onClick={() => pos !== 'center' ? goTo(i) : undefined}
                className="absolute rounded-[20px] overflow-hidden shadow-xl"
                style={{
                  width: cardW,
                  height: cardH,
                  transform: `translateX(${s.x}px) scale(${s.scale}) translateZ(${s.z}px)`,
                  zIndex: pos === 'center' ? 10 : pos.includes('1') ? 5 : 1,
                  opacity: s.opacity,
                  transition: 'all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  cursor: pos === 'center' ? 'default' : 'pointer',
                  pointerEvents: isHidden ? 'none' : 'auto',
                  background: 'rgb(var(--color-surface))',
                }}
              >
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-full h-full object-cover"
                  style={{
                    filter: s.gray ? 'grayscale(100%)' : 'none',
                    transition: 'filter 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                  draggable={false}
                />
              </div>
            );
          })}
        </div>

        {/* Arrows */}
        <button
          onClick={prev}
          className="absolute left-2 md:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-primary/50 text-primary-inv flex items-center justify-center hover:bg-primary/80 hover:scale-110 active:scale-95 transition-all backdrop-blur-sm"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={next}
          className="absolute right-2 md:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-primary/50 text-primary-inv flex items-center justify-center hover:bg-primary/80 hover:scale-110 active:scale-95 transition-all backdrop-blur-sm"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Product name + category */}
      <div className="text-center mt-5 mb-4 px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="text-xl md:text-3xl font-bold mb-1 relative inline-block px-8">
              <span className="absolute top-1/2 left-0 md:-left-10 w-6 md:w-16 h-[2px] bg-primary/20 -translate-y-1/2" />
              {active.name}
              <span className="absolute top-1/2 right-0 md:-right-10 w-6 md:w-16 h-[2px] bg-primary/20 -translate-y-1/2" />
            </h3>
            <p className="text-primary/40 text-xs md:text-sm uppercase tracking-[0.15em] mt-1">
              {active.category} — {active.price.toLocaleString()} ₽
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mb-5">
        {carouselItems.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === current ? 12 : 10,
              height: i === current ? 12 : 10,
              backgroundColor: i === current
                ? 'rgb(var(--color-primary))'
                : 'rgb(var(--color-primary) / 0.2)',
              transform: i === current ? 'scale(1.2)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex justify-center"
      >
        <Link to={`/product/${active.id}`}>
          <LiquidButton width={260} height={56}>
            Подробнее
          </LiquidButton>
        </Link>
      </motion.div>
    </div>
  );
}
