import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the same network use the dev server. Next blocks
  // dev-only requests from hosts other than localhost, so opened by the Mac's
  // LAN address the page renders but never hydrates: nothing responds.
  allowedDevOrigins: ["192.168.*.*", "*.local"],
};

export default nextConfig;
