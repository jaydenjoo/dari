-- Task B-4: 일별 사용량 집계 RPC (차트용)
--
-- 기간 내 일 단위 `{day, messages, tokens}` 배열을 1 왕복 jsonb 로 반환한다.
-- 원가(usd_cents) 는 RPC 에 포함하지 않는다 — 단가는 앱 레이어 상수
-- (`src/core/pricing/claude-rates.ts`) 에서 곱한다. Claude 단가 변경 시
-- 마이그레이션 없이 코드 1 지점 수정으로 대응하기 위함.
--
-- 설계:
--   - 일 경계는 `Asia/Seoul` 기준. KR 사용자의 "오늘/어제" 직관과 일치.
--     UTC 기준이면 KST 자정 직전 메시지가 다음 날로 묶여 운영자 혼란.
--     구현: `date_trunc('day', ts AT TIME ZONE 'Asia/Seoul')::date`
--   - security invoker: 호출자 세션의 auth.uid() 로 RLS 평가. bot owner 가
--     아니면 EXISTS 서브쿼리가 0 반환 → 빈 배열 (enumeration 방어).
--   - search_path='': public. 프리픽스 강제 (하이재킹 차단).
--   - jsonb 배열 반환: day 오름차순. 빈 결과는 `[]` (`coalesce` 로 null 방지).
--   - `to_char(..., 'YYYY-MM-DD')` 로 text 직렬화 — timestamp 직렬화 드리프트 방지.
--   - p_since 는 timestamptz. 'all' 케이스는 앱 레벨에서 epoch 전달
--     (기존 `bot_stats` RPC 와 동일 계약).
--
-- 성능:
--   - 기존 messages 인덱스: `idx_messages_conversation_id(conversation_id)` +
--     `idx_messages_created_at(created_at)` 2개 (단일 컬럼). 복합 인덱스 부재.
--     Bitmap AND 결합 또는 선택도 낮은 쪽만 사용 — MVP 단계 OK.
--   - 90일 × 평균 N 메시지 기준 <50ms 기대. 대용량 시 `(conversation_id,
--     created_at)` 복합 인덱스 추가 검토 (Phase 3 Backlog).
--
-- 권한:
--   - authenticated 만 EXECUTE. anon/public 자동 배제.
--
-- 롤백:
--   drop function if exists public.bot_stats_daily(uuid, timestamptz);

create or replace function public.bot_stats_daily(
  p_bot_id uuid,
  p_since timestamptz
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', to_char(day_bucket, 'YYYY-MM-DD'),
        'messages', messages,
        'tokens', tokens
      )
      order by day_bucket asc
    ),
    '[]'::jsonb
  )
  from (
    select
      (date_trunc('day', m.created_at at time zone 'Asia/Seoul'))::date as day_bucket,
      count(*)::bigint as messages,
      coalesce(sum(m.tokens_used), 0)::bigint as tokens
    from public.messages m
    where m.created_at >= p_since
      and exists (
        select 1 from public.conversations c
        where c.id = m.conversation_id and c.bot_id = p_bot_id
      )
    group by day_bucket
  ) sub;
$$;

revoke all on function public.bot_stats_daily(uuid, timestamptz) from public;
revoke all on function public.bot_stats_daily(uuid, timestamptz) from anon;
grant execute on function public.bot_stats_daily(uuid, timestamptz) to authenticated;

comment on function public.bot_stats_daily(uuid, timestamptz) is
  'Task B-4: 일별 메시지/토큰 집계 (Asia/Seoul day bins). 원가 USD 는 앱 레이어에서 곱함.';
