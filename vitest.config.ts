import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    cache: false,
  },
  resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      alias: {
        // Redirect Capacitor plugins to no-op stubs so unit tests can run
        // outside of a Capacitor/Android WebView context.
        "@capacitor-community/sqlite": resolve(
          __dirname,
          "src/__mocks__/@capacitor-community/sqlite.ts"
        ),
        "@capacitor/app": resolve(
          __dirname,
          "src/__mocks__/@capacitor/app.ts"
        ),
      },
    },
});
