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
      // Regression 방어 — 현재(2026-04-21) baseline 의 바로 아래를 하한으로 고정.
      // statements/lines 52.01% / branches 51.79% / functions 58.7% (phase-1-release-checklist §2).
      // widget(Phase 2 배포) + 외부 의존 클라이언트(firecrawl/login-limiter) 때문에 전체 수치가 낮게 pulling.
      // 점진 상승 전략: 새 모듈 추가 시 해당 영역 커버리지 90%+ 강제, baseline 은 분기별로 +5pp 상향.
      // 실행: `pnpm test:coverage` (CI 와 로컬 동일 게이트).
      thresholds: {
        lines: 50,
        statements: 50,
        branches: 50,
        functions: 55,
      },
    },
  },
});
