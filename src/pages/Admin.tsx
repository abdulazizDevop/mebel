import { useCallback, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Package, CheckCircle, Bell, MessageCircle, Send, ArrowLeft, Plus, Trash2,
  Edit3, X, Save, Check, Settings, Upload, Camera,
  Pipette, BarChart3, Users, ShoppingCart, Heart, Eye, Calendar,
  Shield, TrendingUp, Star, AlertCircle, LogOut, Wallet, UserPlus, KeyRound,
  Crown
} from 'lucide-react';
import { useStore, Order, RecommendationCategory, ALL_SECTIONS, SectionName } from '../store/useStore';
import { Product } from '../data/products';
import { cn } from '../utils/cn';
import { ImageCropModal } from '../components/ImageCropModal';
import {
  createAdminUser as apiCreateAdminUser,
  deleteAdminUser as apiDeleteAdminUser,
  dtoToChatMessage,
  dtoToProduct,
  fetchStats,
  getProduct as apiGetProduct,
  listAdminUsers as apiListAdminUsers,
  socketMessageToDto,
  updateAdminUser as apiUpdateAdminUser,
  uploadImage,
  useOrderChatSocket,
} from '../api';
import type { AdminUser, StatsDTO } from '../api';

/* ═══════════════════════════════════════════════════
   AdminChat — order-specific chat
   ═══════════════════════════════════════════════════ */
function AdminChat({ order, onBack }: { order: Order; onBack: () => void }) {
  const { sendMessage, appendChatMessage } = useStore();
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [order.chat.length]);

  const handleSocketMessage = useCallback(
    (raw: Parameters<typeof socketMessageToDto>[0]) => {
      appendChatMessage(order.id, dtoToChatMessage(socketMessageToDto(raw)));
    },
    [order.id, appendChatMessage],
  );
  const chatSocket = useOrderChatSocket(order.id, 'admin', handleSocketMessage);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (chatSocket.send(trimmed)) {
      setText('');
      return;
    }
    sendMessage(order.id, 'admin', trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col h-[70vh] sm:h-[60vh]">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="bg-background p-2.5 sm:p-3 rounded-full shadow-sm hover:shadow-md transition-shadow flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h3 className="font-bold truncate">{order.name}</h3>
          <p className="text-xs opacity-40 truncate">{order.phone} — {order.total} ₽</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-4 px-1 scrollbar-hide">
        {order.chat.map((msg) => {
          const isAdmin = msg.from === 'admin';
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2.5",
                isAdmin
                  ? "ml-auto bg-primary text-primary-inv rounded-br-md"
                  : "mr-auto bg-background border border-primary/10 rounded-bl-md"
              )}
            >
              <p className={cn(
                "text-[10px] font-bold mb-1 uppercase tracking-wide",
                isAdmin ? "text-primary-inv/60" : "text-primary/40"
              )}>
                {isAdmin ? 'Вы (админ)' : order.name}
              </p>
              <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
              <p className={cn(
                "text-[10px] mt-1",
                isAdmin ? "text-primary-inv/50 text-right" : "text-primary/30"
              )}>
                {msg.time}
              </p>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 pt-4 border-t border-primary/5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ответить клиенту..."
          className="flex-1 min-w-0 bg-background rounded-full px-5 py-3 border-none shadow-sm focus:ring-2 focus:ring-primary outline-none text-sm"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all flex-shrink-0",
            text.trim()
              ? "bg-primary text-primary-inv hover:scale-105 active:scale-95"
              : "bg-primary/10 text-primary/30"
          )}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ProductForm — Add / Edit Product (up to 35 photos, color picker + eyedropper + color name)
   ═══════════════════════════════════════════════════ */
function ProductForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Product;
  onSave: (p: Product) => void;
  onCancel: () => void;
}) {
  const { allCategories: storeCats } = useStore();
  const cats = storeCats.filter((c) => c !== 'Все');
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial?.price?.toString() || '');
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice?.toString() || '');
  const [category, setCategory] = useState(initial?.category || cats[0]);
  const [description, setDescription] = useState(initial?.description || '');
  const [images, setImages] = useState<string[]>(() => {
    if (!initial) return [];
    const imgs = [initial.image, ...initial.colorVariants.map(v => v.image)];
    return [...new Set(imgs)];
  });
  const [dimWidth, setDimWidth] = useState(() => {
    if (!initial?.dimensions) return '';
    const parts = initial.dimensions.split('×').map(s => s.trim().replace(/[^\d.]/g, ''));
    return parts[0] || '';
  });
  const [dimHeight, setDimHeight] = useState(() => {
    if (!initial?.dimensions) return '';
    const parts = initial.dimensions.split('×').map(s => s.trim().replace(/[^\d.]/g, ''));
    return parts[2] || '';
  });
  const [dimDepth, setDimDepth] = useState(() => {
    if (!initial?.dimensions) return '';
    const parts = initial.dimensions.split('×').map(s => s.trim().replace(/[^\d.]/g, ''));
    return parts[1] || '';
  });
  const [weight, setWeight] = useState(initial?.weight || '');
  const [material, setMaterial] = useState(initial?.material || '');
  const [inStock, setInStock] = useState(initial?.inStock !== false);
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() || '');
  const [colors, setColors] = useState<{ hex: string; name: string; photos: string[] }[]>(() => {
    if (!initial) return [{ hex: '#FFFFFF', name: '', photos: [] }];
    return initial.colorVariants.map(v => ({
      hex: v.hex,
      name: (v as any).name || '',
      photos: (v as any).photos || [v.image],
    }));
  });

  // Files chosen by the admin queue up here; the next one in line is
  // surfaced to ImageCropModal. After confirming a crop, the file is
  // uploaded and the queue advances. Multiple-select photos walk through
  // the modal one by one so the admin can crop each individually.
  const [cropQueue, setCropQueue] = useState<{ file: File; target: 'product' | { color: number } }[]>([]);

  const queueFiles = (files: FileList | null, target: 'product' | { color: number }) => {
    if (!files || files.length === 0) return;
    setCropQueue((prev) => [...prev, ...Array.from(files).map((file) => ({ file, target }))]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    queueFiles(e.target.files, 'product');
    e.target.value = '';
  };

  const handleColorPhotoUpload = (colorIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    queueFiles(e.target.files, { color: colorIdx });
    e.target.value = '';
  };

  // Called by the crop modal when the admin confirms the trim.
  const handleCropConfirm = async (cropped: File) => {
    const head = cropQueue[0];
    if (!head) return;
    // Pop first so the next file's modal opens immediately even if upload
    // is slow — uploads still run in the background.
    setCropQueue((prev) => prev.slice(1));
    try {
      if (head.target === 'product') {
        const url = await uploadImage(cropped, 'product');
        setImages((prev) => (prev.length >= 35 ? prev : [...prev, url]));
      } else {
        const colorIdx = head.target.color;
        const url = await uploadImage(cropped, 'color');
        setColors((prev) =>
          prev.map((c, i) =>
            i !== colorIdx ? c : c.photos.length >= 35 ? c : { ...c, photos: [...c.photos, url] },
          ),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить';
      alert(`Ошибка загрузки «${head.file.name}»: ${msg}`);
    }
  };

  const handleCropCancel = () => {
    // Skip just the head — keep any other queued files intact.
    setCropQueue((prev) => prev.slice(1));
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // Promote a general photo to "main" by moving it to index 0. The save
  // handler treats `images[0]` as the product cover, so this is enough
  // — no extra schema field needed.
  const setMainImage = (idx: number) => {
    if (idx === 0) return;
    setImages((prev) => {
      const next = prev.slice();
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  };

  const removeColorPhoto = (colorIdx: number, photoIdx: number) => {
    setColors(prev => prev.map((c, i) => {
      if (i !== colorIdx) return c;
      return { ...c, photos: c.photos.filter((_, pi) => pi !== photoIdx) };
    }));
  };

  // Same trick for per-colour galleries: photos[0] is the swatch image.
  const setMainColorPhoto = (colorIdx: number, photoIdx: number) => {
    if (photoIdx === 0) return;
    setColors((prev) => prev.map((c, i) => {
      if (i !== colorIdx) return c;
      const next = c.photos.slice();
      const [picked] = next.splice(photoIdx, 1);
      next.unshift(picked);
      return { ...c, photos: next };
    }));
  };

  const addColor = () => setColors((prev) => [...prev, { hex: '#000000', name: '', photos: [] }]);
  const removeColor = (idx: number) => setColors((prev) => prev.filter((_, i) => i !== idx));
  const updateColorHex = (idx: number, hex: string) => {
    setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, hex } : c)));
  };
  const updateColorName = (idx: number, name: string) => {
    setColors((prev) => prev.map((c, i) => (i === idx ? { ...c, name } : c)));
  };

  const handleEyedropper = async (idx: number) => {
    // Native EyeDropper API is desktop-Chromium only. On every other browser
    // (Safari mobile/desktop, Firefox, etc.) it doesn't exist — instead of
    // doing nothing we tell the user to use the round swatch / hex input,
    // both of which work everywhere.
    if (!('EyeDropper' in window)) {
      alert('Пипетка работает только в Chrome/Edge на компьютере. На телефоне используйте круглый кружок цвета или введите HEX-код вручную.');
      return;
    }
    try {
      const dropper = new (window as any).EyeDropper();
      const result = await dropper.open();
      updateColorHex(idx, (result.sRGBHex as string).toUpperCase());
    } catch {
      // User cancelled — silent.
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price.trim() || (images.length === 0 && colors.every(c => c.photos.length === 0))) return;

    const dims = (dimWidth || dimHeight || dimDepth)
      ? `${dimWidth || '0'} × ${dimDepth || '0'} × ${dimHeight || '0'} см`
      : undefined;

    const mainImage = images[0] || colors[0]?.photos[0] || '';
    const product: Product = {
      id: initial?.id || `P-${Date.now().toString(36).toUpperCase()}`,
      name: name.trim(),
      sku: initial?.sku || `RM${String(Math.floor(Math.random() * 90000) + 10000)}`,
      price: Number(price),
      purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
      image: mainImage,
      category,
      description: description.trim(),
      dimensions: dims,
      weight: weight.trim() || undefined,
      material: material.trim() || undefined,
      colorVariants: colors.map((c, i) => ({
        hex: c.hex,
        name: c.name,
        image: c.photos[0] || images[i] || mainImage,
        photos: c.photos.length > 0 ? c.photos : (images[i] ? [images[i]] : [mainImage]),
      })),
      inStock,
      quantity: quantity ? Number(quantity) : undefined,
    };
    onSave(product);
  };

  const fieldClass = 'w-full bg-surface rounded-2xl px-5 py-3 border border-primary/10 shadow-sm focus:ring-2 focus:ring-primary outline-none text-sm';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Crop modal — opens whenever there's a file waiting to be cropped.
          Drains the queue file-by-file. */}
      {cropQueue[0] && (
        <ImageCropModal
          key={cropQueue[0].file.name + cropQueue.length}
          file={cropQueue[0].file}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold">{initial ? 'Редактировать товар' : 'Новый товар'}</h3>
        <button type="button" onClick={onCancel} className="p-2 hover:bg-primary/5 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold opacity-50 mb-1 block">Название *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Тумба Oslo" className={fieldClass} required />
        </div>
        <div>
          <label className="text-xs font-bold opacity-50 mb-1 block">Цена продажи (₽) *</label>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12900" className={fieldClass} required />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold opacity-50 mb-1 block">Закупочная цена (₽) — для расчёта чистой прибыли</label>
        <input
          type="number"
          min="0"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
          placeholder="6500"
          className={fieldClass}
        />
        {price && purchasePrice && Number(price) > Number(purchasePrice) && (
          <p className="text-[10px] opacity-50 mt-1">
            Прибыль с единицы: <span className="font-bold text-green-600 dark:text-green-400">+{(Number(price) - Number(purchasePrice)).toLocaleString('ru-RU')} ₽</span>
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-bold opacity-50 mb-1 block">Категория</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
          {cats.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
      </div>

      {/* General photos (up to 35) */}
      <div>
        <label className="text-xs font-bold opacity-50 mb-1 block">Общие фото товара (до 35 шт.)</label>
        <div className="flex gap-2 flex-wrap mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-primary/10 shadow-sm group">
              <img src={img} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute top-0.5 left-0.5 bg-primary text-primary-inv text-[7px] px-1 py-0.5 rounded-full">Главное</span>}
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => setMainImage(i)}
                  title="Сделать главным"
                  aria-label="Сделать главным"
                  className="absolute bottom-0.5 left-0.5 bg-black/50 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Crown size={8} />
                </button>
              )}
              <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={8} />
              </button>
            </div>
          ))}
          {images.length < 35 && (
            <>
              {/* Gallery picker — multi-select, no `capture` so the OS shows
                  the photo library (and a 'take photo' option in the same sheet
                  on iOS). */}
              <label className="w-16 h-16 rounded-xl border-2 border-dashed border-primary/15 flex flex-col items-center justify-center cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all">
                <Upload size={14} className="opacity-30" />
                <span className="text-[8px] opacity-30 mt-0.5">Галерея</span>
                <span className="text-[7px] opacity-30">{images.length}/35</span>
                <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
              </label>
              {/* Direct-to-camera button — `capture="environment"` skips the
                  chooser sheet and goes straight to the rear camera, which is
                  what mobile clients usually want for a quick product shot. */}
              <label className="w-16 h-16 rounded-xl border-2 border-dashed border-primary/15 flex flex-col items-center justify-center cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all">
                <Camera size={14} className="opacity-30" />
                <span className="text-[8px] opacity-30 mt-0.5">Камера</span>
                <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
              </label>
            </>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold opacity-50 mb-1 block">Описание</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание товара..." rows={3} className={fieldClass + ' resize-none'} />
      </div>

      <div>
        <label className="text-xs font-bold opacity-50 mb-2 block">Размеры (см)</label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <span className="text-[10px] opacity-30 block mb-1 text-center">Ширина</span>
            <input type="number" value={dimWidth} onChange={(e) => setDimWidth(e.target.value)} placeholder="50" className={fieldClass + ' text-center'} />
          </div>
          <div>
            <span className="text-[10px] opacity-30 block mb-1 text-center">Глубина</span>
            <input type="number" value={dimDepth} onChange={(e) => setDimDepth(e.target.value)} placeholder="40" className={fieldClass + ' text-center'} />
          </div>
          <div>
            <span className="text-[10px] opacity-30 block mb-1 text-center">Высота</span>
            <input type="number" value={dimHeight} onChange={(e) => setDimHeight(e.target.value)} placeholder="55" className={fieldClass + ' text-center'} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold opacity-50 mb-1 block">Вес</label>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="12 кг" className={fieldClass} />
        </div>
        <div>
          <label className="text-xs font-bold opacity-50 mb-1 block">Материал</label>
          <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Дуб, МДФ" className={fieldClass} />
        </div>
      </div>

      {/* Stock / Quantity */}
      <div className="bg-background rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold opacity-50">В наличии</label>
          <button
            type="button"
            onClick={() => setInStock(!inStock)}
            className={cn(
              "relative w-12 h-6 rounded-full transition-all",
              inStock ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
            )}
          >
            <span className={cn(
              "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all",
              inStock ? "left-[26px]" : "left-0.5"
            )} />
          </button>
        </div>
        {inStock && (
          <div>
            <label className="text-xs font-bold opacity-50 mb-1 block">Количество (шт.)</label>
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Без ограничений"
              className={fieldClass}
            />
          </div>
        )}
      </div>

      {/* Colors with picker + eyedropper + name + per-color photos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold opacity-50">Цвета (с пипеткой и названием)</label>
          <button type="button" onClick={addColor} className="text-xs opacity-40 hover:opacity-100 flex items-center gap-1 transition-opacity">
            <Plus size={12} /> Добавить цвет
          </button>
        </div>
        <div className="space-y-3">
          {colors.map((c, i) => (
            <div key={i} className="bg-background rounded-2xl p-3 space-y-2">
              {/* Three ways to set a colour, in order of likely-to-work on
                  the client's device:
                    1. Tap the round swatch → native colour picker (works on
                       all desktop, iOS 16.4+, modern Android).
                    2. Eyedropper button → Chrome/Edge desktop only; falls
                       back to opening the native picker when unsupported.
                    3. Type the hex code manually — universal fallback.        */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(c.hex) ? c.hex : '#000000'}
                  onChange={(e) => updateColorHex(i, e.target.value.toUpperCase())}
                  className="w-8 h-8 rounded-full border-0 cursor-pointer bg-transparent [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-2 [&::-webkit-color-swatch]:border-primary/10"
                  title="Открыть выбор цвета"
                />
                <button type="button" onClick={() => handleEyedropper(i)} className="p-1.5 rounded-full hover:bg-primary/10 transition-colors" title="Пипетка (только Chrome/Edge)">
                  <Pipette size={14} className="opacity-50" />
                </button>
                <input
                  type="text"
                  value={c.hex}
                  onChange={(e) => {
                    let v = e.target.value.trim().toUpperCase();
                    if (v && !v.startsWith('#')) v = '#' + v;
                    // Allow any partial hex while typing; full validation on
                    // submit is fine since invalid colours just render black.
                    if (/^#?[0-9A-Fa-f]{0,6}$/.test(v.replace('#', ''))) {
                      updateColorHex(i, v);
                    }
                  }}
                  placeholder="#000000"
                  maxLength={7}
                  spellCheck={false}
                  className="text-[11px] font-mono w-20 bg-surface rounded-md px-2 py-1.5 border border-primary/10 outline-none focus:ring-1 focus:ring-primary uppercase"
                />
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => updateColorName(i, e.target.value)}
                  placeholder="Название цвета (напр. Дуб натуральный)"
                  className="flex-1 min-w-[120px] bg-surface rounded-xl px-3 py-1.5 border border-primary/5 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
                {colors.length > 1 && (
                  <button type="button" onClick={() => removeColor(i)} className="p-1 rounded-full hover:bg-red-50 transition-colors">
                    <X size={12} className="opacity-30" />
                  </button>
                )}
              </div>
              {/* Per-color photos */}
              <div className="flex gap-1.5 flex-wrap">
                {c.photos.map((photo, pi) => (
                  <div key={pi} className="relative w-12 h-12 rounded-lg overflow-hidden border border-primary/10 group">
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                    {pi === 0 && (
                      <span className="absolute top-0 left-0 bg-primary text-primary-inv text-[6px] px-1 rounded-br-md leading-tight">★</span>
                    )}
                    {pi !== 0 && (
                      <button
                        type="button"
                        onClick={() => setMainColorPhoto(i, pi)}
                        title="Сделать главным для этого цвета"
                        aria-label="Сделать главным"
                        className="absolute bottom-0 left-0 bg-black/50 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Crown size={7} />
                      </button>
                    )}
                    <button type="button" onClick={() => removeColorPhoto(i, pi)} className="absolute top-0 right-0 bg-black/50 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={7} />
                    </button>
                  </div>
                ))}
                {c.photos.length < 35 && (
                  <>
                    <label className="w-12 h-12 rounded-lg border border-dashed border-primary/15 flex flex-col items-center justify-center cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all">
                      <Upload size={10} className="opacity-30" />
                      <span className="text-[7px] opacity-30">{c.photos.length}/35</span>
                      <input type="file" accept="image/*" multiple onChange={(e) => handleColorPhotoUpload(i, e)} className="hidden" />
                    </label>
                    <label className="w-12 h-12 rounded-lg border border-dashed border-primary/15 flex flex-col items-center justify-center cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all">
                      <Camera size={10} className="opacity-30" />
                      <span className="text-[7px] opacity-30">камера</span>
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => handleColorPhotoUpload(i, e)} className="hidden" />
                    </label>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-primary text-primary-inv rounded-full py-4 font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform"
      >
        <Save size={18} />
        {initial ? 'Сохранить изменения' : 'Добавить товар'}
      </button>
    </form>
  );
}

/* ═══════════════════════════════════════════════════
   Dashboard — Analytics view (server-aggregated via /stats)
   ═══════════════════════════════════════════════════ */
function Dashboard() {
  const { orders, favorites, allProducts } = useStore();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statsRaw, setStatsRaw] = useState<StatsDTO | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Refetch stats whenever the period or the custom range is fully filled.
  useEffect(() => {
    let cancelled = false;
    const params: { period: 'today' | 'week' | 'month' | 'custom'; from?: string; to?: string } = { period };
    if (period === 'custom') {
      if (!customFrom || !customTo) return; // wait for both endpoints
      params.from = new Date(customFrom).toISOString();
      params.to = new Date(customTo + 'T23:59:59').toISOString();
    }
    setStatsLoading(true);
    fetchStats(params)
      .then((d) => { if (!cancelled) setStatsRaw(d); })
      .catch(() => { if (!cancelled) setStatsRaw(null); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [period, customFrom, customTo]);

  // Snake-case API → camelCase shape the JSX has been written against.
  // Favourites still live in localStorage so the favourite-total is computed
  // client-side until favourites move server-side too.
  const favoriteTotalValue = favorites.reduce((sum, f) => {
    const p = allProducts.find((pr) => pr.id === f.productId);
    return sum + (p?.price || 0);
  }, 0);

  const stats = {
    visits: statsRaw?.visits ?? 0,
    productViews: statsRaw?.product_views ?? 0,
    cartAdds: statsRaw?.cart_adds ?? 0,
    checkouts: statsRaw?.checkouts ?? 0,
    chatOpens: statsRaw?.chat_opens ?? 0,
    favoriteAdds: statsRaw?.favorite_adds ?? 0,
    revenue: statsRaw?.revenue ?? 0,
    cost: statsRaw?.cost ?? 0,
    netProfit: statsRaw?.net_profit ?? 0,
    ordersCount: statsRaw?.orders_count ?? 0,
    favoriteTotalValue,
    topViewed: (statsRaw?.top_viewed ?? []).map((t) => ({
      product: { id: t.product_id, name: t.name, image: t.main_image, price: t.price },
      count: t.count,
    })),
    topCarted: (statsRaw?.top_carted ?? []).map((t) => ({
      product: { id: t.product_id, name: t.name, image: t.main_image, price: t.price },
      count: t.count,
    })),
    topFavorited: (statsRaw?.top_favorited ?? []).map((t) => ({
      product: { id: t.product_id, name: t.name, image: t.main_image, price: t.price },
      count: t.count,
    })),
  };

  const statCards = [
    { label: 'Посетители', value: stats.visits, icon: Eye, color: 'bg-blue-500/10 text-blue-600' },
    { label: 'Просмотры товаров', value: stats.productViews, icon: Package, color: 'bg-indigo-500/10 text-indigo-600' },
    { label: 'Добавили в корзину', value: stats.cartAdds, icon: ShoppingCart, color: 'bg-amber-500/10 text-amber-600' },
    { label: 'Оформили заказ', value: stats.checkouts, icon: CheckCircle, color: 'bg-green-500/10 text-green-600' },
    { label: 'Открыли чат', value: stats.chatOpens, icon: MessageCircle, color: 'bg-purple-500/10 text-purple-600' },
    { label: 'Добавили в избранное', value: stats.favoriteAdds, icon: Heart, color: 'bg-red-500/10 text-red-600' },
    { label: 'Сумма избранного', value: `${stats.favoriteTotalValue.toLocaleString('ru-RU')} ₽`, icon: TrendingUp, color: 'bg-teal-500/10 text-teal-600' },
  ];

  // Count cart-abandoned (added to cart but didn't checkout)
  const cartAbandoned = stats.cartAdds - stats.checkouts;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-2 mb-2">
        {([
          { key: 'today' as const, label: 'Сегодня' },
          { key: 'week' as const, label: 'Неделя' },
          { key: 'month' as const, label: 'Месяц' },
          { key: 'custom' as const, label: 'Период' },
        ]).map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold transition-all",
              period === p.key ? "bg-primary text-primary-inv shadow-md" : "bg-surface border border-primary/10 hover:bg-primary/5"
            )}
          >
            {p.key === 'custom' && <Calendar size={12} className="inline mr-1" />}
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="flex gap-3 items-center bg-surface rounded-2xl p-3 shadow-sm">
          <div className="flex-1">
            <label className="text-[10px] opacity-40 block mb-1">От</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-full bg-background rounded-xl px-3 py-2 text-xs border border-primary/5 outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] opacity-40 block mb-1">До</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-full bg-background rounded-xl px-3 py-2 text-xs border border-primary/5 outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
      )}

      {/* Net profit / finance block */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/15 dark:to-emerald-500/5 rounded-2xl p-5 shadow-sm border border-emerald-500/10"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Wallet size={18} />
            </div>
            <div>
              <p className="text-sm font-bold">Чистая прибыль</p>
              <p className="text-[10px] opacity-50">Цена продажи − закупочная, по заказам в периоде</p>
            </div>
          </div>
          <span className="text-[10px] opacity-40 bg-surface px-2 py-1 rounded-full">{stats.ordersCount} заказ.</span>
        </div>
        <p className={cn(
          "text-3xl font-bold mb-3",
          stats.netProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        )}>
          {stats.netProfit >= 0 ? '+' : ''}{stats.netProfit.toLocaleString('ru-RU')} ₽
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface/60 rounded-xl p-3">
            <p className="text-[10px] opacity-40 mb-0.5">Выручка</p>
            <p className="text-sm font-bold">{stats.revenue.toLocaleString('ru-RU')} ₽</p>
          </div>
          <div className="bg-surface/60 rounded-xl p-3">
            <p className="text-[10px] opacity-40 mb-0.5">Себестоимость</p>
            <p className="text-sm font-bold">{stats.cost.toLocaleString('ru-RU')} ₽</p>
          </div>
        </div>
        {stats.ordersCount > 0 && stats.cost === 0 && (
          <p className="text-[10px] opacity-50 mt-3 italic">
            Закупочная цена не указана у товаров — прибыль = выручке. Добавьте «закупочную цену» в карточке товара для точного расчёта.
          </p>
        )}
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {statCards.map(s => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface rounded-2xl p-4 shadow-sm"
          >
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-2", s.color)}>
              <s.icon size={18} />
            </div>
            <p className="text-xl font-bold">{typeof s.value === 'number' ? s.value : s.value}</p>
            <p className="text-[10px] opacity-40 mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Cart abandoned */}
      {cartAbandoned > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-200/50">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={16} className="text-amber-600" />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Брошенные корзины</span>
          </div>
          <p className="text-xs opacity-60">{cartAbandoned} человек добавили товары в корзину, но не оформили заказ</p>
        </div>
      )}

      {/* Current favorites summary */}
      <div className="bg-surface rounded-2xl p-5 shadow-sm">
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Heart size={16} className="text-red-400" /> Избранное пользователей
        </h4>
        {favorites.length === 0 ? (
          <p className="text-xs opacity-40">Пока никто не добавил товары в избранное</p>
        ) : (
          <div className="space-y-2">
            {favorites.map(f => {
              const p = allProducts.find(pr => pr.id === f.productId);
              if (!p) return null;
              return (
                <div key={f.productId} className="flex items-center gap-3 bg-background rounded-xl p-2">
                  <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{p.name}</p>
                    <p className="text-[10px] opacity-40">{p.price.toLocaleString('ru-RU')} ₽</p>
                  </div>
                  <Star size={14} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />
                </div>
              );
            })}
            <div className="pt-2 border-t border-primary/5 flex justify-between text-sm">
              <span className="opacity-50">Общая сумма избранного</span>
              <span className="font-bold">{stats.favoriteTotalValue.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
        )}
      </div>

      {/* Top viewed products */}
      {stats.topViewed.length > 0 && (
        <div className="bg-surface rounded-2xl p-5 shadow-sm">
          <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Eye size={16} className="text-indigo-500" /> Самые просматриваемые
          </h4>
          <div className="space-y-2">
            {stats.topViewed.map(({ product, count }) => (
              <div key={product.id} className="flex items-center gap-3 bg-background rounded-xl p-2">
                <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{product.name}</p>
                  <p className="text-[10px] opacity-40">{product.price.toLocaleString('ru-RU')} ₽</p>
                </div>
                <span className="text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-full">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top carted products */}
      {stats.topCarted.length > 0 && (
        <div className="bg-surface rounded-2xl p-5 shadow-sm">
          <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
            <ShoppingCart size={16} className="text-amber-500" /> Популярные в корзине
          </h4>
          <div className="space-y-2">
            {stats.topCarted.map(({ product, count }) => (
              <div key={product.id} className="flex items-center gap-3 bg-background rounded-xl p-2">
                <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{product.name}</p>
                  <p className="text-[10px] opacity-40">{product.price.toLocaleString('ru-RU')} ₽</p>
                </div>
                <span className="text-xs font-bold bg-primary/5 px-2 py-1 rounded-full">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-surface rounded-2xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold">{orders.length}</p>
          <p className="text-[10px] opacity-40">Всего заказов</p>
        </div>
        <div className="bg-surface rounded-2xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold">{allProducts.length}</p>
          <p className="text-[10px] opacity-40">Товаров</p>
        </div>
        <div className="bg-surface rounded-2xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold">{orders.reduce((s, o) => s + o.total, 0).toLocaleString('ru-RU')} ₽</p>
          <p className="text-[10px] opacity-40">Общая выручка</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   UserManager — Role management (server-backed via /admin/users)
   ═══════════════════════════════════════════════════ */
function UserManager() {
  const { adminSession } = useStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'viewer'>('viewer');
  const [sections, setSections] = useState<string[]>([...ALL_SECTIONS]);
  const [submitError, setSubmitError] = useState('');

  const sectionLabels: Record<string, string> = {
    dashboard: 'Дашборд',
    orders: 'Заказы',
    products: 'Товары',
    recommendations: 'Рекомендации',
    users: 'Пользователи',
    settings: 'Настройки',
  };

  const reload = async () => {
    try {
      const list = await apiListAdminUsers();
      setUsers(list);
      setLoadError('');
    } catch (e) {
      setLoadError('Не удалось загрузить список пользователей');
    }
  };

  // Initial load. Re-runs whenever the admin re-mounts this component.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setName(''); setPassword(''); setRole('viewer'); setSections([...ALL_SECTIONS]);
    setShowForm(false); setEditingUser(null); setSubmitError('');
  };

  const handleEdit = (u: AdminUser) => {
    setEditingUser(u);
    setName(u.name);
    setPassword('');  // never preload — leave blank to keep, fill to reset
    setRole(u.role);
    setSections(u.role === 'admin' ? [...ALL_SECTIONS] : u.sections);
    setShowForm(true);
    setSubmitError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Password is required when creating; optional (=keep) when editing.
    if (!editingUser && password.length < 4) {
      setSubmitError('Пароль не короче 4 символов');
      return;
    }
    if (editingUser && password && password.length < 4) {
      setSubmitError('Новый пароль не короче 4 символов');
      return;
    }
    const finalSections = role === 'admin' ? [...ALL_SECTIONS] : sections;
    try {
      if (editingUser) {
        await apiUpdateAdminUser(editingUser.id, {
          name: name.trim(),
          role,
          sections: finalSections,
          ...(password ? { password } : {}),
        });
      } else {
        await apiCreateAdminUser({
          name: name.trim(),
          password,
          role,
          sections: finalSections,
        });
      }
      await reload();
      resetForm();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Не удалось сохранить';
      setSubmitError(msg);
    }
  };

  const handleDelete = async (u: AdminUser) => {
    if (u.id === adminSession?.name) return; // shouldn't happen — name vs id, but cheap belt
    if (!confirm(`Удалить пользователя «${u.name}»?`)) return;
    try {
      await apiDeleteAdminUser(u.id);
      await reload();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Не удалось удалить';
      alert(msg);
    }
  };

  const toggleSection = (s: string) => {
    setSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  return (
    <div className="space-y-4">
      {loadError && (
        <p className="text-xs text-red-500 px-1">{loadError}</p>
      )}
      {/* Add user button or form */}
      {showForm ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-3xl shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <UserPlus size={18} className="opacity-40" />
              {editingUser ? 'Редактировать пользователя' : 'Новый пользователь'}
            </h3>
            <button onClick={resetForm} className="p-2 hover:bg-primary/5 rounded-full"><X size={18} /></button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold opacity-50 mb-1 block">Имя *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя пользователя" className="w-full bg-background rounded-2xl px-5 py-3 border border-primary/5 outline-none text-sm focus:ring-2 focus:ring-primary" required />
              </div>
              <div>
                <label className="text-xs font-bold opacity-50 mb-1 block">Пароль{editingUser ? '' : ' *'}</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={editingUser ? 'Оставить без изменений' : 'Минимум 4 символа'}
                  className="w-full bg-background rounded-2xl px-5 py-3 border border-primary/5 outline-none text-sm focus:ring-2 focus:ring-primary"
                  required={!editingUser}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold opacity-50 mb-2 block">Роль</label>
              <div className="flex gap-2">
                {([
                  { key: 'admin' as const, label: 'Админ', icon: Shield },
                  { key: 'manager' as const, label: 'Менеджер', icon: Users },
                  { key: 'viewer' as const, label: 'Наблюдатель', icon: Eye },
                ]).map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      setRole(r.key);
                      if (r.key === 'admin') setSections([...ALL_SECTIONS]);
                    }}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border",
                      role === r.key ? "bg-primary text-primary-inv border-primary" : "bg-background border-primary/10 hover:bg-primary/5"
                    )}
                  >
                    <r.icon size={14} /> {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section access */}
            {role !== 'admin' && (
              <div>
                <label className="text-xs font-bold opacity-50 mb-2 block">Доступные разделы</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SECTIONS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSection(s)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                        sections.includes(s)
                          ? "bg-primary text-primary-inv border-primary"
                          : "bg-background border-primary/10 opacity-50 hover:opacity-100"
                      )}
                    >
                      {sectionLabels[s] || s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {submitError && (
              <p className="text-xs text-red-500 px-1">{submitError}</p>
            )}
            <button type="submit" className="w-full bg-primary text-primary-inv rounded-full py-3.5 font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform">
              {editingUser ? 'Сохранить' : 'Создать пользователя'}
            </button>
          </form>
        </motion.div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-surface rounded-3xl shadow-sm p-5 flex items-center justify-center gap-3 border-2 border-dashed border-primary/15 hover:border-primary/30 hover:bg-primary/5 transition-all group"
        >
          <div className="bg-primary/10 rounded-full p-2 group-hover:bg-primary group-hover:text-primary-inv transition-all">
            <UserPlus size={20} />
          </div>
          <span className="font-bold opacity-60 group-hover:opacity-100 transition-opacity">Добавить пользователя</span>
        </button>
      )}

      {/* User list */}
      {users.length === 0 ? (
        <div className="bg-surface rounded-3xl shadow-sm p-12 text-center">
          <Users size={40} className="mx-auto opacity-15 mb-4" />
          <p className="opacity-40">Пользователей пока нет</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <motion.div key={u.id} layout className="bg-surface rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  u.role === 'admin' ? 'bg-red-500/10 text-red-500' : u.role === 'manager' ? 'bg-blue-500/10 text-blue-500' : 'bg-gray-500/10 text-gray-500'
                )}>
                  {u.role === 'admin' ? <Shield size={18} /> : u.role === 'manager' ? <Users size={18} /> : <Eye size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm">{u.name}</h4>
                  <p className="text-[10px] opacity-40">
                    {u.role === 'admin' ? 'Администратор' : u.role === 'manager' ? 'Менеджер' : 'Наблюдатель'} · {new Date(u.created_at).toLocaleDateString('ru-RU')}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(u.role === 'admin' ? ALL_SECTIONS : u.sections).map(s => (
                      <span key={s} className="text-[9px] bg-primary/5 px-1.5 py-0.5 rounded-full opacity-60">
                        {sectionLabels[s] || s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => handleEdit(u)} className="p-2 rounded-full hover:bg-primary/5 transition-colors">
                    <Edit3 size={14} className="opacity-40" />
                  </button>
                  <button onClick={() => handleDelete(u)} className="p-2 rounded-full hover:bg-red-50 transition-colors">
                    <Trash2 size={14} className="opacity-40" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RecommendationsManager — manage "Рекомендуем для вас"
   ═══════════════════════════════════════════════════ */
function RecommendationsManager() {
  const { recommendations, addRecommendation, updateRecommendation, removeRecommendation, allProducts, allCategories: storeCats } = useStore();
  const existingCats = storeCats.filter(c => c !== 'Все');

  const [showForm, setShowForm] = useState(false);
  const [editingRec, setEditingRec] = useState<RecommendationCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [customName, setCustomName] = useState('');
  const [useExisting, setUseExisting] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');

  const resetForm = () => {
    setCatName(''); setCustomName(''); setSelectedProducts([]); setProductSearch('');
    setShowForm(false); setEditingRec(null); setUseExisting(true);
  };

  const handleEdit = (rec: RecommendationCategory) => {
    setEditingRec(rec);
    setCatName(rec.name);
    setCustomName(rec.name);
    setSelectedProducts([...rec.productIds]);
    setUseExisting(existingCats.includes(rec.name));
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const name = useExisting ? catName : customName.trim();
    if (!name || selectedProducts.length === 0) return;

    if (editingRec) {
      updateRecommendation(editingRec.id, { name, productIds: selectedProducts });
    } else {
      addRecommendation(name, selectedProducts);
    }
    resetForm();
  };

  const toggleProduct = (pid: string) => {
    setSelectedProducts(prev =>
      prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
    );
  };

  const filteredProducts = allProducts.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.category.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {showForm ? (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-surface rounded-3xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2">
              <Star size={18} className="opacity-40" />
              {editingRec ? 'Редактировать рекомендацию' : 'Новая категория рекомендаций'}
            </h3>
            <button onClick={resetForm} className="p-2 hover:bg-primary/5 rounded-full"><X size={18} /></button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Choose existing or custom category */}
            <div>
              <label className="text-xs font-bold opacity-50 mb-2 block">Тип категории</label>
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setUseExisting(true)} className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                  useExisting ? "bg-primary text-primary-inv border-primary" : "bg-background border-primary/10"
                )}>
                  Существующая
                </button>
                <button type="button" onClick={() => setUseExisting(false)} className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                  !useExisting ? "bg-primary text-primary-inv border-primary" : "bg-background border-primary/10"
                )}>
                  Своя название
                </button>
              </div>

              {useExisting ? (
                <select value={catName} onChange={e => setCatName(e.target.value)} className="w-full bg-background rounded-2xl px-5 py-3 border border-primary/5 outline-none text-sm focus:ring-2 focus:ring-primary">
                  <option value="">Выберите категорию...</option>
                  {existingCats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Название категории (напр. Хиты продаж)"
                  className="w-full bg-background rounded-2xl px-5 py-3 border border-primary/5 outline-none text-sm focus:ring-2 focus:ring-primary"
                />
              )}
            </div>

            {/* Product selection */}
            <div>
              <label className="text-xs font-bold opacity-50 mb-2 block">
                Товары ({selectedProducts.length} выбрано)
              </label>
              <input
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Поиск товаров..."
                className="w-full bg-background rounded-2xl px-5 py-2.5 border border-primary/5 outline-none text-sm focus:ring-1 focus:ring-primary mb-2"
              />

              {/* Selected products */}
              {selectedProducts.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {selectedProducts.map(pid => {
                    const p = allProducts.find(pr => pr.id === pid);
                    if (!p) return null;
                    return (
                      <span key={pid} className="flex items-center gap-1.5 bg-primary/10 rounded-full px-2.5 py-1 text-xs">
                        <img src={p.image} alt="" className="w-4 h-4 rounded-full object-cover" />
                        <span className="font-medium truncate max-w-[100px]">{p.name}</span>
                        <button type="button" onClick={() => toggleProduct(pid)} className="hover:text-red-500">
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Product list to select from */}
              <div className="max-h-48 overflow-y-auto space-y-1 border border-primary/5 rounded-2xl p-2">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all text-sm",
                      selectedProducts.includes(p.id) ? "bg-primary/10" : "hover:bg-primary/5"
                    )}
                  >
                    <img src={p.image} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{p.name}</p>
                      <p className="text-[10px] opacity-40">{p.category} · {p.price} ₽</p>
                    </div>
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                      selectedProducts.includes(p.id) ? "bg-primary border-primary" : "border-primary/20"
                    )}>
                      {selectedProducts.includes(p.id) && <Check size={10} className="text-primary-inv" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={(!useExisting ? !customName.trim() : !catName) || selectedProducts.length === 0}
              className="w-full bg-primary text-primary-inv rounded-full py-3.5 font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-30 disabled:scale-100"
            >
              {editingRec ? 'Сохранить' : 'Создать категорию'}
            </button>
          </form>
        </motion.div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-surface rounded-3xl shadow-sm p-5 flex items-center justify-center gap-3 border-2 border-dashed border-primary/15 hover:border-primary/30 hover:bg-primary/5 transition-all group"
        >
          <div className="bg-primary/10 rounded-full p-2 group-hover:bg-primary group-hover:text-primary-inv transition-all">
            <Plus size={20} />
          </div>
          <span className="font-bold opacity-60 group-hover:opacity-100 transition-opacity">Добавить категорию рекомендаций</span>
        </button>
      )}

      {/* List of recommendation categories */}
      {recommendations.length === 0 && !showForm ? (
        <div className="bg-surface rounded-3xl shadow-sm p-12 text-center">
          <Star size={40} className="mx-auto opacity-15 mb-4" />
          <p className="opacity-40">Рекомендаций пока нет</p>
          <p className="text-xs opacity-30 mt-1">Добавьте категории и выберите товары для секции "Рекомендуем для вас"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map(rec => {
            const products = rec.productIds.map(id => allProducts.find(p => p.id === id)).filter(Boolean) as typeof allProducts;
            return (
              <motion.div key={rec.id} layout className="bg-surface rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/5 rounded-full p-2"><Star size={16} /></div>
                    <div>
                      <h4 className="font-bold text-sm">{rec.name}</h4>
                      <p className="text-[10px] opacity-40">{products.length} товаров</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(rec)} className="p-2 rounded-full hover:bg-primary/5 transition-colors">
                      <Edit3 size={14} className="opacity-40" />
                    </button>
                    <button onClick={() => removeRecommendation(rec.id)} className="p-2 rounded-full hover:bg-red-50 transition-colors">
                      <Trash2 size={14} className="opacity-40" />
                    </button>
                  </div>
                </div>
                {/* Product thumbnails */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {products.map(p => (
                    <div key={p.id} className="flex-shrink-0 w-14">
                      <img src={p.image} alt={p.name} className="w-14 h-14 rounded-xl object-cover border border-primary/5" />
                      <p className="text-[8px] opacity-40 truncate mt-0.5 text-center">{p.name}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Main Admin Component
   ═══════════════════════════════════════════════════ */
export function Admin() {
  const navigate = useNavigate();
  const {
    orders, allProducts, addProduct, removeProduct, updateProduct,
    adminCredentials, updateAdminCredentials,
    notifications, markNotificationRead, unreadCount,
    recommendations, addRecommendation, updateRecommendation, removeRecommendation,
    allCategories: storeCats, addCategory, removeCategory, customCategories,
    adminSession, logoutAdmin,
  } = useStore();

  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword.trim() || !newPassword.trim()) {
      setSettingsError('Введите текущий и новый пароль');
      return;
    }
    if (newPassword.length < 4) {
      setSettingsError('Новый пароль должен быть не менее 4 символов');
      return;
    }
    setSettingsError('');
    setSavingSettings(true);
    const result = await updateAdminCredentials(currentPassword, newName, newPassword);
    setSavingSettings(false);
    if (!result.ok) {
      setSettingsError(result.error || 'Не удалось сохранить');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setNewName('');
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  const activeOrder = orders.find((o) => o.id === selectedOrder);

  const canAccess = (section: string) => {
    if (!adminSession) return false;
    if (adminSession.role === 'admin') return true;
    return adminSession.sections.includes(section);
  };

  /* ── Not logged in — redirect to profile/login ── */
  useEffect(() => {
    if (!adminSession) {
      navigate('/profile', { replace: true });
    }
  }, [adminSession, navigate]);

  if (!adminSession) {
    return null;
  }

  const loggedInUser = adminSession;

  const handleSaveProduct = (product: Product) => {
    if (editingProduct) {
      updateProduct(product.id, product);
      setEditingProduct(null);
    } else {
      addProduct(product);
      setShowAddForm(false);
    }
  };

  const tabs = [
    { key: 'dashboard', label: 'Дашборд', icon: BarChart3, section: 'dashboard' },
    { key: 'orders', label: 'Заказы', icon: Package, section: 'orders', count: orders.length },
    { key: 'products', label: 'Товары', icon: CheckCircle, section: 'products', count: allProducts.length },
    { key: 'recommendations', label: 'Рекомендации', icon: Star, section: 'recommendations', count: recommendations.length },
    { key: 'users', label: 'Пользователи', icon: Users, section: 'users' },
  ].filter(t => canAccess(t.section));

  return (
    <div className="py-2 sm:py-6 pb-32">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <div>
          {loggedInUser && (
            <p className="text-sm font-bold opacity-70">
              {loggedInUser.name} · {loggedInUser.role === 'admin' ? 'Администратор' : loggedInUser.role === 'manager' ? 'Менеджер' : 'Наблюдатель'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canAccess('settings') && (
            <button
              onClick={() => { setShowSettings(!showSettings); setActiveTab('settings'); }}
              className={cn(
                "p-2.5 rounded-full transition-all",
                activeTab === 'settings' ? "bg-primary text-primary-inv" : "bg-primary/5 hover:bg-primary/10"
              )}
            >
              <Settings size={18} />
            </button>
          )}
          {/* Logout */}
          <button
            onClick={() => { logoutAdmin(); navigate('/profile'); }}
            className="p-2.5 rounded-full bg-red-500/10 hover:bg-red-500/20 transition-all text-red-500"
            title="Выйти"
          >
            <LogOut size={18} />
          </button>
          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="p-2.5 rounded-full bg-primary/5 hover:bg-primary/10 transition-all relative"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            <AnimatePresence>
              {showNotifs && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="absolute right-0 top-12 w-72 bg-surface rounded-2xl shadow-xl z-50 overflow-hidden border border-primary/10"
                >
                  <div className="p-3 border-b border-primary/5 flex justify-between items-center">
                    <h4 className="text-sm font-bold">Уведомления</h4>
                    <button onClick={() => setShowNotifs(false)} className="p-1 hover:bg-primary/5 rounded-full">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs opacity-40 text-center">Нет уведомлений</p>
                    ) : (
                      notifications.slice(0, 20).map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            markNotificationRead(n.id);
                            if (n.orderId) {
                              setSelectedOrder(n.orderId);
                              setActiveTab('orders');
                            }
                            setShowNotifs(false);
                          }}
                          className={cn(
                            "w-full text-left p-3 hover:bg-primary/5 transition-colors border-b border-primary/5 last:border-0",
                            !n.read && "bg-primary/3"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read && <span className="w-2 h-2 bg-red-500 rounded-full mt-1 flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs leading-relaxed">{n.text}</p>
                              <p className="text-[10px] opacity-30 mt-0.5">{n.time}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {activeTab === 'settings' && canAccess('settings') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-surface rounded-3xl shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <KeyRound size={18} className="opacity-40" />
                <h3 className="font-bold">Сменить учётные данные</h3>
              </div>
              <form onSubmit={handleSaveSettings} className="space-y-3">
                <div>
                  <label className="text-xs font-bold opacity-50 mb-1 block px-1">Текущий пароль *</label>
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Подтвердите изменение" className="w-full bg-background rounded-2xl px-5 py-3 border border-primary/5 focus:ring-2 focus:ring-primary outline-none text-sm" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold opacity-50 mb-1 block px-1">Новое имя (необязательно)</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={adminSession?.name || 'Имя'} className="w-full bg-background rounded-2xl px-5 py-3 border border-primary/5 focus:ring-2 focus:ring-primary outline-none text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold opacity-50 mb-1 block px-1">Новый пароль *</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Минимум 4 символа" className="w-full bg-background rounded-2xl px-5 py-3 border border-primary/5 focus:ring-2 focus:ring-primary outline-none text-sm" />
                  </div>
                </div>
                {settingsError && (
                  <p className="text-xs text-red-500 px-1">{settingsError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingSettings || !currentPassword.trim() || !newPassword.trim() || newPassword.length < 4}
                    className={cn(
                      "flex-1 rounded-full py-3 font-bold text-sm flex items-center justify-center gap-2 transition-all",
                      settingsSaved ? "bg-green-600 text-white" : "bg-primary text-primary-inv hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:scale-100"
                    )}
                  >
                    {settingsSaved ? <><Check size={16} /> Сохранено!</> : <><Save size={16} /> {savingSettings ? 'Сохранение…' : 'Сохранить'}</>}
                  </button>
                  <button type="button" onClick={() => setActiveTab('dashboard')} className="px-4 py-3 rounded-full border border-primary/10 text-sm hover:bg-primary/5 transition-all">
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setShowAddForm(false); setEditingProduct(null); setSelectedOrder(null); }}
            className={cn(
              "px-4 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
              activeTab === t.key ? "bg-primary text-primary-inv shadow-md" : "bg-surface border border-primary/10 hover:bg-primary/5"
            )}
          >
            <t.icon size={14} />
            {t.label}
            {t.count !== undefined && <span className="opacity-60">({t.count})</span>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Dashboard Tab ── */}
        {activeTab === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <Dashboard />
          </motion.div>
        )}

        {/* ── Orders Tab ── */}
        {activeTab === 'orders' && (
          activeOrder ? (
            <motion.div key="chat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="bg-surface rounded-3xl shadow-sm p-4 sm:p-6 max-w-3xl mx-auto">
              <AdminChat order={activeOrder} onBack={() => setSelectedOrder(null)} />
            </motion.div>
          ) : (
            <motion.div key="order-list" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              {orders.length === 0 ? (
                <div className="bg-surface rounded-3xl shadow-sm p-12 text-center">
                  <Package size={40} className="mx-auto opacity-15 mb-4" />
                  <p className="opacity-40">Заказов пока нет</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <motion.button
                      key={order.id}
                      onClick={() => setSelectedOrder(order.id)}
                      className="w-full bg-surface rounded-2xl shadow-sm p-5 flex items-center gap-4 text-left hover:shadow-md transition-shadow"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="bg-primary/5 rounded-full p-3">
                        <MessageCircle size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm">{order.name}</h4>
                          <span className="text-xs opacity-40">{order.createdAt}</span>
                        </div>
                        <p className="text-xs opacity-50 truncate">{order.phone}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs opacity-40">{order.items.length} товаров — {order.total} ₽</span>
                          <span className="bg-terracotta/10 text-terracotta text-[10px] font-bold px-2 py-0.5 rounded-full">{order.chat.length} сообщ.</span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )
        )}

        {/* ── Products Tab ── */}
        {activeTab === 'products' && (
          <motion.div key="products" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* Category Manager */}
            <div className="mb-4">
              <button
                onClick={() => setShowCatManager(!showCatManager)}
                className={cn(
                  "w-full flex items-center justify-between bg-surface rounded-2xl shadow-sm px-5 py-3 transition-all",
                  showCatManager ? "ring-2 ring-primary" : "hover:shadow-md"
                )}
              >
                <span className="text-sm font-bold">Категории ({storeCats.filter(c => c !== 'Все').length})</span>
                <span className="text-xs opacity-40">{showCatManager ? 'Скрыть' : 'Управление'}</span>
              </button>

              <AnimatePresence>
                {showCatManager && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-surface rounded-2xl shadow-sm p-4 mt-2 space-y-3">
                      {/* Add new category */}
                      <div className="flex gap-2">
                        <input
                          value={newCatName}
                          onChange={e => setNewCatName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newCatName.trim()) {
                              addCategory(newCatName.trim());
                              setNewCatName('');
                            }
                          }}
                          placeholder="Новая категория..."
                          className="flex-1 bg-background rounded-xl px-4 py-2.5 border border-primary/5 outline-none text-sm focus:ring-1 focus:ring-primary"
                        />
                        <button
                          onClick={() => {
                            if (newCatName.trim()) {
                              addCategory(newCatName.trim());
                              setNewCatName('');
                            }
                          }}
                          disabled={!newCatName.trim()}
                          className="bg-primary text-primary-inv rounded-xl px-4 py-2.5 text-sm font-bold hover:scale-105 active:scale-95 transition-transform disabled:opacity-30 disabled:scale-100"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* Category list */}
                      <div className="flex flex-wrap gap-2">
                        {storeCats.filter(c => c !== 'Все').map(cat => {
                          const isCustom = customCategories.includes(cat);
                          const productCount = allProducts.filter(p => p.category === cat).length;
                          return (
                            <span
                              key={cat}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                isCustom ? "bg-primary/10 border-primary/20" : "bg-background border-primary/5"
                              )}
                            >
                              {cat}
                              <span className="opacity-30">({productCount})</span>
                              {isCustom && (
                                <button
                                  onClick={() => removeCategory(cat)}
                                  className="ml-0.5 hover:text-red-500 transition-colors"
                                >
                                  <X size={10} />
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {(showAddForm || editingProduct) ? (
              <div className="bg-surface rounded-3xl shadow-sm p-6 mb-6">
                <ProductForm
                  initial={editingProduct || undefined}
                  onSave={handleSaveProduct}
                  onCancel={() => { setShowAddForm(false); setEditingProduct(null); }}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full bg-surface rounded-3xl shadow-sm p-5 flex items-center justify-center gap-3 mb-6 border-2 border-dashed border-primary/15 hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <div className="bg-primary/10 rounded-full p-2 group-hover:bg-primary group-hover:text-primary-inv transition-all">
                  <Plus size={20} />
                </div>
                <span className="font-bold opacity-60 group-hover:opacity-100 transition-opacity">Добавить товар</span>
              </button>
            )}

            <div className="space-y-3">
              {allProducts.map((product) => (
                <motion.div key={product.id} layout className="bg-surface rounded-2xl shadow-sm p-4 flex items-center gap-4">
                  <img src={product.image} alt={product.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm truncate">{product.name}</h4>
                    <p className="text-xs opacity-40">{product.category} — {product.sku}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <p className="text-sm font-bold">{product.price} ₽</p>
                      {product.colorVariants.length > 1 && (
                        <div className="flex gap-0.5 ml-2">
                          {product.colorVariants.slice(0, 5).map((v, i) => (
                            <span key={i} className="w-3 h-3 rounded-full border border-primary/10" style={{ backgroundColor: v.hex }} />
                          ))}
                          {product.colorVariants.length > 5 && <span className="text-[9px] opacity-30">+{product.colorVariants.length - 5}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={async () => {
                        // The cached `product` is the slim list version (no
                        // per-colour photos). Pull the full record so the
                        // edit form can preserve every photo on save.
                        try {
                          const full = await apiGetProduct(product.id);
                          setEditingProduct(dtoToProduct(full));
                        } catch {
                          setEditingProduct(product);
                        }
                        setShowAddForm(false);
                      }}
                      className="p-2.5 rounded-full hover:bg-primary/5 transition-colors"
                      title="Редактировать"
                    >
                      <Edit3 size={16} className="opacity-40" />
                    </button>
                    <button onClick={() => removeProduct(product.id)} className="p-2.5 rounded-full hover:bg-red-50 transition-colors" title="Удалить">
                      <Trash2 size={16} className="opacity-40 hover:text-red-500" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Recommendations Tab ── */}
        {activeTab === 'recommendations' && (
          <motion.div key="recommendations" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <RecommendationsManager />
          </motion.div>
        )}

        {/* ── Users Tab ── */}
        {activeTab === 'users' && (
          <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <UserManager />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
