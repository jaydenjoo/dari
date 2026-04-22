// 이 barrel 은 csv.ts / meta.ts (둘 다 "server-only") 를 포함하므로
// 아래 import 로 barrel 전체를 server-only 로 락한다.
// → 클라이언트 컴포넌트에서 이 barrel 을 import 하려 하면 Next.js 가 빌드 시 차단.
// 만약 미래에 클라이언트에서 status/visitor/mask-email (isomorphic) 이 필요하면
// barrel 이 아닌 세부 경로 (`@/shared/conversations/status` 등) 로 import 할 것.
import "server-only";

// ---- server-only (barrel 을 타면 위 락에 의해 빌드 경계 유지) ----
export * from "./csv";
export * from "./meta";
// ---- isomorphic (세부 경로로 import 하면 client 에서도 사용 가능) ----
export * from "./mask-email";
export * from "./status";
export * from "./visitor";
