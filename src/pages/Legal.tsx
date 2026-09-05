import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { LEGAL_SLUGS, legalDocuments, type LegalBlock, type LegalSlug } from '../legal/documents';
import { openCookieSettings } from '../consent/cookieConsent';

function Block({ block }: { block: LegalBlock }) {
  switch (block.t) {
    case 'h':
      return <h2 className="text-lg sm:text-xl font-semibold mt-8 mb-3 break-words">{block.text}</h2>;
    case 'p':
      return (
        <p className={block.strong ? 'font-semibold mb-3 leading-relaxed break-words' : 'mb-3 leading-relaxed break-words'}>
          {block.text}
        </p>
      );
    case 'ul':
      return (
        <ul className="list-disc pl-5 mb-4 space-y-1 leading-relaxed break-words">
          {block.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ul>
      );
    case 'kv':
      return (
        <dl className="mb-4 space-y-1.5">
          {block.rows.map((r) => (
            <div key={r.label} className="flex flex-col sm:flex-row sm:gap-2 break-words">
              <dt className="opacity-60 sm:min-w-[6.5rem]">{r.label}:</dt>
              <dd className="font-medium">
                {r.href ? (
                  <a href={r.href} className="underline underline-offset-2 hover:opacity-70 break-all">
                    {r.value}
                  </a>
                ) : (
                  r.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'link':
      return (
        <p className="mb-4 break-all">
          {block.external ? (
            <a href={block.href} className="underline underline-offset-2 hover:opacity-70">{block.label}</a>
          ) : (
            <Link to={block.href} className="underline underline-offset-2 hover:opacity-70">{block.label}</Link>
          )}
        </p>
      );
    case 'cookie-settings':
      return (
        <p className="mb-6">
          <button
            type="button"
            onClick={openCookieSettings}
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-primary/5 transition-colors"
          >
            <Cookie size={16} /> Настройки cookie
          </button>
        </p>
      );
    default:
      return null;
  }
}

export function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = legalDocuments[slug];

  useEffect(() => {
    const prev = document.title;
    document.title = `${doc.title} — Rooomebel`;
    return () => {
      document.title = prev;
    };
  }, [doc]);

  return (
    <article id="contacts" className="max-w-3xl mx-auto py-4 sm:py-8 text-[15px]">
      <h1 className="text-2xl sm:text-3xl font-semibold leading-tight mb-2 break-words">{doc.title}</h1>
      {doc.versionLabel && <p className="text-sm opacity-50 mb-6">{doc.versionLabel}</p>}
      {!doc.versionLabel && <div className="mb-6" />}

      {doc.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}

      <nav aria-label="Правовые документы" className="mt-12 pt-6 border-t border-primary/10">
        <p className="text-xs uppercase tracking-wider opacity-40 mb-3">Другие документы</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {LEGAL_SLUGS.filter((s) => s !== slug).map((s) => (
            <li key={s}>
              <Link to={legalDocuments[s].path} className="underline underline-offset-2 opacity-70 hover:opacity-100">
                {legalDocuments[s].footerLabel}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
