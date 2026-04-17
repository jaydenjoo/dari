import type { Logger } from "pino";
import { logger } from "./logger";

export interface RequestContext {
  requestId: string;
  botId?: string;
  userId?: string;
}

/**
 * 요청 범위의 child logger 생성 — 이후 로그에 ctx 필드가 자동 포함된다.
 *
 * pino 는 undefined 값 키를 JSON 출력에서 자동 제외하므로 optional 필드
 * (`botId`, `userId`) 를 그대로 전달해도 누락 시 로그에 표기되지 않는다.
 *
 * 예시:
 *   const log = createRequestLogger({ requestId, botId });
 *   log.info({ event: "message.received" }, "incoming chat");
 *
 * 주: 자동 컨텍스트 전파(AsyncLocalStorage) 는 별도 Task 에서 도입.
 */
export function createRequestLogger(ctx: RequestContext): Logger {
  return logger.child(ctx);
}
