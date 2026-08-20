---
name: StudioFlow
colors:
  surface: '#FFFFFF'
  surface-dim: '#d1daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dfe8fe'
  surface-container-highest: '#dae3f8'
  on-surface: '#131c2b'
  on-surface-variant: '#464555'
  inverse-surface: '#283141'
  inverse-on-surface: '#ecf0ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#555e74'
  on-secondary: '#ffffff'
  secondary-container: '#d7dff9'
  on-secondary-container: '#5a6278'
  tertiary: '#004c77'
  on-tertiary: '#ffffff'
  tertiary-container: '#00659c'
  on-tertiary-container: '#bfdfff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#d9e2fc'
  secondary-fixed-dim: '#bdc6e0'
  on-secondary-fixed: '#121b2e'
  on-secondary-fixed-variant: '#3e475b'
  tertiary-fixed: '#cde5ff'
  tertiary-fixed-dim: '#94ccff'
  on-tertiary-fixed: '#001d32'
  on-tertiary-fixed-variant: '#004b74'
  background: '#f9f9ff'
  on-background: '#131c2b'
  surface-variant: '#dae3f8'
  canvas: '#F7F7F5'
  surface-subtle: '#F1F3F5'
  border: '#DDE1E6'
  text-muted: '#7B8495'
  primary-hover: '#4338CA'
  primary-subtle: '#EEF2FF'
  focus-ring: '#6366F1'
  success: '#15803D'
  success-subtle: '#ECFDF3'
  warning: '#B45309'
  warning-subtle: '#FFF7E6'
  danger: '#B91C1C'
  danger-subtle: '#FEF2F2'
  info-subtle: '#F0F9FF'
typography:
  page-title:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  section-title:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  card-title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 21px
  table-dense:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  screen-padding: 24px
  card-padding: 16px
  gutter: 16px
  sidebar-expanded: 248px
  sidebar-collapsed: 72px
  topbar-height: 64px
---

## Brand & Style

The design system is built for a professional agency workspace, prioritizing operational efficiency over marketing flair. The brand personality is calm, clear, and human, aiming to provide a trustworthy environment for complex creative production.

The visual style is **Corporate / Modern** with a lean toward **Minimalism**. It avoids distractions like gradients, glassmorphism, or neon accents. Instead, it relies on a structured grid, high-quality typography, and purposeful color usage to create a "Fast by Default" experience. The aesthetic is defined by "Scan before Reading," ensuring that information hierarchy is immediately apparent to power users.

## Colors

This design system uses a logic-driven color palette focused on status and workflow clarity. The primary Indigo (#4F46E5) is reserved for the visually dominant "next action" on every screen.

### Usage Guidelines
- **Canvas vs. Surface:** Use the Canvas color (#F7F7F5) for the main application background and White (#FFFFFF) for cards and content containers to create subtle depth.
- **Status Communication:** Status is communicated through a combination of text, icons, and pale semantic backgrounds. Large surface areas (like full cards) should never be filled with saturated status colors.
- **Interactive States:** Use "Primary Hover" for button interactions and the specific "Focus Ring" color for all keyboard navigation and input focus states to meet accessibility standards.

## Typography

The typography system leverages **Inter** for its exceptional legibility in data-heavy environments. The scale is designed to support "Scan before Reading" by providing clear contrast between structural titles and operational metadata.

### Rules
- **Casing:** Use sentence case for all UI strings. Avoid all-caps, reserving them only for small, non-essential metadata labels.
- **Dense Views:** For planning lists and data tables, utilize the `table-dense` token to maximize information density without sacrificing readability.
- **Accessibility:** Ensure all text-to-background contrast ratios meet WCAG 2.2 AA requirements.

## Layout & Spacing

The layout is built on a **4px base spacing system**, ensuring a consistent vertical and horizontal rhythm. 

### Grid & Structure
- **Desktop:** A responsive 12-column grid is used for main content. Data tables and planning lists are allowed to use the full available width to maximize operational utility.
- **Sidebar:** The primary navigation resides in a left sidebar. It supports an expanded state (248px) for navigation and a collapsed state (72px) to maximize workspace.
- **Top Bar:** A fixed 64px top bar contains workspace identity and global search/actions.
- **Breakpoints:** 
  - **Desktop (1440px+):** Persistent sidebar, multi-column layouts.
  - **Tablet:** Collapsible sidebar, stacked secondary panels, maintained planning lists.
  - **Mobile:** Transition to bottom navigation or compact top-nav. Use full-screen sheets for actions instead of side drawers.

## Elevation & Depth

This design system favors **low-contrast outlines** and **tonal layers** over heavy shadows. Physical depth is minimized to keep the interface feeling fast and digital.

- **Borders:** Use 1px borders (#DDE1E6) as the primary method for defining card boundaries and input fields.
- **Shadows:** Restricted to floating elements that temporarily sit above the main UI, such as dropdown menus, dialogs, and side drawers. Shadows should be ambient and diffused.
- **Layers:** Use the Canvas (#F7F7F5) as the lowest layer, with Surface (#FFFFFF) cards providing the next level of hierarchy.

## Shapes

The shape language is "Rounded," striking a balance between professional rigor and human approachability.

- **Cards:** 10px corner radius.
- **Inputs & Buttons:** 8px corner radius.
- **Chips/Badges:** Full pill-shaped radius (rounded-full).
- **Icons:** Use clean, consistent line icons. For workflow status, icons are mandatory to accompany text labels to ensure accessibility.

## Components

### Buttons
- **Primary:** Solid #4F46E5 background, white text. Reserved for the "one visually dominant next action."
- **Standard:** 40px height. **Compact:** 36px height for dense tables/lists.
- **Style:** 8px radius, semibold 14px text.

### Status Badges
Every badge must include an icon and text. Use the `Workflow Tokens` for background/text color pairings. Backgrounds should be pale/subtle (e.g., `success-subtle`) with high-contrast accessible text (`success`).

### Input Fields
- **Height:** 40px.
- **Border:** 1px (#DDE1E6).
- **Focus:** 2px ring (#6366F1) with an offset.
- **Labels:** Every input must have a persistent label. Use `label` typography.

### Cards
- **Padding:** 16px to 20px.
- **Hierarchy:** KPI cards should feature one prominent value with a short label. Avoid decorative charts; prefer click-to-filter behavior for data interrogation.

### Side Drawers
- **Width:** 480px–560px on desktop.
- **Behavior:** Use for quick work to preserve context. Keep primary action buttons sticky at the bottom of the drawer.

### Data Tables
- Use `table-dense` typography.
- Layout: Date, Title, Format, Status, Owner, Next Action.
- Provide a compact density toggle for power users.