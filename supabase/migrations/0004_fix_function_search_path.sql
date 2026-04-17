-- Migration: 0004_fix_function_search_path
-- Purpose:   보안 린트 function_search_path_mutable WARN 2건 해결.
--            함수의 search_path 가 role-mutable 이면 동명 사용자 정의 함수로
--            하이재킹되어 권한 상승 경로가 될 수 있음. 빈 search_path 로 고정.
-- Scope:     Epic 0-B 보조 (기술부채 사전 차단). 데이터 0건 시점.
--
-- 적용 전제:
--   - public.set_updated_at: 본문이 now() (pg_catalog 암묵 포함) + PL/pgSQL 언어 키워드(new)
--     → 빈 search_path 에서도 정상 동작.
--   - public.update_conversation_last_message: 본문이 public.conversations 로 스키마 명시
--     → 빈 search_path 에서도 정상 동작.
--
-- 롤백 SQL:
--   alter function public.set_updated_at() reset search_path;
--   alter function public.update_conversation_last_message() reset search_path;

-- ─── 1. bots/conversations updated_at 자동 갱신 트리거 함수 ───
alter function public.set_updated_at()
  set search_path = '';

-- ─── 2. messages → conversations.last_message_at 자동 갱신 트리거 함수 ───
alter function public.update_conversation_last_message()
  set search_path = '';
