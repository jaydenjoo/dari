/**
 * Playwright global setup — 테스트 세션 전 1회 실행.
 *
 * - 주 테스트 계정 1건 생성 (기존에 남아 있으면 먼저 삭제 후 재생성).
 * - uid 를 `tests/e2e/.state/main-user.json` 에 기록 — teardown 이 읽어 삭제.
 *
 * 주의: setup 이 throw 하면 Playwright 는 teardown 을 호출하지 않는다.
 * 그래서 setup 첫 단계가 `deleteTestUserByEmail` 로 선제 정리 — 이전 실행에서
 * teardown 이 실패해 남은 계정은 다음 setup 이 self-heal 한다.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { createTestUser, deleteTestUserByEmail } from "./support/test-accounts";
import { MAIN_TEST_USER } from "./support/fixtures";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, ".state");
const STATE_FILE = join(STATE_DIR, "main-user.json");

export default async function globalSetup(): Promise<void> {
  // 과거 teardown 실패로 남은 계정 선제 정리.
  await deleteTestUserByEmail(MAIN_TEST_USER.email);

  const user = await createTestUser(
    MAIN_TEST_USER.email,
    MAIN_TEST_USER.password,
  );

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ id: user.id }, null, 2));

  console.log(`[e2e setup] 테스트 계정 생성: ${user.email} (${user.id})`);
}
