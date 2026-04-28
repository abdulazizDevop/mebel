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
import { StoreProvider } from './store/useStore';
import { ThemeProvider } from './context/ThemeContext';
import { CartSidebar } from './components/CartSidebar';

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
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <Router>
          <Layout>
            <AnimatedRoutes />
            <CartSidebar />
          </Layout>
        </Router>
      </StoreProvider>
    </ThemeProvider>
  );
}

export default App;
