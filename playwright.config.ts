import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://localhost:3017",
    channel: process.env.CI ? undefined : "chrome",
    viewport: { width: 1536, height: 1024 },
  },
  reporter: "list",
});
