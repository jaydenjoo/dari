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
  var params = new URLSearchParams(window.location.search);
  var slug = params.get("bot");
  var cdn = params.get("cdn") || "http://localhost:4000/widget.js";
  if (!slug) return;

  var script = document.createElement("script");
  script.src = cdn;
  script.async = true;
  script.setAttribute("data-bot-id", slug);
  script.setAttribute("data-testid", "dari-widget-script");
  document.body.appendChild(script);
})();
