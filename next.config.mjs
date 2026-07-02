/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Allow large multipart bodies for media uploads via route handlers.
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};
export default nextConfig;
