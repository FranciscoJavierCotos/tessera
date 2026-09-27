import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests always run in UTC (see CLAUDE.md).
process.env.TZ = "UTC";

// The `db` project talks to the Supabase Cloud project: load `.env.local`
// locally so `@/env` validates. Variables already set (CI secrets) win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        // RLS tests against the Supabase Cloud project (no Docker). Fixtures are
        // created per run in `global-setup.ts`; files run serially.
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          globalSetup: ["./tests/db/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
