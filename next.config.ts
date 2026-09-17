import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR ?? ".next",
  compress: true,
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
