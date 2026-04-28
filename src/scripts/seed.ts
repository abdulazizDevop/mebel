/* One-shot seed: pushes the legacy `src/data/products.ts` catalogue into the
 * FastAPI backend so the storefront isn't empty on first run.
 *
 * Run with the backend already serving on VITE_API_URL (default
 * http://localhost:8000):
 *
 *     ADMIN_PASSWORD=admin npx tsx src/scripts/seed.ts
 *
 * Idempotent on duplicates: a 409 (category already exists / SKU already
 * exists) is logged and skipped, so re-running is safe. */

import { products as defaultProducts, categories as defaultCategories } from '../data/products';

const API = process.env.VITE_API_URL || 'http://localhost:8000';
const ADMIN_NAME = process.env.ADMIN_NAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

interface CategoryDTO { id: number; name: string }
interface TokenResponse { access_token: string }

async function loginAsAdmin(): Promise<string> {
  const params = new URLSearchParams({ username: ADMIN_NAME, password: ADMIN_PASSWORD });
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!r.ok) throw new Error(`Admin login failed (${r.status}). Run \`python -m app.seed\` first.`);
  const data = (await r.json()) as TokenResponse;
  return data.access_token;
}

async function ensureCategories(token: string): Promise<Record<string, number>> {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const map: Record<string, number> = {};
  for (let i = 0; i < defaultCategories.length; i++) {
    const name = defaultCategories[i];
    if (name === 'Все') continue;
    const r = await fetch(`${API}/categories`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, sort_order: i }),
    });
    if (r.ok) {
      const c = (await r.json()) as CategoryDTO;
      map[name] = c.id;
    } else if (r.status === 409) {
      // Already there — pull the full list once and resolve everything we still need.
      const all = (await fetch(`${API}/categories`).then((res) => res.json())) as CategoryDTO[];
      for (const c of all) map[c.name] = c.id;
    } else {
      throw new Error(`Failed to create category "${name}": ${r.status} ${await r.text()}`);
    }
  }
  return map;
}

async function pushProducts(token: string, catMap: Record<string, number>) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  let created = 0;
  let skipped = 0;
  for (const p of defaultProducts) {
    const body = {
      name: p.name,
      sku: p.sku,
      price: p.price,
      purchase_price: p.purchasePrice ?? null,
      main_image: p.image,
      description: p.description,
      category_id: catMap[p.category] ?? null,
      dimensions: p.dimensions ?? null,
      weight: p.weight ?? null,
      material: p.material ?? null,
      in_stock: p.inStock ?? true,
      quantity: p.quantity ?? null,
      color_variants: p.colorVariants.map((v, i) => ({
        hex: v.hex,
        name: v.name ?? null,
        image: v.image,
        photos: v.photos && v.photos.length > 0 ? v.photos : [v.image],
        sort_order: i,
      })),
    };
    const r = await fetch(`${API}/products`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (r.ok) {
      created++;
    } else if (r.status === 409) {
      skipped++;
    } else {
      const text = await r.text();
      console.warn(`[seed] product "${p.name}" failed: ${r.status} ${text}`);
      skipped++;
    }
  }
  console.log(`[seed] products: ${created} created, ${skipped} skipped`);
}

async function main() {
  console.log(`[seed] target API: ${API}`);
  const token = await loginAsAdmin();
  console.log(`[seed] logged in as "${ADMIN_NAME}"`);
  const catMap = await ensureCategories(token);
  console.log(`[seed] categories ready (${Object.keys(catMap).length})`);
  await pushProducts(token, catMap);
  console.log('[seed] done');
}

main().catch((e) => {
  console.error('[seed] failed:', e);
  process.exit(1);
});
