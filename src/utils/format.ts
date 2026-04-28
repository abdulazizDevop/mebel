/* Input formatters and validators for the Mebel storefront.
 *
 * Phones are formatted on every keystroke as the user types (digits-only,
 * country-code-aware), and validated as "long enough" on submit. Names get
 * a lighter touch: trim + a Cyrillic/Latin/space character class.
 */

const RU_PREFIXES = /^(7|8)/;
const UZ_PREFIX = /^9{0,1}9{0,1}8/;

/** Strip everything that isn't a digit. Pasting "+998 (90) 111-22-33" returns "998901112233". */
function digitsOnly(input: string): string {
  return input.replace(/\D+/g, '');
}

/**
 * Auto-format a partially-typed phone string. Returns a value safe to put
 * straight back into the same input on each keystroke. Supports +998 (UZ)
 * and +7 (RU) — the two formats this storefront targets.
 *
 * - "9013434" → "+998 (90) 13-43-4"  (groups fill in as the user types)
 * - "7903"    → "+7 (903)"
 * - "8903"    → "+7 (903)"           (Russian "8" prefix normalised to +7)
 * - free input outside those prefixes is returned with at most "+" + digits
 *   so it never looks half-formatted.
 */
export function formatPhoneInput(raw: string): string {
  let d = digitsOnly(raw);

  // Russian "8 (xxx) xxx-xx-xx" is conventionally re-keyed as +7 (xxx).
  if (RU_PREFIXES.test(d) && d.startsWith('8')) {
    d = '7' + d.slice(1);
  }

  // Anchor: detect UZ if user typed "9...", "99...", "998..." (cap to 12 = 998+9).
  if (d.startsWith('998')) {
    d = d.slice(0, 12);
    return formatUz(d);
  }
  if (d.startsWith('9')) {
    // User probably forgot the country code — assume UZ.
    d = ('998' + d).slice(0, 12);
    return formatUz(d);
  }

  // Russian +7
  if (d.startsWith('7')) {
    d = d.slice(0, 11);
    return formatRu(d);
  }

  // Anything else: just show "+digits" so the input never looks half-formatted.
  return d ? `+${d.slice(0, 15)}` : '';
}

function formatUz(d: string): string {
  // d looks like "998..." up to 12 digits. Splits: 998 | XX | XXX | XX | XX
  const cc = d.slice(0, 3);
  const a = d.slice(3, 5);
  const b = d.slice(5, 8);
  const c = d.slice(8, 10);
  const e = d.slice(10, 12);
  let out = `+${cc}`;
  if (a) out += ` (${a}${a.length === 2 ? ')' : ''}`;
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (e) out += `-${e}`;
  return out;
}

function formatRu(d: string): string {
  // d looks like "7..." up to 11 digits. Splits: 7 | XXX | XXX | XX | XX
  const cc = d.slice(0, 1);
  const a = d.slice(1, 4);
  const b = d.slice(4, 7);
  const c = d.slice(7, 9);
  const e = d.slice(9, 11);
  let out = `+${cc}`;
  if (a) out += ` (${a}${a.length === 3 ? ')' : ''}`;
  if (b) out += ` ${b}`;
  if (c) out += `-${c}`;
  if (e) out += `-${e}`;
  return out;
}

/** Strict: phone must contain at least 9 digits (so a UZ "998901112233"
 *  passes but "8sd9023" doesn't). Use on submit. */
export function isValidPhone(input: string): boolean {
  return digitsOnly(input).length >= 9;
}

/** Names: 2+ chars after trim, only letters / spaces / hyphens / apostrophes.
 *  Cyrillic + Latin both accepted because the storefront is RU/UZ. */
const NAME_OK = /^[A-Za-zА-Яа-яЁёҲҳҚқҒғӮӯ' \-]+$/;

export function isValidName(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 2) return false;
  return NAME_OK.test(trimmed);
}

/** As-you-type filter for name fields: keeps allowed characters, drops
 *  digits/punctuation. Returns the cleaned value safe to push back into
 *  the input on every keystroke. */
export function sanitizeNameInput(input: string): string {
  // Keep one leading space-allowance during typing — but collapse runs.
  return input.replace(/[^A-Za-zА-Яа-яЁёҲҳҚқҒғӮӯ' \-]+/g, '').replace(/ {2,}/g, ' ');
}
