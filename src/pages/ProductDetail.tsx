import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Star, ShoppingBag, ChevronLeft, ChevronRight, Check, X, Pipette } from 'lucide-react';
import { cn } from '../utils/cn';
import { useStore } from '../store/useStore';
import { LiquidButton } from '../components/LiquidButton';
import { dtoToProduct, getProduct as apiGetProduct } from '../api';
import type { Product } from '../data/products';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { allProducts: products, addToCart, toggleFavorite, isFavorite: isFav, trackEvent } = useStore();
  const [showOrderToast, setShowOrderToast] = useState(false);
  const [activeColor, setActiveColor] = useState(0);
  const [activeThumb, setActiveThumb] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pickedColor, setPickedColor] = useState<string | null>(null);

  // The catalog list ships a slim version of every product (no per-colour
  // photos[]) to keep payloads tiny. On the detail page we need the full
  // gallery, so fetch it once and prefer it over the cached slim copy.
  const [fullProduct, setFullProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGetProduct(id)
      .then((dto) => setFullProduct(dtoToProduct(dto)))
      .catch(() => {/* leave fullProduct null; we'll fall back to the slim cached version */});
  }, [id]);

  const product = fullProduct || products.find((p) => p.id === id);
  const isFavorite = product ? isFav(product.id) : false;

  useEffect(() => {
    if (product) trackEvent({ type: 'product_view', productId: product.id });
  }, [product?.id, trackEvent]);

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h2 className="text-3xl font-bold mb-4">Товар не найден</h2>
        <button
          onClick={() => navigate('/catalog')}
          className="bg-primary text-primary-inv pill px-8 py-3 font-bold"
        >
          Вернуться в каталог
        </button>
      </div>
    );
  }

  const handleOrder = () => {
    addToCart(product, activeColor);
    setShowOrderToast(true);
    setTimeout(() => setShowOrderToast(false), 2000);
  };

  // Current color variant
  const currentVariant = product.colorVariants[activeColor];
  const currentImage = currentVariant?.image || product.image;

  // Thumbnails: use per-color photos when the admin uploaded several. The
  // legacy fallback (`${url}&fit=crop&crop=…`) was an Unsplash trick that
  // breaks for the S3-backed catalog (the suffixed URL 404/403s on S3),
  // so we just show the single available image when there's no proper
  // multi-photo gallery.
  const variantPhotos = currentVariant?.photos;
  const thumbs = variantPhotos && variantPhotos.length > 0 ? variantPhotos : [currentImage];

  const handleColorChange = (index: number) => {
    setActiveColor(index);
    setActiveThumb(0);
  };

  const handleEyedropper = async () => {
    try {
      if ('EyeDropper' in window) {
        const dropper = new (window as any).EyeDropper();
        const result = await dropper.open();
        setPickedColor(result.sRGBHex);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="pb-36">
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

      {/* Top row: explicit back button on the left (catalog history is a
          breadcrumb the user expects), favourite toggle on the right. */}
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <button
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="bg-surface/80 backdrop-blur-sm p-2.5 sm:p-3 rounded-full shadow-sm hover:shadow-md transition-shadow"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          onClick={() => product && toggleFavorite(product.id)}
          aria-label="В избранное"
          className="bg-surface/80 backdrop-blur-sm p-2.5 sm:p-3 rounded-full shadow-sm hover:shadow-md transition-shadow"
        >
          <Star
            size={20}
            className={cn(
              'transition-colors',
              isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-primary/40'
            )}
          />
        </button>
      </div>

      {/* Product image with rotated price sticker */}
      <div>
            <div className="relative aspect-square max-w-lg mx-auto mb-4 bg-background rounded-[2rem] overflow-visible">
              <div className="w-full h-full rounded-[2rem] overflow-hidden shadow-sm">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={`${activeColor}-${activeThumb}`}
                    src={thumbs[activeThumb]}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                  />
                </AnimatePresence>
              </div>

              {/* Rotated price sticker */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: 12 }}
                transition={{ delay: 0.5, type: 'spring', bounce: 0.4 }}
                className="absolute bottom-8 right-[-8px] bg-background border border-primary/10 rounded-2xl px-5 py-3 shadow-lg rotate-[12deg]"
              >
                <span className="text-2xl font-bold text-terracotta">{product.price} ₽</span>
              </motion.div>
            </div>

            {/* Thumbnail carousel */}
            <div className="max-w-lg mx-auto flex items-center gap-3 mb-6 px-6">
              <button
                onClick={() => setActiveThumb(Math.max(0, activeThumb - 1))}
                className="text-primary/30 hover:text-primary transition-colors flex-shrink-0"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex gap-3 flex-1 justify-center py-1 px-1">
                {thumbs.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveThumb(i)}
                    className={cn(
                      "w-11 h-11 rounded-full overflow-hidden border-2 flex-shrink-0 transition-all duration-200",
                      i === activeThumb
                        ? "border-primary shadow-md scale-[1.15]"
                        : "border-transparent opacity-50 hover:opacity-100"
                    )}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>

              <button
                onClick={() => setActiveThumb(Math.min(thumbs.length - 1, activeThumb + 1))}
                className="text-primary/30 hover:text-primary transition-colors flex-shrink-0"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Color variant selector with names */}
            {product.colorVariants.length > 1 && (
              <div className="max-w-lg mx-auto mb-8 px-2">
                <span className="text-xs opacity-40 uppercase tracking-wider mb-2 block">цвет</span>
                <div className="flex gap-2 flex-wrap">
                  {product.colorVariants.map((variant, i) => (
                    <button
                      key={i}
                      onClick={() => handleColorChange(i)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full border-2 transition-all hover:scale-105",
                        i === activeColor
                          ? "border-primary shadow-md ring-2 ring-primary/20 ring-offset-1"
                          : "border-primary/10"
                      )}
                    >
                      <span className="w-6 h-6 rounded-full border border-primary/10 flex-shrink-0" style={{ backgroundColor: variant.hex }} />
                      {(variant as any).name && (
                        <span className="text-xs font-medium">{(variant as any).name}</span>
                      )}
                      <span className="text-[9px] opacity-30 font-mono">{variant.hex}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
      </div>

      {/* Product info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="max-w-lg mx-auto"
      >
        {/* Name */}
        <div className="mb-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight">
            {product.name}
          </h2>
        </div>

        {/* Description with toggle */}
        <div className="mb-6">
          <p className={cn(
            "text-sm opacity-60 leading-relaxed  transition-all",
            !expanded && "line-clamp-2"
          )}>
            {product.description}
          </p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm font-bold mt-1 hover:opacity-70 transition-opacity"
          >
            {expanded ? 'Скрыть —' : 'Подробнее +'}
          </button>
        </div>

        {/* Specs table with thumbnail */}
        <div className="flex gap-5 mb-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden shadow-sm flex-shrink-0 bg-surface">
            <img
              src={currentImage}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm self-center">
            {product.dimensions && (() => {
              const parts = product.dimensions!.split('×').map((d) => d.trim());
              const height = parts[2] || parts[0] || '—';
              const width = parts[1] || parts[0] || '—';
              return (
                <>
                  <span className="opacity-50">Высота</span>
                  <span className="font-bold text-right">{height}</span>
                  <span className="opacity-50">Ширина</span>
                  <span className="font-bold text-right">{width}</span>
                </>
              );
            })()}

            {product.weight && (
              <>
                <span className="opacity-50">Вес</span>
                <span className="font-bold text-right">{product.weight}</span>
              </>
            )}

            {product.material && (
              <>
                <span className="opacity-50">Материал</span>
                <span className="font-bold text-right">{product.material}</span>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Bottom bar — full-width on phones, compact right-aligned on larger screens */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="fixed bottom-28 left-4 right-4 sm:left-auto sm:right-6 z-40 flex justify-center sm:justify-end"
      >
        <LiquidButton onClick={handleOrder} width={200} height={52}>
          <span className="flex items-center gap-2">
            <ShoppingBag size={16} />
            В корзину · {product.price.toLocaleString('ru-RU')} ₽
          </span>
        </LiquidButton>
      </motion.div>
    </div>
  );
}
