# eChook Ecosystem UI & UX Styleguide

A practical design system extracted from **eChook Live**, intended for reuse across eChook products so they feel like one family: technical, race-ready, calm under pressure, and readable on a pit-lane laptop in bright sun or dark garage light.

Use this document when scaffolding a new app, reviewing UI PRs, or prompting an AI to match the ecosystem look.

---

## 1. Product personality

| Attribute | Guidance |
| --- | --- |
| Tone | Direct, technical, trustworthy — not playful marketing |
| Density | Information-dense but not cramped; race teams scan numbers fast |
| Motif | Magenta/rose accent on zinc/neutral chrome; monospace for live values |
| Mood | Functional dashboard + polished public surfaces (login/spectate) |
| Avoid | Purple-indigo gradients, soft “AI SaaS” cream themes, heavy glow stacks, emoji decoration, glass-everywhere kitsch |

**One-line brief for designers/AI:** *Zinc/neutral light–dark UI with a sharp magenta (`#cb1557`) brand accent, Oswald for the wordmark only, monospace for telemetry numbers, Heroicons outline icons, and quiet borders instead of heavy shadows.*

---

## 2. Brand mark

### Wordmark structure

- **`eChook`** — display face: **Oswald**, bold, slightly larger than the companion word (`text-2xl`), tight tracking.
- **`Live`** (or product suffix) — same baseline, **primary magenta**, default sans, bold.
- Combined mark is an inline flex aligned to the end baseline; hover fades opacity (`hover:opacity-80`).
- Keep brand column width consistent across public and app headers (Live uses ~`9.5rem`) so chrome does not jump between routes.

### Brand rules

- Do not replace Oswald with Inter/Roboto for the wordmark.
- Do not put the full wordmark in primary color; only the product suffix is magenta.
- Prefer text wordmark over logo-as-icon in headers; icons are for nav and status, not the brand itself.
- On public landing/login, the brand sits in a fixed header; content panels sit below — brand is always present, not a giant hero type block competing with forms.

---

## 3. Color system

### Brand / semantic tokens

| Token | Hex / value | Tailwind | Role |
| --- | --- | --- | --- |
| Primary | `#cb1557` | `primary` | Brand accent, CTAs, focus, active nav, links |
| App background | Light `#fafafa` / Dark `#171717` | `var(--app-bg)` or `bg-zinc-100` / `bg-neutral-900` | Page canvas |
| Surface | Light `#ffffff` / Dark `#262626` | `bg-white` / `bg-neutral-800`–`900` | Cards, panels, headers |
| Text | Light `#18181b` / Dark `#fafafa` | `text-zinc-900` / `dark:text-white` | Primary copy |
| Muted | Light `#71717a` / Dark `#a3a3a3` | `text-zinc-500`–`600` / `dark:text-gray-400`–`500` | Labels, hints |
| Border | Light `#e4e4e7` / Dark `#404040` | `border-zinc-200`–`300` / `dark:border-neutral-700`–`800` | Dividers, card edges |

Primary is **constant across themes** (`--app-primary: #cb1557`). Do not invent a lighter pink for dark mode.

### Tailwind setup (copy into new projects)

```js
// tailwind.config.js
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#cb1557',
      },
      fontFamily: {
        oswald: ['Oswald', 'sans-serif'],
      },
    },
  },
}
```

```css
/* Global semantic CSS variables */
:root {
  color-scheme: light;
  --app-bg: #fafafa;
  --app-surface: #ffffff;
  --app-text: #18181b;
  --app-muted: #71717a;
  --app-border: #e4e4e7;
  --app-primary: #cb1557;
}

.dark {
  color-scheme: dark;
  --app-bg: #171717;
  --app-surface: #262626;
  --app-text: #fafafa;
  --app-muted: #a3a3a3;
  --app-border: #404040;
  --app-primary: #cb1557;
}
```

### Neutrals pairing rule

Live consistently pairs:

- **Light:** `zinc-*` for text, borders, soft fills (`zinc-100` page / `zinc-200` chips).
- **Dark:** `neutral-*` for surfaces and borders (`neutral-900` chrome, `neutral-800` panels, `neutral-700` borders), with `gray-*` often used for muted text in `dark:`.

When porting, prefer this same zinc-light / neutral-dark split rather than using one scale for both.

### Status & feedback colors

| Meaning | Light | Dark | Usage |
| --- | --- | --- | --- |
| Live / OK | `green-500` | same | Connection dots, LIVE pills |
| Caution / paused | `orange-500`, `amber-*`, `yellow-500` | same | Stale data, truncated history, reconnecting |
| Error / offline | `red-500`, `rose-500` | `red-900/50` panels | Disconnect, form errors, destructive hover |
| Info / secondary CTA | `blue-400`–`500` | same | Demo link, secondary stats icons |
| Warning threshold | `amber-400` border + `amber-50/70` fill | `amber-900/15` | Telemetry cards near limit |
| Critical threshold | `red-400` border + `red-50/70` fill | `red-900/15` | Telemetry cards past limit |
| Beta / experimental badge | `bg-amber-400 text-amber-950` | same | Tiny uppercase badges on nav |

### Primary usage recipes

- Solid CTA: `bg-primary text-white hover:bg-primary/90` (or `hover:opacity-90`)
- Soft selected: `bg-primary/10 text-primary`
- Soft info callout: `bg-primary/10 border border-primary/20`
- Focus: `focus:border-primary focus:ring-1 focus:ring-primary`
- Link: `text-primary hover:underline`
- Hover accent on neutrals: `hover:border-primary/50`, `group-hover:text-primary`

---

## 4. Typography

### Font stack

| Role | Face | Notes |
| --- | --- | --- |
| UI body | System / Tailwind `font-sans` | Antialiased (`antialiased` on root) |
| Brand word “eChook” | **Oswald** (Google Fonts, weights 200–700) | `font-oswald` only for brand |
| Live numbers / IDs / timestamps | `font-mono` | Telemetry values, loaded-data range, IDs |

Load Oswald once:

```html
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap" rel="stylesheet">
```

### Scale & hierarchy (common patterns)

| Element | Typical classes |
| --- | --- |
| Page title (in-app) | `text-2xl font-bold text-zinc-900 dark:text-white` |
| Panel / auth title | `text-3xl font-bold text-center text-primary` |
| Section title | `text-lg font-semibold` + bottom border rule |
| Eyebrow / section label | `text-xs` or `text-sm font-semibold uppercase tracking-wide text-zinc-500` |
| Body | `text-sm text-zinc-600 dark:text-gray-400` |
| Micro label | `text-[10px]`–`text-xs` uppercase `tracking-wider` muted |
| Metric value | `text-lg`–`text-2xl font-mono font-bold` |
| Hero metric (spectator) | `font-mono text-xl text-primary font-bold` |

### Copy style

- Short, imperative button labels: “Enter Dashboard”, “Load Data”, “Assign Batteries”.
- Empty states are plain sentences, often italic muted text — no illustrations required.
- Feature lists use a magenta `+` prefix, not bullets or checkmarks.
- Legal / retention notes are small, honest, and visible — not buried.

---

## 5. Layout & structure

### App shell (authenticated)

1. **Sticky header** — `h-16`, white/neutral-900, bottom border, `z-50`, horizontal padding `px-6`.
2. **Optional data ribbon** — live metric cards in a horizontal scroll strip (`h-20` / `md:h-28`).
3. **Nav + content** — desktop left rail `w-16`; mobile bottom bar `h-14`.
4. **Content** — fills remaining height; scroll inside the active tab, not the whole shell when possible.

### Public shell (login / register / policies)

1. Fixed public header with brand + live server stats.
2. Centered content with `pt-32` clearance under the header.
3. Optional full-bleed photographic background with light darkening gradient.
4. Footer with legal links, top border, compact `text-xs`.

### Content width

- Auth / marketing panels: `max-w-4xl` grid of cards.
- Feature tabs (e.g. batteries): `max-w-6xl mx-auto` with `space-y-6`.
- Settings / dense tools: full width with padded sections (`p-4 md:p-6`).

### Spacing rhythm

- Prefer Tailwind scale: `2`, `3`, `4`, `6`, `8`.
- Card padding: `p-4` compact, `p-6`–`p-8` public panels.
- Stack gap between major blocks: `space-y-6` or `gap-8`.
- Form fields: `space-y-5` with label `mb-1`/`mb-2`.

---

## 6. Surfaces, borders, elevation

### Default surface language

Surfaces are **bordered panels**, not floating neumorphic cards:

```
rounded-lg|xl
border border-zinc-200 dark:border-neutral-700
bg-white dark:bg-neutral-800|900
```

Elevation is restrained:

| Context | Treatment |
| --- | --- |
| In-app sections | Border + optional `shadow-sm` |
| Public auth panels | `rounded-xl shadow-2xl` |
| Dropdowns / menus | `shadow-2xl` + ring (`ring-1 ring-black/5`) |
| Telemetry data cards | `shadow` → `hover:shadow-lg hover:shadow-primary/10` + slight lift |
| Modals | `shadow-xl` over `bg-black/80 backdrop-blur-sm` |

**Rule:** If a border alone communicates grouping, skip the shadow. Cards are for interactive or primary content containers — not decorative wrappers.

### Nested / inset surfaces

Inner blocks use softer fills:

- Light: `bg-zinc-50` / `bg-zinc-100`
- Dark: `bg-neutral-800/40` / `bg-neutral-900`

Settings sections often use translucent panels: `bg-white/90 dark:bg-neutral-800/50`.

### Radius

| Use | Radius |
| --- | --- |
| Buttons, inputs, small controls | `rounded` / `rounded-md` / `rounded-lg` |
| Panels, modals, toast | `rounded-lg` / `rounded-xl` |
| Status pills, LIVE badges | `rounded-full` |
| Nav accents | `rounded-r-full` / `rounded-t-full` |

Avoid making everything pill-shaped. Full rounding is reserved for status chips and toggles.

---

## 7. Components

### 7.1 Buttons

**Primary**

```
bg-primary text-white font-bold|semibold
rounded-lg px-4 py-2 | py-3 (forms)
hover:bg-primary/90 (or hover:opacity-90)
disabled:opacity-50 disabled:cursor-not-allowed
transition
active:scale-95   /* primary CTAs on public forms */
```

**Secondary / quiet**

```
bg-zinc-200 dark:bg-neutral-800
border border-zinc-300 dark:border-neutral-700
text-zinc-700 dark:text-gray-300
hover:bg-zinc-300 dark:hover:bg-neutral-700
```

**Destructive**

- Prefer confirmation modal first.
- Icon buttons may shift to rose on hover: `hover:bg-rose-500/20 hover:text-rose-500`.
- Danger zones use red-tinted bordered sections (`border-red-900/30`, `bg-red-900/50` actions in dark).

**Icon-only toolbar buttons**

- Minimum touch target: `min-h-11 min-w-11` on mobile-critical controls.
- Always include `title` and `aria-label`.

### 7.2 Form controls

Shared input recipe:

```
w-full
bg-white dark:bg-neutral-900
border border-zinc-300 dark:border-neutral-600|700
rounded-lg p-3 | px-3 py-2
text-zinc-900 dark:text-white
focus:border-primary focus:ring-1 focus:ring-primary
outline-none transition
```

- Labels: `text-sm font-medium` muted, or compact `text-xs font-bold uppercase tracking-wider`.
- Checkboxes/radios: `text-primary focus:ring-primary`.
- Toggle switches: track `h-6 w-11 rounded-full`; on = `bg-primary` (or warning red when the toggle itself is a “danger opt-out”).
- Sliders: `accent-primary` on a muted track (`bg-zinc-200 dark:bg-neutral-700`).
- Autofill must be restyled for both themes (see Live’s `style.css` overrides).

### 7.3 Cards & panels

**Public content card**

```
bg-white dark:bg-neutral-800 rounded-xl shadow-2xl
border border-zinc-200 dark:border-neutral-700 p-8
```

**In-app section panel**

```
rounded-xl border … bg-white dark:bg-neutral-900 p-4 md:p-6
```

**Telemetry value card**

- Centered column: uppercase micro label + large mono value.
- Hover: border toward primary, soft magenta shadow, `-translate-y-0.5`.
- Stale: `opacity-50 grayscale`.
- Threshold: amber/red border + tinted background; value text shifts to amber/red.

**Empty state**

- Centered, single bordered card, short explanation, one primary CTA.
- Dashed border blocks (`border-2 border-dashed`) for “nothing here yet” lists.

### 7.4 Navigation

**Desktop icon rail**

- Inactive: muted icon, hover soft zinc/neutral fill.
- Active: `bg-primary/10 text-primary` + left accent bar `w-1 h-6 bg-primary rounded-r-full`.
- Settings often pinned to the bottom of the rail.

**Mobile tab bar**

- Icon only (sr-only labels); active color primary; bottom accent `w-8 h-1 bg-primary rounded-t-full`.

**List / sub-nav selection**

- Active row: `bg-primary/10` and/or `border-l-4 border-l-primary`.
- Text nav buttons: `navTabButtonClass` pattern — soft primary wash when active.

**Beta badges**

- Tiny absolute amber chips (`text-[8px]`–`[9px] font-bold`) — never large pills.

### 7.5 Modals

- Headless UI (or equivalent) for focus trap & Escape.
- Backdrop: `bg-black/80 backdrop-blur-sm`.
- Panel: bordered surface, `sm:max-w-sm` for confirms; larger for complex forms.
- Enter: fade + slight scale/translate; leave faster.
- Confirm right (row-reverse on desktop); cancel is quiet secondary.
- Confirm button class is injectable so destructive actions can swap to red while default stays primary.
- Stacking: confirmation above feature modals (`z-[110]` vs typical `z-[100]`).

### 7.6 Toasts

- Fixed bottom-center (`bottom-6`, centered, `z-[9999]`).
- Surface card with border; colored icon tile by type:
  - success green / warning yellow / error red / info blue
- Explicit **Dismiss** control (not icon-only X only).
- Short message; auto-hide allowed, manual dismiss always available.

### 7.7 Status indicators

Connection / health language is consistent:

| State | Dot |
| --- | --- |
| Live / connected | `bg-green-500 animate-pulse` |
| Degraded / paused / reconnecting | `bg-orange-500` or amber |
| Offline / error | `bg-red-500` |

Dots live inside quiet chips:

```
rounded-full bg-zinc-200 dark:bg-neutral-800
border border-zinc-300 dark:border-neutral-700
px-2|3 py-1
```

Floating connection banners (over content) use dark translucent amber/red pills with blur — reserved for critical connectivity, not general tips.

### 7.8 Tables

- Wrapper: `overflow-x-auto rounded-lg border …`
- Compact readable rows; mono for IDs/numbers.
- Prefer zebra or hover row highlight sparingly; borders do most of the work.

### 7.9 Icons

- Default set: **Heroicons v2 outline** (`@heroicons/vue/24/outline`).
- Sizes: `w-4 h-4` inline, `w-5 h-5` controls, `w-6 h-6` nav.
- Color inherits from text; accent icons may be `text-primary` (or fixed semantic colors for stats: blue/green).
- Custom icons should match outline weight and 24px optical size.

---

## 8. Interaction & UX patterns

### Feedback loop

1. Optimistic UI only when safe; otherwise disable the control (`disabled:opacity-50`) and show progress label (“Assigning…”, “Authenticating…”).
2. Success/failure → toast.
3. Destructive or data-lossy actions → confirmation modal; offer “Don’t ask again” only for repeated workflow friction (and persist that preference).

### Selection & live context

- Selected entity: primary wash + optional left border.
- Live lists: green pulsing `LIVE` chip.
- Historical vs live modes should be visually obvious (pause button yellow wash, status text changes).

### Progressive disclosure

- Dense tools (history calendar, analytics) hide behind triggers; overlays dismiss via backdrop click.
- Mobile compresses chrome to icons; desktop reveals labels and wider controls at `lg:`.

### Keyboard & power-user

- Dashboard supports shortcuts; expose a help modal from settings/header.
- Focus rings use primary; never remove outlines without a visible replacement.

### Copy & honesty

- Retention, privacy, and demo limitations are stated in-product near the action.
- Demo mode should clearly disable unavailable features rather than failing silently.

---

## 9. Motion

Intentional, short, functional — presence without noise.

| Pattern | Timing | Notes |
| --- | --- | --- |
| Button press | `active:scale-95` | Primary public CTAs |
| Hover lift (data cards) | `duration-200` + `-translate-y-0.5` | Subtle |
| Modal / toast | 150–300ms ease-out/in | Opacity + translate/scale |
| Ribbon show/hide | ~300ms height/opacity | |
| Live pulse | `animate-pulse` on dots/LIVE | Always pair `motion-reduce:animate-none` |
| Spinners | `animate-spin` on `ArrowPathIcon` | Loading only |

**Reduced motion:** globally collapse animation/transition durations when `prefers-reduced-motion: reduce` is set.

Do not add continuous background animations, particle fields, or glowing borders for decoration.

---

## 10. Dark mode

- Strategy: **`class` dark mode** on `<html>` (`.dark`), with optional `themeMode`: `light` | `dark` | `system`.
- Apply theme **before first paint** via inline boot script reading persisted settings to avoid flash.
- Set `color-scheme` appropriately for native controls.
- Test both themes for every new surface; primary magenta stays the same.
- Photographic public backgrounds may stay image-based; panels on top must remain theme-aware and readable.

---

## 11. Responsive behavior

| Breakpoint usage | Pattern |
| --- | --- |
| Default | Mobile-first; bottom nav; condensed header controls |
| `md:` | Side nav appears; larger data cards; two-column auth |
| `lg:` | Full history toolbar, text status labels, wider dropdowns |

Rules of thumb:

- Touch targets ≥ ~44px for primary mobile controls.
- Hide supporting words before hiding the control entirely.
- Tables and ribbon scroll horizontally rather than squashing.
- Modals: bottom-sheet feel on small (`items-end`), centered on `sm+`.

---

## 12. Accessibility checklist

- Icon-only controls have accessible names.
- Active nav uses `aria-current="page"` where applicable.
- Modals trap focus and close on backdrop/Escape (Headless UI pattern).
- Toasts use `role="alert"`.
- Do not rely on color alone for status — pair dots with labels/tooltips.
- Maintain contrast: muted zinc/gray on white/neutral is the baseline; avoid light-gray-on-gray body text.
- Respect reduced motion.
- Keep hit areas large enough on pit-side phones.

---

## 13. Data display conventions

- **Numbers that change live** → `font-mono font-bold`.
- **Units** → quieter, often in parentheses beside the label, not competing with the value.
- **Timestamps / ranges** → mono in compact chips.
- **Missing values** → em dash `—` or `--/--`, not blank.
- **Relative time** preferred for “last updated” style fields.
- Locale for dates in Live often `en-GB` short form; stay consistent per product audience.
- Warning/critical thresholds tint the container, not only the number.

---

## 14. Content & information architecture

### Public pages

- Two equal jobs above the fold when relevant (e.g. Login + Spectate) — twin panels, not a single marketing hero.
- “What’s New” sits below as a secondary bordered panel.
- Cookie notice: bottom bar, backdrop blur, one primary OK — essential cookies only messaging.

### In-app pages

- Title + one-line subtitle, actions top-right.
- One hero/context section (e.g. live fitment), then the working table/list.
- Settings: titled sections with hairline under section headings; danger zone clearly separated.

### Voice

- Prefer concrete verbs over vague “Submit” / “OK” when the action is specific.
- Error text is human and specific enough to act on.

---

## 15. Z-index ladder (suggested)

| Layer | Approx. z |
| --- | --- |
| Content / side nav | `z-40` |
| Sticky header / mobile nav / cookie bar | `z-50` |
| Dropdown overlays | `z-50`–`z-[60]` |
| Feature modals | `z-[100]` |
| Confirmation modals | `z-[110]` |
| Toasts | `z-[9999]` |

Keep confirmations above feature dialogs so destructive prompts never hide behind another modal.

---

## 16. Implementation recipes for new projects

### Root app wrapper

```html
<div class="min-h-screen font-sans antialiased bg-[color:var(--app-bg)] text-[color:var(--app-text)]">
  <!-- router outlet -->
  <!-- global toast host -->
</div>
```

### Quick component class cheatsheet

```txt
Primary button:   bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg px-4 py-2 transition disabled:opacity-50
Secondary button: bg-zinc-200 dark:bg-neutral-800 border border-zinc-300 dark:border-neutral-700 rounded-lg …
Text link:        text-primary hover:underline
Panel:            rounded-xl border border-zinc-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6
Input:            … focus:border-primary focus:ring-1 focus:ring-primary outline-none
Active nav:       bg-primary/10 text-primary
Section eyebrow:  text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-gray-400
Metric:           font-mono font-bold text-zinc-900 dark:text-white
```

### Stack assumptions that reinforce the look

- Utility-first CSS (Tailwind) with a single `primary` token.
- Outline icon set at consistent sizes.
- Accessible dialog primitives.
- Class-based dark mode with persisted preference.

Framework choice (Vue/React/etc.) does not matter if tokens, type roles, and component recipes stay the same.

---

## 17. Do / Don’t

### Do

- Use magenta sparingly as signal (CTA, active, link, brand suffix).
- Pair every dark style with its light counterpart in the same class string.
- Put live values in mono; put brand “eChook” in Oswald.
- Prefer borders + quiet fills over heavy shadows.
- Confirm destructive or data-lossy actions.
- Match header brand footprint across public and authenticated chrome.

### Don’t

- Recolor the whole UI around primary pink backgrounds.
- Introduce a second brand accent (purple, teal) without a strong semantic reason.
- Use Oswald for body copy or form labels.
- Animate everything that is merely visible.
- Ship light-only screens in an ecosystem app that already supports dark mode.
- Replace status dots with text-only or color-only encodings.
- Wrap every piece of text in a card.

---

## 18. AI / handoff prompt (pasteable)

Use this when asking a model to build UI that matches the ecosystem:

> Design in the eChook Live visual language: zinc/neutral light–dark surfaces, single brand accent `#cb1557` (`primary`), Oswald only for the “eChook” wordmark with magenta product suffix, system sans for UI, monospace for live metrics. Bordered panels (`rounded-lg/xl`, light zinc / dark neutral borders), restrained shadows, Heroicons outline. Primary buttons are solid magenta with white text; selection uses `primary/10`. Class-based dark mode. Dense, technical, pit-lane readable. No purple gradients, no cream-serif marketing look, no emoji, no decorative glow. Include light and dark classes together, clear empty states, confirmation for destructive actions, and short motion with reduced-motion fallbacks.

---

## 19. Source map (this repo)

| Concern | Where to look |
| --- | --- |
| Color tokens / reduced motion / autofill | `src/style.css`, `tailwind.config.js` |
| Brand wordmark | `src/components/AppBrand.vue` |
| Public chrome | `src/components/PublicHeader.vue`, `PublicFooter.vue`, `src/views/LoginView.vue` |
| App chrome / nav | `src/components/DashboardHeader.vue`, `src/views/DashboardView.vue`, `src/utils/navTabClasses.js` |
| Metric cards | `src/components/DataCard.vue` |
| Modal / toast | `src/components/ui/ConfirmationModal.vue`, `ToastNotification.vue` |
| In-app feature layout | `src/components/tabs/BatteriesTab.vue`, `batteries/HeroSection.vue`, `EmptyStoreView.vue` |
| Settings sections | `src/components/tabs/SettingsTab.vue` |

---

*Document version: 1.0 — derived from eChook Live UI patterns. Update this guide when tokens or core component recipes change.*
