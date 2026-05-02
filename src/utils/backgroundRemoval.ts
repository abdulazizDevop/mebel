/* Browser-side background removal + recolor.
 *
 * Wraps `@imgly/background-removal` (~3-4 MB WASM model, downloaded from
 * IMG.LY's CDN on first use) so the rest of the app can call a simple
 * `replaceBackground(file, '#FFFFFF')` and get back a JPG.
 *
 * Why dynamic import: the model + WASM bundle is heavy. Loading it eagerly
 * would bloat the initial bundle and slow down every admin session even
 * when they don't touch the background-change feature. The dynamic import
 * means the chunk is only fetched when the admin actually opens the
 * "Изменить фон" UI for the first time.
 */

let _libPromise: Promise<typeof import('@imgly/background-removal')> | null = null;

function loadLib() {
  if (!_libPromise) _libPromise = import('@imgly/background-removal');
  return _libPromise;
}

/** Optional: warm the chunk cache the moment the admin opens the panel,
 *  before they hit the apply button. Silent if it fails — we'll retry
 *  during the actual call. */
export function preloadBackgroundRemoval(): void {
  loadLib().catch(() => {/* model fetch will retry on real use */});
}

interface ReplaceOptions {
  /** Hex colour for the new background, e.g. `#FFFFFF`. */
  bgColor: string;
  /** Optional callback to surface model-download progress. */
  onProgress?: (percent: number) => void;
}

/**
 * Removes the background from `file` and composites the cutout on top of a
 * solid `bgColor`. Returns a JPEG `File` ready for upload.
 *
 * Throws if the model fails to load (offline, browser doesn't support
 * required APIs) — caller should fall back to the original file with a
 * user-visible warning.
 */
export async function replaceBackground(
  file: File,
  { bgColor, onProgress }: ReplaceOptions,
): Promise<File> {
  const { removeBackground } = await loadLib();

  const cutoutBlob = await removeBackground(file, {
    progress: (key, current, total) => {
      // The library emits progress per asset (model download, fetch, etc.).
      // Coalesce into a single 0-100 number for the UI.
      if (total > 0 && onProgress) {
        onProgress(Math.min(100, Math.round((current / total) * 100)));
      }
    },
  });

  // Decode the cutout (PNG with transparent background) so we can paint it
  // onto a coloured canvas at native resolution.
  const cutout = await blobToImage(cutoutBlob);

  const canvas = document.createElement('canvas');
  canvas.width = cutout.naturalWidth;
  canvas.height = cutout.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cutout, 0, 0);

  const finalBlob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
  );

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([finalBlob], `${baseName}-bg.jpg`, { type: 'image/jpeg' });
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode cutout image'));
    };
    img.src = url;
  });
}
