-- Migration: 0007_add_message_limit_trigger
-- Purpose:   conversation 당 메시지 200건 상한을 DB 레벨에서 강제.
--            앱 레벨 count 체크 (route.ts MAX_MESSAGES_PER_CONVERSATION) 는
--            정상 경로에서 새 conversation 으로 전환하는 1차 방어선이고,
--            이 트리거는 race condition (동시 요청이 199 → 200+N) 차단의
--            2차 방어선이다. (security re-review N-2, Task 1-6-a 후속)
-- Scope:     Task 1-6-a Chat API 후속 보강. 데이터 0건 시점.
--
-- 알려진 한계:
--   - READ COMMITTED 격리에서 트리거 내부 count(*) 자체에도 미세 race 잔존.
--     완전 차단은 conversation 레벨 advisory lock 또는 SERIALIZABLE 격리가 필요한데,
--     Phase 1 MVP 비용 대비 이득 작아 보류. rate limit (봇당 IP 100/h) 이 자연 상한.
--   - 트리거 발동 시 PostgREST 가 4xx/5xx 반환 → app 레벨에서 internal_error 500
--     으로 일반화됨 (enumeration 방지). 앱 레벨 1차 방어가 도달 직전에 새 conversation
--     으로 전환을 처리하므로, 트리거까지 도달하는 케이스는 race 또는 직접 DB 접근뿐.
--
-- 보안 고려:
--   - search_path = '' 로 함수 하이재킹 방어 (0004 패턴 따름).
--   - 빈 search_path 에서 미한정 참조는 ERROR → 본문에서 public.messages 명시 필수.
--   - errcode 'check_violation' 사용 — 의미상 일치 + Supabase REST 가 예외 메시지를
--     평문 반환하지 않게 일반 4xx 처리.
--
-- 롤백 SQL:
--   drop trigger if exists trg_messages_check_limit on public.messages;
--   drop function if exists public.check_message_limit();

create or replace function public.check_message_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.messages
    where conversation_id = new.conversation_id
  ) >= 200 then
    raise exception 'message_limit_exceeded'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_messages_check_limit
  before insert on public.messages
  for each row
  execute function public.check_message_limit();

comment on function public.check_message_limit() is
  '한 conversation 당 메시지 수 200건 상한 enforce. app 레벨 count 체크의 race condition 2차 방어선.';
