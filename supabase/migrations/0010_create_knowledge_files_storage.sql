-- Migration: 0010_create_knowledge_files_storage
-- Purpose:   Task 1-7-c — file 지식 업로드용 Supabase Storage 버킷 + RLS 4정책.
-- Scope:     Epic 1-7 (지식 업로드).
--
-- 주요 결정:
--   - 버킷 id/name: 'knowledge-files'. private (public=false) → 인증/서명 URL 필요.
--   - 경로 구조: {bot_id}/{uuid}.{ext}  — first segment 가 bot_id (RLS 매칭 키).
--   - file_size_limit = 10MB. Server Action bodySizeLimit(next.config.ts)과 이중 방어.
--   - allowed_mime_types: application/pdf / text/plain / text/markdown / text/x-markdown.
--     앱 layer 에서 magic bytes 재검증 (MIME 헤더 위조 방어).
--
-- RLS 정책 설계 (knowledge_chunks_*_owner 0006 정책 패턴 계승):
--   - 4 action (INSERT/SELECT/UPDATE/DELETE) 각각 별도 정책 — USING/WITH CHECK 구분.
--   - 판별식: `bots.id::text = (storage.foldername(name))[1] AND bots.owner_id = auth.uid()`.
--     storage.foldername 은 슬래시 분리 배열. [1] = 첫 세그먼트(= bot_id).
--   - (select auth.uid()) InitPlan 래핑 — 정책이 row 마다 재평가되지 않게 (0006 패턴).
--   - anon 자동 배제 — `to authenticated` 명시.
--
-- 보안:
--   - 타인 봇 bot_id 경로로 업로드/다운로드 시도 시 WITH CHECK/USING 0-row → 자동 거부.
--   - on conflict (id) do update — file_size_limit / allowed_mime_types 재배포 시 갱신 가능.
--
-- 롤백 SQL:
--   drop policy if exists knowledge_files_insert_owner on storage.objects;
--   drop policy if exists knowledge_files_select_owner on storage.objects;
--   drop policy if exists knowledge_files_update_owner on storage.objects;
--   drop policy if exists knowledge_files_delete_owner on storage.objects;
--   delete from storage.buckets where id = 'knowledge-files';

-- 1. 버킷 생성 또는 갱신 (idempotent — 재배포 안전).
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'knowledge-files',
  'knowledge-files',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/x-markdown'
  ]
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. RLS 정책 4개. drop if exists → create 패턴으로 재배포 안전.

-- INSERT — 본인 봇 경로로만 업로드.
drop policy if exists knowledge_files_insert_owner on storage.objects;
create policy knowledge_files_insert_owner
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'knowledge-files'
    and exists (
      select 1 from public.bots
      where bots.id::text = (storage.foldername(name))[1]
        and bots.owner_id = (select auth.uid())
    )
  );

-- SELECT — 본인 봇 파일만 읽기 (signed URL 생성 시 권한 체크).
drop policy if exists knowledge_files_select_owner on storage.objects;
create policy knowledge_files_select_owner
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'knowledge-files'
    and exists (
      select 1 from public.bots
      where bots.id::text = (storage.foldername(name))[1]
        and bots.owner_id = (select auth.uid())
    )
  );

-- UPDATE — 동일 경로 덮어쓰기 (같은 파일명 재업로드).
drop policy if exists knowledge_files_update_owner on storage.objects;
create policy knowledge_files_update_owner
  on storage.objects
  for update to authenticated
  using (
    bucket_id = 'knowledge-files'
    and exists (
      select 1 from public.bots
      where bots.id::text = (storage.foldername(name))[1]
        and bots.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'knowledge-files'
    and exists (
      select 1 from public.bots
      where bots.id::text = (storage.foldername(name))[1]
        and bots.owner_id = (select auth.uid())
    )
  );

-- DELETE — 파일 삭제 (Phase 2 UI 에서 호출).
drop policy if exists knowledge_files_delete_owner on storage.objects;
create policy knowledge_files_delete_owner
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'knowledge-files'
    and exists (
      select 1 from public.bots
      where bots.id::text = (storage.foldername(name))[1]
        and bots.owner_id = (select auth.uid())
    )
  );

comment on policy knowledge_files_insert_owner on storage.objects is
  'Task 1-7-c: knowledge-files 버킷에 업로드 시 경로 첫 세그먼트(bot_id) 로 소유권 검증.';
