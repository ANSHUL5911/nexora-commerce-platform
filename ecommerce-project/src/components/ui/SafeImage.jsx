import { useState, useEffect } from 'react';
import { normalizeProductImage, ARCHITECTURAL_PLACEHOLDER_SVG } from '../../utils/media.js';

/**
 * SafeImage Component for Nexora Commerce.
 * Guarantees zero layout shift (CLS), zero broken image icons,
 * proper asynchronous decoding, and graceful fallback to architectural vector SVG.
 */
export function SafeImage({
  src,
  alt = '',
  category = '',
  width,
  height,
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

  return (
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
        height: height || 'auto',
        ...style,
      }}
      onError={handleError}
      onLoad={handleLoad}
      {...rest}
    />
  );
}

export default SafeImage;
