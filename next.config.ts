import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure leaflet and dynamic map components work smoothly
  transpilePackages: ["lucide-react"],
};

export default nextConfig;
