import "server-only";

/**
 * 리포지토리 팩토리 — 앱 코드가 구현체를 고르는 유일한 지점.
 *
 * 고르는 순서: MariaDB → Supabase → 인메모리.
 *
 * MariaDB가 설정돼 있으면 그쪽을 쓴다. 둘 다 둬도 되므로 이관 중에 한쪽씩
 * 옮길 수 있고, 되돌릴 때는 MARIADB_HOST만 빼면 Supabase로 돌아온다.
 * 어느 것도 없으면 인메모리 — 로컬에서 DB 없이 화면을 볼 수 있게 한다.
 */
import { SEED_TODOS, SEED_TODO_UPDATES } from "../seed/todos";
import { createMariaDbTodoRepository, type MariaDbConfig } from "./mariadb-todo-repository";
import { createMemoryTodoRepository } from "./memory-todo-repository";
import { createSupabaseTodoRepository } from "./supabase-todo-repository";
import type { TodoRepository } from "./todo-repository";

export type DataSource = "mariadb" | "supabase" | "memory";

// dev의 HMR에서 인메모리 데이터가 매 요청 초기화되지 않도록 전역에 고정한다.
const globalForRepo = globalThis as typeof globalThis & {
  __todoRepository?: TodoRepository;
};

/**
 * 접두사 없는 이름을 우선한다.
 *
 * Next.js는 빌드 시점에 값이 존재하면 `NEXT_PUBLIC_*`를 번들에 리터럴로 박아버린다.
 * 그러면 컨테이너 환경변수를 바꿔도 반영되지 않는 함정이 생긴다(스테이징/운영 분리,
 * 프로젝트 교체 시 특히 위험). 이 앱은 Supabase를 서버에서만 쓰므로 접두사가 필요 없고,
 * 떼면 항상 런타임에 읽는다.
 *
 * `NEXT_PUBLIC_*`도 계속 받아들인다 — 기존 .env.local을 깨지 않기 위함이다.
 */
/**
 * MariaDB 설정.
 *
 * 비밀번호는 ECS 태스크 정의에서 Secrets Manager로 주입한다 —
 * 이미지에는 굽지 않는다. 여기서는 환경변수로 읽기만 한다.
 */
function readMariaDbEnv(): MariaDbConfig | null {
  const host = process.env.MARIADB_HOST?.trim();
  const user = process.env.MARIADB_USER?.trim();
  const password = process.env.MARIADB_PASSWORD;
  const database = process.env.MARIADB_DATABASE?.trim();
  if (!host || !user || password === undefined || !database) return null;

  const port = Number(process.env.MARIADB_PORT?.trim() || 3306);
  if (!Number.isFinite(port) || port <= 0) return null;

  const limit = Number(process.env.MARIADB_POOL_SIZE?.trim() || 10);

  return {
    host,
    port,
    user,
    password,
    database,
    // 사내 DB가 TLS를 요구하면 켠다. 기본은 끔 — VPC 안이면 불필요하다.
    ssl: process.env.MARIADB_SSL?.trim() === "true",
    connectionLimit: Number.isFinite(limit) && limit > 0 ? limit : 10,
  };
}

function readSupabaseEnv(): { url: string; key: string } | null {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  // 서버 전용 코드이므로 service role 키가 있으면 우선 사용한다.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return url && key ? { url, key } : null;
}

export function getDataSource(): DataSource {
  if (readMariaDbEnv()) return "mariadb";
  return readSupabaseEnv() ? "supabase" : "memory";
}

export function getTodoRepository(): TodoRepository {
  if (globalForRepo.__todoRepository) return globalForRepo.__todoRepository;

  const mariadb = readMariaDbEnv();
  const supabase = mariadb ? null : readSupabaseEnv();
  const repository = mariadb
    ? createMariaDbTodoRepository(mariadb)
    : supabase
      ? createSupabaseTodoRepository(supabase.url, supabase.key)
      : createMemoryTodoRepository(SEED_TODOS, SEED_TODO_UPDATES);

  globalForRepo.__todoRepository = repository;
  return repository;
}

export * from "./todo-repository";
