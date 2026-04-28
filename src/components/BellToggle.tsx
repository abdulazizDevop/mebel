import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';

export function BellToggle() {
  const { theme, toggleTheme } = useTheme();
  const [isPulled, setIsPulled] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    if (isPulled) return;
    setIsPulled(true);
    setTimeout(() => {
      toggleTheme();
    }, 300);
    setTimeout(() => {
      setIsPulled(false);
    }, 650);
  };

  const isDark = theme === 'dark';

  return (
    <motion.button
      onClick={handleClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="relative flex flex-col items-center cursor-pointer"
      aria-label="Переключить тему"
      style={{ width: 36, height: 76 }}
    >
      {/* Wire / cord */}
      <motion.div
        animate={{
          height: isPulled ? 38 : 26,
          rotate: isHovered && !isPulled ? [0, -3, 3, -2, 1, 0] : 0,
        }}
        transition={{
          height: { type: 'spring', stiffness: 350, damping: 14 },
          rotate: { duration: 1.2, repeat: isHovered && !isPulled ? Infinity : 0, repeatType: 'mirror' },
        }}
        className="w-[2.5px] rounded-full origin-top"
        style={{
          background: isDark
            ? 'linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.6))'
            : 'linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.5))',
        }}
      />

      {/* Whole lamp assembly — swings on hover & pull */}
      <motion.div
        animate={{
          rotate: isPulled
            ? [0, -20, 16, -10, 5, 0]
            : isHovered
              ? [0, -4, 4, -3, 2, 0]
              : 0,
          y: isPulled ? 6 : 0,
        }}
        transition={{
          rotate: isPulled
            ? { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
            : { duration: 1.5, repeat: isHovered ? Infinity : 0, repeatType: 'mirror', ease: 'easeInOut' },
          y: { type: 'spring', stiffness: 280, damping: 12 },
        }}
        className="relative flex flex-col items-center"
        style={{ transformOrigin: 'top center' }}
      >
        {/* Socket / Патрон — small dark cylinder */}
        <div
          className="relative z-10"
          style={{
            width: 12,
            height: 10,
            borderRadius: '3px 3px 2px 2px',
            background: isDark
              ? 'linear-gradient(180deg, #555 0%, #333 100%)'
              : 'linear-gradient(180deg, #444 0%, #222 100%)',
            boxShadow: isDark
              ? '0 1px 4px rgba(0,0,0,0.4), 0 0 8px rgba(255,200,100,0.1)'
              : '0 1px 4px rgba(0,0,0,0.3)',
          }}
        >
          {/* Socket ring */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2"
            style={{
              width: 14,
              height: 3,
              borderRadius: '1px',
              background: isDark
                ? 'linear-gradient(180deg, #666 0%, #444 100%)'
                : 'linear-gradient(180deg, #555 0%, #333 100%)',
            }}
          />
        </div>

        {/* Bulb — round glass shape */}
        <div
          className="relative -mt-[1px]"
          style={{
            width: 22,
            height: 24,
            borderRadius: '5px 5px 11px 11px',
            background: isDark
              ? 'radial-gradient(circle at 50% 45%, rgba(255,240,200,0.95) 0%, rgba(255,220,140,0.8) 40%, rgba(255,200,100,0.5) 70%, rgba(255,180,60,0.2) 100%)'
              : 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.5) 0%, rgba(220,220,220,0.3) 40%, rgba(200,200,200,0.15) 100%)',
            border: isDark
              ? '1px solid rgba(255,220,150,0.3)'
              : '1px solid rgba(0,0,0,0.08)',
            boxShadow: isDark
              ? '0 0 20px rgba(255,200,100,0.6), 0 0 40px rgba(255,180,60,0.3), inset 0 0 10px rgba(255,220,150,0.3)'
              : '0 2px 6px rgba(0,0,0,0.08), inset 0 1px 3px rgba(255,255,255,0.4)',
          }}
        >
          {/* Filament lines inside bulb */}
          <svg
            viewBox="0 0 22 24"
            className="absolute inset-0 w-full h-full"
            style={{ opacity: isDark ? 0.7 : 0.15 }}
          >
            <line x1="9" y1="3" x2="8" y2="14" stroke={isDark ? '#ffcc66' : '#666'} strokeWidth="0.6" />
            <line x1="13" y1="3" x2="14" y2="14" stroke={isDark ? '#ffcc66' : '#666'} strokeWidth="0.6" />
            <path d="M8,14 Q11,18 14,14" fill="none" stroke={isDark ? '#ffcc66' : '#666'} strokeWidth="0.6" />
          </svg>

          {/* Glass highlight */}
          <div
            className="absolute top-1 left-1 w-2 h-4 rounded-full"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)',
              opacity: isDark ? 0.5 : 0.6,
            }}
          />
        </div>

        {/* Glow halo around bulb in dark mode */}
        <AnimatePresence>
          {isDark && (
            <motion.div
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.3 }}
              transition={{ duration: 0.5 }}
              className="absolute pointer-events-none"
              style={{
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,210,120,0.25) 0%, rgba(255,180,60,0.08) 50%, transparent 70%)',
                filter: 'blur(4px)',
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </motion.button>
  );
}
