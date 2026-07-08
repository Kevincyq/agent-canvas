/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com https://mcp.fluxink.ai https://*.fluxink.ai",
              "style-src 'self' 'unsafe-inline' https://mcp.fluxink.ai https://*.fluxink.ai",
              "img-src 'self' data: blob: https://mcp.fluxink.ai https://*.fluxink.ai",
              "font-src 'self' data: https://mcp.fluxink.ai https://*.fluxink.ai",
              "connect-src 'self' https://mcp.fluxink.ai https://*.fluxink.ai https://unpkg.com",
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
