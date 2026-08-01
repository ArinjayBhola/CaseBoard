/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // A `next build` writing into the same .next a running `next dev` owns will
  // fail partway through collecting page data. Setting NEXT_BUILD_DIR lets a
  // verification or CI build run alongside a live dev server.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
};

export default nextConfig;
