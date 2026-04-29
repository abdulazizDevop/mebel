/* "Update available" banner — surfaces when the service worker has a new
 * bundle ready. Clicking "Обновить" tells the SW to skip waiting; the
 * controllerchange listener in `serviceWorker.ts` then reloads the page so
 * the user lands on the new build without re-installing the PWA. */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, X } from 'lucide-react';

import { registerSW } from '../serviceWorker';

export function UpdateBanner() {
  const [skip, setSkip] = useState<(() => void) | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    registerSW({
      onUpdateReady: (skipWaiting) => {
        // Stash the action so the button can call it.
        setSkip(() => skipWaiting);
      },
    });
  }, []);

  const visible = !!skip && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[110] bg-primary text-primary-inv pill px-4 py-2.5 flex items-center gap-3 shadow-2xl max-w-[calc(100vw-1.5rem)]"
        >
          <RefreshCcw size={16} />
          <span className="text-xs sm:text-sm font-bold whitespace-nowrap">Доступна новая версия</span>
          <button
            onClick={() => skip?.()}
            className="text-xs sm:text-sm font-bold bg-primary-inv text-primary rounded-full px-3 py-1 hover:scale-[1.03] active:scale-[0.97] transition-transform"
          >
            Обновить
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
