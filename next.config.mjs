/** @type {import('next').NextConfig} */
const defaultPortalFrameAncestors = [
  "https://ai.eaglelab.tcl.com",
  "https://ai.tcl.com",
];

function getPortalFrameAncestors() {
  const configuredOrigins = process.env.PORTAL_FRAME_ANCESTOR_ORIGIN
    ?.split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter((origin) => /^https?:\/\/[^/]+$/.test(origin));

  return configuredOrigins?.length
    ? configuredOrigins
    : defaultPortalFrameAncestors;
}

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    const portalFrameAncestors = getPortalFrameAncestors();

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
              "connect-src 'self' https://*.api.cognitive.microsoft.com wss://*.stt.speech.microsoft.com https://mcp.fluxink.ai https://*.fluxink.ai https://unpkg.com",
              "frame-src 'self' blob: data:",
              `frame-ancestors 'self' ${portalFrameAncestors.join(" ")}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
