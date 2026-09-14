import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.GUICHE_DIST_DIR || '.next',
  webpack(config, { webpack }) {
    if (process.env.GUICHE_LOCAL === '1') {
      config.resolve.alias['@/lib/runtime-env'] = path.resolve('lib/local-env.ts');
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /^cloudflare:workers$/, path.resolve('lib/local-env.ts'),
      ));
    }
    return config;
  },
};

export default nextConfig;
