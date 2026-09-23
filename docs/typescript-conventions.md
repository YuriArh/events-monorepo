# TypeScript conventions

Shared config lives in `packages/typescript-config`. Every package extends one
of `base.json`, `nextjs.json`, or `react-library.json` rather than redefining
compiler options.

`base.json` is strict: `strict`, `noUncheckedIndexedAccess`, `isolatedModules`,
`moduleResolution: NodeNext`.

## Apps turn off declaration emit

`base.json` sets `declaration: true` for libraries. Applications override it:

```json
{ "compilerOptions": { "declaration": false, "declarationMap": false } }
```

Without this, TypeScript rejects inferred types it cannot name in a `.d.ts`
(`TS2883`, typically triggered by Prisma's internal types leaking through a
repository object). Apps are never consumed as libraries, so declarations are
pure cost.

## Types at boundaries

Validate untrusted input with Zod at the edge, then let inference carry the
types inward:

```ts
export const createEventSchema = z.object({ name: z.string().min(1).max(255) });
export type CreateEventInput = z.infer<typeof createEventSchema>;
```

Keep Zod schemas in `*.schema.ts` and derived types in `*.types.ts`. Don't
hand-write a type that duplicates a schema — infer it.

Model types come from Prisma via `@repo/db`; re-export rather than restate them.

## Rules

- No `any`. Narrow `unknown` with a type guard (`error instanceof Error`).
- Use `import type` for type-only imports — `isolatedModules` requires it.
- Relative imports inside a package need the `.js` extension (`NodeNext`), e.g.
  `from "./event.service.js"`, even though the source is `.ts`.
- Workspace dependencies use the `workspace:*` protocol. Plain `"*"` makes pnpm
  look in the npm registry and fail.
- `@/*` in the web app maps to `apps/web/app/*`. The mapping is duplicated in
  `babel.config.json` for StyleX's module resolution — change both together.
- Prefer inferred return types; annotate only when inference is wrong or the
  signature is the contract.
- Request/response schemas belong in `@repo/contracts`, never duplicated per app.
  Derive types with `z.infer` rather than hand-writing them.

## Commands

```bash
pnpm check-types     # tsc --noEmit across the monorepo
pnpm lint            # Biome
```

Biome replaces ESLint in `apps/api` and `apps/web`; `packages/ui` still uses
ESLint. Biome config is the root `biome.json`, and formatting is left to
Prettier (Biome's formatter is off).
