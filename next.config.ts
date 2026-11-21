import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const dev = process.env.NODE_ENV !== "production";

// Content Security Policy: scripts, styles and data only from this site (plus Supabase for sign-in
// and two-step codes). Next.js needs inline scripts for page start-up; nothing loads from elsewhere.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl}`.trim(),
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // File downloads set their own headers: a page-wide CSP can stop the browser's PDF viewer.
      { source: "/:path((?!api/attachments/).*)", headers: securityHeaders },
      {
        source: "/api/attachments/:id",
        headers: securityHeaders.filter((h) => h.key !== "Content-Security-Policy"),
      },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
  },
  // Route-group folders like "(app)" end up in browser chunk file names. Some proxies re-encode
  // the parentheses and Cloudflare's asset server redirects back, looping forever. Keep them out.
  webpack(config, { isServer }) {
    if (!isServer && typeof config.output?.filename === "string") {
      const clean = (template: string) => (pathData: { chunk?: { name?: string | null } }) =>
        pathData.chunk?.name && /[()]/.test(pathData.chunk.name)
          ? template.replace("[name]", pathData.chunk.name.replace(/[()]/g, "_"))
          : template;
      config.output.filename = clean(config.output.filename);
      if (typeof config.output.chunkFilename === "string") config.output.chunkFilename = clean(config.output.chunkFilename);
    }
    return config;
  },
};

export default nextConfig;

// Lets `next dev` use Cloudflare bindings locally.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
