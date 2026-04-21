#!/usr/bin/env node
/**
 * Dari 위젯 embed smoke — 정적 호스트 서버 (Task A-3).
 *
 * 목적: cross-origin embed 재현. Next.js dev 서버(:4000)에서 위젯 스크립트를 로드하고,
 *       이 서버(:4001)가 host 페이지를 서빙한다. 두 origin 이 다르므로 실제 고객사
 *       embed 환경과 동일한 Origin 검증·CORS·CSP 경로를 거친다.
 *
 * 의존성 0 — node:http + node:fs 기본 모듈만 사용. pnpm 에 http-server 같은 추가 의존성
 * 도입하지 않음 (번들 크기 / 설치 시간 방어).
 *
 * 서빙 대상: `tests/e2e/widget-embed/*.html`
 * 시작: `node tests/e2e/widget-embed/serve.mjs` (기본 port 4001, env `HOST_PORT` 로 override)
 * 종료: SIGINT / SIGTERM (Playwright webServer 가 관리)
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.HOST_PORT ?? 4001);

const ALLOWED_FILES = new Set([
  "host.html",
  "host-strict-csp.html",
  "host-permissive-csp.html",
  "loader.js",
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const rawPath = url.pathname === "/" ? "/host.html" : url.pathname;
    // path traversal 방어 — ALLOWED_FILES 화이트리스트 + 정규화 경로 검증.
    const fileName = normalize(rawPath).replace(/^\/+/, "");
    if (!ALLOWED_FILES.has(fileName)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }

    const filePath = join(__dirname, fileName);
    const content = await readFile(filePath);
    const ext = fileName.slice(fileName.lastIndexOf("."));
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(content);
  } catch (err) {
    // 서버 측 로그만 상세, 응답은 정적 메시지 (code/sec MED-2: 절대경로/스택 노출 차단).
    console.error("[widget-embed host] request failed:", err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`[widget-embed host] listening on http://localhost:${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
