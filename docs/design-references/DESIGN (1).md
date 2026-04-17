# Design System Specification v3.0

## 1. Overview & Creative North Star: "The Digital Sanctuary"

This design system is engineered to move beyond the utilitarian "SaaS dashboard" aesthetic. Our North Star is **The Digital Sanctuary**—a space that prioritizes cognitive ease, editorial elegance, and high-end Korean craftsmanship. 

Unlike standard frameworks that rely on rigid grids and heavy borders, this system utilizes **Intentional Asymmetry** and **Tonal Depth**. By embracing a "Calm Dashboard" philosophy, we strip away visual noise (no "AI" badges, no aggressive shadows, no 1px borders) to create an experience that feels curated rather than generated. We treat the screen as a canvas for high-end editorial content where white space is an active functional element.

---

## 2. Color Architecture & Surface Logic

We leverage the **OKLCH** color space to ensure perceptual uniformity and vibrant, sophisticated tones. Our palette moves away from "digital blue" toward a deeper, more intentional spectrum.

### Core Tokens (OKLCH)
- **Primary:** `oklch(0.62 0.15 240)` — A deep, authoritative blue for core actions.
- **Widget Primary:** `oklch(0.58 0.12 200)` — A muted, teal-leaning slate for information containers.
- **Background Light:** `oklch(0.99 0 0)` — A pristine, off-white "Paper" base.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to define sections. All containment must be achieved through:
1.  **Background Shifts:** Placing a `surface-container-low` element against a `surface` background.
2.  **Tonal Transitions:** Using the `surface-container` tiers (Lowest to Highest) to create "nested" depth.

### Glass & Gradient Implementation
To avoid a "flat" template look, floating elements (modals, tooltips) should utilize **Glassmorphism**:
- **Fill:** `surface` tokens at 80% opacity.
- **Backdrop:** `blur(20px)`.
- **Polish:** CTAs may use a subtle linear gradient from `primary` to `primary_container` (155° angle) to add "soul" and dimension.

---

## 3. Typography: The Editorial Scale

Our typography is a bi-lingual dialogue. We pair the precision of **Pretendard Variable** with the geometric warmth of **DM Sans**.

### The Hybrid Headline Rule
In mixed-language headlines, the Korean text must be scaled down by **20-30%** relative to the English text to balance visual weight. 
- **Korean:** `font-family: "Pretendard Variable"`, `word-break: keep-all`, `line-height: 1.8`.
- **English:** `font-family: "DM Sans"`.

| Token | Size | Font (EN/KR) | Role |
| :--- | :--- | :--- | :--- |
| **display-lg** | 3.5rem | DM Sans / Pretendard | Editorial Hero statements. |
| **headline-md** | 1.75rem | DM Sans / Pretendard | Section entries; mixed-scale applied. |
| **title-md** | 1.125rem | Pretendard | Card titles, Primary navigation. |
| **body-lg** | 1.0rem | Pretendard | Long-form reading (1.8 line-height). |
| **label-sm** | 0.6875rem | DM Sans | Metadata and small utility caps. |

*Strict Prohibition: Inter, Roboto, and system sans-serifs are forbidden to maintain the signature identity.*

---

## 4. Elevation & Tonal Layering

Hierarchy is conveyed through **Tonal Stacking** rather than structural lines.

### The Layering Principle
Think of the UI as physical sheets of fine paper. 
- **Base Layer:** `surface` (The foundation).
- **Secondary Layer:** `surface-container-low` (Asymmetric grid zones).
- **Active Card Layer:** `surface-container-lowest` (Highest contrast for focus).

### Ambient Shadows & "Ghost Borders"
When a "floating" effect is required (L1-L4), use **Multi-layered Shadows**:
- **Style:** Extra-diffused, 4-8% opacity.
- **Tint:** Shadow color must be a tinted version of `on-surface` (not pure black).
- **Ghost Borders:** If a container requires a border for accessibility, use `outline-variant` at **15% opacity**. Never 100%.

---

## 5. Layout: The Asymmetric Bento

This system rejects the "Uniform 3-Column Grid." We use an **Asymmetric Bento Grid** to create visual interest.

- **Spacing:** Strict 4px-based increments (8px, 12px, 16px, 24px, 32px, 48px, 64px).
- **Corner Radii:** 
    - **8px:** Buttons, input fields.
    - **12px / 16px:** Small widgets, nested containers.
    - **24px:** Main Bento cards.
- **Composition:** Combine large "Hero" cards (e.g., 2x2) with slender "Utility" cards (1x2) to create a rhythmic, non-repetitive flow.

---

## 6. Components

### Buttons
- **Primary:** High-contrast `primary` background. No border. 8px radius.
- **Tertiary:** No background. `on-surface` text. Interaction revealed via a soft `surface-container-high` hover state.
- **Motion:** 200ms ease-out scale on press (0.98x).

### Inputs & Fields
- **Surface:** Use `surface-container-lowest` for the field background.
- **State:** On focus, use a 2px "Focus Ring" using the `primary` token at 30% opacity, offset by 2px.
- **No Borders:** Use background contrast to define the input zone.

### Cards & Lists
- **Rule:** Absolute prohibition of divider lines (`<hr>`). 
- **Separation:** Use 24px vertical white space or a slight shift from `surface-container` to `surface` to denote list item boundaries.

### Navigation (The Signature "Calm" Nav)
- Minimalist sidebar using `surface-container-low`. 
- Active states indicated by a subtle `primary` vertical "pill" (4px width) and a weight shift in Pretendard.

---

## 7. Do's and Don'ts

### Do
- **Do** prioritize Korean text in all contexts unless it is a global brand name or a metric.
- **Do** use sequential entrance animations (staggered fade-in + slide-up 10px) for Bento cards.
- **Do** use `keep-all` for Korean text to prevent awkward word breaks.
- **Do** ensure all text is 100% opacity to maintain "The Digital Sanctuary" clarity.

### Don't
- **Don't** use "AI Powered" or "Magic" badges/glitter icons. We communicate intelligence through UX, not labels.
- **Don't** use text-opacity. If a label is secondary, use a lighter color token (`on-surface-variant`), not 50% opacity.
- **Don't** align everything to a center axis. Embrace the "left-heavy" or "editorial-offset" layout.
- **Don't** use standard shadows. If it looks like a default CSS shadow, it is wrong.