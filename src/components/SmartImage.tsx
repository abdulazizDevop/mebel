import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { imageVariant, type ImageSize } from '../utils/images';

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Original image URL (what the API stores). */
  src: string;
  /** Rendition to request; falls back to `src` if it 404s. */
  size: ImageSize;
}

/** <img> that loads the small WebP rendition and silently falls back to the
 *  original when the rendition does not exist yet. */
export function SmartImage({ src, size, loading = 'lazy', decoding = 'async', ...rest }: SmartImageProps) {
  const variant = imageVariant(src, size);
  const [current, setCurrent] = useState(variant);
  useEffect(() => setCurrent(variant), [variant]);
  return (
    <img
      {...rest}
      src={current}
      loading={loading}
      decoding={decoding}
      onError={(e) => {
        if (current !== src) setCurrent(src);
        rest.onError?.(e);
      }}
    />
  );
}
