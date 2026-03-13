# Plan: Redesign Views — jakub.kr Design Principles

## Context

The webview UI is functional but uses flat borders everywhere, hardcoded hex colors, and inconsistent border radii. Applying design principles from jakub.kr (shadows instead of borders, OKLCH colors, concentric border radius, optical alignment) will give the UI a more polished, contemporary feel while remaining fully compatible with VS Code light/dark themes.

**Scope:** CSS-only changes to `index.css` and `App.css`. No TSX component changes needed.

## Design Principles Applied

| Principle | Source | Application |
|-----------|--------|-------------|
| Shadows instead of borders | jakub.kr/work/shadows | Replace `border` separators with layered `box-shadow` on containers |
| OKLCH colors | jakub.kr/components/oklch-colors | Status colors, accent tones with perceptual uniformity |
| Concentric border radius | jakub.kr/work/concentric-border-radius | Standardize radius scale; inner = outer - gap |
| Optical alignment | jakub.kr/components/optical-alignment | Button icon padding, rail icon adjustments |

## Changes

### 1. Design tokens in `:root` (`index.css`)

Add CSS custom properties for the new design system:

```css
:root {
  /* Radius scale */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  /* Shadow tokens (shadows-instead-of-borders) */
  --shadow-border: 0 0 0 1px rgba(0, 0, 0, 0.06);
  --shadow-sm: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 2px 4px 0 rgba(0, 0, 0, 0.04);
  --shadow-sm-hover: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.10), 0 8px 24px -4px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.22);

  /* OKLCH status colors with sRGB fallbacks */
  --color-ok: oklch(0.62 0.19 145);
  --color-warn: oklch(0.55 0.22 27);
  --color-muted: var(--vscode-descriptionForeground, #57606a);
  --color-ok-bg: oklch(0.62 0.19 145 / 0.14);
  --color-warn-bg: oklch(0.55 0.22 27 / 0.14);

  /* Separator (replaces hard border lines) */
  --separator: color-mix(in srgb, var(--vscode-editorWidget-border, #d0d7de) 40%, transparent);
}
```

### 2. Replace structural borders with shadows (`App.css`)

**Stage rail:** Replace `border-right: 1px solid` with a shadow that fades into the background.
```css
.stage-rail {
  border-right: none;
  box-shadow: 1px 0 0 0 var(--separator);
}
```

**URL bar:** Replace `border-bottom` with a subtle inset shadow.
```css
.url-bar {
  border-bottom: none;
  box-shadow: 0 1px 0 0 var(--separator);
}
```

**Stage header:** Same pattern.
```css
.stage-header {
  border-bottom: none;
  box-shadow: 0 1px 0 0 var(--separator);
}
```

**Section dividers:** Use softer separator.
```css
.section {
  border-bottom: 1px solid var(--separator);  /* lighter than current */
}
```

**Action stack:** Replace left border.
```css
.action-stack {
  border-left: none;
  box-shadow: -1px 0 0 0 var(--separator);
}
```

### 3. Elevate cards with shadows (`App.css`)

**`.kv` grid cards:** Already use `box-shadow` — standardize to token.

**`.identity-card`:** Replace border with shadow + keep colored left accent.
```css
.identity-card {
  border: none;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
.identity-card-ok {
  box-shadow: var(--shadow-sm), inset 3px 0 0 0 var(--color-ok);
}
.identity-card-warn {
  box-shadow: var(--shadow-sm), inset 3px 0 0 0 var(--color-muted);
}
```

**`.automation-card`:** Replace border with shadow.
```css
.automation-card {
  border: none;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}
```

**`.doc-item`:** Replace border with shadow.
```css
.doc-item {
  border: none;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 140ms ease-out, transform 140ms ease-out;
}
.doc-item:hover {
  border-color: unset;
  box-shadow: var(--shadow-sm-hover);
  transform: translateY(-0.5px);
}
```

**`.tool-group`:** Replace border with shadow.

### 4. Standardize border radius (`App.css`)

Apply concentric radius principle — outer containers use `--radius-md` (10px), inner elements use `--radius-sm` (6px) or `--radius-xs` (4px):

| Component | Current | New |
|-----------|---------|-----|
| `button` | `4px` | `var(--radius-xs)` |
| `input` | `4px` | `var(--radius-xs)` |
| `code` | `4px` | `var(--radius-xs)` |
| `.app-overlay` | `12px` | `var(--radius-lg)` |
| `.command-palette-panel` | `12px` | `var(--radius-lg)` |
| `.matrix-card` | `10px` | `var(--radius-md)` |
| `.registry-toolbar` | `10px` | `var(--radius-md)` |
| `.registry-split-panel` | `10px` | `var(--radius-md)` |
| `.kv` | `6px` | `var(--radius-sm)` |
| `.automation-card` | `4px` | `var(--radius-sm)` |
| `.identity-card` | `6px` | `var(--radius-md)` |
| `.tooltip-wrap::after` | `6px` | `var(--radius-sm)` |

### 5. OKLCH status colors (`App.css`)

Replace hardcoded hex status colors:

```css
.status-dot-ok     { background: var(--color-ok); }
.status-dot-warn   { background: var(--color-warn); }
.pill-ok, .pill-success { background: var(--color-ok-bg); color: var(--color-ok); }
.pill-warn         { background: var(--color-warn-bg); color: var(--color-warn); }
.status-ok         { color: var(--color-ok); }
.status-missing    { color: var(--color-warn); }
.run-accepted      { color: var(--color-ok); }
```

### 6. Improved hover transitions

Add `transition` to elements that currently lack smooth state changes:

```css
.task-row {
  transition: background 120ms ease-out;
}
.review-issue-row {
  transition: background 120ms ease-out;
}
.stage-rail-item {
  transition: background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out;
}
.sub-nav-item {
  transition: color 120ms ease-out, border-color 120ms ease-out;
}
```

### 7. Button hover shadow refinement (`index.css`)

Apply the jakub.kr 3-layer shadow pattern to button hover (already partially there):

```css
button:hover:not(:disabled) {
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.06),
    0 1px 2px -1px rgba(0, 0, 0, 0.08),
    0 2px 6px 0 rgba(0, 0, 0, 0.06);
}
```

### 8. Dark mode shadow adjustments

Shadows need higher opacity in dark mode. Add dark-mode overrides:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --shadow-border: 0 0 0 1px rgba(255, 255, 255, 0.06);
    --shadow-sm: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.3), 0 2px 4px 0 rgba(0, 0, 0, 0.2);
    --shadow-sm-hover: 0 0 0 1px rgba(255, 255, 255, 0.09), 0 2px 4px -1px rgba(0, 0, 0, 0.35), 0 4px 12px -2px rgba(0, 0, 0, 0.25);
    --shadow-md: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.4), 0 8px 24px -4px rgba(0, 0, 0, 0.3);
    --separator: color-mix(in srgb, var(--vscode-editorWidget-border, #3c3c3c) 50%, transparent);
  }
}
```

## Files Modified

| File | Changes |
|------|---------|
| `src/webview/src/index.css` | Design tokens (`:root`), button shadow refinement, OKLCH fallbacks |
| `src/webview/src/App.css` | Borders → shadows, radius standardization, status colors, hover transitions |

## Verification

1. `bun run build:ext` — builds without errors
2. `bun run lint` — no lint errors
3. Visual: Light mode — shadows replace borders, cards have depth
4. Visual: Dark mode — shadows adjusted, separators visible but subtle
5. Visual: Registry page matrix cards and KV grid — consistent radius and shadow
6. Visual: Plan page worklist — smooth hover transitions
7. Visual: Review page issue detail — shadow-based identity card
8. Visual: Command palette — consistent radius scale
