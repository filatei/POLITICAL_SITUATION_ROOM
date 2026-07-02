/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `output: standalone` — we run our own compiled custom server (server.cjs).
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Don't fail the production build on type errors (dev box). Type-check
  // separately with `npm run typecheck`.
  typescript: { ignoreBuildErrors: true },
  // Allow large multipart bodies for media uploads via route handlers.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};
export default nextConfig;
