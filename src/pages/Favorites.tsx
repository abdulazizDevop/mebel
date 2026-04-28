import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Trash2, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { cn } from '../utils/cn';

export function Favorites() {
  const navigate = useNavigate();
  const { favorites, toggleFavorite, allProducts, addToCart } = useStore();

  const favoriteProducts = favorites
    .map(f => allProducts.find(p => p.id === f.productId))
    .filter(Boolean) as typeof allProducts;

  const totalValue = favoriteProducts.reduce((s, p) => s + p.price, 0);

  if (favoriteProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="bg-primary/5 p-8 pill mb-8">
          <Heart size={48} className="text-primary opacity-20" />
        </div>
        <h2 className="text-3xl font-bold mb-4">Ваша коллекция</h2>
        <p className="opacity-50 max-w-xs mb-6">
          Сохраняйте предметы, которые вам нравятся. Ваше спокойное пространство начинается здесь.
        </p>
        <button
          onClick={() => navigate('/catalog')}
          className="bg-primary text-primary-inv rounded-full px-8 py-3 font-bold"
        >
          В каталог
        </button>
      </div>
    );
  }

  return (
    <div className="pb-32">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Избранное</h2>
          <p className="text-xs opacity-40 mt-0.5">{favoriteProducts.length} товаров · {totalValue.toLocaleString('ru-RU')} ₽</p>
        </div>
        <div className="bg-primary/5 rounded-full p-3">
          <Heart size={20} className="text-red-400 fill-red-400" />
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {favoriteProducts.map((product) => (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50, height: 0, marginBottom: 0 }}
              className="bg-surface rounded-2xl shadow-sm p-4 flex items-center gap-4"
            >
              <button
                onClick={() => navigate(`/product/${product.id}`)}
                className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0"
              >
                <img src={product.image} alt={product.name} className="w-full h-full object-cover hover:scale-110 transition-transform" />
              </button>
              <div className="flex-1 min-w-0">
                <button onClick={() => navigate(`/product/${product.id}`)} className="text-left">
                  <h4 className="font-bold text-sm truncate hover:opacity-70 transition-opacity">{product.name}</h4>
                </button>
                <p className="text-xs opacity-40">{product.category}</p>
                <p className="text-sm font-bold mt-1">{product.price.toLocaleString('ru-RU')} ₽</p>
                {product.colorVariants.length > 1 && (
                  <div className="flex gap-1 mt-1">
                    {product.colorVariants.map((v, i) => (
                      <span key={i} className="w-3.5 h-3.5 rounded-full border border-primary/10" style={{ backgroundColor: v.hex }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={() => addToCart(product)}
                  className="p-2.5 rounded-full bg-primary/5 hover:bg-primary hover:text-primary-inv transition-all"
                  title="В корзину"
                >
                  <ShoppingBag size={16} />
                </button>
                <button
                  onClick={() => toggleFavorite(product.id)}
                  className="p-2.5 rounded-full hover:bg-red-50 transition-colors"
                  title="Удалить"
                >
                  <Trash2 size={16} className="opacity-40 hover:text-red-500" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
