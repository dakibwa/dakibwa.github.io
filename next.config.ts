import type { NextConfig } from "next";

const siteBasePath = process.env.SITE_BASE_PATH?.replace(/^\/+|\/+$/g, "");
const basePath = siteBasePath ? `/${siteBasePath}` : "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  devIndicators: false,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  }
};

export default nextConfig;
