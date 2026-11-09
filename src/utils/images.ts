/* Derived image renditions — mirrors backend/app/services/images.py.
 *
 *   products/<uuid>.jpg       original
 *   products/<uuid>_sm.webp   ≤ 400 px (cards, thumbnail strips)
 *   products/<uuid>_md.webp   ≤ 900 px (product page, carousel)
 *
 * Only our own storage URLs are rewritten; anything else is returned as-is.
 * Components use <SmartImage>, which falls back to the original when a
 * rendition is missing (e.g. an upload from before the backfill ran). */

export type ImageSize = 'sm' | 'md';

const OWN_UPLOAD = /^(.*\/(?:products|colors|chat)\/[0-9a-f]{32})\.(?:jpe?g|png|webp|gif)$/i;

export function imageVariant(url: string | undefined | null, size: ImageSize): string {
  if (!url) return '';
  const clean = url.split('?')[0];
  const m = OWN_UPLOAD.exec(clean);
  if (!m) return url;
  return `${m[1]}_${size}.webp`;
}
