---
name: MessMate
colors:
  surface: '#f0fdf4'
  surface-dim: '#d0ddd5'
  surface-bright: '#f0fdf4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaf7ee'
  surface-container: '#e4f1e8'
  surface-container-high: '#deebe3'
  surface-container-highest: '#d9e6dd'
  on-surface: '#131e19'
  on-surface-variant: '#3e4943'
  inverse-surface: '#27332d'
  inverse-on-surface: '#e7f4eb'
  outline: '#6e7a73'
  outline-variant: '#bdc9c1'
  surface-tint: '#006c4e'
  primary: '#005d42'
  on-primary: '#ffffff'
  primary-container: '#047857'
  on-primary-container: '#9ffdd3'
  inverse-primary: '#7bd8b1'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#495167'
  on-tertiary: '#ffffff'
  tertiary-container: '#616980'
  on-tertiary-container: '#e4e9ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#97f5cc'
  primary-fixed-dim: '#7bd8b1'
  on-primary-fixed: '#002115'
  on-primary-fixed-variant: '#00513a'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#f0fdf4'
  on-background: '#131e19'
  surface-variant: '#d9e6dd'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a vibrant, premium, and professional aesthetic tailored for modern utility. The visual personality is rooted in trustworthiness, freshness, and high-end execution, evoking an immediate sense of reliability paired with contemporary flair. 

We embrace a refined **Glassmorphism meets Minimalism** approach. The interface relies on clean typographic hierarchy, frosted glass surfaces with subtle backdrop blurs, and an invigorating color palette that balances operational grounding with moments of dynamic warmth.

## Colors

The color palette is built on rich Emerald Green as the anchor primary, paired with Warm Gold for high-value accents and states. Deep Forest Charcoal provides structure and supreme legibility for all text and structural framing, while the soft mint background delivers an expansive, breathable canvas that reduces eye strain and elevates the premium feel.

## Typography

Using **Plus Jakarta Sans** throughout creates a unified, soft, and welcoming tone. Letterforms feature subtle geometric characteristics that scale impeccably from dense data displays to sprawling promotional headers. Ensure high-contrast pairings between Deep Forest Charcoal text and the soft mint backgrounds to maintain supreme accessibility standards.

## Elevation & Depth

Depth is achieved primarily through **ambient frosted glass layers** paired with soft, highly diffused color-tinted shadows. 

- Use translucent surfaces (`rgba(255, 255, 255, 0.75)`) combined with backdrop blurs (`blur(12px)`) to simulate physical elevation.
- Shadows should pull subtle warmth from the Emerald Green and Deep Forest Charcoal palettes rather than relying on harsh black opacities, ensuring a cohesive and luminous spatial hierarchy.

## Shapes

The shape language relies on a friendly, approachable **rounded** aesthetic (roundedness level `2`). 
- Standard UI components feature a base `0.5rem` border radius.
- Larger containers and cards utilize `1rem` to `1.5rem` radii (`rounded-lg` and `rounded-xl`), softening the interface geometry while maintaining professional alignment.

## Components

- **Buttons:** Primary actions utilize solid Emerald Green (`#047857`) with crisp hover states shifting to deeper tones, paired with Plus Jakarta Sans labels. Secondary actions use ghost styles with subtle emerald borders. Accent triggers leverage Warm Gold (`#f59e0b`).
- **Chips:** Compact, pill-shaped indicators featuring soft minting or translucent fills, ideal for filtering states and categorization.
- **Lists:** Clean typographic stacking with generous vertical padding, separated by low-opacity emerald dividers.
- **Checkboxes & Radio Buttons:** Custom-styled geometric inputs featuring rounded corners, utilizing Emerald Green for active selection states.
- **Input Fields:** Outlined text boxes with soft background fills, transitioning to high-contrast emerald focus rings and floating labels.
- **Cards:** Frosted glass containers featuring subtle borders, generous internal padding, and elevated drop shadows to segment complex information hierarchies.
- **Navigation:** Fixed or floating glassmorphic navbars utilizing backdrop blurs to anchor the viewport experience.