/* Wire-format types matching backend Pydantic schemas (snake_case JSON).
 * Kept in sync with backend/app/schemas/*. */

export type UserRole = 'admin' | 'manager' | 'viewer';

export interface AdminUser {
  id: string;
  name: string;
  role: UserRole;
  sections: string[];
  created_at: string;
}

export interface AdminUserCreateDTO {
  name: string;
  password: string;
  role: UserRole;
  sections: string[];
}

export interface AdminUserUpdateDTO {
  name?: string;
  password?: string;
  role?: UserRole;
  sections?: string[];
}

export interface CustomerUser {
  id: string;
  name: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
}

export interface CategoryDTO {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface ColorVariantDTO {
  id?: number;
  hex: string;
  name?: string | null;
  image: string;
  photos: string[];
  sort_order: number;
}

export interface ProductDTO {
  id: string;
  name: string;
  sku: string;
  price: number;
  purchase_price: number | null;
  main_image: string;
  description: string;
  category_id: number | null;
  category_name: string | null;
  dimensions: string | null;
  weight: string | null;
  material: string | null;
  in_stock: boolean;
  quantity: number | null;
  color_variants: ColorVariantDTO[];
  created_at: string;
  updated_at: string;
}

export type ProductCreateDTO = Omit<
  ProductDTO,
  'id' | 'created_at' | 'updated_at' | 'category_name' | 'color_variants' | 'sku'
> & {
  sku?: string;
  color_variants: Omit<ColorVariantDTO, 'id'>[];
};

export type OrderStatus = 'new' | 'chatting' | 'confirmed' | 'completed' | 'cancelled';
export type ChatSender = 'client' | 'admin';

export interface OrderItemDTO {
  id: number;
  product_id: string | null;
  product_name: string;
  product_sku: string;
  product_image: string;
  price: number;
  purchase_price: number | null;
  qty: number;
  color_index: number;
  color_hex: string | null;
  color_name: string | null;
}

export interface ChatMessageDTO {
  id: string;
  sender: ChatSender;
  sender_user_id: string | null;
  text: string;
  created_at: string;
}

export interface OrderDTO {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  total: number;
  status: OrderStatus;
  items: OrderItemDTO[];
  chat: ChatMessageDTO[];
  created_at: string;
}

export interface OrderCreateDTO {
  customer_name: string;
  customer_phone: string;
  items: { product_id: string; qty: number; color_index: number }[];
  /** Free-form text appended to the auto-seeded first chat message —
   *  used for custom-furniture orders that have no line items. */
  note?: string;
}

/* ─── Analytics ─── */

export type AnalyticsEventType =
  | 'visit'
  | 'product_view'
  | 'cart_add'
  | 'cart_checkout'
  | 'chat_open'
  | 'favorite_add'
  | 'favorite_remove';

export interface AnalyticsEventInDTO {
  type: AnalyticsEventType;
  product_id?: string;
  session_id?: string;
  data?: Record<string, unknown>;
}

export interface TopProductDTO {
  product_id: string;
  name: string;
  main_image: string;
  price: number;
  count: number;
}

export type StatsPeriod = 'today' | 'week' | 'month' | 'custom';

export interface StatsDTO {
  visits: number;
  product_views: number;
  cart_adds: number;
  checkouts: number;
  chat_opens: number;
  favorite_adds: number;

  revenue: number;
  cost: number;
  net_profit: number;
  orders_count: number;

  top_viewed: TopProductDTO[];
  top_carted: TopProductDTO[];
  top_favorited: TopProductDTO[];

  period: StatsPeriod;
  range_from: string;
  range_to: string;
}
