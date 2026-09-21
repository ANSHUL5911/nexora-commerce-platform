import { useEffect } from 'react';

/**
 * Dynamic Head & Structured Data manager for Nexora Commerce.
 * Authoritatively manages document title, meta descriptions, and schema.org JSON-LD per route.
 */
export function SEOHead({
  title,
  description,
  canonical,
  jsonLd,
}) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (title) {
      document.title = title.includes('Nexora') ? title : `${title} — Nexora`;
    }

    if (description) {
      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) {
        descMeta.setAttribute('content', description);
      }
    }

    if (canonical) {
      const canonicalLink = document.querySelector('link[rel="canonical"]');
      if (canonicalLink) {
        canonicalLink.setAttribute('href', canonical);
      }
    }

    let scriptTag = null;
    if (jsonLd) {
      scriptTag = document.createElement('script');
      scriptTag.type = 'application/ld+json';
      scriptTag.setAttribute('data-nx-route-schema', 'true');
      scriptTag.text = JSON.stringify(jsonLd);
      document.head.appendChild(scriptTag);
    }

    return () => {
      if (scriptTag && scriptTag.parentNode) {
        scriptTag.parentNode.removeChild(scriptTag);
      }
    };
  }, [title, description, canonical, jsonLd]);

  return null;
}

export default SEOHead;
