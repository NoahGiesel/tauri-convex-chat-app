# Theming

The app's look is driven by a **theme JSON**. A theme only lists base colors; everything else
(soft accent backgrounds, AI/upload tints, backdrop…) is derived in code, so a theme stays small
and a custom accent recolors the whole UI consistently.

## Files (`src/themes/`)

| File | Purpose |
|---|---|
| `presets.json` | Built-in templates: Graphite (default), Midnight, Warm Charcoal, Forest, Amethyst |
| `theme.schema.json` | JSON Schema of a theme (for editors and validation of shared files) |
| `types.ts` | `ThemeDefinition`, `ThemeColors`, `ResolvedTheme`, `ThemePreference` |
| `build-theme.ts` | Derives the full palette (`buildTheme`), contrast helpers, import validation |
| `apply-theme.ts` | Writes CSS variables on `<html>`: shadcn tokens + `--app-*` tokens |
| `theme-provider.tsx` | `<ThemeProvider>` and `useTheme()`: select, custom accent, import/export, persistence |

## Theme format

```json
{
  "version": 1,
  "id": "graphite",
  "name": "Graphite",
  "description": "Grigio neutro con accento blu: sobrio e professionale.",
  "mode": "dark",
  "colors": {
    "bg": "#121316", "sidebar": "#17181c", "panel": "#1c1e23", "field": "#23252b", "raised": "#2a2d34",
    "border": "#2b2e35", "borderStrong": "#3b3f4a",
    "text": "#e8eaee", "textStrong": "#ffffff", "textSoft": "#c4c8d0", "textMuted": "#9ba1ad", "textDim": "#8a909c",
    "accent": "#2f6fe4", "accentFg": "#ffffff",
    "online": "#3fbf8a", "offline": "#5d6370", "ai": "#5cc0e0", "upload": "#e0a93e",
    "avatars": ["#4a6a96", "#9a603a", "#4a7a66"],
    "art": ["#1b2c4b", "#2a4a86", "#4a78c9", "#233a66", "#16264a", "#0e1930"]
  }
}
```

Rules: all colors are `#rrggbb`; `avatars` has at least 3 entries; `art` has exactly 6 (login illustration).

## Derived tokens

`accentBright`, `accentText`, `accentSoft`, `accentSoftBorder`, `accentSoftStrong`, `aiText`, `aiBg`,
`aiBorder`, `uploadBg`, `onlineBg`, `backdrop` — computed by mixing base colors (see `build-theme.ts`).
When the user picks a custom accent, `accentFg` is recomputed (dark or white, whichever has more contrast).

## Using it

```tsx
// main.tsx
<ThemeProvider><UpdaterProvider><App /></UpdaterProvider></ThemeProvider>

// anywhere
const { themes, definition, setTheme, setCustomAccent, exportTheme, importTheme } = useTheme();
```

- shadcn components follow the theme automatically (`--background`, `--primary`, `--border`…).
- App-specific colors are available as Tailwind arbitrary values: `bg-[var(--app-sidebar)]`,
  `text-[var(--app-online)]`, `bg-[var(--app-accent-soft)]`, avatars as `--app-av-1…`.
- The preference (theme id, custom accent, imported themes) is stored in `localStorage` under
  `chat:theme`. Syncing it per user with Convex is a later step.

## Adding a template

Append an object to `presets.json` (or import one at runtime through Settings › Aspetto).
Check contrast before shipping: body text ≥ 7:1 on `panel`, muted/dim text ≥ 4.5:1 on `sidebar`,
`accentFg` ≥ 4.5:1 on `accent`. The built-in presets were checked with these thresholds.

## Light themes

`mode: "light"` is supported by the format and `applyTheme`, but no light preset ships yet:
the derived tokens (tints mixed towards `panel`, `accentText` mixed towards white) were tuned for
dark surfaces and need a light variant before a light preset is added.
