import "server-only";

/**
 * 스토리지 팩토리 — 앱 코드가 구현체를 고르는 유일한 지점.
 * 리포지토리·메일러 팩토리와 같은 형태를 유지한다.
 */
import { createSupabaseStorage } from "./supabase-storage";
import type { FileStorage } from "./storage";

/**
 * 리포지토리와 같은 규칙으로 env를 읽는다.
 *
 * 접두사 없는 이름을 우선하는 이유도 같다 — NEXT_PUBLIC_*는 빌드 시점에
 * 번들에 박혀 컨테이너 환경변수를 바꿔도 반영되지 않는다.
 * 업로드·삭제는 쓰기 권한이 필요하므로 service role 키가 있으면 그것을 쓴다.
 */
function readEnv(): { url: string; key: string } | null {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** 설정이 없으면 null — 호출자가 "첨부 불가"로 안내한다. */
export function getFileStorage(): FileStorage | null {
  const env = readEnv();
  return env ? createSupabaseStorage(env.url, env.key) : null;
}

/** 화면에서 "첨부 가능 여부"를 안내할 때 쓴다 */
export function isStorageConfigured(): boolean {
  return readEnv() !== null;
}

export * from "./storage";
