import "server-only";

/**
 * 스토리지 팩토리 — 앱 코드가 구현체를 고르는 유일한 지점.
 * 리포지토리·메일러 팩토리와 같은 형태를 유지한다.
 *
 * S3가 설정돼 있으면 S3, 아니면 Supabase Storage.
 * 둘 다 둬도 되며 S3가 이긴다 — 이관 중에 한쪽씩 옮길 수 있고,
 * 되돌릴 때는 S3_BUCKET만 빼면 Supabase로 돌아온다.
 */
import { createS3Storage, type S3Config } from "./s3-storage";
import { createSupabaseStorage } from "./supabase-storage";
import type { FileStorage } from "./storage";

/**
 * S3 설정.
 *
 * 자격증명은 읽지 않는다 — ECS 태스크 역할을 SDK가 알아서 집는다.
 * 버킷과 리전만 있으면 된다.
 */
function readS3Env(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim();
  if (!bucket || !region) return null;

  const endpoint = process.env.S3_ENDPOINT?.trim();
  return {
    bucket,
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  };
}

/**
 * 리포지토리와 같은 규칙으로 Supabase env를 읽는다.
 *
 * 접두사 없는 이름을 우선하는 이유도 같다 — NEXT_PUBLIC_*는 빌드 시점에
 * 번들에 박혀 컨테이너 환경변수를 바꿔도 반영되지 않는다.
 * 업로드·삭제는 쓰기 권한이 필요하므로 service role 키가 있으면 그것을 쓴다.
 */
function readSupabaseEnv(): { url: string; key: string } | null {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** 어느 스토리지가 쓰이는지 — 화면·헬스체크에서 확인용으로 쓴다. */
export type StorageKind = "s3" | "supabase" | "none";

export function getStorageKind(): StorageKind {
  if (readS3Env()) return "s3";
  if (readSupabaseEnv()) return "supabase";
  return "none";
}

/** 설정이 없으면 null — 호출자가 "첨부 불가"로 안내한다. */
export function getFileStorage(): FileStorage | null {
  const s3 = readS3Env();
  if (s3) return createS3Storage(s3);

  const supabase = readSupabaseEnv();
  return supabase ? createSupabaseStorage(supabase.url, supabase.key) : null;
}

/** 화면에서 "첨부 가능 여부"를 안내할 때 쓴다 */
export function isStorageConfigured(): boolean {
  return getStorageKind() !== "none";
}

export * from "./storage";
