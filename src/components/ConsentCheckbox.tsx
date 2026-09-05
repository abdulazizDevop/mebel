import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../utils/cn';

/* Links open in a new tab so a half-filled form is never lost. Anchors are
 * interactive content, so clicking them inside the <label> does NOT toggle
 * the checkbox (HTML label activation rules). */
function DocLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:opacity-70"
    >
      {children}
    </Link>
  );
}

interface ConsentCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  /** Highlight as invalid (user tried to submit without ticking a required box). */
  invalid?: boolean;
  className?: string;
}

/** Unchecked by default — the caller's state must start with `false`. */
export function ConsentCheckbox({ id, checked, onChange, children, invalid, className }: ConsentCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 cursor-pointer select-none rounded-2xl px-1 py-1 text-xs leading-relaxed',
        invalid && 'text-red-600',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer rounded',
          invalid && 'outline outline-2 outline-red-400',
        )}
      />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}

/* ─── Ready-made label texts (ТЗ §10, §13, §14 — wording is fixed) ─── */

export function PersonalDataConsentText() {
  return (
    <>
      Я даю согласие на обработку моих персональных данных в соответствии с{' '}
      <DocLink to="/personal-data-consent">Согласием на обработку персональных данных</DocLink>.
      <span className="block mt-1 opacity-70">
        <DocLink to="/privacy">Политика обработки персональных данных</DocLink>
      </span>
    </>
  );
}

export function TermsConsentText() {
  return (
    <>
      Я ознакомился с условиями дистанционной продажи, оплаты, доставки и возврата.
      <span className="block mt-1 opacity-70 space-x-2">
        <DocLink to="/offer">Условия продажи</DocLink>
        <span aria-hidden="true">·</span>
        <DocLink to="/delivery-payment">Оплата и доставка</DocLink>
        <span aria-hidden="true">·</span>
        <DocLink to="/returns">Возврат и обмен</DocLink>
        <span aria-hidden="true">·</span>
        <DocLink to="/privacy">Политика обработки персональных данных</DocLink>
      </span>
    </>
  );
}

export function MarketingConsentText() {
  return (
    <>
      Я хочу получать акции и специальные предложения Rooomebel по телефону, SMS, электронной почте и в мессенджерах.
      <span className="block mt-1 opacity-70">
        <DocLink to="/marketing-consent">Согласие на получение рекламных сообщений</DocLink>
      </span>
    </>
  );
}

export const CONSENT_ERRORS = {
  personalData: 'Необходимо согласие на обработку персональных данных',
  terms: 'Необходимо подтвердить ознакомление с условиями продажи, оплаты, доставки и возврата',
} as const;
