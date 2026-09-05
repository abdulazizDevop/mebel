import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { ProductDetail } from './pages/ProductDetail';
import { Favorites } from './pages/Favorites';
import { Profile } from './pages/Profile';
import { Admin } from './pages/Admin';
import { Chat } from './pages/Chat';
import { LegalPage } from './pages/Legal';
import { StoreProvider } from './store/useStore';
import { ThemeProvider } from './context/ThemeContext';
import { CartSidebar } from './components/CartSidebar';
import { UpdateBanner } from './components/UpdateBanner';
import { CookieConsent } from './components/CookieConsent';
import { metrikaHit } from './analytics/metrika';

const pageVariants = {
  initial: { opacity: 0, y: 24, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -16, scale: 0.99 },
};

const pageTransition = {
  type: 'tween' as const,
  ease: [0.25, 0.1, 0.25, 1],
  duration: 0.35,
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    // `onExitComplete` fires after the OLD page has fully animated away and
    // before the new one mounts — perfect moment to reset scroll without the
    // user seeing the old page's content fly past mid-transition.
    <AnimatePresence mode="wait" onExitComplete={() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransition}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/chat" element={<Chat />} />

          {/* Legal pages (152-ФЗ / 2300-1 / 38-ФЗ) — Russian only, texts in src/legal/documents.ts */}
          <Route path="/requisites" element={<LegalPage slug="requisites" />} />
          <Route path="/privacy" element={<LegalPage slug="privacy" />} />
          <Route path="/personal-data-consent" element={<LegalPage slug="personal-data-consent" />} />
          <Route path="/cookies" element={<LegalPage slug="cookies" />} />
          <Route path="/marketing-consent" element={<LegalPage slug="marketing-consent" />} />
          <Route path="/offer" element={<LegalPage slug="offer" />} />
          <Route path="/delivery-payment" element={<LegalPage slug="delivery-payment" />} />
          <Route path="/returns" element={<LegalPage slug="returns" />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

/** SPA page views for Яндекс.Метрика — no-op until the visitor allowed analytics. */
function MetrikaRouteHits() {
  const location = useLocation();
  useEffect(() => {
    metrikaHit(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <Router>
          {/* PWA: registers /sw.js and shows a small banner when a new
              bundle has been deployed. One tap on "Обновить" swaps the new
              service worker into control and reloads — no reinstall, no
              "remove from Home Screen" needed. */}
          <UpdateBanner />
          <MetrikaRouteHits />
          <Layout>
            <AnimatedRoutes />
            <CartSidebar />
          </Layout>
          <CookieConsent />
        </Router>
      </StoreProvider>
    </ThemeProvider>
  );
}

export default App;
