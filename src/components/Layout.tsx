import { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { BellToggle } from './BellToggle';
import { useTheme } from '../context/ThemeContext';

interface LayoutProps {
  children: ReactNode;
}

function LogoUnderline() {
  return (
    <svg
      className="absolute -bottom-1 left-0 w-full h-[6px]"
      viewBox="0 0 200 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <path
        d="M2 4C30 2 60 3 100 2.5C140 2 170 3.5 198 2"
        stroke="#8E392B"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Layout({ children }: LayoutProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className="min-h-screen pb-32 relative">
      {/* Waves — light mode only */}
      {isLight && (
        <>
          <div className="wave" />
          <div className="wave" />
          <div className="wave" />
        </>
      )}
      <header className="px-4 py-6 sm:p-8 flex justify-between items-center relative z-10">
        <h1 className="text-xl sm:text-2xl tracking-tight font-bold !uppercase relative inline-block">
          Rooomebel
          <LogoUnderline />
        </h1>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden sm:block text-sm opacity-50">Обретите покой</div>
          <BellToggle />
        </div>
      </header>

      <main className="px-4 sm:px-6 md:px-12 lg:px-24 relative z-10">
        {children}
      </main>

      <Navbar />
    </div>
  );
}
