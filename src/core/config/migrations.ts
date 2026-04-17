import { dariConfigSchema, type DariConfig } from "./schema";

/**
 * Config 버전 마이그레이션
 *
 * 미래에 스키마가 변경되면, 이전 버전 Config를 최신 스키마로 변환한다.
 * 예: v1.0 → v2.0 변경 시 `migrateV1ToV2` 함수를 추가.
 *
 * 사용:
 *   import { migrateAndValidate } from "@/core/config";
 *   const config = migrateAndValidate(rawJson);
 */

type AnyConfig = Record<string, unknown>;

/**
 * 버전별 마이그레이션 함수 체인
 *
 * 각 함수는 특정 버전의 Config를 받아 다음 버전으로 변환한다.
 * 현재는 1.0만 존재 → 체인 비어있음.
 */
const migrations: Record<string, (c: AnyConfig) => AnyConfig> = {
  // 예시 (미래): "1.0": (c) => migrateV1ToV2(c),
};

/**
 * 이전 버전 Config를 최신으로 올려 검증한다.
 *
 * @throws 지원하지 않는 버전 or 스키마 검증 실패
 */
export function migrateAndValidate(raw: unknown): DariConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Config must be a JSON object");
  }

  let current = raw as AnyConfig;
  const version = (current.version as string | undefined) ?? "1.0";

  // 순차적으로 최신 버전까지 마이그레이션
  let v = version;
  while (migrations[v]) {
    current = migrations[v](current);
    v = (current.version as string) ?? v;
  }

  // 최종 Zod 검증
  return dariConfigSchema.parse(current);
}
