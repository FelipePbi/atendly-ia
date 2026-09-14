import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Data tests stay on `node`: they exercise schemas and the HTTP adapter,
    // where a DOM would only add globals nobody asked for. Component tests opt
    // into a DOM per file with `@vitest-environment jsdom`, so the environment
    // is visible in the file that needs it rather than implied by a glob.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup/dom.ts"],
  },
});
