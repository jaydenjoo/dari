// Vitest 환경용 "server-only" 모듈 스텁.
// 실 server-only 패키지는 Next.js 번들러가 client 번들에서만 throw 하도록 설계되어
// vitest 의 node 환경에서 import 하면 무조건 throw 된다. 테스트는 서버 경로만
// 실행하므로 이 빈 모듈로 덮어써서 런타임 에러를 회피한다.
export {};
