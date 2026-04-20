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
    // 각 테스트 파일 import 전에 process.env 에 merge 된다 (vitest v1+ 공식 동작).
    // env.ts 가 부팅 시점에 fail-fast 로 필수 변수를 검증하므로, 실 키 아닌 placeholder 를
    // 여기서 제공한다. 개별 파일의 `vi.hoisted()` 주입이 중복되더라도 `??=` 관례로 보존.
    // 실 테스트 키는 gitleaks 오탐 회피 위해 `fake-*` / `fc-test-*` prefix 사용.
    env: {
      FIRECRAWL_API_KEY: "fc-test-placeholder-do-not-call",
    },
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
