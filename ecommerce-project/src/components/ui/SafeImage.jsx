import { useState, useEffect } from 'react';
import { normalizeProductImage, ARCHITECTURAL_PLACEHOLDER_SVG } from '../../utils/media.js';

/**
 * Returns AVIF and WebP source paths for local product imagery.
 */
function getResponsiveSources(src) {
  if (!src || typeof src !== 'string') return null;
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) return null;
  const match = src.match(/^(\/images\/products\/[^.]+)\.(jpg|jpeg|png)$/i);
  if (match) {
    const basePath = match[1];
    return {
      avif: `${basePath}.avif`,
      webp: `${basePath}.webp`,
    };
  }
  return null;
}

/**
 * SafeImage Component for Nexora Commerce.
 * Guarantees zero layout shift (CLS), zero broken image icons,
 * proper asynchronous decoding, modern picture/AVIF/WebP responsive sources,
 * and graceful fallback to architectural vector SVG.
 */
export function SafeImage({
  src,
  alt = '',
  category = '',
  width = 600,
  height = 750,
  loading = 'lazy',
  decoding = 'async',
  className = '',
  style = {},
  fallbackSrc = ARCHITECTURAL_PLACEHOLDER_SVG,
  normalize = true,
  onError,
  onLoad,
  ...rest
}) {
  const [currentSrc, setCurrentSrc] = useState(() => (
    !normalize ? (src || fallbackSrc) : normalizeProductImage(src, category)
  ));
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextSrc = !normalize ? (src || fallbackSrc) : normalizeProductImage(src, category);
    setCurrentSrc(nextSrc);
    setHasError(false);
  }, [src, category, fallbackSrc, normalize]);

  const handleError = (e) => {
    if (!hasError && currentSrc !== fallbackSrc) {
      setHasError(true);
      setCurrentSrc(fallbackSrc);
    }
    onError?.(e);
  };

  const handleLoad = (e) => {
    onLoad?.(e);
  };

  const responsiveSources = !hasError ? getResponsiveSources(currentSrc) : null;

  const imgElement = (
    <img
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      className={`nx-safe-image ${hasError ? 'nx-safe-image--fallback' : ''} ${className}`.trim()}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: height ? `${height}px` : 'auto',
        aspectRatio: `${width}/${height}`,
        objectFit: 'cover',
        ...style,
      }}
      onError={handleError}
      onLoad={handleLoad}
      {...rest}
    />
  );

  if (responsiveSources) {
    return (
      <picture className="nx-safe-picture" style={{ display: 'block', maxWidth: '100%' }}>
        <source type="image/avif" srcSet={responsiveSources.avif} />
        <source type="image/webp" srcSet={responsiveSources.webp} />
        {imgElement}
      </picture>
    );
  }

  return imgElement;
}

export default SafeImage;
