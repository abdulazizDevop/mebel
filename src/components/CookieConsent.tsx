import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import { cn } from '../utils/cn';
import {
  COOKIE_SETTINGS_EVENT,
  getVisitorId,
  readCookiePrefs,
  writeCookiePrefs,
  type CookiePrefs,
} from '../consent/cookieConsent';
import { recordConsent } from '../api/resources';
import { LEGAL_VERSION } from '../legal/documents';
import { isMetrikaLoaded, loadMetrika } from '../analytics/metrika';

type Choice = { analytics: boolean; marketing: boolean };

/** Persist locally, mirror to the backend ConsentLog, start/stop optional tech. */
async function applyChoice(choice: Choice, source: 'cookie_banner' | 'cookie_settings', previous: CookiePrefs | null) {
  writeCookiePrefs(choice);
  const requestId = getVisitorId();
  await Promise.allSettled([
    recordConsent({
      consent_type: 'analytics_cookie',
      granted: choice.analytics,
      source_form: source,
      request_id: requestId,
      document_version: LEGAL_VERSION,
    }),
    recordConsent({
      consent_type: 'marketing_cookie',
      granted: choice.marketing,
      source_form: source,
      request_id: requestId,
      document_version: LEGAL_VERSION,
    }),
  ]);
  if (choice.analytics) {
    loadMetrika();
  } else if (previous?.analytics && isMetrikaLoaded()) {
    // A loaded counter can't be unloaded in place — a reload drops it.
    window.location.reload();
  }
}

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors shrink-0',
        on ? 'bg-primary text-primary-inv' : 'bg-primary/10 text-primary',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full transition-colors',
          on ? 'bg-primary-inv' : 'bg-primary/40',
        )}
      />
      {on ? 'ВКЛ' : 'ВЫКЛ'}
    </button>
  );
}

export function CookieConsent() {
  const [prefs, setPrefs] = useState<CookiePrefs | null>(() => readCookiePrefs());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<Choice>({ analytics: false, marketing: false });
  const [busy, setBusy] = useState(false);

  // Resume optional tech for returning visitors who already allowed it.
  useEffect(() => {
    if (prefs?.analytics) loadMetrika();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Footer link / cookies page → open the settings dialog.
  useEffect(() => {
    const open = () => {
      const current = readCookiePrefs();
      setDraft({ analytics: current?.analytics ?? false, marketing: current?.marketing ?? false });
      setSettingsOpen(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, open);
  }, []);

  const decide = useCallback(
    async (choice: Choice, source: 'cookie_banner' | 'cookie_settings') => {
      if (busy) return;
      setBusy(true);
      const previous = prefs;
      setPrefs({ necessary: true, ...choice, version: LEGAL_VERSION, updatedAt: new Date().toISOString() });
      setSettingsOpen(false);
      try {
        await applyChoice(choice, source, previous);
      } finally {
        setBusy(false);
      }
    },
    [busy, prefs],
  );

  const showBanner = prefs === null && !settingsOpen;

  return (
    <>
      {showBanner && (
        <div
          role="dialog"
          aria-label="Использование cookie"
          className="fixed z-[55] left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:bottom-32 rounded-3xl shadow-2xl border border-primary/10 p-5 text-sm"
          style={{ backgroundColor: 'var(--color-bg)' }}
        >
          <div className="flex items-start gap-3">
            <Cookie size={20} className="shrink-0 mt-0.5 opacity-70" />
            <p className="leading-relaxed">
              Rooomebel использует необходимые cookie-файлы для корректной работы сайта. С вашего разрешения мы
              также можем использовать аналитические cookie для анализа и улучшения работы сайта.{' '}
              <Link to="/cookies" className="underline underline-offset-2 whitespace-nowrap">
                Подробнее о cookie
              </Link>
            </p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => decide({ analytics: true, marketing: true }, 'cookie_banner')}
              className="rounded-full bg-primary text-primary-inv py-2.5 px-4 text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              Принять
            </button>
            <button
              type="button"
              onClick={() => decide({ analytics: false, marketing: false }, 'cookie_banner')}
              className="rounded-full border border-primary/20 py-2.5 px-4 text-sm font-semibold hover:bg-primary/5 transition-colors"
            >
              Отклонить необязательные
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft({ analytics: false, marketing: false });
                setSettingsOpen(true);
              }}
              className="rounded-full border border-primary/20 py-2.5 px-4 text-sm font-semibold hover:bg-primary/5 transition-colors"
            >
              Настроить
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Настройки cookie"
            className="relative w-full max-w-md rounded-3xl shadow-2xl border border-primary/10 p-6 text-sm max-h-[90dvh] overflow-y-auto"
            style={{ backgroundColor: 'var(--color-bg)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Cookie size={18} /> Настройки cookie
              </h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-2 rounded-full hover:bg-primary/5"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <ul className="space-y-4">
              <li className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">Необходимые cookie</p>
                  <p className="text-xs opacity-60 mt-0.5">Работа сайта, авторизация, корзина, безопасность.</p>
                </div>
                <span className="text-xs font-semibold opacity-60 whitespace-nowrap mt-1">Включены всегда</span>
              </li>
              <li className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">Аналитические cookie</p>
                  <p className="text-xs opacity-60 mt-0.5">Анализ посещаемости и улучшение сайта (Яндекс.Метрика).</p>
                </div>
                <Toggle
                  label="Аналитические cookie"
                  on={draft.analytics}
                  onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
                />
              </li>
              <li className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">Маркетинговые cookie</p>
                  <p className="text-xs opacity-60 mt-0.5">Персонализированные предложения. Сейчас не используются.</p>
                </div>
                <Toggle
                  label="Маркетинговые cookie"
                  on={draft.marketing}
                  onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
                />
              </li>
            </ul>

            <button
              type="button"
              disabled={busy}
              onClick={() => decide(draft, 'cookie_settings')}
              className="mt-6 w-full rounded-full bg-primary text-primary-inv py-3 font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              Сохранить настройки
            </button>
            <p className="mt-3 text-center text-xs">
              <Link to="/cookies" className="underline underline-offset-2 opacity-70 hover:opacity-100" onClick={() => setSettingsOpen(false)}>
                Подробнее о cookie
              </Link>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
