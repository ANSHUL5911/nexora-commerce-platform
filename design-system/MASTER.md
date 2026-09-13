# Nexora Design System — Master Specification
# Version 1.0 (Architectural Editorial Commerce)

## 1. Design North Star & Personality
- **Visual Character**: Crisp editorial typography paired with warm neutral canvases, structured 1px alignments, and generous intentional whitespace.
- **Interaction Character**: Decisive, tactile, and restrained. Micro-interactions communicate causality and state transitions in 100ms–150ms.
- **Brand Perception**: Quiet luxury, fiduciary integrity, and authentic product craftsmanship.
- **Core Principle**: Product is the protagonist. Every pixel serves comprehension.

---

## 2. Design Tokens Schema

### Color Palette
```css
:root {
  /* Canvas & Surfaces */
  --color-canvas: #F9F9F8;
  --color-surface: #FFFFFF;
  --color-surface-subtle: #F4F3F0;
  --color-surface-elevated: #FFFFFF;

  /* Typography Colors */
  --color-text-primary: #121212;
  --color-text-secondary: #525250;
  --color-text-muted: #787875;
  --color-text-inverse: #FFFFFF;

  /* Structural Borders */
  --color-border-subtle: #EAE9E5;
  --color-border-strong: #D1D0CB;
  --color-border-focus: #121212;

  /* Semantic Feedback Tokens */
  --color-status-success: #0D5F3A;
  --color-status-success-bg: #EDF7F2;
  --color-status-warning: #92400E;
  --color-status-warning-bg: #FEF3C7;
  --color-status-error: #9E1C1C;
  --color-status-error-bg: #FDF2F2;
  --color-status-info: #1E40AF;
  --color-status-info-bg: #EFF6FF;

  /* Brand Accents */
  --color-accent-primary: #121212;
  --color-accent-hover: #2B2B2B;
  --color-accent-active: #000000;
}
```

### Typography Hierarchy
```css
:root {
  --font-display: 'Newsreader', Georgia, serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;

  /* Typographic Scales */
  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */
}
```

### Spacing & Grid System
```css
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */

  --container-max: 1320px;
  --container-checkout: 1040px;
}
```

### Structural Radii & Shadows
```css
:root {
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  --shadow-subtle: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.08);
}
```

---

## 3. Anti-AI-Slop Prohibitions
1. **No decorative gradients**: Solid `#F9F9F8` canvas; no mesh, rainbow, or neon background gradients.
2. **No floating blobs or glowing elements**: Box shadows must be crisp and shallow.
3. **No excessive glassmorphism**: Solid `#FFFFFF` cards with 1px `#EAE9E5` borders.
4. **No cards inside cards**: Clean horizontal dividers instead of nested bordered boxes.
5. **No bounce or endless motion**: 100ms–150ms transitions strictly communicating state changes.
6. **No fake scarcity or fake timers**: All timers must be presentation representations of backend `expires_at`.
7. **No disappearing placeholder labels**: Inputs must feature persistent top labels.
8. **Honor `prefers-reduced-motion`**: Instant transitions when reduced motion is requested.
