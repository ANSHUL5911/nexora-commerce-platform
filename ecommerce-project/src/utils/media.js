/**
 * Media Normalizer and Architectural Fallback System for Nexora.
 * Guarantees that no broken image icons ever render in the browser.
 */

// Architectural inline SVG placeholder (zero external network dependency)
export const ARCHITECTURAL_PLACEHOLDER_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750" width="100%" height="100%" fill="%23F4F3F0"><rect width="100%" height="100%" fill="%23F4F3F0"/><rect x="40" y="40" width="520" height="670" fill="none" stroke="%23EAE9E5" stroke-width="1.5" stroke-dasharray="4 4"/><circle cx="300" cy="340" r="48" fill="none" stroke="%23D1D0CB" stroke-width="1.5"/><line x1="300" y1="280" x2="300" y2="400" stroke="%23D1D0CB" stroke-width="1.5"/><line x1="240" y1="340" x2="360" y2="340" stroke="%23D1D0CB" stroke-width="1.5"/><text x="300" y="440" font-family="monospace" font-size="12" fill="%238C887F" letter-spacing="2" text-anchor="middle">NEXORA ARCHIVE</text><text x="300" y="465" font-family="serif" font-style="italic" font-size="14" fill="%235C5850" text-anchor="middle">Form &amp; Function</text></svg>`;

export const CATEGORY_FALLBACK_IMAGES = {
  APPAREL: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80",
  FOOTWEAR: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80",
  ACCESSORIES: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
  LIVING: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80",
};

/**
 * Normalizes an image URL from product API data.
 * Fixes relative paths, protocol-relative paths, and known malformed seeds.
 */
export function normalizeProductImage(imageUrl, category = "") {
  if (!imageUrl || typeof imageUrl !== "string") {
    const catUpper = String(category).toUpperCase();
    return CATEGORY_FALLBACK_IMAGES[catUpper] || ARCHITECTURAL_PLACEHOLDER_SVG;
  }

  const trimmed = imageUrl.trim();

  // Fix known malformed Unsplash links from seed data (e.g. https://images.unsplash.com/chronograph)
  if (trimmed === "https://images.unsplash.com/chronograph" || trimmed.match(/^https?:\/\/images\.unsplash\.com\/[a-zA-Z0-9_-]+$/)) {
    const catUpper = String(category).toUpperCase();
    return CATEGORY_FALLBACK_IMAGES[catUpper] || CATEGORY_FALLBACK_IMAGES.ACCESSORIES;
  }

  // Already absolute http/https or data URI
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  // Relative path without leading slash (e.g., "images/products/shoe.jpg")
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }

  return trimmed;
}

/**
 * Image error event handler for <img> elements.
 * Gracefully swaps to the architectural placeholder without layout shift or browser broken icon.
 */
export function handleImageError(event, category = "") {
  const target = event.currentTarget || event.target;
  if (!target) return;

  const catUpper = String(category).toUpperCase();
  const curatedFallback = CATEGORY_FALLBACK_IMAGES[catUpper];

  // If already at fallback, go directly to reliable inline SVG
  if (target.src === ARCHITECTURAL_PLACEHOLDER_SVG) {
    return;
  }

  if (curatedFallback && target.src !== curatedFallback) {
    target.src = curatedFallback;
  } else {
    target.src = ARCHITECTURAL_PLACEHOLDER_SVG;
  }
}
