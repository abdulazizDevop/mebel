import { motion } from 'framer-motion';
import { Home, ShoppingBag, Star, User, MessageCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../utils/cn';
import { useStore } from '../store/useStore';

const ALL_NAV_ITEMS = [
  { id: 'home', icon: Home, label: 'Главная', path: '/' },
  { id: 'catalog', icon: ShoppingBag, label: 'Каталог', path: '/catalog' },
  { id: 'favorites', icon: Star, label: 'Избранное', path: '/favorites' },
  { id: 'chat', icon: MessageCircle, label: 'Чат', path: '/chat' },
  { id: 'profile', icon: User, label: 'Профиль', path: '/profile' },
] as const;

export function Navbar() {
  const location = useLocation();
  const { cart, setCartOpen, orders, favorites, unreadCount, adminSession } = useStore();

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const hasOrders = orders.length > 0;
  const favCount = favorites.length;

  // Admin's chat lives inside /admin → Заказы, so the customer-facing /chat
  // tab is hidden for them. Профиль for an admin is the admin panel itself
  // (so the active-pill highlight stays put after a click instead of flashing
  // on /profile and then losing focus during the redirect to /admin).
  const navItems = adminSession
    ? ALL_NAV_ITEMS
        .filter((i) => i.id !== 'chat')
        .map((i) => (i.id === 'profile' ? { ...i, path: '/admin' } : i))
    : ALL_NAV_ITEMS;

  return (
    <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-1rem)]">
      <nav className="bg-primary pill px-1.5 py-1.5 sm:px-2 sm:py-2 flex items-center gap-0.5 sm:gap-1 shadow-2xl">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
                           (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                "relative flex items-center gap-2 px-3 sm:px-4 py-2 transition-all duration-300",
                isActive
                  ? "bg-background text-primary pill"
                  : "text-primary-inv opacity-70 hover:opacity-100"
              )}
            >
              <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />

              {/* Chat badge */}
              {item.id === 'chat' && (hasOrders || unreadCount > 0) && !isActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-terracotta rounded-full" />
              )}

              {/* Favorites count badge */}
              {item.id === 'favorites' && favCount > 0 && !isActive && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                  {favCount > 9 ? '9+' : favCount}
                </span>
              )}

              {isActive && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="hidden sm:inline text-sm font-bold"
                >
                  {item.label}
                </motion.span>
              )}
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-background pill -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </Link>
          );
        })}

        {/* Cart button */}
        {cartCount > 0 && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={() => setCartOpen(true)}
            className="relative ml-0.5 sm:ml-1 bg-terracotta text-white px-3 sm:px-4 py-2 pill flex items-center gap-1.5 sm:gap-2"
          >
            <ShoppingBag size={18} />
            <span className="text-sm font-bold">{cartCount}</span>
          </motion.button>
        )}
      </nav>
    </div>
  );
}
