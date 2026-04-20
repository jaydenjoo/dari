-- Migration: 0009_replace_knowledge_chunks_for_source
-- Purpose:   Task 1-7-b — 일반화된 (source_type, source_identifier) 단위 원자적 재임베딩 RPC.
--            0008 (text 전용, source_type='manual' 전체 갈이) 와 달리 특정 한 소스만
--            DELETE → INSERT. 1-7-b (url) / 1-7-c (file/pdf) / 1-7-d (multi-text) 재사용.
-- Scope:     Epic 1-7 (지식 업로드).
--
-- 주요 결정:
--   - 왜 별도 RPC 인가: 0008 은 "text 덩어리 교체" 의미라 source_identifier = 고정 ('manual:inline').
--     1-7-b 부터는 URL/파일 개별 단위 교체가 필요 → (source_type, source_identifier)
--     2-key 로 범위를 좁혀야 한다. 동일 함수로 처리하려면 0008 의 의미가 오염되므로 분리.
--   - `security invoker` + `search_path=''`: 0005/0008 와 동일. 호출자 컨텍스트 유지
--     → RLS (`knowledge_chunks_delete_owner` / `_insert_owner`) 자동 적용.
--     타인 봇 bot_id 로 호출해도 DELETE 0 row + INSERT 차단.
--   - jsonb 입력: 0008 과 동일 타입 안전 계약. content/chunk_index/tokens/embedding 4필드.
--   - source_type 값 제한: knowledge_chunks.source_type CHECK (0005) 가
--     ('url','pdf','manual','markdown') 로 강제. 함수는 INSERT 시점에 Postgres 가 자동 검증.
--     (함수 자체는 CHECK 재검증하지 않음 — 단일 출처 유지)
--   - 빈 배열 허용: p_chunks=[] = "해당 source 전체 삭제" 의도. DELETE 만 수행.
--
-- 보안:
--   - `security invoker` 이므로 RLS 우회 불가. bots.owner_id = auth.uid() 인 봇에 대해서만
--     knowledge_chunks 에 대한 DELETE/INSERT 권한 부여됨 (0006 RLS 정책).
--   - 앱 레벨: Server Action 에서 bot 소유권 사전 검증 후 호출 (fail-fast + 명확한 UX).
--
-- 롤백 SQL:
--   drop function if exists public.replace_knowledge_chunks_for_source(uuid, text, text, jsonb);

create or replace function public.replace_knowledge_chunks_for_source(
  p_bot_id uuid,
  p_source_type text,
  p_source_identifier text,
  p_chunks jsonb
)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted int := 0;
begin
  -- 1. 입력 검증.
  if p_bot_id is null then
    raise exception 'p_bot_id cannot be null' using errcode = '22004';
  end if;
  if p_source_type is null or length(p_source_type) = 0 then
    raise exception 'p_source_type cannot be null/empty' using errcode = '22004';
  end if;
  if p_source_identifier is null or length(p_source_identifier) = 0 then
    raise exception 'p_source_identifier cannot be null/empty' using errcode = '22004';
  end if;
  if jsonb_typeof(p_chunks) != 'array' then
    raise exception 'p_chunks must be a jsonb array (got %)',
      jsonb_typeof(p_chunks) using errcode = '22023';
  end if;

  -- 2. 지정 (source_type, source_identifier) 청크만 삭제.
  --    RLS knowledge_chunks_delete_owner 자동 적용 → 타인 봇이면 0 row.
  delete from public.knowledge_chunks
  where bot_id = p_bot_id
    and source_type = p_source_type
    and source_identifier = p_source_identifier;

  -- 3. 빈 배열이면 여기서 종료 (= 소스 완전 제거 의도).
  if jsonb_array_length(p_chunks) = 0 then
    return 0;
  end if;

  -- 4. 원자 INSERT. RLS knowledge_chunks_insert_owner 자동 적용.
  --    source_type CHECK 제약(0005)이 INSERT 시점에 p_source_type 값 유효성 강제.
  insert into public.knowledge_chunks (
    bot_id, source_type, source_identifier,
    content, chunk_index, embedding, tokens, metadata
  )
  select
    p_bot_id,
    p_source_type,
    p_source_identifier,
    c->>'content',
    (c->>'chunk_index')::int,
    (c->>'embedding')::extensions.vector(768),
    nullif(c->>'tokens', '')::int,
    coalesce(c->'metadata', '{}'::jsonb)
  from jsonb_array_elements(p_chunks) as c;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.replace_knowledge_chunks_for_source is
  'Task 1-7-b+: 일반화된 (source_type, source_identifier) 단위 원자적 재임베딩. '
  '지정 소스의 기존 청크 전체 삭제 후 새 청크 INSERT. '
  'security invoker — RLS (knowledge_chunks_delete/insert_owner) 자동 적용. '
  '빈 배열 입력 = 해당 소스 완전 제거. '
  '0008(manual 전체 갈이) 과 상호 배타: url/pdf/multi-text 는 이 함수 사용.';
