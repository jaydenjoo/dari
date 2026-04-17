-- Migration: 0005_create_knowledge_chunks
-- Purpose:   RAG 용 벡터 청크 저장 + pgvector 유사도 검색 RPC.
--            Gemini text-embedding-004 (768-dim) + ivfflat cosine 인덱스.
-- Scope:     Epic 0-B 마지막 (4/4 테이블 완성).
--
-- 주요 결정:
--   - 임베딩 제공자: Gemini text-embedding-004 (768차원). 키 보유 + 무료 tier + 한국어 양호.
--   - 인덱스: ivfflat (lists=100, cosine). 데이터 <= 100K 적합. 이후 hnsw 로 REINDEX 가능.
--   - 청킹 전략(앱 레벨): 고정 500 토큰 + 오버랩 50. 재처리 가능 작업.
--   - source 분리: knowledge_sources 별도 테이블 없음 (YAGNI).
--     source_type + source_identifier 컬럼으로 원본 그룹핑. 재크롤링 시 DELETE→재삽입 기준.
--   - RLS: enable 만. 정책은 Epic 0-D Auth 이후 0006 에서.
--   - RPC: security invoker + search_path='' — 호출자 권한 + 스키마 하이재킹 방지.
--
-- 롤백 SQL:
--   drop function if exists public.match_knowledge_chunks(uuid, extensions.vector, int, float);
--   drop trigger if exists trg_knowledge_chunks_set_updated_at on public.knowledge_chunks;
--   drop table if exists public.knowledge_chunks cascade;

-- pgvector 재확인 (0001_enable_pgvector 에서 이미 설치).
create extension if not exists vector with schema extensions;

-- ─── 1. knowledge_chunks 테이블 ───
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),

  -- 소속 봇. 봇 삭제 시 청크 전체 삭제.
  bot_id uuid not null references public.bots(id) on delete cascade,

  -- 원본 문서 종류.
  source_type text not null default 'manual'
    check (source_type in ('url', 'pdf', 'manual', 'markdown')),

  -- 원본 식별자 (URL/파일명/문서ID 등). 재크롤링 시 이 단위로 DELETE→재삽입.
  source_identifier text not null
    check (char_length(source_identifier) between 1 and 500),

  -- 청크 본문. 500 토큰 ≈ 한글 700자, 10KB 상한은 방어적.
  content text not null
    check (char_length(content) > 0 and char_length(content) <= 10000),

  -- 같은 source_identifier 내 청크 순번 (0부터).
  chunk_index int not null default 0 check (chunk_index >= 0),

  -- Gemini text-embedding-004: 768차원.
  embedding extensions.vector(768) not null,

  -- 청킹 검증/비용 추적용 (null 허용).
  tokens int check (tokens is null or tokens > 0),

  -- title, url, page_number, author, chunked_at 등 자유 메타.
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 유일성: 같은 봇 내 동일 원본의 동일 순번은 1개만.
  unique (bot_id, source_identifier, chunk_index)
);

-- ─── 2. 인덱스 ───
-- 봇별 청크 조회 (RAG 기본 흐름).
create index idx_knowledge_chunks_bot_id
  on public.knowledge_chunks (bot_id);

-- source 단위 재인덱싱 (같은 URL 재크롤링 시 기존 청크 일괄 DELETE).
create index idx_knowledge_chunks_source
  on public.knowledge_chunks (bot_id, source_identifier);

-- 벡터 유사도 인덱스: ivfflat + cosine.
-- lists=100 은 데이터 10K~100K 에 적합. 100K+ 도달 시 아래로 전환:
--   drop index idx_knowledge_chunks_embedding;
--   create index idx_knowledge_chunks_embedding on public.knowledge_chunks
--     using hnsw (embedding extensions.vector_cosine_ops);
create index idx_knowledge_chunks_embedding
  on public.knowledge_chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

-- ─── 3. updated_at 자동 갱신 트리거 (기존 함수 재사용) ───
create trigger trg_knowledge_chunks_set_updated_at
  before update on public.knowledge_chunks
  for each row
  execute function public.set_updated_at();

-- ─── 4. RLS 활성화 ───
-- 정책 없음 = 기본 전원 거부. service_role 만 우회 가능.
-- 실제 정책은 Epic 0-D(Auth) 이후 0006 마이그레이션에서 추가.
alter table public.knowledge_chunks enable row level security;

-- ─── 5. 코멘트 ───
comment on table public.knowledge_chunks is
  'RAG 청크 저장. 봇별 지식 베이스. pgvector cosine 유사도 검색.';
comment on column public.knowledge_chunks.bot_id is
  '소속 봇 (bots.id uuid FK). 봇 삭제 시 cascade.';
comment on column public.knowledge_chunks.source_type is
  'url | pdf | manual | markdown.';
comment on column public.knowledge_chunks.source_identifier is
  '원본 식별자. 재크롤링 시 이 단위로 DELETE → 재삽입.';
comment on column public.knowledge_chunks.chunk_index is
  '같은 source_identifier 내 청크 순번 (0-base).';
comment on column public.knowledge_chunks.embedding is
  'Gemini text-embedding-004 임베딩 (768차원).';
comment on column public.knowledge_chunks.tokens is
  '청크 토큰 수 (청킹/비용 검증용, nullable).';

-- ─── 6. 유사도 검색 RPC ───
-- 호출 예 (앱 레벨 supabase-js):
--   const { data } = await supabase.rpc('match_knowledge_chunks', {
--     p_bot_id: botId, p_query_embedding: queryVec,
--     p_match_count: 5, p_min_score: 0.7,
--   })
create or replace function public.match_knowledge_chunks(
  p_bot_id uuid,
  p_query_embedding extensions.vector(768),
  p_match_count int default 5,
  p_min_score float default 0.0
)
returns table (
  id uuid,
  content text,
  score float,
  source_type text,
  source_identifier text,
  chunk_index int,
  metadata jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    kc.id,
    kc.content,
    1 - (kc.embedding operator(extensions.<=>) p_query_embedding) as score,
    kc.source_type,
    kc.source_identifier,
    kc.chunk_index,
    kc.metadata
  from public.knowledge_chunks kc
  where kc.bot_id = p_bot_id
    and (1 - (kc.embedding operator(extensions.<=>) p_query_embedding)) >= p_min_score
  order by kc.embedding operator(extensions.<=>) p_query_embedding
  limit p_match_count;
$$;

comment on function public.match_knowledge_chunks is
  'RAG 벡터 유사도 검색. 봇별 필터 + cosine similarity. '
  'score = 1 - cosine_distance (1.0 = 완벽 일치). '
  'security invoker 로 호출자 권한 적용 — RLS 정책이 추가되면 자동 반영.';
