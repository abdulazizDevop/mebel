/* Storefront URL builders. One place to change if the URL scheme moves.
 *
 *   /catalog                          — all products
 *   /catalog/krovati                  — category
 *   /catalog/krovati/krovat-turtsiya  — product (category segment is cosmetic:
 *                                       the product is looked up by its own slug)
 *   /product/<uuid>                   — legacy links (QR codes, WhatsApp) → redirect
 */
import type { Product } from '../data/products';

export const UNCATEGORIZED_SEGMENT = 'tovary';

export function categoryPath(slug?: string | null): string {
  return slug ? `/catalog/${encodeURIComponent(slug)}` : '/catalog';
}

export function productPath(p: Pick<Product, 'id' | 'slug' | 'categorySlug'>): string {
  if (!p.slug) return `/product/${p.id}`; // slim legacy cache row, pre-slug
  return `/catalog/${encodeURIComponent(p.categorySlug || UNCATEGORIZED_SEGMENT)}/${encodeURIComponent(p.slug)}`;
}

/** Reserved category segment for the custom-order form (mirrors backend CUSTOM_ORDER_SEGMENT). */
export const CUSTOM_ORDER_SLUG = 'individualnyy-zakaz';
export const CUSTOM_ORDER_PATH = `/catalog/${CUSTOM_ORDER_SLUG}`;
export const CUSTOM_ORDER_LABEL = 'Индивидуальный заказ';

export const ORDER_PATH = '/order';
export const orderSuccessPath = (orderId: string) => `/order/success/${orderId}`;
