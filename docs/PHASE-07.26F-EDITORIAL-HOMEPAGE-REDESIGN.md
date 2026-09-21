# Phase 07.26F — Nexora Award-Winning Editorial Homepage
## Real Component Libraries (Unlumen UI & SmoothUI) + Editorial Art Direction

**Document Version:** 1.0.0  
**Phase:** 07.26F  
**Status:** COMPLETE & FROZEN  
**Design North Star:** Architectural Editorial Commerce (Apple precision + Aesop restraint + COS composition + Linear discipline)  
**Taste Settings:** `DESIGN_VARIANCE = 7`, `MOTION_INTENSITY = 5`, `VISUAL_DENSITY = 3`  

---

## 1. Visual Problem Audit (Before)

Before Phase 07.26F, the initial customer storefront had several significant UX gaps and visual defects:
1. **Broken Product Images & Browser Broken-Image Icons:** Products with malformed seed URLs (such as `https://images.unsplash.com/chronograph` lacking photo IDs or relative paths missing leading slashes) rendered default browser broken-image icons or 404s.
2. **Raw Catalog Controls on Brand Landing:** The homepage featured generic product cards with raw quantity select dropdowns, Add to Cart buttons, and rating star bars identical to a utility catalog.
3. **Weak Hierarchy & Layout Sprawl:** Excessive unstructured whitespace, generic card soup, and absence of architectural pacing or editorial narrative.
4. **Horizontal Document Overflow on Mobile:** On narrow viewports (375px–390px), fixed-width controls and unconstrained flex containers caused `document.documentElement.scrollWidth > document.documentElement.clientWidth`.
5. **No Editorial Brand Campaign Opener:** Lack of narrative connection between the brand's reductionist philosophy and its physical artifacts.

---

## 2. Redesign Strategy & Creative Direction

Rather than building generic custom visual effects or dropping unmodified library demos onto the page, Phase 07.26F enforced a **library-backed, heavily themed editorial system**:

$$\text{NEXORA DESIGN SYSTEM} + \text{SELECTED REAL LIBRARY PRIMITIVES} = \text{AWARD-WINNING STOREFRONT}$$

The homepage was recomposed into **8 continuous editorial sections**:
- **01 HEADER:** Sticky architectural navigation (wordmark linking to `/`, search, catalog link, cart badge, customer sign-in/account, with strict admin isolation redirecting admin users to `/admin`).
- **02 HERO:** Asymmetric campaign opener (*Autumn / Winter Edition*) featuring real Unlumen `MagneticButton` for the primary CTA, serene typography, and high-fidelity still imagery.
- **03 COLLECTION INTRODUCTION:** Architectural manifesto (*"Objects designed around material, proportion and everyday utility."*) with hairline structural divider and technical specification pills.
- **04 EDITORIAL FEATURE:** Asymmetric visual story (*Collection 01 — Material before ornament.*) using real Unlumen `TextReveal` for word-by-word scroll entrance, technical metadata grid, and deep-dive provenance modal trigger.
- **05 SHOP BY CATEGORY:** Editorial taxonomy (*01 Apparel, 02 Living, 03 Footwear, 04 Accessories*) powered by real SmoothUI `AnimatedTabs` for active discipline selection, hairline borders, and hover arrow animations.
- **06 SELECTED OBJECTS:** 3-column desktop (2-col tablet, 1-col mobile) curated grid using `EditorialObjectCard`. 4:5 portrait aspect ratio, sequential indexes (`01`–`06`), formatted prices in Indian Rupees (₹), entire card linking to `/product/:id`, and zero raw catalog controls.
- **07 BRAND PHILOSOPHY:** Architectural editorial quote with 3 foundation pillars: *Tactile Permanence*, *Proportional Restraint*, and *Ethical Provenance*.
- **08 FOOTER:** Complete architectural footer with collection taxonomy, navigation links, edition status badge, coordinate metadata (`LAT 28.6139° N / LON 77.2090° E`), and copyright.

---

## 3. Real Component Libraries Integration Record

As strictly required by the prompt, **real component libraries were added and imported directly into the codebase**, avoiding custom pseudo-reimplementations:

| Component | Library | Actual Installed? | Installation Method | Source File | Used Where |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Magnetic Button** | Unlumen UI | **YES** | Registry Component (`shadcn` format) | `src/components/unlumen-ui/primitives/magnetic-button.tsx` | Hero Primary CTA (`Explore Collection →`) |
| **Text Reveal** | Unlumen UI | **YES** | Registry Component (`shadcn` format) | `src/components/unlumen-ui/primitives/text-reveal.tsx` | Editorial Feature Headline (*"Material before ornament."*) |
| **Animated Tabs** | SmoothUI | **YES** | SmoothUI CLI Component | `src/components/smoothui/ui/smoothui/animated-tabs/index.tsx` | Shop by Category Discipline Selector |
| **Image Metadata Preview** | SmoothUI | **YES** | SmoothUI CLI Component | `src/components/smoothui/ui/smoothui/image-metadata-preview/index.tsx` | Featured Artifact Architectural Provenance Modal |
| **Product Card** | SmoothUI | *EVALUATED & OMITTED* | CLI Available | `smoothui/ui/smoothui/product-card` | **Intentionally omitted:** Contains badges, ratings, and Add-to-Cart buttons that fundamentally conflict with the editorial "Selected Objects" presentation. |
| **Infinite Slider** | SmoothUI | *OMITTED* | CLI Available | `smoothui/ui/smoothui/infinite-slider` | **Intentionally omitted:** Prompt strictly prohibits default product carousels to prevent AI slop. |
| **Morph Surface** | SmoothUI | *OMITTED* | CLI Available | `smoothui/ui/smoothui/morph-surface` | **Intentionally omitted:** Kept out to prevent turning the homepage into an unfocused component showcase. |

---

## 4. Component Theming & Customization

The component libraries provide spring physics and interaction discipline; **Nexora strictly dictates all aesthetics**:
- **Design Tokens:**
  - Canvas: `#F9F9F8`
  - Surface: `#FFFFFF`
  - Subtle Surface: `#F4F3F0`
  - Structural Border: `#EAE9E5`
  - Strong Border: `#D1D0CB`
  - Text Primary: `#121212`
  - Text Secondary: `#525250`
  - Text Muted: `#787875`
- **Typography:** Newsreader (display serif), Inter (functional sans-serif), JetBrains Mono (architectural metadata & prices).
- **Utility Mapping:** Built `src/lib/utils.js` exporting `cn(...inputs)` via `clsx` and `tailwind-merge`, and mapped CSS variables to Nexora tokens, ensuring zero styling collisions and no destructive Tailwind 4 migrations.

---

## 5. Media Normalization & Reliability Pipeline

Built `src/utils/media.js` with comprehensive fallback defenses:
1. **`normalizeProductImage(imageUrl, category)`:**
   - Detects known malformed seed URLs (e.g. `https://images.unsplash.com/chronograph`) and maps them to curated high-resolution category photography.
   - Enforces leading slashes on relative paths (e.g. `images/products/...` $\rightarrow$ `/images/products/...`) to prevent 404s when navigating nested routes.
2. **`handleImageError(event, category)`:**
   - Swaps failing images dynamically to a category-specific fallback or an architectural inline SVG wireframe placeholder (`ARCHITECTURAL_PLACEHOLDER_SVG`).
   - Completely eliminates broken-image browser icons and prevents Cumulative Layout Shift (CLS) via predictable `4 / 5` aspect ratios.
3. **Protected Components:**
   - Applied to `EditorialObjectCard.jsx`, `Product.jsx` (Catalog), and `ProductDetailPage.jsx`.

---

## 6. Zero Document Horizontal Overflow & Responsiveness

- Verified across all required breakpoints: **1440px, 1280px, 1024px, 768px, 430px, 390px, and 375px**.
- Verified in browser subagent:
  $$\text{document.documentElement.scrollWidth} \le \text{document.documentElement.clientWidth} \quad (\text{TRUE at all viewports})$$
- Root fixes applied:
  - Removed all hardcoded button/quantity wrapper min-widths on mobile.
  - Set `min-width: 0` on grid items to prevent intrinsic image blowout.
  - Used `width: 100%` instead of `100vw` to prevent vertical scrollbar inclusion.
  - Recomposed 3-column desktop layout into 2 columns on tablet and 1 column on mobile.

---

## 7. Motion & Accessibility

- **Emil Kowalski Principles:**
  - Motion intensity bounded at `5/10`.
  - Preferred properties: `transform` (GPU accelerated) and `opacity`.
  - Spring easing configurations (`stiffness: 150`, `damping: 15`, `bounce: 0.05`).
- **Accessibility:**
  - All real components include `useReducedMotion()` checks, automatically disabling spring offsets and blur transitions when reduced motion is preferred.
  - Semantic landmark roles (`banner`, `main`, `region`, `dialog`, `contentinfo`).
  - Full keyboard navigation on SmoothUI `AnimatedTabs` (Arrow keys, Home, End) and modal focus trapping.
  - Minimum touch targets ($\ge 44 \times 44\text{px}$) maintained on mobile.

---

## 8. Verification Results

### Frontend Unit & Integration Tests (Vitest)
```
Test Files  33 passed (33)
     Tests  244 passed (244)
  Duration  48.44s
```
- Includes dedicated Phase 07.26F test suite: `src/pages/home/HomePage.phase0726f.test.jsx` (4/4 passing).
- Includes real library components import suite: `src/libraryComponents.test.jsx` (4/4 passing).
- Includes media normalization suite: `src/utils/media.test.js` (5/5 passing).

### Frontend Lint & Build
```
npm run lint  --> 0 errors, 0 warnings (Clean)
npm run build --> Built in 7.39s (dist generated cleanly)
```

### Backend Test Suite & Lint
```
npm test      --> 59 passed (59 test files, 509 tests passing)
npm run lint  --> 0 errors, 0 warnings (Clean)
```

### Browser Subagent Visual QA
- Inspected live desktop (`1440x900`) and mobile (`390x844`).
- All 8 editorial sections validated without visual defects.
- Provenance modal inspected, opened, verified, and closed cleanly.
- Video recording artifact generated: `editorial_homepage_qa_1789970965772.webp`.
