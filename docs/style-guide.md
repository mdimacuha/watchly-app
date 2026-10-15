# Watchly V2 Style Guide

This document outlines the core principles and patterns for the Watchly V2 design system.

## Core Philosophy

*   **Cinematic**: Use deep dark backgrounds (`#09090b`), subtle gradients, and soft shadows. Avoid harsh contrasts.
*   **Dark Mode First**: The UI is designed primarily for dark environments.
*   **Token-Based**: All visual values (colors, spacing, radius) must come from the defined tokens.

## Token Usage

### Colors

| Token Name | Tailwind Class | Usage |
| :--- | :--- | :--- |
| **Background** | `bg-background` | The lowest layer of the app (body background). |
| **Card / Surface** | `bg-card` | Panels, cards, and contained sections. |
| **Secondary** | `bg-secondary` | Input backgrounds, hover states, and muted interactive elements. |
| **Primary** | `bg-primary`, `text-primary` | Brand accents, key actions, focus rings. |
| **Foreground** | `text-foreground` | Primary text content (headings, body). |
| **Muted FG** | `text-muted-foreground` | Secondary text, metadata, labels. |
| **Border** | `border-border` | Subtle dividers and outlines. |

### Typography

Use the semantic text classes instead of raw sizing:

*   **Headings**: `.text-h1`, `.text-h2`, `.text-h3`
*   **Body**: `.text-body-lg`, `.text-body-regular`
*   **Metadata**: `.text-meta` (for timestamps, labels, captions)

### Border Radius

*   **Small**: `rounded-sm` (4px) - Checkboxes, small inputs.
*   **Medium**: `rounded-md` (8px) - Buttons, inputs, small cards.
*   **Large**: `rounded-lg` (12px) - Standard cards, containers.
*   **X-Large**: `rounded-xl` (16px) - Modals, large featured sections.
*   **Pill**: `rounded-pill` (Full) - Badges, chips, buttons.

---

## Do's and Don'ts

### Colors & Values

**❌ Bad (Hardcoded Values)**
```tsx
<div className="bg-[#18181b] border-[1px] border-[#27272a] text-white">
  ...
</div>
```

**✅ Good (Tokens)**
```tsx
<div className="bg-card border border-border text-foreground">
  ...
</div>
```

### Layout

**❌ Bad (Arbitrary Spacing)**
```tsx
<div className="p-[15px] mt-[10px]">
  ...
</div>
```

**✅ Good (Spacing Scale)**
```tsx
<div className="p-4 mt-3"> {/* uses 4px grid (16px, 12px) */}
  ...
</div>
```

---

## Component Naming

*   **Files**: Use `kebab-case` for component files.
    *   `src/components/ui/button.tsx`
    *   `src/components/feature-card.tsx`
*   **Components**: Use `PascalCase` for React components.
    *   `export function FeatureCard() { ... }`

## PR Review Checklist

Before merging, verify:

1.  [ ] No hardcoded hex colors (`#...`) in components.
2.  [ ] No arbitrary pixel values for padding/margin (use standard Tailwind scale).
3.  [ ] Typography uses the `.text-` helper classes where possible.
4.  [ ] New components are responsive (check Tablet/Desktop breakpoints).
