/**
 * Playwright global teardown — 테스트 세션 종료 후 1회 실행.
 *
 * global-setup 이 기록한 uid 로 테스트 계정 삭제.
 * state 파일이 없거나 삭제가 실패해도 teardown 은 throw 하지 않는다
 * (CI 실패를 덧씌우지 않기 위함). 실패는 stderr 로만 고지.
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deleteTestUser, deleteTestUserByEmail } from "./support/test-accounts";
import { MAIN_TEST_USER } from "./support/fixtures";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, ".state", "main-user.json");

export default async function globalTeardown(): Promise<void> {
  let uid: string | null = null;

  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf8")) as {
        id?: string;
      };
      uid = raw.id ?? null;
    } catch (err) {
      console.error(`[e2e teardown] state 파일 파싱 실패: ${String(err)}`);
    }
  }

  if (uid) {
    await deleteTestUser(uid);
  } else {
    // state 가 없으면 이메일로 찾아 삭제 (best effort).
    await deleteTestUserByEmail(MAIN_TEST_USER.email);
  }

  try {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  } catch {
    // state 파일 정리 실패는 무시.
  }

  console.log(`[e2e teardown] 테스트 계정 정리 완료 (${MAIN_TEST_USER.email})`);
}
