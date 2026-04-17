-- Migration: 0003_create_conversations_and_messages
-- Purpose:   대화 세션과 메시지 저장. bots.id(uuid) FK, ON DELETE CASCADE.
-- Scope:     Epic 0-B. RLS enable만 (정책은 Epic 0-D Auth 이후).
--
-- 롤백 SQL:
--   drop trigger if exists trg_messages_update_conversation on public.messages;
--   drop function if exists public.update_conversation_last_message();
--   drop trigger if exists trg_conversations_set_updated_at on public.conversations;
--   drop table if exists public.messages cascade;
--   drop table if exists public.conversations cascade;

-- ─── 1. conversations 테이블 ───
create table public.conversations (
  id uuid primary key default gen_random_uuid(),

  -- 참조 봇 (bots.id uuid FK). 봇 삭제 시 대화 전체 삭제.
  bot_id uuid not null references public.bots(id) on delete cascade,

  -- 익명 방문자 식별자 (쿠키/localStorage 저장 UUID 또는 해시).
  visitor_id text,

  -- 로그인 사용자 (Epic 0-D 이후 활성). 유저 삭제 시 NULL로.
  user_id uuid references auth.users(id) on delete set null,

  -- 이메일 수집 (Config.behavior.collectEmail 활성 시).
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- 대화 상태.
  status text not null default 'active'
    check (status in ('active', 'closed', 'handed_off')),

  -- 종료 시각 (status = closed/handed_off일 때).
  ended_at timestamptz,

  -- 마지막 메시지 시각 — messages 트리거가 자동 갱신.
  last_message_at timestamptz not null default now(),

  -- 방문자 메타 (User-Agent, Referrer, 언어, 초기 URL 등).
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 정체성 필수 — visitor_id와 user_id 둘 다 NULL은 불허.
  constraint conversations_has_identity
    check (visitor_id is not null or user_id is not null)
);

-- ─── 2. conversations 인덱스 ───
create index idx_conversations_bot_id on public.conversations (bot_id);
create index idx_conversations_visitor_id on public.conversations (visitor_id)
  where visitor_id is not null;
create index idx_conversations_user_id on public.conversations (user_id)
  where user_id is not null;
create index idx_conversations_status_active on public.conversations (status)
  where status = 'active';
create index idx_conversations_last_message_at
  on public.conversations (last_message_at desc);

-- ─── 3. conversations updated_at 트리거 (기존 set_updated_at 재사용) ───
create trigger trg_conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

alter table public.conversations enable row level security;

comment on table public.conversations is
  '대화 세션. 방문자/유저가 봇과 나눈 대화의 컨테이너.';
comment on column public.conversations.bot_id is
  '참조 봇의 bots.id (uuid FK). slug 아님.';
comment on column public.conversations.visitor_id is
  '익명 방문자 식별자 (쿠키/localStorage).';
comment on column public.conversations.status is
  'active | closed | handed_off.';
comment on column public.conversations.last_message_at is
  '타임아웃 감지 및 최근 대화 정렬용. messages INSERT 시 자동 갱신.';

-- ─── 4. messages 테이블 ───
create table public.messages (
  id uuid primary key default gen_random_uuid(),

  -- 부모 대화. 대화 삭제 시 메시지도 함께 삭제.
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,

  -- Claude API role과 일치.
  role text not null check (role in ('user', 'assistant', 'system')),

  -- 메시지 본문. 빈 문자열 금지, 100KB 상한 (방어적).
  content text not null
    check (char_length(content) > 0 and char_length(content) <= 100000),

  -- assistant 응답에 사용된 토큰 (비용 추적).
  tokens_used int check (tokens_used is null or tokens_used >= 0),

  -- RAG 출처 (assistant 응답에 한함).
  -- 예: [{"chunk_id": "uuid", "score": 0.87, "excerpt": "..."}]
  sources jsonb,

  -- 추가 메타 (model, latency_ms, finish_reason 등).
  metadata jsonb not null default '{}'::jsonb,

  -- 메시지는 immutable — updated_at 컬럼 없음.
  created_at timestamptz not null default now()
);

-- ─── 5. messages 인덱스 ───
create index idx_messages_conversation_id on public.messages (conversation_id);
create index idx_messages_created_at on public.messages (created_at);

-- ─── 6. messages → conversations.last_message_at 자동 갱신 트리거 ───
create or replace function public.update_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_messages_update_conversation
  after insert on public.messages
  for each row
  execute function public.update_conversation_last_message();

alter table public.messages enable row level security;

comment on table public.messages is
  '대화 메시지 (immutable). 사용자/AI/시스템의 발화 1건.';
comment on column public.messages.role is
  'Claude API role: user | assistant | system.';
comment on column public.messages.sources is
  'RAG 출처 배열 — [{chunk_id, score, excerpt}]. assistant 응답에 한함.';
comment on column public.messages.metadata is
  'model/latency_ms/finish_reason 등 추가 메타.';
