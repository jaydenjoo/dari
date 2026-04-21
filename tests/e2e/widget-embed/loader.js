// Dari 위젯 embed smoke — external loader (Task A-3).
//
// 이 파일은 host 페이지(HTML)가 external script 로 로드한다.
// 목적: CSP `script-src 'self'` 매트릭스에서 **inline script 차단과 외부 스크립트 차단을
//       분리**해 의미 있는 실측을 가능하게 한다.
//   - inline loader: CSP 'self' 하에서 `unsafe-inline` 없으면 실행 안 됨 → CSP 매트릭스가
//                    "외부 스크립트 차단" 인지 "inline 차단" 인지 구분 불가
//   - external loader (이 파일): host 서버(:4001) 의 self origin 이라 항상 실행됨
//                                 → CSP 효과는 오직 widget.js (:4000) 로드 여부로만 나타남

(function () {
  // security MEDIUM-1 (2026-04-21 review): `cdn` 파라미터는 <script src> 에 직접
  // 삽입되므로 origin 화이트리스트로 제한. 테스트 전용 정적 호스트 (:4001) 이지만
  // CI 포트 노출 / 실수로 외부 접근 허용 시 임의 스크립트 로드 경로가 된다 (CWE-79).
  var ALLOWED_CDN_ORIGINS = ["http://localhost:4000", "http://localhost:3000"];

  var params = new URLSearchParams(window.location.search);
  var slug = params.get("bot");
  var cdnRaw = params.get("cdn") || "http://localhost:4000/widget.js";
  if (!slug) return;

  var cdn;
  try {
    var parsed = new URL(cdnRaw);
    if (!ALLOWED_CDN_ORIGINS.includes(parsed.origin)) return;
    cdn = parsed.href;
  } catch (_e) {
    return;
  }

  var script = document.createElement("script");
  script.src = cdn;
  script.async = true;
  script.setAttribute("data-bot-id", slug);
  script.setAttribute("data-testid", "dari-widget-script");
  document.body.appendChild(script);
})();
