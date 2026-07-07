/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    const portalOrigin = process.env.PORTAL_FRAME_ANCESTOR_ORIGIN;

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self' https://mcp.fluxink.ai https://*.fluxink.ai",
              "frame-src 'self' blob: data:",
              portalOrigin ? `frame-ancestors 'self' ${portalOrigin}` : "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
