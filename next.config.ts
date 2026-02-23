import type { NextConfig } from "next";
const allowedOrigins = [
  `https://${process.env.REPLIT_DEV_DOMAIN || ""}`,
  `https://${process.env.REPLIT_DOMAINS || ""}`,
  "https://064d4fc4-f150-4d04-a316-4dd6b76c5b02-00-2sqefq0pispf6.riker.replit.dev",
];
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: allowedOrigins,
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};
export default nextConfig;
