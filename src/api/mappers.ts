/* Maps between the wire-format `*DTO` types (snake_case, matching the
 * FastAPI schemas) and the existing camelCase frontend `Product` type that
 * the React components already consume. Keeping a single mapping layer here
 * means components don't have to be touched for the API migration. */

import type { Product, ColorVariant } from '../data/products';
import type { ChatMessage, Order } from '../store/useStore';
import type {
  CategoryDTO,
  ChatMessageDTO,
  ColorVariantDTO,
  OrderDTO,
  ProductCreateDTO,
  ProductDTO,
} from './types';

export function dtoToProduct(d: ProductDTO): Product {
  return {
    id: d.id,
    name: d.name,
    sku: d.sku,
    price: Number(d.price),
    purchasePrice: d.purchase_price === null ? undefined : Number(d.purchase_price),
    image: d.main_image,
    category: d.category_name || '',
    description: d.description,
    dimensions: d.dimensions ?? undefined,
    weight: d.weight ?? undefined,
    material: d.material ?? undefined,
    colorVariants: d.color_variants.map(dtoToColorVariant),
    inStock: d.in_stock,
    quantity: d.quantity ?? undefined,
  };
}

export function dtoToColorVariant(cv: ColorVariantDTO): ColorVariant {
  return {
    hex: cv.hex,
    name: cv.name ?? undefined,
    image: cv.image,
    photos: cv.photos,
  };
}

export function productToCreateDto(
  p: Partial<Product> & { name: string; price: number; image: string },
  categories: CategoryDTO[],
): ProductCreateDTO {
  const cat = p.category ? categories.find((c) => c.name === p.category) : undefined;
  const variants = p.colorVariants ?? [];
  return {
    name: p.name,
    sku: p.sku || undefined,
    price: p.price,
    purchase_price: p.purchasePrice ?? null,
    main_image: p.image,
    description: p.description ?? '',
    category_id: cat?.id ?? null,
    dimensions: p.dimensions ?? null,
    weight: p.weight ?? null,
    material: p.material ?? null,
    in_stock: p.inStock !== false,
    quantity: p.quantity ?? null,
    color_variants: variants.map((cv, i) => ({
      hex: cv.hex,
      name: cv.name ?? null,
      image: cv.image,
      photos: cv.photos ?? [],
      sort_order: i,
    })),
  };
}

export function dtoToChatMessage(m: ChatMessageDTO): ChatMessage {
  const ts = new Date(m.created_at).getTime();
  return {
    id: m.id,
    from: m.sender,
    text: m.text,
    time: new Date(m.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    timestamp: ts,
  };
}

export function dtoToOrder(d: OrderDTO): Order {
  const created = new Date(d.created_at);
  return {
    id: d.id,
    name: d.customer_name,
    phone: d.customer_phone,
    total: Number(d.total),
    items: d.items.map((item) => ({
      product: {
        id: item.product_id ?? '',
        name: item.product_name,
        sku: item.product_sku,
        price: Number(item.price),
        purchasePrice: item.purchase_price === null ? undefined : Number(item.purchase_price),
        image: item.product_image,
        category: '',
        description: '',
        colorVariants: [
          {
            hex: item.color_hex ?? '#000000',
            name: item.color_name ?? undefined,
            image: item.product_image,
          },
        ],
      },
      qty: item.qty,
      colorIndex: 0, // synthetic — only one variant survives the snapshot
    })),
    chat: d.chat.map(dtoToChatMessage),
    createdAt: created.toLocaleDateString('ru-RU'),
    createdTimestamp: created.getTime(),
  };
}

export function productToUpdateDto(
  p: Partial<Product>,
  categories: CategoryDTO[],
): Partial<ProductCreateDTO> {
  const out: Partial<ProductCreateDTO> = {};
  if (p.name !== undefined) out.name = p.name;
  if (p.sku !== undefined) out.sku = p.sku;
  if (p.price !== undefined) out.price = p.price;
  if ('purchasePrice' in p) out.purchase_price = p.purchasePrice ?? null;
  if (p.image !== undefined) out.main_image = p.image;
  if (p.description !== undefined) out.description = p.description;
  if (p.category !== undefined) {
    out.category_id = p.category ? categories.find((c) => c.name === p.category)?.id ?? null : null;
  }
  if ('dimensions' in p) out.dimensions = p.dimensions ?? null;
  if ('weight' in p) out.weight = p.weight ?? null;
  if ('material' in p) out.material = p.material ?? null;
  if (p.inStock !== undefined) out.in_stock = p.inStock;
  if ('quantity' in p) out.quantity = p.quantity ?? null;
  if (p.colorVariants !== undefined) {
    out.color_variants = p.colorVariants.map((cv, i) => ({
      hex: cv.hex,
      name: cv.name ?? null,
      image: cv.image,
      photos: cv.photos ?? [],
      sort_order: i,
    }));
  }
  return out;
}
