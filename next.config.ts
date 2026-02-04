import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["esbuild", "esbuild-wasm"],
};

export default nextConfig;
