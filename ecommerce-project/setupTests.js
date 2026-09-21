import '@testing-library/jest-dom';

// Polyfill window.matchMedia for JSDOM
if (typeof window !== 'undefined') {
  window.matchMedia = window.matchMedia || function (query) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };

  // Polyfill ResizeObserver for JSDOM (required by react-use-measure)
  window.ResizeObserver = window.ResizeObserver || class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Polyfill IntersectionObserver for JSDOM (required by motion/react useInView)
  window.IntersectionObserver = window.IntersectionObserver || class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}