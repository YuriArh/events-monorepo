import { createRequire } from "node:module";

import { build } from "esbuild";

// The generated Prisma client requires "@prisma/client-runtime-utils", which
// pnpm only links next to @prisma/client, not where the generated code lives.
// Resolve it from @prisma/client, like Node would at runtime.
const requireFromDb = createRequire(import.meta.resolve("@repo/db"));
const requireFromPrismaClient = createRequire(requireFromDb.resolve("@prisma/client"));
const runtimeUtils = requireFromPrismaClient.resolve("@prisma/client-runtime-utils");

// One self-contained ESM file: the API, the workspace packages (@repo/*, which
// export TypeScript source) and every npm dependency, including the Prisma
// client with its WASM query compiler. Only `argon2` stays out: it is a native
// addon that loads its prebuilt binary from its own folder, so the runtime
// image installs it (see apps/api/Dockerfile).
await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["argon2"],
  alias: { "@prisma/client-runtime-utils": runtimeUtils },
  sourcemap: true,
  minify: false,
  // Bundled CommonJS dependencies (pg, fastify's helpers) call require(),
  // which an ES module does not have.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  logLevel: "info",
});
