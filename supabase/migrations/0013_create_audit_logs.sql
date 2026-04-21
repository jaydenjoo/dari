-- Migration: 0013_create_audit_logs
-- Purpose:   Epic B Task B-2 — 중요 이벤트(봇 CRUD, 대화 삭제/export)를 감사 로그로 기록.
--            RGPD/DPIA 근거 + 운영 가시성 + B-3 soft delete 의 "언제 누가 삭제했나" 추적.
--
-- Scope:     Epic B Task B-2.
--
-- 주요 결정:
--   - 기록 대상 MVP 5 이벤트: bot.create / bot.update / bot.delete / conversation.delete /
--     conversation.export. 추가 event 는 event_type CHECK 패턴으로 확장 가능.
--   - `actor_id` FK → auth.users(id) ON DELETE RESTRICT: 사용자 탈퇴 시 감사 이력 보존 필수
--     (GDPR "processing record" 요건). 사용자 탈퇴 시 명시적 anonymize 스크립트로 분리 처리.
--   - `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`: 항상 객체 존재 보장 (애플리케이션에서
--     null 체크 불필요). redactDeep 통과 값만 저장 (app 레이어 계약).
--   - RLS 2 정책만 (SELECT/INSERT): UPDATE/DELETE 정책 부재 = 자동 거부 → **immutable**
--     감사 로그 (messages 테이블과 동일 패턴, Phase 0-D-2 전례). 삭제는 service_role 만 가능
--     (retention sweeper 용도 — Phase 2+ cron).
--   - `to authenticated` 명시: anon 배제 (Phase 0-D-2 교훈). anon 은 이 테이블 접근 불가.
--   - WITH CHECK: `actor_id = (select auth.uid())` — 타인 이름으로 감사 기록 생성 차단.
--   - `(select auth.uid())` InitPlan 래핑 — per-row 재평가 방지.
--   - event_type CHECK: `^[a-z_]+\.[a-z_]+$` — namespace.name 패턴 강제. 오타/임의 문자열
--     유입 차단. entity_type CHECK: 'bot'|'conversation' — MVP 범위 명시.
--   - 인덱스 2개:
--       * (actor_id, created_at DESC) — "내 감사 로그 최근 20건" 조회 최적화.
--       * (entity_type, entity_id) — "이 봇의 모든 이벤트" 조회 최적화 (B-3 soft delete
--         복구 UI 에서 사용 예정).
--
-- 롤백 SQL (역순):
--   drop policy if exists audit_logs_insert_own on public.audit_logs;
--   drop policy if exists audit_logs_select_own on public.audit_logs;
--   drop index if exists public.audit_logs_entity_idx;
--   drop index if exists public.audit_logs_actor_created_idx;
--   drop table if exists public.audit_logs;

-- ─── 1. 테이블 생성 ───
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- event_type: 'namespace.action' 형식 강제 (예: 'bot.create', 'conversation.export').
  -- 소문자 + 밑줄만 허용 → 오타/이질 이벤트 유입 차단.
  constraint audit_event_type_fmt check (event_type ~ '^[a-z_]+\.[a-z_]+$'),

  -- entity_type 화이트리스트 (MVP). 새 엔티티 도입 시 이 CHECK 만 갱신하면 확장.
  constraint audit_entity_type_valid check (entity_type in ('bot', 'conversation'))
);

comment on table public.audit_logs is
  'Epic B Task B-2: 중요 이벤트 감사 로그. immutable (RLS INSERT/SELECT 만, UPDATE/DELETE 정책 부재).';

-- ─── 2. 인덱스 ───
-- "내 감사 로그 최근순" — actor_id 로 필터 + created_at DESC 정렬 복합.
create index audit_logs_actor_created_idx
  on public.audit_logs (actor_id, created_at desc);

-- "특정 엔티티의 모든 이벤트" — 봇 하나의 이벤트 이력 (B-3 복구 UI 에서 사용 예정).
create index audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

-- ─── 3. RLS 활성화 ───
alter table public.audit_logs enable row level security;

-- ─── 4. RLS 정책 (SELECT / INSERT 2개만 = immutable) ───

-- SELECT: 자기 actor_id 의 로그만 조회 가능 (대시보드용).
-- 타 사용자의 감사 로그는 노출 금지 (개인정보 + 보안).
create policy audit_logs_select_own
  on public.audit_logs
  for select
  to authenticated
  using (actor_id = (select auth.uid()));

-- INSERT: 자기 uid() 로만 actor_id 기록 가능 (impersonation 차단).
-- DB 계층 이중 방어 — 앱에서 actor_id 를 session.user.id 로 세팅하지만,
-- 잘못된 값이 들어와도 RLS 가 차단.
create policy audit_logs_insert_own
  on public.audit_logs
  for insert
  to authenticated
  with check (actor_id = (select auth.uid()));

-- UPDATE/DELETE 정책 부재 = **자동 거부** (immutable 감사 로그).
-- service_role 만 retention sweeper 로 삭제 가능 (Phase 2+).

-- ─── 5. 정책 코멘트 ───
comment on policy audit_logs_select_own on public.audit_logs is
  'Task B-2: 본인 actor_id 의 감사 로그만 조회. 타 사용자 로그는 차단.';
comment on policy audit_logs_insert_own on public.audit_logs is
  'Task B-2: actor_id = auth.uid() 강제 (impersonation 차단). WITH CHECK 검증.';
