import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // prettier는 마지막에 — 스타일 관련 ESLint 규칙 비활성화 (Prettier와 충돌 방지)
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // shadcn/ui 컴포넌트는 외부 생성 파일이므로 lint 제외
    "src/components/ui/**",
    // vitest 커버리지 리포트 (빌드 artifact)
    "coverage/**",
    // Playwright HTML 리포트 + trace 번들 (테스트 artifact — minified JS 포함)
    "playwright-report/**",
    "test-results/**",
    // 위젯 번들 빌드 산출물 (scripts/build-widget.mjs 생성)
    "public/widget.js",
    "public/widget.js.map",
  ]),
  // underscore prefix 는 의도적 unused 관례 — no-unused-vars 에서 제외
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // proxy 런타임 크래시 방어 — learnings.md 2026-04-17 참고.
  // Next.js 16 proxy 는 `server-only` 패키지를 resolve 못해 `adapterFn is not a function`
  // 으로 전 요청 404. proxy-client.ts 는 proxy 전용이며 Next 가 자동으로 클라 번들에
  // 포함 안 하므로 `server-only` 가드 원천 불요 — 실수로 추가되지 않도록 ESLint 로 락.
  {
    files: ["src/core/db/proxy-client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "proxy runtime 은 server-only 를 resolve 못해 adapterFn 크래시. proxy-client.ts 에서는 해당 import 를 추가하지 마세요 (learnings.md 2026-04-17 참고).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
