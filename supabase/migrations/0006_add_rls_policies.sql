-- Migration: 0006_add_rls_policies
-- Purpose:   Epic 0-D Auth 완결 후 owner 기반 RLS 정책 활성화. Task 0-D-2.
--            bots / conversations / messages / knowledge_chunks 4 테이블 — 봇 소유자(auth.uid())
--            만 자기 데이터 CRUD. 익명 방문자(visitor_id) 흐름은 Phase 1 에서 service_role
--            서버 라우트 경유. 로그인 방문자(conversations.user_id) 격리는 Phase 1 위젯 로그인
--            지원 시점에 별도 정책 추가.
--
-- Scope:     Epic 0-D Task 0-D-2. 경로 A (owner 전용, 최소 단단).
--
-- 주요 결정:
--   - `bots.owner_id` NOT NULL 전환: 데이터 0건 시점이 최저 비용 (learnings.md 2026-04-17 참조).
--     이후 모든 봇은 소유자 강제 — 앱 레벨에서 `owner_id = auth.uid()` 주입 필요.
--   - `messages` 는 immutable — UPDATE/DELETE 정책 없음 (INSERT/SELECT 만).
--     대화 재개가 아닌 "새 메시지 추가" 모델.
--   - EXISTS 서브쿼리: JOIN 대신 EXISTS 사용. PG 옵티마이저가 short-circuit 처리 → 첫 매칭 시 종료.
--   - USING vs WITH CHECK 구분:
--       * SELECT/DELETE: USING 만 (기존 row 평가).
--       * INSERT: WITH CHECK 만 (새 row 평가).
--       * UPDATE: USING(기존) + WITH CHECK(변경 후) 둘 다. owner_id 변경 차단 포함.
--   - `auth.uid()` 는 인증되지 않은 세션에서 NULL → `= auth.uid()` 는 자동 false.
--     익명 접근은 별도 처리 없이 자동 차단 (의도).
--   - **소프트 삭제 봇(`status = 'deleted'`) 도 owner 는 여전히 접근 가능** (의도된 설계).
--     근거: 휴지통/복구 UI 여지 + 소프트 삭제 개념 정합. 대시보드 노출 숨김은 앱 레벨에서
--     `where status != 'deleted'` 필터로 처리. 하위 테이블(conversations/messages/
--     knowledge_chunks) 도 bots EXISTS 통해 자동 동일 정책 적용.
--
-- 롤백 SQL (역순):
--   drop policy if exists knowledge_chunks_delete_owner on public.knowledge_chunks;
--   drop policy if exists knowledge_chunks_update_owner on public.knowledge_chunks;
--   drop policy if exists knowledge_chunks_insert_owner on public.knowledge_chunks;
--   drop policy if exists knowledge_chunks_select_owner on public.knowledge_chunks;
--   drop policy if exists messages_insert_owner on public.messages;
--   drop policy if exists messages_select_owner on public.messages;
--   drop policy if exists conversations_delete_owner on public.conversations;
--   drop policy if exists conversations_update_owner on public.conversations;
--   drop policy if exists conversations_insert_owner on public.conversations;
--   drop policy if exists conversations_select_owner on public.conversations;
--   drop policy if exists bots_delete_owner on public.bots;
--   drop policy if exists bots_update_owner on public.bots;
--   drop policy if exists bots_insert_owner on public.bots;
--   drop policy if exists bots_select_owner on public.bots;
--   alter table public.bots alter column owner_id drop not null;

-- ─── 0. bots.owner_id NOT NULL 전환 ───
-- 데이터 0건 시점 = 안전. Epic 0-D 이후 모든 봇은 소유자 강제.
-- 앱 레벨에서 `owner_id = auth.uid()` 주입 필요 (Phase 1 /bots/new 구현 시).
alter table public.bots
  alter column owner_id set not null;

-- ─── 1. bots RLS 정책 (4개) ───
-- SELECT: 자기 봇만 조회.
create policy bots_select_owner
  on public.bots
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

-- INSERT: owner_id 를 자기 uid() 로만 생성 가능 (다른 사람 이름으로 생성 차단).
create policy bots_insert_owner
  on public.bots
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- UPDATE: 자기 봇만 수정. 변경 후에도 owner_id 여전히 자기 소유 (owner 이전 차단).
create policy bots_update_owner
  on public.bots
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- DELETE: 자기 봇만 삭제.
create policy bots_delete_owner
  on public.bots
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ─── 2. conversations RLS 정책 (4개) ───
-- 봇 소유자가 자기 봇의 모든 대화 관리 (대시보드 조회/삭제/상태변경).
-- 익명 방문자(visitor_id) 흐름은 Phase 1 service_role 경유. 로그인 방문자(user_id)는 추후 별도 정책.
-- UPDATE 정책의 USING 은 변경 전 row 기준, WITH CHECK 는 변경 후 row 기준 평가.
-- → bot_id 를 타인 봇으로 이전하는 시도 도 WITH CHECK 의 EXISTS 에서 자동 차단됨.

create policy conversations_select_owner
  on public.conversations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.bots
      where bots.id = conversations.bot_id
        and bots.owner_id = (select auth.uid())
    )
  );

create policy conversations_insert_owner
  on public.conversations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.bots
      where bots.id = conversations.bot_id
        and bots.owner_id = (select auth.uid())
    )
  );

create policy conversations_update_owner
  on public.conversations
  for update
  to authenticated
  using (
    exists (
      select 1 from public.bots
      where bots.id = conversations.bot_id
        and bots.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.bots
      where bots.id = conversations.bot_id
        and bots.owner_id = (select auth.uid())
    )
  );

create policy conversations_delete_owner
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

-- ─── 3. messages RLS 정책 (2개 — SELECT/INSERT) ───
-- messages 는 immutable — UPDATE/DELETE 정책 없음 (정책 부재 = 자동 거부, service_role 만 가능).
-- 조건: messages → conversations → bots.owner_id = auth.uid() 2단 EXISTS.

create policy messages_select_owner
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      join public.bots b on b.id = c.bot_id
      where c.id = messages.conversation_id
        and b.owner_id = (select auth.uid())
    )
  );

create policy messages_insert_owner
  on public.messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.conversations c
      join public.bots b on b.id = c.bot_id
      where c.id = messages.conversation_id
        and b.owner_id = (select auth.uid())
    )
  );

-- ─── 4. knowledge_chunks RLS 정책 (4개) ───
-- 봇 소유자만 지식 베이스 CRUD. RAG 검색 RPC `match_knowledge_chunks` 는 security invoker 이므로
-- 호출자(authenticated/anon) 컨텍스트에 이 정책 자동 적용. Phase 1 위젯은 service_role 경유.

create policy knowledge_chunks_select_owner
  on public.knowledge_chunks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.bots
      where bots.id = knowledge_chunks.bot_id
        and bots.owner_id = (select auth.uid())
    )
  );

create policy knowledge_chunks_insert_owner
  on public.knowledge_chunks
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.bots
      where bots.id = knowledge_chunks.bot_id
        and bots.owner_id = (select auth.uid())
    )
  );

create policy knowledge_chunks_update_owner
  on public.knowledge_chunks
  for update
  to authenticated
  using (
    exists (
      select 1 from public.bots
      where bots.id = knowledge_chunks.bot_id
        and bots.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.bots
      where bots.id = knowledge_chunks.bot_id
        and bots.owner_id = (select auth.uid())
    )
  );

create policy knowledge_chunks_delete_owner
  on public.knowledge_chunks
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.bots
      where bots.id = knowledge_chunks.bot_id
        and bots.owner_id = (select auth.uid())
    )
  );

-- ─── 5. 코멘트 ───
comment on policy bots_select_owner on public.bots is
  'Task 0-D-2 경로 A: 봇 소유자만 자기 봇 조회.';
comment on policy conversations_select_owner on public.conversations is
  'Task 0-D-2 경로 A: 봇 소유자가 자기 봇의 대화 조회. 로그인 방문자 격리는 Phase 1 에서 추가.';
comment on policy messages_select_owner on public.messages is
  'Task 0-D-2 경로 A: 봇 소유자가 자기 봇의 메시지 조회. messages 는 immutable — UPDATE/DELETE 정책 없음.';
comment on policy knowledge_chunks_select_owner on public.knowledge_chunks is
  'Task 0-D-2 경로 A: 봇 소유자만 지식 청크 조회. RAG RPC (security invoker) 에 자동 적용.';
