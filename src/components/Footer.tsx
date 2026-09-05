import { Link, useLocation } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { FOOTER_LEGAL_LINKS, OPERATOR } from '../legal/documents';
import { openCookieSettings } from '../consent/cookieConsent';

/** Russian-only legal footer (ТЗ §18). Hidden on the admin panel and inside the chat. */
export function Footer() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin') || pathname.startsWith('/chat')) return null;

  return (
    <footer className="relative z-10 mt-16 px-4 sm:px-6 md:px-12 lg:px-24 pb-2 text-sm">
      <div className="border-t border-primary/10 pt-8 grid gap-8 md:grid-cols-2">
        <div className="space-y-1.5 break-words">
          <p className="font-semibold tracking-tight uppercase">Rooomebel</p>
          <p className="opacity-70">Мебель собственного производства</p>
          <p className="pt-2">{OPERATOR.name}</p>
          <p className="opacity-70">ИНН: {OPERATOR.inn}</p>
          <p className="opacity-70">Адрес: {OPERATOR.address}</p>
          <p className="opacity-70">
            Телефон:{' '}
            <a href={OPERATOR.phoneHref} className="underline underline-offset-2 hover:opacity-70">
              {OPERATOR.phone}
            </a>
          </p>
          <p className="opacity-70">
            E-mail:{' '}
            <a href={OPERATOR.emailHref} className="underline underline-offset-2 hover:opacity-70 break-all">
              {OPERATOR.email}
            </a>
          </p>
        </div>

        <nav aria-label="Правовая информация">
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {FOOTER_LEGAL_LINKS.map((l) => (
              <li key={l.label}>
                <Link to={l.path} className="opacity-80 hover:opacity-100 underline-offset-2 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={openCookieSettings}
                className="inline-flex items-center gap-1.5 opacity-80 hover:opacity-100 underline-offset-2 hover:underline"
              >
                <Cookie size={14} /> Настройки cookie
              </button>
            </li>
          </ul>
        </nav>
      </div>
      <p className="mt-8 text-[11px] opacity-40">© {new Date().getFullYear()} Rooomebel</p>
    </footer>
  );
}
