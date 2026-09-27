import type { NextConfig } from "next";

// Validate env vars at startup (dev, build, start) so misconfiguration fails fast.
import "./src/env";

const nextConfig: NextConfig = {};

export default nextConfig;
