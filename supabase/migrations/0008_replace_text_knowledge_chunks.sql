-- Migration: 0008_replace_text_knowledge_chunks
-- Purpose:   Task 1-7-a — text 타입 지식 소스의 원자적 재임베딩 RPC.
--            봇당 "manual" 타입 청크 전체를 DELETE → INSERT 하는 1회 트랜잭션.
-- Scope:     Epic 1-7 (지식 업로드). Task 1-7-a (text 타입만).
--
-- 주요 결정:
--   - 왜 RPC 인가: supabase-js 에는 명시적 BEGIN/COMMIT API 가 없다. DELETE + INSERT
--     를 2 호출로 나누면 사이에 실패 시 orphan(삭제만 된 빈 상태) 이 남는다. RPC 는
--     plpgsql 단일 문장 → 트랜잭션 자동 보장 (autocommit off in function).
--   - `security invoker` + `search_path=''`: 0005 match_knowledge_chunks 와 동일.
--     호출자 컨텍스트 유지 → `knowledge_chunks_delete_owner` / `_insert_owner`
--     RLS 정책이 자동 적용. 함수 본체에서 RLS 우회 없음.
--   - jsonb 입력 선택 이유: TEXT[] + vector[] 병렬 배열보다 타입 안전. 각 청크가
--     content/chunk_index/tokens/embedding 4필드를 묶어서 전달 → 순서 오류 방지.
--   - source_identifier 고정값 'manual:inline': MVP 는 "단일 textarea" UI 한 덩어리
--     저장. 여러 text 항목은 Task 1-7-d 로 이월 (title 기반 식별자 승격).
--   - source_type 'manual' = 앱 DariConfig `KnowledgeSource.type = "text"` 의 DB 매핑.
--     (code-review H-1/M-1: 값 체계 분리. types.ts::KnowledgeSourceType 상단 주석 참조.)
--   - 빈 청크 배열 허용: content 를 비우고 저장 = text 지식 완전 제거. DELETE 만 수행.
--
-- 보안:
--   - `security invoker` 이므로 RLS 우회 불가. 타인 봇 bot_id 로 호출해도 DELETE 0 row
--     + INSERT 정책 거부로 차단.
--   - 추가 방어: 앱 레벨 Server Action 에서 `bots.owner_id = auth.uid()` 사전 확인
--     (fail-fast + 명확한 에러 메시지).
--
-- 롤백 SQL:
--   drop function if exists public.replace_text_knowledge_chunks(uuid, jsonb);

create or replace function public.replace_text_knowledge_chunks(
  p_bot_id uuid,
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
  if jsonb_typeof(p_chunks) != 'array' then
    raise exception 'p_chunks must be a jsonb array (got %)',
      jsonb_typeof(p_chunks) using errcode = '22023';
  end if;

  -- 2. 기존 text("manual") 청크 전체 삭제.
  --    RLS knowledge_chunks_delete_owner 자동 적용 → 타인 봇이면 0 row.
  delete from public.knowledge_chunks
  where bot_id = p_bot_id and source_type = 'manual';

  -- 3. 빈 배열이면 여기서 종료 (재임베딩 없이 "전체 삭제" 의도).
  if jsonb_array_length(p_chunks) = 0 then
    return 0;
  end if;

  -- 4. 원자 INSERT. RLS knowledge_chunks_insert_owner 자동 적용.
  --    embedding 은 number[] JSON → ::text → ::extensions.vector 캐스팅.
  insert into public.knowledge_chunks (
    bot_id, source_type, source_identifier,
    content, chunk_index, embedding, tokens, metadata
  )
  select
    p_bot_id,
    'manual',
    'manual:inline',
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

comment on function public.replace_text_knowledge_chunks is
  'Task 1-7-a: text 지식 소스 원자적 재임베딩. '
  '봇의 기존 manual 청크 전체 삭제 후 새 청크 INSERT. '
  'security invoker — RLS (knowledge_chunks_delete/insert_owner) 자동 적용. '
  '빈 배열 입력 허용 (= 전체 삭제).';
