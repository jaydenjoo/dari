# Storage Orphan Cleanup 운영 가이드

> **Task β-3b**: `knowledge-files` 버킷의 orphan 파일을 식별 + 정리하는 standalone 스크립트.
>
> **위치**: `scripts/cleanup-orphan-storage.ts` (entry) / `src/core/knowledge/orphan-cleanup.ts` (순수 분류 로직).

## 목적

봇이 업로드한 파일 중 다음 4가지 경로로 발생하는 **orphan** (config 미참조 파일) 을 정리:

1. `ingest-file.ts` 의 RPC 실패 + Storage 롤백 실패 (best-effort)
2. `remove-source.ts` 가 chunks 삭제 후 Storage 삭제 실패 (best-effort)
3. `trash/actions.ts` 의 permanent delete 시 Storage 삭제 실패
4. **Legacy 데이터** (1-7-c 초기 저장본 — `storagePaths` 없음, 보수적 보존)

## 분류 정책

| 파일 상태                                       | 처리                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| config 에서 참조됨                              | ✅ 정상 (skip)                                 |
| 미참조 + 24h 미만                               | 🛡️ 보존 (`recent_ttl`) — 신규 업로드 race 보호 |
| 미참조 + 24h 이상 + 활성 봇                     | 🗑️ **orphan**                                  |
| 미참조 + 활성 봇 + 봇이 legacy file source      | 🛡️ 보존 (`untracked_bot`)                      |
| 미참조 + soft-deleted 봇 30d 이내               | 🛡️ 보존 (`soft_deleted_bot_within_retention`)  |
| 미참조 + soft-deleted 봇 30d 경과 (legacy 아님) | 🗑️ **orphan**                                  |
| 미참조 + soft-deleted 봇 30d 경과 + legacy 봇   | 🛡️ 보존 (`untracked_bot` — 분류 순서 적용)     |
| 봇 자체가 없음 (폴더만 존재)                    | 🛡️ 보존 (`bot_not_found`, 수동 검토 대상)      |

> **분류 우선순위** (위→아래): `bot_not_found` → `soft_deleted_bot_within_retention` → `untracked_bot` → `referenced` → `recent_ttl` → `unreferenced(orphan)`. legacy 봇은 retention 초과 후에도 `untracked_bot` 로 영구 보존.

## 실행 (3가지 모드)

### 1. Dry-run (분석만, 안전 default)

```bash
pnpm cleanup:orphan-storage
```

- Storage 변경 없음
- 모든 봇의 폴더 list + 분류 + 표 출력
- orphan 후보가 있으면 갯수 + 마스킹된 경로 표시

### 2. 실제 삭제 (이중 게이트)

```bash
# 권장 — 명령 앞에 스페이스 prefix → bash history 회피 (sec M-2)
 CONFIRM_DELETE=yes pnpm cleanup:orphan-storage:apply 2>&1 | tee "cleanup-$(date +%Y%m%d-%H%M%S).log"
```

`--apply` flag + `CONFIRM_DELETE=yes` 환경변수 **둘 다** 필요. 한쪽만 있으면 즉시 abort.

**운영 권장 사항** (sec M-2 / M-4):

- 명령 앞 **스페이스 prefix** 로 bash history 회피 (zsh `HIST_IGNORE_SPACE` / bash `HISTCONTROL=ignorespace` 설정 시)
- `tee cleanup-YYYYMMDD-HHMMSS.log` 로 stdout 보존 → audit trail 대용 (Phase 3 `audit_logs` 통합 전까지)
- 실행 후 로그 파일을 **봇 운영 보안 폴더 (PROGRESS 외 위치)** 로 이동/보관

### 3. 옵션 지정

```bash
# 특정 봇만 검사
pnpm cleanup:orphan-storage -- --bot=<bot-uuid>

# TTL 변경 (default 24h)
pnpm cleanup:orphan-storage -- --ttl-hours=48

# Soft-deleted 봇 보존 기간 변경 (default 30d)
pnpm cleanup:orphan-storage -- --retention-days=60

# 도움말
pnpm cleanup:orphan-storage -- --help
```

> 💡 `pnpm` 은 첫 `--` 이후 인자를 스크립트로 그대로 전달.

## 권한 / 환경변수

`.env.local` 에 다음 키가 있어야 합니다 (앱 운영용 키 그대로 사용 가능):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — **RLS bypass** 필요 (cross-bot 감사)

⚠️ **service_role 키는 모든 RLS 를 우회**합니다. 다음을 항상 지키세요:

- prod `.env.local` 은 절대 commit/push 하지 않음 (`.gitignore` 확인)
- dry-run 으로 먼저 확인 → orphan 갯수가 예상과 다르면 (예: 갑자기 100개) **즉시 중단**하고 원인 파악
- `--bot=<id>` 로 단일 봇 테스트 → 결과 확인 후 전체 적용

## 출력 예시

```
🔍 Storage Orphan Cleanup
   모드: DRY-RUN (분석만)
   TTL: 24h / Retention: 30d

[1/3] bots 조회…
   ✓ 5개 봇
[2/3] Storage list 수집…
   ✓ 12개 파일
[3/3] 분류…

─── 분류 결과 ───
총 파일:                 12
참조됨 (정상):           10
Orphan (삭제 후보):      1
보존 (recent_ttl):       1
보존 (휴지통, retention 내): 0
보존 (legacy 봇):        0
보존 (봇 없음):          0

─── Orphan 목록 ───
  abc12345…/def67890….pdf  age=72h  bot=chatsio

ℹ️  Dry-run 종료. 삭제하려면:
   CONFIRM_DELETE=yes pnpm cleanup:orphan-storage:apply
```

## 운영 권장 주기

- **개발 환경**: 필요 시 (예: ingest 테스트 후 정리)
- **prod**: **월 1회 dry-run** → orphan 누적 추세 모니터링 → 임계 (예: 100개+) 도달 시 apply
- **Phase 3 자동화 후보**: GitHub Actions cron (`docs/security-monitoring.md` 패턴 참고)

## 운영자 주의사항 (sec M-3 / M-5)

### 30d 경계 봇 수동 확인 (sec M-3)

`deletedAt` 가 정확히 retention(30d) 경계인 봇은 dry-run 시점에 `soft_deleted_within_retention` 보존 → apply 시점 1~수초 후 30d 초과 → `unreferenced` orphan 분류 → 삭제 가능. 매우 낮은 확률이나 실 데이터 손실 위험.

**대응**: dry-run 결과에서 `보존 (휴지통, retention 내)` 카운트가 양수일 때, 해당 봇을 SQL 로 확인:

```sql
select id, slug, deleted_at, now() - deleted_at as age
  from bots
  where deleted_at is not null
    and now() - deleted_at > interval '29 days'
    and now() - deleted_at < interval '31 days';
```

해당 결과가 있으면 `--retention-days=35` 등으로 여유 두고 실행하거나 봇별 별도 처리.

### Legacy 봇 (storagePaths 미기록) 마이그레이션 (sec M-5)

`hasUntrackedFileSource: true` 인 봇은 영구 보존 → orphan 누적 지속. 실 운영에서 의도된 보수적 동작이지만 정기적 점검 필요:

```sql
-- legacy 봇 (file source 가 있으나 storagePaths 미기록) 식별
select id, slug
  from bots,
       jsonb_array_elements(config->'knowledge'->'sources') as src
  where src->>'type' = 'file'
    and (src->'storagePaths' is null or jsonb_array_length(src->'storagePaths') = 0);
```

발견 시 옵션:

1. 봇 owner 에게 재업로드 요청 (가장 안전 — 신규 storagePaths 자동 생성)
2. 수동 마이그레이션 스크립트 (Phase 3 — Storage 파일 ↔ files[] 매칭 후 storagePaths 채움)
3. 영구 보존 수용 (Storage 비용 누적은 미미)

## 안전 장치 요약

| 장치                                         | 효과                                      |
| -------------------------------------------- | ----------------------------------------- |
| Default dry-run                              | 실수로 `apply` 누락 시 안전               |
| `--apply` + `CONFIRM_DELETE=yes` 이중 게이트 | 한쪽만 있으면 abort, 의도 명확            |
| TTL 24h                                      | 신규 업로드 race window 보호              |
| 30d retention                                | 휴지통 봇 파일 보존 (B-3 정합)            |
| Legacy 봇 전체 보존                          | storagePaths 미기록 봇은 무차별 삭제 차단 |
| `bot_not_found` 보존                         | 알 수 없는 폴더는 수동 검토 강제          |
| 50개 batch + per-batch 실패 격리             | 대량 실패가 전체 중단으로 이어지지 않음   |

## 관련 문서

- 보안 모니터링 (월 1회 가이드): [`docs/security-monitoring.md`](../security-monitoring.md)
- B-3 휴지통 정책: PROGRESS.md "Task B-3" 세션 + ADR-009 §retention
- Storage RLS: `supabase/migrations/0010_create_knowledge_files_storage.sql`
- Sensitive fields (storagePath redact): `src/core/observability/sensitiveFields.ts`

## Backlog (Phase 3)

- [ ] GitHub Actions cron (월 1회 dry-run + 결과 알림 — security-monitoring 패턴)
- [ ] `audit_logs` 통합 (`STORAGE_ORPHAN_CLEANUP` 신규 이벤트)
- [ ] Storage RLS 에 `deleted_at IS NULL` 조건 추가 (retention cron 과 동반)
- [ ] 대량 봇 (1000+) 시 polling/streaming 출력 (현재는 메모리 누적 후 1회 출력)
