/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Don't fail the production build on type errors (dev box). Type-check
  // separately with `npm run typecheck`.
  typescript: { ignoreBuildErrors: true },
  // Allow large multipart bodies for media uploads via route handlers.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};
export default nextConfig;
