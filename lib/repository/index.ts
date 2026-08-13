import "server-only";

/**
 * 리포지토리 팩토리 — 앱 코드가 구현체를 고르는 유일한 지점.
 *
 * env가 갖춰지면 Supabase, 아니면 인메모리로 떨어진다.
 * MariaDB 이관 시에는 `createMariaDbTodoRepository`를 만들고 여기 분기 한 줄만 추가한다.
 */
import { SEED_TODOS, SEED_TODO_UPDATES } from "../seed/todos";
import { createMemoryTodoRepository } from "./memory-todo-repository";
import { createSupabaseTodoRepository } from "./supabase-todo-repository";
import type { TodoRepository } from "./todo-repository";

export type DataSource = "supabase" | "memory";

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
  return readSupabaseEnv() ? "supabase" : "memory";
}

export function getTodoRepository(): TodoRepository {
  if (globalForRepo.__todoRepository) return globalForRepo.__todoRepository;

  const env = readSupabaseEnv();
  const repository = env
    ? createSupabaseTodoRepository(env.url, env.key)
    : createMemoryTodoRepository(SEED_TODOS, SEED_TODO_UPDATES);

  globalForRepo.__todoRepository = repository;
  return repository;
}

export * from "./todo-repository";
