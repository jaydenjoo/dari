-- Task 1-8-c: 봇별 KPI 집계 RPC
--
-- 5개 지표를 1 왕복 jsonb 로 반환한다:
--   conversationCount : 기간 내 생성된 conversations 수
--   conversationTotal : 전체 conversations 수 (기간 무관, 누적 가독성)
--   activeCount       : status='active' 인 conversations 수 (기간 무관 실시간 스냅샷
--                       — p_since 와 독립적으로 동작하므로 UI tooltip 으로 명시)
--   messageCount      : 기간 내 생성된 messages 수 (2-hop: messages → conversations.bot_id)
--   totalTokens       : 기간 내 messages.tokens_used 합계 (null 은 0 취급)
--
-- 설계:
--   - security invoker: 호출자 세션의 auth.uid() 로 RLS 평가. bot owner 가 아니면
--     내부 쿼리가 0 반환 → 결과 전부 0 (enumeration 방어).
--   - search_path='': public. 프리픽스 강제. search_path 하이재킹 차단.
--   - jsonb 반환: Supabase JS 에서 단일 value 로 수신, 클라에서 Zod parse.
--   - p_since 는 timestamptz. 'all' 케이스는 앱 레벨에서 epoch(1970-01-01) 전달.
--
-- 권한:
--   - authenticated 만 EXECUTE. anon/public 는 자동 배제.
--
-- 롤백:
--   drop function if exists public.bot_stats(uuid, timestamptz);

create or replace function public.bot_stats(
  p_bot_id uuid,
  p_since timestamptz
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'conversationCount', (
      select count(*)::bigint from public.conversations
      where bot_id = p_bot_id and created_at >= p_since
    ),
    'conversationTotal', (
      select count(*)::bigint from public.conversations
      where bot_id = p_bot_id
    ),
    'activeCount', (
      select count(*)::bigint from public.conversations
      where bot_id = p_bot_id and status = 'active'
    ),
    'messageCount', (
      select count(*)::bigint from public.messages m
      where m.created_at >= p_since
        and exists (
          select 1 from public.conversations c
          where c.id = m.conversation_id and c.bot_id = p_bot_id
        )
    ),
    'totalTokens', (
      select coalesce(sum(m.tokens_used), 0)::bigint from public.messages m
      where m.created_at >= p_since
        and exists (
          select 1 from public.conversations c
          where c.id = m.conversation_id and c.bot_id = p_bot_id
        )
    )
  );
$$;

revoke all on function public.bot_stats(uuid, timestamptz) from public;
revoke all on function public.bot_stats(uuid, timestamptz) from anon;
grant execute on function public.bot_stats(uuid, timestamptz) to authenticated;

comment on function public.bot_stats(uuid, timestamptz) is
  'Task 1-8-c: 봇별 KPI 집계. security invoker 로 호출자 RLS 자동 적용. authenticated 만 EXECUTE.';
