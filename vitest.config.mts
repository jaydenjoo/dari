import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // "server-only" 는 Next.js 전용 런타임 guard — vitest node 환경에서는
      // 무조건 throw 하므로 빈 stub 으로 대체한다. (`vitest.stubs/server-only.ts`)
      "server-only": new URL("./vitest.stubs/server-only.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/types.ts",
        "src/**/*.d.ts",
        "src/**/index.ts",
      ],
    },
  },
});
