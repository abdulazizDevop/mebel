import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Product, products as defaultProducts } from '../data/products';
import {
  ApiError,
  CategoryDTO,
  adminListOrders as apiAdminListOrders,
  changeAdminPassword as apiChangeAdminPassword,
  createCategory as apiCreateCategory,
  createProduct as apiCreateProduct,
  deleteCategory as apiDeleteCategory,
  deleteProduct as apiDeleteProduct,
  dtoToOrder,
  dtoToProduct,
  fetchAdminMe,
  fetchCustomerMe,
  ingestAnalyticsEvent as apiIngestAnalyticsEvent,
  listCategories as apiListCategories,
  listProducts as apiListProducts,
  loginAdmin as apiLoginAdmin,
  loginCustomer as apiLoginCustomer,
  logoutAdmin as apiLogoutAdmin,
  logoutCustomer as apiLogoutCustomer,
  myOrders as apiMyOrders,
  placeOrder as apiPlaceOrder,
  productToCreateDto,
  productToUpdateDto,
  registerCustomer as apiRegisterCustomer,
  sendChatAsAdmin as apiSendChatAsAdmin,
  sendChatAsCustomer as apiSendChatAsCustomer,
  subscribeToPush,
  tokenStore,
  unsubscribeFromPush,
  updateProduct as apiUpdateProduct,
} from '../api';

// Browser-tab session id — keeps anonymous analytics rows correlatable so the
// admin can tell "this is one visitor, not 30" even before they log in.
function getOrCreateSessionId(): string {
  try {
    let id = sessionStorage.getItem('mebel_session_id');
    if (!id) {
      id = (crypto as Crypto).randomUUID();
      sessionStorage.setItem('mebel_session_id', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/* ─── Types ─── */
export interface CartItem {
  product: Product;
  qty: number;
  colorIndex: number;
}

export interface ChatMessage {
  id: string;
  from: 'client' | 'admin';
  text: string;
  time: string;
  timestamp: number;
}

export interface Order {
  id: string;
  name: string;
  phone: string;
  items: CartItem[];
  total: number;
  chat: ChatMessage[];
  createdAt: string;
  createdTimestamp: number;
}

export interface AdminCredentials {
  name: string;
  password: string;
}

export interface UserRole {
  id: string;
  name: string;
  password: string;
  role: 'admin' | 'manager' | 'viewer';
  sections: string[];
  createdAt: string;
}

export interface RegisteredUser {
  id: string;
  name: string;
  password: string;
  createdAt: string;
}

export interface FavoriteItem {
  productId: string;
  addedAt: number;
  userId?: string;
}

export interface AnalyticsEvent {
  type: 'visit' | 'cart_add' | 'cart_checkout' | 'chat_open' | 'favorite_add' | 'favorite_remove' | 'product_view';
  timestamp: number;
  productId?: string;
  userId?: string;
  data?: Record<string, any>;
}

export interface RecommendationCategory {
  id: string;
  name: string;
  productIds: string[];
}

export interface ProductColorEntry {
  hex: string;
  name: string;
  image: string;
  photos: string[];
}

/* ─── DB helpers (localStorage "SQL") ─── */
const DB_KEYS = {
  admin: 'rooomebel_admin',
  users: 'rooomebel_users',
  analytics: 'rooomebel_analytics',
  favorites: 'rooomebel_favorites',
  orders: 'rooomebel_orders',
  products: 'rooomebel_products',
  notifications: 'rooomebel_notifications',
  recommendations: 'rooomebel_recommendations',
  categories: 'rooomebel_categories',
  session: 'rooomebel_session',
  registeredUsers: 'rooomebel_registered_users',
  userSession: 'rooomebel_user_session',
} as const;

function dbGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function dbSet(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ─── All admin sections ─── */
export const ALL_SECTIONS = ['dashboard', 'orders', 'products', 'recommendations', 'users', 'settings'] as const;
export type SectionName = typeof ALL_SECTIONS[number];

/* ─── Context type ─── */
interface StoreContextType {
  // Cart
  cart: CartItem[];
  addToCart: (product: Product, colorIndex?: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;

  // Orders
  orders: Order[];
  placeOrder: (name: string, phone: string) => Promise<string | null>;
  placeCustomOrder: (
    name: string,
    phone: string,
    width: string,
    height: string,
    depth: string,
    description: string,
  ) => Promise<string | null>;
  activeOrderId: string | null;
  setActiveOrderId: (id: string | null) => void;
  sendMessage: (orderId: string, from: 'client' | 'admin', text: string) => Promise<void>;
  /** Insert a chat message into a known order's `chat` list, deduped by id.
   *  Used by the live WebSocket subscriber to land server-broadcast messages. */
  appendChatMessage: (orderId: string, msg: ChatMessage) => void;
  refreshOrders: () => Promise<void>;

  // Products
  allProducts: Product[];
  addProduct: (product: Product) => void;
  removeProduct: (productId: string) => void;
  updateProduct: (productId: string, updates: Partial<Product>) => void;

  // Admin auth (server-side via FastAPI)
  adminCredentials: AdminCredentials | null;
  registerAdmin: (name: string, password: string) => void;
  loginAdmin: (name: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  updateAdminCredentials: (
    currentPassword: string,
    newName: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;

  // User roles
  users: UserRole[];
  addUser: (user: Omit<UserRole, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, updates: Partial<UserRole>) => void;
  removeUser: (id: string) => void;

  // Favorites
  favorites: FavoriteItem[];
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;

  // Analytics — events are forwarded to the backend; the Dashboard reads
  // server-aggregated stats via `fetchStats()` (see `src/api/resources.ts`).
  trackEvent: (event: Omit<AnalyticsEvent, 'timestamp'>) => void;

  // Notifications
  notifications: { id: string; text: string; time: string; read: boolean; orderId?: string }[];
  addNotification: (text: string, orderId?: string) => void;
  markNotificationRead: (id: string) => void;
  unreadCount: number;

  // Recommendations
  recommendations: RecommendationCategory[];
  addRecommendation: (name: string, productIds: string[]) => void;
  updateRecommendation: (id: string, updates: Partial<RecommendationCategory>) => void;
  removeRecommendation: (id: string) => void;

  // Categories
  customCategories: string[];
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;
  allCategories: string[];

  // Admin session (global)
  adminSession: { name: string; role: 'admin' | 'manager' | 'viewer'; sections: string[] } | null;
  setAdminSession: (session: { name: string; role: 'admin' | 'manager' | 'viewer'; sections: string[] } | null) => void;
  logoutAdmin: () => void;

  // User session (regular users)
  userSession: { name: string } | null;
  setUserSession: (session: { name: string } | null) => void;
  logoutUser: () => void;
  registeredUsers: RegisteredUser[];
  registerUser: (name: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginUser: (name: string, password: string) => Promise<{ ok: boolean; error?: string }>;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>(() => dbGet(DB_KEYS.orders, []));
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>(() => {
    // Last successful API fetch is cached so the catalog renders instantly
    // on reload before the network round-trip finishes.
    const saved = dbGet<Product[] | null>(DB_KEYS.products, null);
    return saved && saved.length > 0 ? saved : defaultProducts;
  });
  const [categoriesData, setCategoriesData] = useState<CategoryDTO[]>(
    () => dbGet<CategoryDTO[]>('rooomebel_api_categories', []),
  );
  const [adminCredentials, setAdminCredentials] = useState<AdminCredentials | null>(() =>
    dbGet(DB_KEYS.admin, null)
  );
  const [users, setUsers] = useState<UserRole[]>(() => dbGet(DB_KEYS.users, []));
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => dbGet(DB_KEYS.favorites, []));
  const [notifications, setNotifications] = useState<{ id: string; text: string; time: string; read: boolean; orderId?: string }[]>(
    () => dbGet(DB_KEYS.notifications, [])
  );
  const [recommendations, setRecommendations] = useState<RecommendationCategory[]>(
    () => dbGet(DB_KEYS.recommendations, [])
  );
  const [adminSession, setAdminSession] = useState<{ name: string; role: 'admin' | 'manager' | 'viewer'; sections: string[] } | null>(
    () => dbGet(DB_KEYS.session, null)
  );

  // Total wipe on logout. Drops EVERYTHING from localStorage and
  // sessionStorage except the theme preference, then hard-reloads so React
  // in-memory state (orders, cart, products cache, favorites, analytics,
  // notifications, etc.) is also reset. Without this, switching profiles in
  // the same browser would leak the previous user's chat and orders into the
  // new session before the API refresh lands.
  //
  // Also tears down the Web Push subscription so the next user on this
  // browser doesn't get notifications addressed to the previous account.
  const wipeAllAndReload = (redirectTo: string = '/') => {
    void (async () => {
      try {
        await unsubscribeFromPush();
      } catch {
        /* best-effort */
      }
      try {
        const theme = localStorage.getItem('rooomebel_theme');
        localStorage.clear();
        sessionStorage.clear();
        if (theme) localStorage.setItem('rooomebel_theme', theme);
      } catch {
        /* ignore — private mode etc. */
      }
      window.location.replace(redirectTo);
    })();
  };

  const logoutAdmin = () => {
    apiLogoutAdmin();
    setAdminSession(null);
    wipeAllAndReload('/profile');
  };

  const [userSession, setUserSession] = useState<{ name: string } | null>(
    () => dbGet(DB_KEYS.userSession, null)
  );
  const logoutUser = () => {
    apiLogoutCustomer();
    setUserSession(null);
    wipeAllAndReload('/profile');
  };

  // Rehydrate sessions from JWT on first mount. The localStorage cache above
  // gives an instant render; this background call confirms the token is still
  // valid (and otherwise nukes the stale session).
  useEffect(() => {
    if (tokenStore.get('admin')) {
      fetchAdminMe()
        .then((me) => setAdminSession({
          name: me.name,
          role: me.role,
          sections: me.role === 'admin' ? [...ALL_SECTIONS] : me.sections,
        }))
        .catch(() => {
          tokenStore.clear('admin');
          setAdminSession(null);
        });
    }
    if (tokenStore.get('customer')) {
      fetchCustomerMe()
        .then((me) => setUserSession({ name: me.name }))
        .catch(() => {
          tokenStore.clear('customer');
          setUserSession(null);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>(
    () => dbGet(DB_KEYS.registeredUsers, [])
  );

  // Persist to localStorage
  useEffect(() => { dbSet(DB_KEYS.orders, orders); }, [orders]);
  useEffect(() => { dbSet(DB_KEYS.products, allProducts); }, [allProducts]);
  useEffect(() => { dbSet('rooomebel_api_categories', categoriesData); }, [categoriesData]);
  useEffect(() => { dbSet(DB_KEYS.users, users); }, [users]);
  useEffect(() => { dbSet(DB_KEYS.favorites, favorites); }, [favorites]);
  useEffect(() => { dbSet(DB_KEYS.notifications, notifications); }, [notifications]);
  useEffect(() => { dbSet(DB_KEYS.recommendations, recommendations); }, [recommendations]);
  useEffect(() => { dbSet(DB_KEYS.session, adminSession); }, [adminSession]);
  useEffect(() => { dbSet(DB_KEYS.userSession, userSession); }, [userSession]);
  useEffect(() => { dbSet(DB_KEYS.registeredUsers, registeredUsers); }, [registeredUsers]);

  // Track initial visit — fire a single `visit` event to the backend per
  // page-mount. Anonymous (no customer JWT) hits land with just session_id.
  useEffect(() => {
    apiIngestAnalyticsEvent({ type: 'visit', session_id: getOrCreateSessionId() }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adds an incoming chat message into the right order's `chat`, ignoring
  // duplicates so the WebSocket echo of a message we just sent doesn't land
  // twice. Defined as `useCallback` so it can sit in dependency arrays.
  const appendChatMessage = useCallback((orderId: string, msg: ChatMessage) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        if (o.chat.some((c) => c.id === msg.id)) return o;
        return { ...o, chat: [...o.chat, msg] };
      }),
    );
  }, []);

  // Pulls the right order list depending on which JWT is present:
  // admin sees everyone's orders, a customer sees their own, a guest sees nothing.
  const refreshOrders = useCallback(async () => {
    try {
      if (tokenStore.get('admin')) {
        const dtos = await apiAdminListOrders();
        setOrders(dtos.map(dtoToOrder));
      } else if (tokenStore.get('customer')) {
        const dtos = await apiMyOrders();
        setOrders(dtos.map(dtoToOrder));
      }
    } catch {
      /* keep whatever we had cached */
    }
  }, []);

  // Load products + categories from the API on mount. The localStorage
  // cache above provides the initial render; this call refreshes it.
  useEffect(() => {
    apiListProducts()
      .then((dtos) => setAllProducts(dtos.map(dtoToProduct)))
      .catch(() => {
        // Network down or backend not running. Local cache + seed data
        // already populated `allProducts`, so the catalog still renders.
      });
    apiListCategories()
      .then(setCategoriesData)
      .catch(() => {});
    refreshOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a session changes (login or logout), pull the right order list.
  useEffect(() => {
    refreshOrders();
  }, [adminSession?.name, userSession?.name, refreshOrders]);

  // Best-effort Web Push subscription whenever a session is active. Browsers
  // that already granted permission auto-subscribe silently; otherwise the
  // user gets a permission prompt the first time they log in.
  useEffect(() => {
    if (!adminSession && !userSession) return;
    subscribeToPush().catch(() => {});
  }, [adminSession?.name, userSession?.name]);

  // Fire-and-forget POST to the backend. Failures are swallowed because we
  // do NOT want a flaky analytics endpoint to break the storefront UX.
  const trackEvent = useCallback((event: Omit<AnalyticsEvent, 'timestamp'>) => {
    apiIngestAnalyticsEvent({
      type: event.type,
      product_id: event.productId,
      session_id: getOrCreateSessionId(),
      data: event.data,
    }).catch(() => {});
  }, []);

  // Cart
  const addToCart = (product: Product, colorIndex = 0) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { product, qty: 1, colorIndex }];
    });
    setCartOpen(true);
    trackEvent({ type: 'cart_add', productId: product.id });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  // Orders
  const placeOrder = async (name: string, phone: string): Promise<string | null> => {
    try {
      const dto = await apiPlaceOrder({
        customer_name: name,
        customer_phone: phone,
        items: cart.map((c) => ({
          product_id: c.product.id,
          qty: c.qty,
          color_index: c.colorIndex,
        })),
      });
      const order = dtoToOrder(dto);
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      setActiveOrderId(order.id);
      clearCart();
      setCartOpen(false);
      trackEvent({ type: 'cart_checkout', data: { total: order.total, itemCount: order.items.length } });
      addNotification(`Новый заказ от ${name} на ${order.total} ₽`, order.id);
      return order.id;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Network error';
      alert(`Не удалось оформить заказ: ${msg}`);
      return null;
    }
  };

  const placeCustomOrder = async (
    name: string,
    phone: string,
    width: string,
    height: string,
    depth: string,
    description: string,
  ): Promise<string | null> => {
    const dims = `${width} × ${depth} × ${height} см`;
    const note = `Размеры: ${dims}${description ? `\nОписание: ${description}` : ''}`;
    try {
      const dto = await apiPlaceOrder({
        customer_name: name,
        customer_phone: phone,
        items: [],
        note,
      });
      const order = dtoToOrder(dto);
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      setActiveOrderId(order.id);
      addNotification(`Индивидуальный заказ от ${name}`, order.id);
      return order.id;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Network error';
      alert(`Не удалось оформить заказ: ${msg}`);
      return null;
    }
  };

  const sendMessage = async (orderId: string, from: 'client' | 'admin', text: string): Promise<void> => {
    try {
      const sender = from === 'admin' ? apiSendChatAsAdmin : apiSendChatAsCustomer;
      const msgDto = await sender(orderId, text);
      const created = new Date(msgDto.created_at);
      const msg: ChatMessage = {
        id: msgDto.id,
        from: msgDto.sender,
        text: msgDto.text,
        time: created.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        timestamp: created.getTime(),
      };
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, chat: [...o.chat, msg] } : o)));
      if (from === 'client') {
        trackEvent({ type: 'chat_open', data: { orderId } });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Network error';
      alert(`Не удалось отправить сообщение: ${msg}`);
    }
  };

  // Products — server-side. Mutators fire-and-forget the API call and
  // update local state on success; failures show an alert. This keeps the
  // existing void signature so Admin.tsx callers don't need to be rewritten.
  const addProduct = (product: Product) => {
    apiCreateProduct(productToCreateDto(product, categoriesData))
      .then((dto) => setAllProducts((prev) => [dtoToProduct(dto), ...prev]))
      .catch((e) => {
        const msg = e instanceof ApiError ? e.message : 'Network error';
        alert(`Не удалось создать товар: ${msg}`);
      });
  };
  const removeProduct = (productId: string) => {
    apiDeleteProduct(productId)
      .then(() => setAllProducts((prev) => prev.filter((p) => p.id !== productId)))
      .catch((e) => {
        const msg = e instanceof ApiError ? e.message : 'Network error';
        alert(`Не удалось удалить товар: ${msg}`);
      });
  };
  const updateProduct = (productId: string, updates: Partial<Product>) => {
    apiUpdateProduct(productId, productToUpdateDto(updates, categoriesData))
      .then((dto) => setAllProducts((prev) => prev.map((p) => (p.id === productId ? dtoToProduct(dto) : p))))
      .catch((e) => {
        const msg = e instanceof ApiError ? e.message : 'Network error';
        alert(`Не удалось сохранить товар: ${msg}`);
      });
  };

  // Admin auth — server-side. Local-only sub-admins are deprecated until
  // the user-management API endpoints land in a later phase.
  const registerAdmin = (name: string, password: string) => {
    // Legacy no-op: the bootstrap admin is created server-side by `python -m app.seed`.
    // Kept on the interface so older callers don't break. Real registration of
    // additional admins will move to a server-side endpoint in 2E-3.
    const creds = { name, password };
    setAdminCredentials(creds);
    dbSet(DB_KEYS.admin, creds);
  };

  const loginAdmin = async (
    name: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await apiLoginAdmin(name, password);
      const me = await fetchAdminMe();
      setAdminSession({
        name: me.name,
        role: me.role,
        // Admins implicitly have access to every section; manager/viewer use
        // their explicit list.
        sections: me.role === 'admin' ? [...ALL_SECTIONS] : me.sections,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Не удалось подключиться к серверу';
      return { ok: false, error: msg };
    }
  };

  const updateAdminCredentials = async (
    currentPassword: string,
    newName: string,
    newPassword: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const me = await apiChangeAdminPassword({
        current_password: currentPassword,
        new_name: newName.trim() || undefined,
        new_password: newPassword,
      });
      // Reflect the new name immediately in the UI.
      setAdminSession({
        name: me.name,
        role: me.role,
        sections: me.role === 'admin' ? [...ALL_SECTIONS] : me.sections,
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Не удалось изменить пароль';
      return { ok: false, error: msg };
    }
  };

  // Customer auth — server-side. Same JWT works on every device, so a
  // customer who places an order on their phone can log in on a desktop and
  // see it via /orders/me.
  const registerUser = async (
    name: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await apiRegisterCustomer(name, password);
      const me = await fetchCustomerMe();
      setUserSession({ name: me.name });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof ApiError
        ? (e.status === 409 ? 'Имя уже занято' : e.message)
        : 'Не удалось подключиться к серверу';
      return { ok: false, error: msg };
    }
  };

  const loginUser = async (
    name: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      await apiLoginCustomer(name, password);
      const me = await fetchCustomerMe();
      setUserSession({ name: me.name });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Не удалось подключиться к серверу';
      return { ok: false, error: msg };
    }
  };

  // User roles
  const addUser = (userData: Omit<UserRole, 'id' | 'createdAt'>) => {
    const user: UserRole = {
      ...userData,
      id: `USR-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toLocaleDateString('ru-RU'),
    };
    setUsers(prev => [...prev, user]);
  };

  const updateUser = (id: string, updates: Partial<UserRole>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  };

  const removeUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  // Favorites
  const toggleFavorite = (productId: string) => {
    setFavorites(prev => {
      const exists = prev.find(f => f.productId === productId);
      if (exists) {
        trackEvent({ type: 'favorite_remove', productId });
        return prev.filter(f => f.productId !== productId);
      }
      trackEvent({ type: 'favorite_add', productId });
      return [...prev, { productId, addedAt: Date.now() }];
    });
  };

  const isFavoriteCheck = (productId: string) => favorites.some(f => f.productId === productId);

  // Analytics is now server-aggregated — see `fetchStats()` in `src/api/resources.ts`
  // and the Dashboard component which reads from it.

  // Notifications
  const addNotification = useCallback((text: string, orderId?: string) => {
    const notif = {
      id: Date.now().toString(),
      text,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      read: false,
      orderId,
    };
    setNotifications(prev => [notif, ...prev]);

    // Browser push notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ROOOMEBEL', { body: text, icon: '/favicon.ico' });
    }
  }, []);

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Categories — server-side. The string-based `allCategoriesList` is
  // derived from the DTO list to keep the existing UI (which uses category
  // names in dropdowns) untouched. `customCategories` is now an alias for
  // every API-managed category so the admin UI treats them all as deletable.
  const apiCategoryNames = categoriesData.map((c) => c.name);
  const allCategoriesList = ['Все', ...apiCategoryNames];

  const addCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || categoriesData.some((c) => c.name === trimmed)) return;
    apiCreateCategory(trimmed)
      .then((cat) => setCategoriesData((prev) => [...prev, cat].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))))
      .catch((e) => {
        const msg = e instanceof ApiError ? e.message : 'Network error';
        alert(`Не удалось добавить категорию: ${msg}`);
      });
  };

  const removeCategory = (name: string) => {
    const cat = categoriesData.find((c) => c.name === name);
    if (!cat) return;
    apiDeleteCategory(cat.id)
      .then(() => setCategoriesData((prev) => prev.filter((c) => c.id !== cat.id)))
      .catch((e) => {
        const msg = e instanceof ApiError ? e.message : 'Network error';
        alert(`Не удалось удалить категорию: ${msg}`);
      });
  };

  // Recommendations
  const addRecommendation = (name: string, productIds: string[]) => {
    const rec: RecommendationCategory = {
      id: `REC-${Date.now().toString(36).toUpperCase()}`,
      name,
      productIds,
    };
    setRecommendations(prev => [...prev, rec]);
  };

  const updateRecommendation = (id: string, updates: Partial<RecommendationCategory>) => {
    setRecommendations(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRecommendation = (id: string) => {
    setRecommendations(prev => prev.filter(r => r.id !== id));
  };

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <StoreContext.Provider value={{
      cart, addToCart, removeFromCart, clearCart, cartOpen, setCartOpen,
      orders, placeOrder, placeCustomOrder, activeOrderId, setActiveOrderId, sendMessage, appendChatMessage, refreshOrders,
      allProducts, addProduct, removeProduct, updateProduct,
      adminCredentials, registerAdmin, loginAdmin, updateAdminCredentials,
      users, addUser, updateUser, removeUser,
      favorites, toggleFavorite, isFavorite: isFavoriteCheck,
      trackEvent,
      notifications, addNotification, markNotificationRead, unreadCount,
      recommendations, addRecommendation, updateRecommendation, removeRecommendation,
      customCategories: apiCategoryNames, addCategory, removeCategory, allCategories: allCategoriesList,
      adminSession, setAdminSession, logoutAdmin,
      userSession, setUserSession, logoutUser, registeredUsers, registerUser, loginUser,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
