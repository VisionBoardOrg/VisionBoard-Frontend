# VisionBoard — Design System & Visual Guidelines 🎨

> **Authoritative Specification**: This document governs all visual styling, UI components, typography, color palettes, and interaction design rules across VisionBoard. All AI developer agents and human contributors **MUST** follow these guidelines strictly.

---

## 💎 1. Design Philosophy

VisionBoard is an **AI-native product management workspace**. Its visual identity reflects clarity, precision, high velocity, and modern sophistication.

### Core Principles
1. **High Contrast & Readability**: Content must pop with crisp typography (`Plus Jakarta Sans`), deep ink contrast (`#0F172A`), and vivid blue accents (`#2563EB`). Never use low-contrast text on light backgrounds.
2. **Strict Design Tokens**: **Never hardcode hex values** in component files. Always use the predefined Tailwind CSS v4 variables defined in `globals.css`.
3. **Cursor Pointer Standard for All Interactive Elements**: Every clickable element (`<button>`, `<a>`, `<Link>`, `<input type="checkbox">`, `<select>`, cards with click handlers) **MUST** display `cursor: pointer` (`cursor-pointer`).
4. **Micro-Animations & Smooth Feedback**: Hover effects, modal scale-ins, transitions, and focus rings must feel responsive and low-latency.

---

## 🎨 2. Color System & Theme Tokens

All color tokens are defined in `app/globals.css` using Tailwind CSS `@theme` variables.

```css
@theme {
  --font-sans: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;

  /* Primary Brand Blue */
  --color-blue: #2563EB;        /* Primary action blue */
  --color-blue-deep: #1E3A8A;   /* Hero text & gradient accents */
  --color-blue-mid: #1D4ED8;    /* Hover state for primary buttons */
  --color-blue-light: #DBEAFE;  /* Soft border & badge background */
  --color-blue-faint: #EFF6FF;  /* Card highlighting & active tab background */
  --color-cyan: #0EA5E9;        /* Gradient secondary highlight */

  /* Neutrals & Surfaces */
  --color-ink: #0F172A;         /* Primary text color & dark headers */
  --color-slate: #475569;       /* Secondary body text & muted labels */
  --color-muted: #94A3B8;       /* Disabled text & subtle borders */
  --color-border: #E2E8F0;      /* Standard card & container borders */
  --color-offwhite: #F8FAFF;    /* Page background surface */
  --color-white: #FFFFFF;       /* Card & modal container surface */

  /* Semantic Feedback */
  --color-success: #10B981;     /* Completed states, positive growth */
  --color-warning: #F59E0B;     /* Blocked items, caution alerts */
  --color-danger: #EF4444;      /* Errors, destructive actions */

  /* Shadows */
  --shadow-primary: 0 2px 8px rgba(37,99,235,0.32);
  --shadow-icon: 0 2px 8px rgba(37,99,235,0.28);
}
```

### Color Usage Rules
- **Primary Actions**: `bg-blue text-white hover:bg-blue-mid`
- **Secondary Actions**: `bg-transparent text-blue border border-blue-light hover:bg-blue-faint`
- **Primary Text**: `text-ink` (`#0F172A`)
- **Secondary/Body Text**: `text-slate` (`#475569`)
- **Page Background**: `bg-offwhite` (`#F8FAFF`)
- **Card Background**: `bg-white border border-border rounded-2xl shadow-sm`

---

## 👆 3. Cursor Pointer & Interactive State Standard

> [!IMPORTANT]
> **Cursor Pointer Enforcement**: Every single clickable element in the application **MUST** exhibit `cursor: pointer` styling when hovered over by a user.

### Global CSS Enforcement (`globals.css`)
```css
button,
a,
select,
input[type="submit"],
input[type="button"],
input[type="reset"],
input[type="checkbox"],
input[type="radio"],
[role="button"] {
  cursor: pointer;
}
```

### Component Guidelines
1. **Buttons**: Ensure `cursor-pointer` class is present (or inherited from base button rules). Disabled buttons must show `cursor-not-allowed opacity-50`.
2. **Navigation Links**: All `<Link>` and `<a>` elements must show `cursor-pointer hover:text-blue transition-colors`.
3. **Interactive Cards / Rows**: Any table row or card with an `onClick` handler **MUST** include `cursor-pointer hover:bg-offwhite/50 transition-colors`.
4. **Form Controls**: Checkboxes, radio buttons, and custom dropdown triggers **MUST** display `cursor-pointer`.

---

## 🔤 4. Typography Scale

VisionBoard uses **Plus Jakarta Sans** (`--font-jakarta`) across all pages.

| Token / Usage | Font Size | Weight | Line Height | Tailwind Class |
| :--- | :--- | :--- | :--- | :--- |
| **Display Hero** | `52px` / `64px` | Extrabold (800) | `1.1` | `text-[52px] md:text-[64px] font-extrabold tracking-[-0.03em]` |
| **Heading 1 (Section)** | `36px` / `48px` | Extrabold (800) | `1.2` | `text-[36px] md:text-[48px] font-extrabold tracking-[-0.03em]` |
| **Heading 2 (Modal/Card)**| `24px` | Bold (700) | `1.25` | `text-2xl font-bold tracking-tight text-ink` |
| **Heading 3 (Subtitle)** | `18px` | Bold (700) | `1.3` | `text-lg font-bold text-ink` |
| **Body Large** | `17px` / `18px` | Medium (500) | `1.65` | `text-[17px] md:text-[18px] text-slate font-medium` |
| **Body Standard** | `14px` / `15px` | Medium (500) | `1.5` | `text-sm text-slate font-medium` |
| **Caption / Meta** | `12px` / `11px` | Semibold (600) | `1.4` | `text-xs text-slate font-semibold` |
| **Mono / Badge** | `11px` / `12px` | Mono (700) | `1.0` | `font-mono text-xs font-bold` |

---

## 🧩 5. Reusable Component Specs

All custom UI components reside in `components/reusables/` and `components/`.

### 1. `<PrimaryButton>`
- **Classes**: `inline-flex items-center justify-center font-semibold tracking-tight transition-colors bg-blue text-white shadow-[--shadow-primary] hover:bg-blue-mid cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`
- **Sizes**:
  - `sm`: `h-8 px-4 text-[14px] rounded-md gap-1`
  - `md`: `h-11 px-6 text-[16px] rounded-lg gap-2`
  - `lg`: `h-[52px] px-8 text-[16px] rounded-[10px] gap-2`

### 2. `<SecondaryButton>`
- **Classes**: `inline-flex items-center justify-center font-semibold tracking-tight transition-colors bg-transparent text-blue border-[1.5px] border-blue-light hover:bg-blue-faint cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`

### 3. Form Inputs & Selects
- **Inputs**: `bg-offwhite/50 border border-border rounded-xl px-4 py-2.5 text-sm font-medium text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all`
- **Selects**: `bg-white border border-border rounded-xl px-3 py-2 text-xs font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue`
- **Options**: `<option className="text-ink bg-white">` to ensure dark contrast across all operating systems and browser themes.

### 4. Cards & Modals
- **Modals**: `bg-white rounded-3xl border border-border shadow-2xl p-8`
- **Cards**: `bg-white rounded-2xl border border-border shadow-sm p-6`
- **Badges**: `px-2.5 py-0.5 rounded-full text-xs font-bold`

---

## 📐 6. Layout & Elevation Guidelines

- **Container Max-Widths**: `max-w-7xl` (pages), `max-w-5xl` (sections), `max-w-xl` (modals), `max-w-md` (auth cards).
- **Border Radius Hierarchy**:
  - Badges/Pills: `rounded-full`
  - Large Modals: `rounded-3xl` (`24px`)
  - Standard Cards: `rounded-2xl` (`16px`)
  - Buttons & Inputs: `rounded-xl` (`12px`)
  - Small Elements: `rounded-lg` (`8px`)
