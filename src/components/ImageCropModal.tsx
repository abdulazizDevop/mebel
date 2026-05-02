/* Image crop modal — opens when admin picks a photo, lets them trim
 * sides/corners before the upload hits S3.
 *
 * Why crop client-side instead of letting S3/imagemagick do it server-side?
 *  1. Saves a round-trip (no upload-then-recrop-then-reupload dance).
 *  2. Mobile clients pick huge photos straight off the camera; cropping +
 *     re-encoding to JPEG ~quality 90 cuts the payload to a fraction before
 *     it leaves the device.
 *  3. The admin sees exactly what shoppers will see.
 */
import { useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import { X, Check, Palette, Pipette } from 'lucide-react';
import 'react-image-crop/dist/ReactCrop.css';

import { cn } from '../utils/cn';
import { preloadBackgroundRemoval, replaceBackground } from '../utils/backgroundRemoval';

interface Props {
  /** The original `File` the admin picked from gallery/camera. */
  file: File;
  /** Called with the cropped JPEG when the admin confirms. */
  onConfirm: (cropped: File) => void;
  /** Called when the admin closes without saving. */
  onCancel: () => void;
}

const ASPECT_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: 'Свободно', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
];

// Quick-pick palette for background swatches. The native colour input is
// always available below for anything custom.
const BG_PRESETS = ['#FFFFFF', '#F5F5F0', '#E8E2D4', '#1A1A1A', '#222831', '#D9CFC1', '#C1A78D', '#7E8C7C'];

function defaultCrop(width: number, height: number, aspect?: number): Crop {
  if (!aspect) {
    return { unit: '%', width: 90, height: 90, x: 5, y: 5 };
  }
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
    width,
    height,
  );
}

export function ImageCropModal({ file, onConfirm, onCancel }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  // Background-replacement state. Off by default — most product shots
  // already have a clean backdrop, so we don't slow down every save with
  // a 3-4 MB model download. When the admin toggles this on the lib
  // chunk starts loading in the background so the apply step is fast.
  const [bgEnabled, setBgEnabled] = useState(false);
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [bgProgress, setBgProgress] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (bgEnabled) preloadBackgroundRemoval();
  }, [bgEnabled]);

  const handleEyedropper = async () => {
    if (!('EyeDropper' in window)) {
      alert('Пипетка работает только в Chrome/Edge на компьютере.');
      return;
    }
    try {
      const dropper = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
      const result = await dropper.open();
      setBgColor(result.sRGBHex.toUpperCase());
    } catch {
      // user cancelled — silent
    }
  };

  // Read the file into a data URL so <img> can render it. Revoking the
  // ObjectURL would invalidate the rendered image, so we keep it for the
  // lifetime of the modal and let GC clean up on unmount.
  //
  // Safari occasionally fails to load `blob:` URLs in iframes / private
  // browsing — the FileReader fallback below is more reliable on iOS.
  useEffect(() => {
    let cancelled = false;
    try {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      return () => {
        cancelled = true;
        URL.revokeObjectURL(url);
      };
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        if (!cancelled && typeof reader.result === 'string') setImageSrc(reader.result);
      };
      reader.readAsDataURL(file);
      return () => { cancelled = true; };
    }
  }, [file]);

  const onImageLoad: React.ReactEventHandler<HTMLImageElement> = (e) => {
    const { width, height } = e.currentTarget;
    setCrop(defaultCrop(width, height, aspect));
  };

  const onAspectChange = (value: number | undefined) => {
    setAspect(value);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      setCrop(defaultCrop(width, height, value));
    }
  };

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img || !completedCrop || completedCrop.width < 1 || completedCrop.height < 1) return;

    setBusy(true);
    setBusyLabel('Обработка…');
    try {
      // Crop on a canvas at native resolution — `naturalWidth/Height` are
      // the file's actual pixels, while `width/height` are the rendered
      // size (potentially shrunk to fit the modal).
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const sx = completedCrop.x * scaleX;
      const sy = completedCrop.y * scaleY;
      const sw = completedCrop.width * scaleX;
      const sh = completedCrop.height * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
          'image/jpeg',
          0.9,
        ),
      );

      // Replace original extension with .jpg — we always re-encode to JPEG.
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
      let result = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });

      if (bgEnabled) {
        // Lazy-load the model + replace the backdrop. First run downloads
        // a few MB from IMG.LY's CDN; subsequent crops in the same session
        // reuse it. If anything fails (offline, unsupported browser) the
        // crop without bg-replace still goes through.
        setBusyLabel('Удаляю фон…');
        setBgProgress(0);
        try {
          result = await replaceBackground(result, {
            bgColor,
            onProgress: (p) => setBgProgress(p),
          });
        } catch (e) {
          alert(
            'Не удалось заменить фон: ' +
              (e instanceof Error ? e.message : 'unknown') +
              '. Загружаю исходное изображение.',
          );
        } finally {
          setBgProgress(null);
        }
      }

      onConfirm(result);
    } catch (err) {
      alert('Не удалось обрезать изображение: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface rounded-3xl shadow-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base sm:text-lg">Обрезать изображение</h3>
          <button onClick={onCancel} className="p-2 hover:bg-primary/5 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Aspect ratio chips — let admin lock to common product-photo shapes
            or stay free-form for irregular furniture. */}
        <div className="flex gap-1.5 sm:gap-2 mb-3 flex-wrap">
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => onAspectChange(opt.value)}
              className={cn(
                'text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-full transition-all',
                aspect === opt.value
                  ? 'bg-primary text-primary-inv'
                  : 'bg-background border border-primary/10 hover:bg-primary/5',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Background-replace block — toggle reveals colour picker.
            We don't auto-run the model on toggle; it fires on Save so the
            admin can crop+recolour in one step. */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setBgEnabled(v => !v)}
            className={cn(
              'w-full flex items-center justify-between gap-2 rounded-2xl px-4 py-2.5 border text-xs sm:text-sm font-bold transition-all',
              bgEnabled
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-background border-primary/10 hover:bg-primary/5',
            )}
          >
            <span className="flex items-center gap-2">
              <Palette size={14} />
              Изменить фон
            </span>
            <span
              className={cn(
                'relative w-9 h-5 rounded-full transition-all',
                bgEnabled ? 'bg-primary' : 'bg-primary/15',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all',
                  bgEnabled ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
          </button>

          {bgEnabled && (
            <div className="mt-2 bg-background rounded-2xl p-3 space-y-2.5 border border-primary/5">
              <p className="text-[10px] opacity-50 leading-relaxed">
                ИИ удалит фон и заменит его на выбранный цвет. Первый раз скачивается модель (~30 МБ), дальше работает быстро (кеш браузера).
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {BG_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBgColor(c)}
                    className={cn(
                      'w-7 h-7 rounded-full border-2 transition-all hover:scale-110',
                      bgColor.toUpperCase() === c.toUpperCase()
                        ? 'border-primary shadow-md ring-2 ring-primary/20 ring-offset-1'
                        : 'border-primary/10',
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9A-Fa-f]{6}$/.test(bgColor) ? bgColor : '#FFFFFF'}
                  onChange={(e) => setBgColor(e.target.value.toUpperCase())}
                  className="w-8 h-8 rounded-full border-0 cursor-pointer bg-transparent [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-2 [&::-webkit-color-swatch]:border-primary/10"
                  title="Произвольный цвет"
                />
                <button
                  type="button"
                  onClick={handleEyedropper}
                  className="p-1.5 rounded-full hover:bg-primary/10 transition-colors"
                  title="Пипетка (Chrome/Edge)"
                >
                  <Pipette size={14} className="opacity-50" />
                </button>
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => {
                    let v = e.target.value.trim().toUpperCase();
                    if (v && !v.startsWith('#')) v = '#' + v;
                    if (/^#?[0-9A-Fa-f]{0,6}$/.test(v.replace('#', ''))) setBgColor(v);
                  }}
                  maxLength={7}
                  spellCheck={false}
                  className="text-[11px] font-mono w-20 bg-surface rounded-md px-2 py-1.5 border border-primary/10 outline-none focus:ring-1 focus:ring-primary uppercase"
                />
                {bgProgress !== null && (
                  <span className="text-[10px] opacity-60 ml-auto">
                    Загрузка модели: {bgProgress}%
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Crop area — capped to 70vh so on tall portrait images the user
            can still see the controls below. */}
        <div className="flex-1 min-h-0 overflow-auto bg-black/5 rounded-2xl flex items-center justify-center mb-3 p-2">
          {imageSrc && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
              aspect={aspect}
              minWidth={20}
              minHeight={20}
              keepSelection
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="to crop"
                onLoad={onImageLoad}
                style={{ maxHeight: '60vh', maxWidth: '100%' }}
                draggable={false}
              />
            </ReactCrop>
          )}
        </div>

        {/* Buttons row 1 — primary actions */}
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full py-3 text-sm font-bold border border-primary/10 hover:bg-primary/5 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !completedCrop}
            className={cn(
              'flex-1 rounded-full py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all',
              busy || !completedCrop
                ? 'bg-primary/20 text-primary/40 cursor-not-allowed'
                : 'bg-primary text-primary-inv hover:scale-[1.02] active:scale-[0.98]',
            )}
          >
            <Check size={16} /> {busy ? (busyLabel || 'Обработка…') : 'Сохранить'}
          </button>
        </div>
        {/* Bypass — useful when Safari has trouble loading the image into
            the crop UI, or when the user just wants to upload as-is. */}
        <button
          type="button"
          onClick={() => onConfirm(file)}
          disabled={busy}
          className="w-full text-xs opacity-60 hover:opacity-100 underline transition-opacity"
        >
          Загрузить без обрезки
        </button>
      </div>
    </div>
  );
}
