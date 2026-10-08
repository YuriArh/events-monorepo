/** Where the Next server reaches Fastify. The browser never does — it goes through the rewrites below. */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/**
 * Development proxy. In production nginx routes /api and /uploads straight to
 * Fastify (docs/architecture.md → Deploying) and Next is built with API_PROXY=off:
 * rewrites() runs at `next build`, so these variables must be set for the build.
 */
const proxyEnabled = process.env.API_PROXY !== "off";

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Same-origin API for the browser: the session cookie belongs to the web
    // host, so Server Components and Server Actions can read it.
    async rewrites() {
        return proxyEnabled
            ? [
                  { source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` },
                  { source: "/uploads/:path*", destination: `${API_INTERNAL_URL}/uploads/:path*` },
              ]
            : [];
    },
};

export default nextConfig;
