-- Migration: 0001_create_bots_table
-- Purpose:   Dari 봇 정체성 저장 테이블 생성. 각 봇의 Config(jsonb) + 메타데이터.
-- Scope:     Epic 0-B (DB 기반). RLS는 enable만 하고 정책은 Epic 0-D(Auth) 후 0002에서 추가.
--
-- 롤백 SQL:
--   drop trigger if exists trg_bots_set_updated_at on public.bots;
--   drop function if exists public.set_updated_at();
--   drop table if exists public.bots cascade;

-- ─── 1. bots 테이블 ───
create table public.bots (
  -- 내부 FK용 uuid (성능/고유성).
  id uuid primary key default gen_random_uuid(),

  -- 외부 노출 slug (URL, 위젯 설치 식별자). Config.botId와 일치.
  -- 패턴: 소문자/숫자/하이픈 3~64자, 첫/끝 영숫자.
  bot_id text not null unique
    check (bot_id ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),

  -- 소유자 (Epic 0-D Auth 완료 후 실제 user로 채워짐). 현재 NULL 허용.
  owner_id uuid references auth.users(id) on delete cascade,

  -- 봇 이름 (목록/검색용 — Config.identity.name 미러).
  name text not null check (char_length(name) between 1 and 50),

  -- 전체 DariConfig JSON. 앱 레벨(Zod)에서 구조 검증.
  config jsonb not null,

  -- Config 스키마 버전 (src/core/config/migrations.ts 로 업그레이드 트래킹).
  config_version text not null default '1.0',

  -- 봇 상태 (소프트 삭제 + 일시정지 지원).
  status text not null default 'active'
    check (status in ('active', 'paused', 'deleted')),

  -- 타임스탬프 (updated_at은 트리거로 자동 갱신).
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 2. 인덱스 ───
-- "내 봇 목록" 조회 최적화.
create index idx_bots_owner_id on public.bots (owner_id);

-- active 봇만 조회 최적화 (부분 인덱스 — deleted/paused는 인덱스 차지 안 함).
create index idx_bots_status_active on public.bots (status) where status = 'active';

-- ─── 3. updated_at 자동 갱신 트리거 ───
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_bots_set_updated_at
  before update on public.bots
  for each row
  execute function public.set_updated_at();

-- ─── 4. RLS 활성화 ───
-- 정책 없음 = 기본 전원 거부 (service_role만 우회 가능).
-- 실제 정책은 Epic 0-D(Auth) 완료 후 migration 0002에서 추가:
--   - SELECT: owner_id = auth.uid() OR 공개 위젯 라우트용 화이트리스트
--   - INSERT/UPDATE/DELETE: owner_id = auth.uid()
alter table public.bots enable row level security;

-- ─── 5. 코멘트 (Supabase Dashboard 탐색용) ───
comment on table public.bots is 'Dari 봇 정체성. 각 봇의 Config JSON + 메타데이터 저장.';
comment on column public.bots.bot_id is '외부 노출 slug (URL/위젯 설치 식별자). Config.botId와 동일.';
comment on column public.bots.owner_id is '소유자 (auth.users). Epic 0-D 이후 활성화. 현재 nullable.';
comment on column public.bots.config is 'DariConfig v1.0 JSON. 앱 레벨 Zod 스키마로 검증.';
comment on column public.bots.config_version is 'Config 스키마 버전 (src/core/config/migrations.ts).';
comment on column public.bots.status is 'active | paused | deleted (소프트 삭제).';
