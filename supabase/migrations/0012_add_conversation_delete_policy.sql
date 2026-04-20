-- Task 1-8-d: owner 의 conversations 삭제 RLS 정책.
--
-- 설계:
--   - `to authenticated`: anon 배제.
--   - `(select auth.uid())` InitPlan 래핑 (per-row 재평가 방지).
--   - messages 는 `on delete cascade` (0003) 로 자동 정리되므로 별도 정책 불필요.
--     FK cascade 는 RLS 와 무관한 시스템 동작이며, conversations DELETE 권한을
--     가진 세션에서만 cascade 가 트리거되므로 owner 격리는 유지됨.
--   - UPDATE/INSERT 정책 없음 (0006 설계 유지) — DELETE 만 신규.
--
-- 롤백:
--   drop policy if exists "conversations_delete_owner" on public.conversations;

-- 기존 정책 존재 시 idempotent 하게 drop + recreate. MCP 히스토리 또는
-- Supabase Studio 수동 생성 가능성 고려.
drop policy if exists "conversations_delete_owner" on public.conversations;

create policy "conversations_delete_owner"
on public.conversations
for delete
to authenticated
using (
  exists (
    select 1 from public.bots
    where bots.id = conversations.bot_id
      and bots.owner_id = (select auth.uid())
  )
);

comment on policy "conversations_delete_owner" on public.conversations is
  'Task 1-8-d: owner bot 의 conversations 만 삭제. messages 는 FK on delete cascade 로 자동 삭제.';
