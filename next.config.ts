import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  deploymentId:
    process.env.RAILWAY_DEPLOYMENT_ID ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GIT_SHA,
};

export default nextConfig;
