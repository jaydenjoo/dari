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
]);

export default eslintConfig;
