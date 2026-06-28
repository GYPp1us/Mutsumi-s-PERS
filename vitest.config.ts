import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/lib/drag/__tests__/setup.ts"],
  },
});
