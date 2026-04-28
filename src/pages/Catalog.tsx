import { useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Product } from '../data/products';
import { cn } from '../utils/cn';
import { ShoppingBag, SlidersHorizontal, Filter, ArrowRight, Compass, Check, X, Ruler, MessageCircle, Send } from 'lucide-react';
import { LiquidButton } from '../components/LiquidButton';
import { useStore } from '../store/useStore';
import { formatPhoneInput, isValidName, isValidPhone, sanitizeNameInput } from '../utils/format';

// categoryList is now built dynamically inside the component

/* ── Falling letters animation ── */
const letterExitVariants = {
  initial: { y: 0, opacity: 1, rotate: 0 },
  exit: (i: number) => ({
    y: [0, -8, 60 + Math.random() * 40],
    opacity: [1, 1, 0],
    rotate: (Math.random() - 0.5) * 90,
    x: (Math.random() - 0.5) * 30,
    transition: {
      duration: 0.5,
      delay: i * 0.03,
      ease: [0.36, 0, 0.66, -0.56],
    },
  }),
};

const letterEnterVariants = {
  initial: (i: number) => ({
    y: -40 - Math.random() * 30,
    opacity: 0,
    rotate: (Math.random() - 0.5) * 45,
  }),
  animate: (i: number) => ({
    y: 0,
    opacity: 1,
    rotate: 0,
    transition: {
      delay: i * 0.035,
      type: 'spring',
      stiffness: 300,
      damping: 18,
    },
  }),
};

function FallingTitle({ text }: { text: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={text}
        className="inline-flex overflow-hidden"
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {text.split('').map((char, i) => (
          <motion.span
            key={`${text}-${i}`}
            custom={i}
            variants={{
              initial: letterEnterVariants.initial(i),
              animate: letterEnterVariants.animate(i),
              exit: letterExitVariants.exit(i),
            }}
            className="inline-block"
            style={{ whiteSpace: char === ' ' ? 'pre' : undefined }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}

// Random initial tilt directions for the "tumbler" drop-in effect
const dropVariants = [
  { rotate: -8, x: -30 },
  { rotate: 6, x: 20 },
  { rotate: -5, x: -15 },
  { rotate: 9, x: 25 },
  { rotate: -7, x: -20 },
  { rotate: 5, x: 15 },
];

function TumblerCard({ product, index, onOrder }: { product: Product; index: number; onOrder: (e: React.MouseEvent, product: Product) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-150, 150], [12, -12]);
  const rotateY = useTransform(x, [-150, 150], [-12, 12]);

  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 20 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 20 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const drop = dropVariants[index % dropVariants.length];

  return (
    <motion.div
      key={product.id}
      initial={{
        opacity: 0,
        y: -120,
        rotate: drop.rotate,
        x: drop.x,
        scale: 0.7,
      }}
      animate={{
        opacity: 1,
        y: 0,
        rotate: 0,
        x: 0,
        scale: 1,
      }}
      transition={{
        delay: index * 0.12,
        type: 'spring',
        stiffness: 120,
        damping: 14,
        mass: 0.8,
      }}
      className="group"
      style={{ perspective: 800 }}
    >
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          transformStyle: 'preserve-3d',
        }}
        whileTap={{ scale: 0.95, rotateX: 4, rotateY: -4 }}
        className="will-change-transform"
      >
        <Link to={`/product/${product.id}`}>
          <div
            className="relative aspect-square mb-4 bg-surface rounded-2xl overflow-hidden transition-shadow duration-300"
            style={{
              boxShadow: '0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            {/* Convex highlight overlay */}
            <div
              className="absolute inset-0 z-10 pointer-events-none rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.25) 0%, transparent 60%)',
              }}
            />
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
            />
          </div>

          <div className="px-1">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold leading-tight">{product.name}</h3>
                <p className="text-xs opacity-40 tracking-wider uppercase mt-0.5">{product.sku}</p>
                {product.inStock === false ? (
                  <span className="text-[10px] text-red-500 font-bold">Нет в наличии</span>
                ) : product.quantity !== undefined && product.quantity > 0 ? (
                  <span className="text-[10px] text-green-600 font-bold">В наличии: {product.quantity} шт.</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{product.price} ₽</span>
                <button
                  onClick={(e) => onOrder(e, product)}
                  className="w-10 h-10 bg-primary text-primary-inv rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-md"
                >
                  <ShoppingBag size={16} />
                </button>
              </div>
            </div>
            {/* Color dots */}
            <div className="flex items-center gap-1.5 mt-2">
              {product.colorVariants.map((variant, i) => (
                <span
                  key={i}
                  className={cn(
                    "w-3 h-3 rounded-full border",
                    i === 0 ? "border-primary/40 ring-1 ring-primary/20 ring-offset-1" : "border-primary/10"
                  )}
                  style={{ backgroundColor: variant.hex }}
                />
              ))}
            </div>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  );
}

/* ── Individual Order Form ── */
function CustomOrderForm() {
  const navigate = useNavigate();
  const { placeCustomOrder } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [depth, setDepth] = useState('');
  const [desc, setDesc] = useState('');
  const [sent, setSent] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const nameValid = isValidName(name);
  const phoneValid = isValidPhone(phone);
  const sizesValid = !!(width && height && depth);
  const formValid = nameValid && phoneValid && sizesValid;

  const fc = 'w-full bg-surface rounded-2xl px-5 py-3 border border-primary/10 shadow-sm focus:ring-2 focus:ring-primary outline-none text-sm';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNameTouched(true);
    setPhoneTouched(true);
    if (!formValid) return;
    placeCustomOrder(name.trim(), phone.trim(), width, height, depth, desc.trim());
    setSent(true);
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface rounded-3xl shadow-sm p-8 text-center max-w-md mx-auto"
      >
        <div className="inline-flex bg-green-50 rounded-full p-4 mb-4">
          <Check size={28} className="text-green-600" />
        </div>
        <h3 className="text-xl font-bold mb-2">Заявка отправлена!</h3>
        <p className="text-sm opacity-50 mb-6">Администратор получил ваш индивидуальный заказ и скоро ответит в чате</p>
        <button
          onClick={() => navigate('/chat')}
          className="bg-primary text-primary-inv rounded-full px-6 py-3 font-bold flex items-center justify-center gap-2 mx-auto hover:scale-105 active:scale-95 transition-transform"
        >
          <MessageCircle size={18} />
          Открыть чат
        </button>
      </motion.div>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="bg-surface rounded-3xl shadow-sm p-6 max-w-md mx-auto space-y-4"
    >
      <div className="text-center mb-2">
        <div className="inline-flex bg-primary/5 rounded-full p-3 mb-3">
          <Ruler size={24} className="opacity-50" />
        </div>
        <h3 className="text-lg font-bold">Индивидуальный заказ</h3>
        <p className="text-xs opacity-40 mt-1">Укажите размеры и мы изготовим мебель для вас</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold opacity-50 mb-1 block">Имя *</label>
          <input
            value={name}
            onChange={(e) => setName(sanitizeNameInput(e.target.value))}
            onBlur={() => setNameTouched(true)}
            placeholder="Ваше имя"
            className={cn(fc, nameTouched && !nameValid && 'border-red-400 focus:ring-red-500')}
            required
          />
          {nameTouched && !nameValid && (
            <p className="text-[10px] text-red-500 mt-1">Минимум 2 буквы</p>
          )}
        </div>
        <div>
          <label className="text-xs font-bold opacity-50 mb-1 block">Телефон *</label>
          <input
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            onBlur={() => setPhoneTouched(true)}
            placeholder="+7 (999) 123-45-67"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={cn(fc, phoneTouched && !phoneValid && 'border-red-400 focus:ring-red-500')}
            required
          />
          {phoneTouched && !phoneValid && (
            <p className="text-[10px] text-red-500 mt-1">Минимум 9 цифр</p>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold opacity-50 mb-2 block">Размеры (см) *</label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <span className="text-[10px] opacity-30 block mb-1 text-center">Ширина</span>
            <input type="number" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="120" className={fc + ' text-center'} required />
          </div>
          <div>
            <span className="text-[10px] opacity-30 block mb-1 text-center">Глубина</span>
            <input type="number" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="60" className={fc + ' text-center'} required />
          </div>
          <div>
            <span className="text-[10px] opacity-30 block mb-1 text-center">Высота</span>
            <input type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="80" className={fc + ' text-center'} required />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold opacity-50 mb-1 block">Описание пожеланий</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Опишите что вы хотите..." rows={3} className={fc + ' resize-none'} />
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-xs">
          <LiquidButton width={240} height={54}>
            <span className="flex items-center gap-2"><Send size={18} /> Отправить заявку</span>
          </LiquidButton>
        </div>
      </div>
    </motion.form>
  );
}

export function Catalog() {
  const navigate = useNavigate();
  const { addToCart, allProducts: products, recommendations, allCategories: storeCats } = useStore();
  const categoryList = storeCats.map((cat) => ({ key: cat, label: cat }));
  const [showOrderToast, setShowOrderToast] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Все');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [activeRecCat, setActiveRecCat] = useState(0);
  const [priceFilterOpen, setPriceFilterOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState('');

  const handleOrder = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
    setShowOrderToast(true);
    setTimeout(() => setShowOrderToast(false), 2000);
  };

  const toggleSort = () => {
    setSortOrder((prev) => prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none');
  };

  let filtered = activeCategory === 'Все'
    ? [...products]
    : products.filter((p) => p.category === activeCategory);

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter((p) =>
      p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }

  if (maxPrice.trim()) {
    const maxP = Number(maxPrice);
    if (!isNaN(maxP) && maxP > 0) {
      filtered = filtered.filter((p) => p.price <= maxP);
    }
  }

  if (sortOrder === 'asc') filtered.sort((a, b) => a.price - b.price);
  if (sortOrder === 'desc') filtered.sort((a, b) => b.price - a.price);

  // Recommendations: use admin-configured categories, fallback to default
  const defaultRecs = [
    { id: '_default', name: 'Кровати', productIds: products.filter(p => p.category === 'Кровати').map(p => p.id) },
    { id: '_default2', name: 'Комоды', productIds: products.filter(p => p.category === 'Комоды').map(p => p.id) },
    { id: '_default3', name: 'Консоли', productIds: products.filter(p => p.category === 'Консоли').map(p => p.id) },
  ];
  const recCategories = recommendations.length > 0 ? recommendations : defaultRecs;

  return (
    <div className="pb-20">
      <AnimatePresence>
        {showOrderToast && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-primary text-primary-inv pill px-6 py-3 flex items-center gap-3 shadow-xl"
          >
            <Check size={18} />
            <span className="text-sm font-bold">Добавлено в корзину</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero banner with background image — from reference */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-[2rem] overflow-hidden mb-10 aspect-[16/10] md:aspect-[16/7]"
      >
        <img
          src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&q=80&w=1200"
          alt="интерьер"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/30 to-background/70" />
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6">
          <h2 className="text-5xl md:text-7xl font-bold tracking-tight mb-2">исследуй</h2>
          <p className="opacity-60 text-sm md:text-base mb-5 max-w-xs">
            Отражение вашего стиля, вкуса и индивидуальности
          </p>
          <Link
            to="#catalog-grid"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('catalog-grid')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-primary text-primary-inv rounded-full px-6 py-3 flex items-center gap-2 text-sm font-bold shadow-lg hover:scale-105 transition-transform"
          >
            <Compass size={16} />
            Узнать больше
          </Link>
        </div>
      </motion.div>

      {/* "Рекомендуем для вас" — horizontal scroll section from reference */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-2xl font-bold">Рекомендуем для вас</h3>
          <Link to="#catalog-grid" className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
            <ArrowRight size={20} />
          </Link>
        </div>

        {/* Category pills for recommendations */}
        <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide pb-1">
          {recCategories.map((rec, i) => (
            <button
              key={rec.id}
              onClick={() => setActiveRecCat(i)}
              className={cn(
                "px-4 py-2 rounded-full border text-sm whitespace-nowrap transition-all cursor-pointer",
                i === activeRecCat ? "border-primary bg-primary/5 font-bold" : "border-primary/10 hover:bg-primary/5"
              )}
            >
              {rec.name}
            </button>
          ))}
        </div>

        {/* Horizontal scroll cards */}
        <div className="flex gap-3 sm:gap-5 overflow-x-auto pb-4 -mx-2 px-2 snap-x snap-mandatory scrollbar-hide">
          {(recCategories[activeRecCat]?.productIds || []).map(pid => {
            const product = products.find(p => p.id === pid);
            if (!product) return null;
            return (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="flex-shrink-0 w-32 sm:w-44 snap-start group"
              >
                <div className="aspect-square bg-surface rounded-2xl overflow-hidden shadow-sm mb-3 group-hover:shadow-md transition-shadow">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <h4 className="text-sm font-bold leading-tight">{product.name}</h4>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-base font-bold">{product.price} ₽</span>
                  <div className="flex items-center gap-1">
                    {product.colorVariants.map((variant, vi) => (
                      <span
                        key={vi}
                        className="w-2.5 h-2.5 rounded-full border border-primary/10"
                        style={{ backgroundColor: variant.hex }}
                      />
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Search / Filter / Sort icon row */}
      <div id="catalog-grid" className="space-y-3 mb-8">
        {/* Icons row with animated search */}
        <div className="flex items-center gap-3">
          {/* Animated search toggle — magnifying glass → input */}
          <div className="relative flex items-center shrink-0" style={{ height: 40 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
              placeholder={searchOpen ? 'Поиск...' : ''}
              className={cn(
                "h-10 rounded-full border-2 border-terracotta bg-transparent outline-none text-terracotta font-bold transition-all duration-500",
                searchOpen ? "w-52 pl-5 pr-8 text-sm" : "w-10 pl-3 pr-3 text-[0px] cursor-pointer"
              )}
              style={{ caretColor: searchOpen ? '#8E392B' : 'transparent' }}
            />
            {/* Magnifying glass SVG — circle + handle */}
            <svg
              className="absolute pointer-events-none transition-all duration-500"
              style={searchOpen ? {
                left: 10,
                top: '50%',
                transform: 'translateY(-50%) scale(0)',
                opacity: 0,
                width: 20,
                height: 20,
              } : {
                left: 8,
                top: 8,
                transform: 'scale(1)',
                opacity: 1,
                width: 24,
                height: 24,
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8E392B"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="10" r="7" />
              <line x1="15.5" y1="15.5" x2="21" y2="21" />
            </svg>
            {searchQuery && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setSearchQuery(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-terracotta/50 hover:text-terracotta transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Price filter — expanding field */}
          <div className="relative flex items-center shrink-0" style={{ height: 40 }}>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              onFocus={() => setPriceFilterOpen(true)}
              onBlur={() => { if (!maxPrice) setPriceFilterOpen(false); }}
              placeholder={priceFilterOpen ? 'Цена до ₽' : ''}
              className={cn(
                "h-10 rounded-full border-2 bg-transparent outline-none font-bold transition-all duration-500",
                maxPrice ? "border-primary text-primary" : "border-primary/15 text-primary",
                priceFilterOpen ? "w-36 pl-5 pr-8 text-sm" : "w-10 pl-3 pr-3 text-[0px] cursor-pointer"
              )}
              style={{ caretColor: priceFilterOpen ? 'var(--primary)' : 'transparent' }}
              onClick={() => !priceFilterOpen && setPriceFilterOpen(true)}
            />
            {!priceFilterOpen && (
              <button
                onClick={() => setPriceFilterOpen(true)}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Filter size={17} className={maxPrice ? "text-primary" : "opacity-60"} />
              </button>
            )}
            {maxPrice && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setMaxPrice(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={toggleSort}
            className={cn(
              "w-10 h-10 rounded-full border flex items-center justify-center transition-all shrink-0",
              sortOrder !== 'none' ? "bg-primary text-primary-inv border-primary" : "border-primary/15 hover:bg-primary/5"
            )}
          >
            <SlidersHorizontal size={17} className={sortOrder !== 'none' ? "" : "opacity-60"} />
          </button>

          {sortOrder !== 'none' && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs opacity-50"
            >
              {sortOrder === 'asc' ? 'Цена ↑' : 'Цена ↓'}
            </motion.span>
          )}

          {maxPrice && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs opacity-50"
            >
              до {Number(maxPrice).toLocaleString('ru-RU')} ₽
            </motion.span>
          )}
        </div>

        {/* Active category title with falling letters */}
        <div className="h-10 flex items-center">
          <h3 className="text-2xl font-bold tracking-tight">
            <FallingTitle text={activeCategory} />
          </h3>
        </div>

        {/* Category pills — separate scrollable row */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {categoryList.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "px-4 py-2 pill border border-primary/10 text-sm whitespace-nowrap transition-all flex-shrink-0",
                activeCategory === cat.key ? "bg-primary text-primary-inv" : "hover:bg-primary/5"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Old search removed — now inline in icon row */}
      </div>

      {/* Product grid or Custom Order Form */}
      {activeCategory === 'Индивидуальные заказы' ? (
        <CustomOrderForm />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((product, index) => (
            <TumblerCard
              key={product.id}
              product={product}
              index={index}
              onOrder={handleOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
