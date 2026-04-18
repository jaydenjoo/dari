#!/usr/bin/env node
/**
 * 위젯 번들 빌드 스크립트 (Task 1-6-b).
 *
 * 입력: src/widget/index.ts
 * 출력: public/widget.js (+ .map, --sourcemap 지정 시에만)
 *
 * Next 는 public/ 하위 정적 파일을 `/widget.js` 경로로 자동 서빙하므로 별도 라우팅 불요.
 * `build` 체인에서 `pnpm build:widget && next build` 로 선행 실행된다.
 *
 * 포맷: IIFE / target es2020 / minify on
 *
 * ⚠️ sourcemap 정책 (sec H-2 반영):
 *   - 기본 OFF — 프로덕션 `public/widget.js.map` 공개 시 내부 모듈 구조·주석·에러 코드가
 *     노출되어 공격자 정보량이 커진다. 공격 표면 축소를 위해 차단이 기본.
 *   - 디버그용은 `pnpm build:widget:dev` 또는 `node scripts/build-widget.mjs --sourcemap`.
 *     이 경우에도 `.gitignore` 에 `/public/widget.js.map` 이 있어 실수로 커밋되지 않는다.
 */
import { build } from "esbuild";
import { readFile, stat, unlink } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const ENTRY = "src/widget/index.ts";
const OUTFILE = "public/widget.js";
const WITH_SOURCEMAP = process.argv.includes("--sourcemap");

async function main() {
  // 이전 산출물 정리 — 기본(prod) 빌드 시 dev 모드에서 생성된 .map 이 남아 배포에
  // 포함되는 경로 차단. (재리뷰 sec LOW: CI 오염 완전 방어)
  await unlink(OUTFILE).catch(() => {});
  await unlink(`${OUTFILE}.map`).catch(() => {});

  const start = Date.now();
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    minify: true,
    sourcemap: WITH_SOURCEMAP,
    format: "iife",
    target: "es2020",
    outfile: OUTFILE,
    legalComments: "none",
    logLevel: "info",
    metafile: true,
  });

  const stats = await stat(OUTFILE);
  const raw = await readFile(OUTFILE);
  const gz = gzipSync(raw).length;
  const elapsed = Date.now() - start;

  console.log(
    `✓ widget.js ${formatSize(stats.size)} (gzip ${formatSize(gz)})` +
      `${WITH_SOURCEMAP ? " + sourcemap" : ""} / ${elapsed}ms`,
  );

  if (gz > 15 * 1024) {
    console.warn(
      `⚠ widget.js gzip ${formatSize(gz)} 이 목표 15KB 를 초과. 번들 내용 검토 필요.`,
    );
  }

  if (result.warnings.length > 0) {
    console.warn(`⚠ warnings: ${result.warnings.length}`);
  }
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

main().catch((err) => {
  console.error("✗ widget build 실패:", err);
  process.exit(1);
});
