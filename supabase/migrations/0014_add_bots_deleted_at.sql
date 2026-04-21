-- Migration: 0014_add_bots_deleted_at
-- Purpose:   Epic B Task B-3 — bots soft delete 도입.
--            DELETE → UPDATE deleted_at = now() 로 전환. 복구 = UPDATE deleted_at = NULL.
--            30일 후 영구 purge 는 Phase 2 retention cron 에서 처리.
--
-- Scope:     Epic B Task B-3 (봇만). conversations soft delete 는 B-3-후속 이월.
--
-- 주요 결정:
--   - **RLS 정책 변경 없음**: 기존 `bots_select_owner` 등 4 정책이 `owner_id = auth.uid()` 만
--     검증. Phase 0-D-2 설계 결정 "소프트 삭제 봇도 owner 접근 허용" 과 정합 —
--     `deleted_at IS NULL` 필터는 **앱 레이어** 에서만 적용 (일반 경로 숨김, 휴지통 경로 노출).
--   - **부분 인덱스 `bots_active_idx`**: 활성 봇 조회가 압도적으로 빈번. WHERE 절 부분
--     인덱스 → 휴지통 row 제외, 인덱스 크기 최소. 정렬 키로 `updated_at DESC` 포함해 대시보드
--     "최근 수정" 정렬 바로 활용.
--   - `status='deleted'` 값은 **deprecated** — 본 마이그레이션 이후 쓰지 않음. 현재 prod
--     `status='deleted'` row 0건 확인 → backfill 불필요. 코드에서 status='deleted' 사용
--     지점은 Task B-3 작업 중 전부 제거.
--   - 컬럼은 nullable. DEFAULT 없음 (insert 시 null → 활성).
--
-- 롤백 SQL (역순):
--   drop index if exists public.bots_active_idx;
--   alter table public.bots drop column if exists deleted_at;

-- ─── 1. 컬럼 추가 ───
alter table public.bots
  add column deleted_at timestamptz null;

comment on column public.bots.deleted_at is
  'Epic B Task B-3: soft delete 마커. NULL=활성, NOT NULL=휴지통. 30일 후 permanent purge 대상 (Phase 2 retention cron).';

-- ─── 2. 부분 인덱스 (활성 봇 빠른 조회) ───
-- 대시보드 `SELECT ... WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`
-- 쿼리에 최적화. 휴지통 row 는 인덱스에서 제외되어 크기·통계 정확성 향상.
create index bots_active_idx
  on public.bots (owner_id, updated_at desc)
  where deleted_at is null;

comment on index public.bots_active_idx is
  'Task B-3: 활성 봇 대시보드 조회 최적화. soft-deleted row 자동 제외.';
