-- Migration: 0002_rename_bot_id_to_slug
-- Purpose:   bots.bot_id → bots.slug. conversations/messages가 bots.id(uuid)를
--            "bot_id"로 참조할 때 이름 충돌을 제거하기 위한 사전 리네임.
-- Scope:     Epic 0-B 초기 단계, 데이터 0건 시점의 저비용 리팩토링.
-- Note:      PostgreSQL 12+ 는 check 표현식 내 컬럼 참조를 자동 업데이트하므로
--            별도 check 재작성 불필요. unique/check constraint 자동명은 그대로 유지
--            (기능 동등 — 이름은 관례대로 `bots_bot_id_key`/`_check` 이지만 참조는 slug).
--
-- 롤백 SQL:
--   alter table public.bots rename column slug to bot_id;
--   comment on column public.bots.bot_id is '외부 노출 slug (URL/위젯 설치 식별자). Config.botId와 동일.';

alter table public.bots rename column bot_id to slug;

comment on column public.bots.slug is '외부 노출 slug (URL/위젯 설치 식별자). Config.botId와 동일.';
