import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
