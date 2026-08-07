import { Phone } from 'lucide-react';
import { cn } from '../utils/cn';

/* Deep-links to WhatsApp with a pre-filled message, plus a tap-to-call link.
 * Both numbers come from the backend /config so the owner can change them
 * without a rebuild. Each piece hides itself when its number is empty. */

/** 79280484048 → "+7 (928) 048-40-48"; falls back to "+<digits>". */
export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
    const n = '7' + d.slice(1);
    return `+7 (${n.slice(1, 4)}) ${n.slice(4, 7)}-${n.slice(7, 9)}-${n.slice(9, 11)}`;
  }
  return d ? `+${d}` : '';
}

export function CallLink({ phone, className }: { phone: string; className?: string }) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return (
    <a
      href={`tel:+${digits}`}
      className={cn('flex items-center justify-center gap-1.5 text-sm', className)}
    >
      <Phone size={14} className="opacity-60" />
      <span className="opacity-60">Или позвонить:</span>
      <span className="font-bold">{formatPhoneDisplay(digits)}</span>
    </a>
  );
}

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function WhatsAppButton({
  phone,
  message,
  variant = 'solid',
  className,
  label = 'Заказать в WhatsApp',
}: {
  phone: string;
  message: string;
  variant?: 'solid' | 'outline' | 'icon';
  className?: string;
  label?: string;
}) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  if (variant === 'icon') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center bg-[#25D366] text-white shadow-sm hover:scale-105 active:scale-95 transition-transform flex-shrink-0',
          className,
        )}
      >
        <WhatsAppIcon />
      </a>
    );
  }

  // Outline = white pill with green icon/text/border (matches the product-page
  // mockup). Solid = filled green.
  const look =
    variant === 'outline'
      ? 'bg-surface text-[#25D366] border-2 border-[#25D366]'
      : 'bg-[#25D366] text-white';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center justify-center gap-2 rounded-full py-4 px-6 font-bold hover:scale-[1.02] active:scale-[0.98] transition-all',
        look,
        className,
      )}
    >
      <WhatsAppIcon size={20} />
      {label}
    </a>
  );
}
