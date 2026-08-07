import { api, tokenStore } from './client';
import type { ChatAttachment } from './chatSocket';
import type {
  AdminUser,
  AdminUserCreateDTO,
  AdminUserUpdateDTO,
  AnalyticsEventInDTO,
  CategoryDTO,
  ChatMessageDTO,
  CustomerUser,
  OrderCreateDTO,
  OrderDTO,
  OrderStatus,
  ProductCreateDTO,
  ProductDTO,
  StatsDTO,
  StatsPeriod,
  TokenResponse,
} from './types';

/* ─── Admin auth ─── */
export async function loginAdmin(name: string, password: string): Promise<TokenResponse> {
  const tok = await api.postForm<TokenResponse>('/auth/login', { username: name, password });
  tokenStore.set('admin', tok.access_token);
  return tok;
}
export const fetchAdminMe = () => api.get<AdminUser>('/auth/me', { tokenSlot: 'admin' });
export const logoutAdmin = () => tokenStore.clear('admin');
export const changeAdminPassword = (input: { current_password: string; new_name?: string; new_password: string }) =>
  api.post<AdminUser>('/auth/me/password', input, { tokenSlot: 'admin' });

/* ─── Admin staff CRUD (admin role only) ─── */
export const listAdminUsers = () =>
  api.get<AdminUser[]>('/admin/users', { tokenSlot: 'admin' });
export const createAdminUser = (input: AdminUserCreateDTO) =>
  api.post<AdminUser>('/admin/users', input, { tokenSlot: 'admin' });
export const updateAdminUser = (id: string, input: AdminUserUpdateDTO) =>
  api.patch<AdminUser>(`/admin/users/${id}`, input, { tokenSlot: 'admin' });
export const deleteAdminUser = (id: string) =>
  api.delete<void>(`/admin/users/${id}`, { tokenSlot: 'admin' });

/* ─── Customer auth ─── */
export async function registerCustomer(name: string, password: string): Promise<TokenResponse> {
  const tok = await api.post<TokenResponse>('/auth/customer/register', { name, password });
  tokenStore.set('customer', tok.access_token);
  return tok;
}
export async function loginCustomer(name: string, password: string): Promise<TokenResponse> {
  const tok = await api.postForm<TokenResponse>('/auth/customer/login', { username: name, password });
  tokenStore.set('customer', tok.access_token);
  return tok;
}
export const fetchCustomerMe = () => api.get<CustomerUser>('/auth/customer/me', { tokenSlot: 'customer' });
export const logoutCustomer = () => tokenStore.clear('customer');

/* ─── Categories ─── */
export const listCategories = () => api.get<CategoryDTO[]>('/categories');
export const createCategory = (name: string, sort_order = 0) =>
  api.post<CategoryDTO>('/categories', { name, sort_order }, { tokenSlot: 'admin' });
export const updateCategory = (id: number, patch: Partial<{ name: string; sort_order: number }>) =>
  api.patch<CategoryDTO>(`/categories/${id}`, patch, { tokenSlot: 'admin' });
export const deleteCategory = (id: number) =>
  api.delete<void>(`/categories/${id}`, { tokenSlot: 'admin' });

/* ─── Products ─── */
export const listProducts = (params?: {
  category_id?: number;
  in_stock_only?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.category_id !== undefined) qs.set('category_id', String(params.category_id));
  if (params?.in_stock_only) qs.set('in_stock_only', 'true');
  if (params?.q) qs.set('q', params.q);
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return api.get<ProductDTO[]>(`/products${q ? `?${q}` : ''}`);
};
export const getProduct = (id: string) => api.get<ProductDTO>(`/products/${id}`);
export const createProduct = (input: ProductCreateDTO) =>
  api.post<ProductDTO>('/products', input, { tokenSlot: 'admin' });
export const updateProduct = (id: string, patch: Partial<ProductCreateDTO>) =>
  api.patch<ProductDTO>(`/products/${id}`, patch, { tokenSlot: 'admin' });
export const deleteProduct = (id: string) =>
  api.delete<void>(`/products/${id}`, { tokenSlot: 'admin' });

/* ─── Orders ─── */
/** Variant-3 hybrid checkout. Sends customer JWT if available, otherwise creates a guest order. */
export const placeOrder = (input: OrderCreateDTO) =>
  api.post<OrderDTO>('/orders', input, { tokenSlot: 'customer' });
export const myOrders = () => api.get<OrderDTO[]>('/orders/me', { tokenSlot: 'customer' });
export const adminListOrders = (params?: { phone?: string; status?: OrderStatus }) => {
  const qs = new URLSearchParams();
  if (params?.phone) qs.set('phone', params.phone);
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return api.get<OrderDTO[]>(`/orders${q ? `?${q}` : ''}`, { tokenSlot: 'admin' });
};
export const adminGetOrder = (id: string) =>
  api.get<OrderDTO>(`/orders/${id}`, { tokenSlot: 'admin' });
export const adminUpdateOrderStatus = (id: string, status: OrderStatus) =>
  api.patch<OrderDTO>(`/orders/${id}/status`, { status }, { tokenSlot: 'admin' });

/* ─── Chat ─── */
interface ChatBody {
  text: string;
  audio_url?: string;
  audio_duration?: number;
  image_url?: string;
}
const chatBody = (text: string, a?: ChatAttachment): ChatBody => ({
  text,
  ...(a?.audioUrl ? { audio_url: a.audioUrl, audio_duration: a.audioDuration } : {}),
  ...(a?.imageUrl ? { image_url: a.imageUrl } : {}),
});

export const sendChatAsAdmin = (orderId: string, text: string, a?: ChatAttachment) =>
  api.post<ChatMessageDTO>(`/orders/${orderId}/chat`, chatBody(text, a), { tokenSlot: 'admin' });
export const sendChatAsCustomer = (orderId: string, text: string, a?: ChatAttachment) =>
  api.post<ChatMessageDTO>(`/orders/${orderId}/chat/customer`, chatBody(text, a), { tokenSlot: 'customer' });

/* ─── Guest chat (order-link capability, no auth) ─── */
/** Poll a guest order's chat by UUID — how a not-logged-in customer sees admin replies. */
export const getOrderChatPublic = (orderId: string) =>
  api.get<ChatMessageDTO[]>(`/orders/${orderId}/chat`);
/** Guest customer reply, keyed by order UUID (no token). */
export const sendChatAsGuest = (orderId: string, text: string, a?: ChatAttachment) =>
  api.post<ChatMessageDTO>(`/orders/${orderId}/chat/guest`, chatBody(text, a));

/* ─── Admin order actions ─── */
export const deleteOrder = (orderId: string) =>
  api.delete<void>(`/orders/${orderId}`, { tokenSlot: 'admin' });
export const setOrderArchived = (orderId: string, archived: boolean) =>
  api.patch<OrderDTO>(`/orders/${orderId}/archive`, { archived }, { tokenSlot: 'admin' });

/* ─── Chat attachment uploads ─── */
async function uploadChatFile(path: string, file: File, orderId?: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  if (orderId) fd.append('order_id', orderId);
  const token = tokenStore.get('admin') || tokenStore.get('customer');
  const res = await fetch(`${(import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = (await res.json()).detail; } catch { /* */ }
    throw new Error(detail || `Upload failed (${res.status})`);
  }
  return ((await res.json()) as { url: string }).url;
}
/** Recorded audio → server transcodes to MP3, returns its URL. Guests pass the order UUID. */
export const uploadAudio = (file: File, orderId?: string) => uploadChatFile('/uploads/audio', file, orderId);
/** Photo / screenshot attached in chat → returns its URL. Guests pass the order UUID. */
export const uploadChatImage = (file: File, orderId?: string) => uploadChatFile('/uploads/chat-image', file, orderId);

/* ─── Public runtime config (WhatsApp / call numbers, etc.) ─── */
export const fetchPublicConfig = () => api.get<{ whatsapp_phone: string; call_phone: string }>('/config');

/* ─── Admin: contact settings (owner-editable numbers) ─── */
export interface ContactSettings {
  whatsapp_phone: string;
  call_phone: string;
}
export const getContactSettings = () =>
  api.get<ContactSettings>('/admin/settings/contact', { tokenSlot: 'admin' });
export const updateContactSettings = (input: ContactSettings) =>
  api.put<ContactSettings>('/admin/settings/contact', input, { tokenSlot: 'admin' });

/* ─── Image upload ─── */
export async function uploadImage(file: File, kind: 'product' | 'color' = 'product'): Promise<string> {
  const path = kind === 'color' ? '/uploads/color-photo' : '/uploads/image';
  const fd = new FormData();
  fd.append('file', file);
  // We can't reuse `api.post` (it auto-stringifies bodies); fall through to
  // a raw fetch with the admin token attached so the response shape stays
  // consistent with the rest of the resources module.
  const token = tokenStore.get('admin');
  const res = await fetch(`${(import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try { detail = (await res.json()).detail; } catch { /* */ }
    throw new Error(detail || `Upload failed (${res.status})`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

/* ─── Analytics ─── */
/** Anonymous-friendly. The server fills `customer_id` from the bearer token if one is present. */
export const ingestAnalyticsEvent = (event: AnalyticsEventInDTO) =>
  api.post<void>('/analytics/events', event, { tokenSlot: 'customer' });

export const ingestAnalyticsBatch = (events: AnalyticsEventInDTO[]) =>
  api.post<void>('/analytics/events/batch', { events }, { tokenSlot: 'customer' });

/** Admin-only. The Dashboard reads from this; period mirrors the legacy local-stat semantics. */
export const fetchStats = (params: {
  period: StatsPeriod;
  from?: string;
  to?: string;
}) => {
  const qs = new URLSearchParams();
  qs.set('period', params.period);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return api.get<StatsDTO>(`/stats?${qs.toString()}`, { tokenSlot: 'admin' });
};
