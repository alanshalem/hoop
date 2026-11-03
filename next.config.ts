import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Dev only: let a tablet on the local network or a Cloudflare quick tunnel load the dev server.
  allowedDevOrigins: ['192.168.0.138', '*.trycloudflare.com'],
};

export default nextConfig;
