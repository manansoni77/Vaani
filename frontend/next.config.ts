import type { NextConfig } from "next";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Proxy /grpc/* → backend to avoid CORS on gRPC-Web requests.
        // The browser talks to the Next.js dev server (same origin),
        // Next.js forwards server-side where CORS does not apply.
        source: "/grpc/:path*",
        destination: `${API_ORIGIN}/grpc/:path*`,
      },
    ];
  },
};

export default nextConfig;
