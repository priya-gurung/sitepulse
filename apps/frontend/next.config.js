/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.DASHBOARD_API_URL || "http://localhost:4002"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
