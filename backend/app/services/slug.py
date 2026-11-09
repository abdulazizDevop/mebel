"""URL slugs for products and categories.

`/catalog/krovati/krovat-turtsiya-160-i-180` instead of `/product/<uuid>`.
Cyrillic is transliterated the way Yandex shows it in snippets (ж → zh,
х → h, ц → ts, щ → sch, ё → yo, й/ы → y, ъ/ь dropped). Anything that is not a
latin letter or digit becomes a single hyphen. Slugs are lower-case, at most
MAX_LEN characters and never empty (fallback = `tovar` / `razdel` + counter).
"""
from __future__ import annotations

import re
from collections.abc import Callable

MAX_LEN = 80

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}

_NON_SLUG = re.compile(r"[^a-z0-9]+")

# Category slugs a real category must never take: `tovary` is the pseudo
# category used in product URLs when the product has no category.
RESERVED_CATEGORY_SLUGS = frozenset(
    {"tovary", "catalog", "order", "admin", "chat", "profile", CUSTOM_ORDER_SEGMENT := "individualnyy-zakaz"}
)


def transliterate(text: str) -> str:
    out: list[str] = []
    for ch in text.lower():
        out.append(_TRANSLIT.get(ch, ch))
    return "".join(out)


def slugify(text: str, *, fallback: str = "tovar") -> str:
    """`Кровать "Турция 160 И 180"` → `krovat-turtsiya-160-i-180`."""
    s = _NON_SLUG.sub("-", transliterate(text)).strip("-")
    if len(s) > MAX_LEN:
        s = s[:MAX_LEN].rstrip("-")
        # Do not end on a chopped word fragment when a hyphen is nearby.
        if "-" in s[-12:]:
            s = s[: s.rfind("-")]
    return s or fallback


def make_unique(base: str, taken: Callable[[str], bool]) -> str:
    """Return `base`, or `base-2`, `base-3`, … — the first value for which
    `taken(candidate)` is False. Keeps the result within MAX_LEN."""
    if not taken(base):
        return base
    n = 2
    while True:
        suffix = f"-{n}"
        candidate = f"{base[: MAX_LEN - len(suffix)].rstrip('-')}{suffix}"
        if not taken(candidate):
            return candidate
        n += 1
