# CSS conventions

Styling is **StyleX only**. Tailwind was installed and then deliberately
removed — do not reintroduce utility classes.

## Where styles live

- Component styles: a `stylex.create({...})` block at the top of the file.
- Design tokens: `apps/web/app/styles/tokens.stylex.ts` (`colors`, `radius`,
  `fontSizes`, `typography`).
- Global tokens and base rules: `apps/web/app/globals.css`.

Tokens wrap CSS custom properties (`colors.primary` → `var(--primary)`), so
theming stays driven by the `:root` / `.dark` blocks in `globals.css`. Reference
`colors.primary`, never a raw `var(--primary)` string.

## Layer order is load-bearing

StyleX appends its own layers (`resets`, `priority1`–`priority8`) at the end of
the bundle, and CSS layer precedence follows **declaration order**, not source
order. `globals.css` therefore declares the order up front:

```css
@layer base, resets, priority1, …, priority8;
```

Two consequences:

1. **Base styles must sit inside `@layer base`.** Unlayered CSS outranks every
   layer, so an unlayered `body { … }` would beat component styles.
2. StyleX's reset (`* { margin: 0; padding: 0 }`) lands in `resets`, before the
   component layers — which is why components can still set their own spacing.

Getting this wrong is silent: rules simply stop applying with no error.

## The `@stylex` directive

`globals.css` ends with `@stylex;`. The PostCSS plugin replaces it with all
compiled styles. There must be **exactly one** in the project — a second one
elsewhere is silently dropped depending on plugin order.

## Build pipeline

StyleX needs a compile step; `stylex.create()` throws if it reaches runtime.

- `apps/web/babel.config.json` — the babel plugin (JSON, not `.js`: Next
  `require()`s the config, which breaks under `"type": "module"`).
- `apps/web/postcss.config.js` — the PostCSS plugin, which reads its options
  from the babel config. Keep options in one place.

A custom babel config disables SWC for the app, which is why `next dev --webpack`
fails (`next/font` requires SWC). Use Turbopack, i.e. plain `pnpm dev`.

**PostCSS config changes are not hot-reloaded.** After editing it, restart the
dev server and delete `.next`, or you'll debug stale CSS.

## Vendored components

`apps/web/app/components/ui/**` is copy-paste code from the
[stylexui](https://stylexui.dev) registry, pulled with the shadcn CLI:

```bash
pnpm dlx shadcn@latest add https://stylexui.dev/r/<component>.json
```

Treat it as vendored: it's excluded from lint, and local edits are lost on
regeneration. Customise from the outside instead — every component accepts a
`style` prop typed as `StyleXStyles`:

```tsx
<Card style={styles.card}>
```

Registry files import tokens from `@/styles/tokens.stylex`, so that path must
keep resolving; the babel `aliases` option mirrors the tsconfig `@/*` mapping.
There is exactly one real tokens file, `apps/web/app/styles/tokens.stylex.ts`.

**Pulling a new component writes a stray duplicate.** The `shadcn` CLI maps
the registry's `styles/tokens.stylex.ts` path to an alias that resolves inside
`app/components/ui/`, not `app/styles/`, so nearly every `add` also drops a
byte-identical `app/components/ui/tokens.stylex.ts`. Nothing imports it — real
imports all use `@/styles/tokens.stylex`, which resolves to the file in
`app/styles/` — but delete the duplicate before committing anyway. If a future
edit ever needs to touch tokens, point it at `app/styles/tokens.stylex.ts`;
the copy under `ui/` is dead vendoring noise, not an alternate source of truth.

### No vendored date picker

The registry's `date-picker` entry (`https://stylexui.dev/r/date-picker.json`)
lists real dependencies (`calendar.tsx`, `button.tsx`, tokens, utils) but its
`files` array never includes a `date-picker.tsx` — pulling it creates nothing.
Ours is hand-composed instead, from the vendored `Popover` + `Calendar` plus a
plain time `Input`, in `apps/web/app/components/date-time-picker.tsx`. That
file is regular app code, not registry output — unlike `app/components/ui/**`,
which stays vendored and is regenerated rather than hand-edited.

## Writing styles

- Prefer tokens over literals for colour and radius; raw rem values for spacing
  are fine.
- Conditional values use StyleX's object form, not ternaries in class strings:
  ```ts
  color: { default: null, ":hover": colors.destructive }
  ```
- Media queries are values, not blocks:
  ```ts
  paddingInline: { default: "1rem", "@media (min-width: 640px)": "1.5rem" }
  ```
- Use `stylex.keyframes` for animation; there is no utility-class equivalent.
