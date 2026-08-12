import "server-only";

/**
 * 리포지토리 팩토리 — 앱 코드가 구현체를 고르는 유일한 지점.
 *
 * env가 갖춰지면 Supabase, 아니면 인메모리로 떨어진다.
 * MariaDB 이관 시에는 `createMariaDbTodoRepository`를 만들고 여기 분기 한 줄만 추가한다.
 */
import { SEED_TODOS } from "../seed/todos";
import { createMemoryTodoRepository } from "./memory-todo-repository";
import { createSupabaseTodoRepository } from "./supabase-todo-repository";
import type { TodoRepository } from "./todo-repository";

export type DataSource = "supabase" | "memory";

// dev의 HMR에서 인메모리 데이터가 매 요청 초기화되지 않도록 전역에 고정한다.
const globalForRepo = globalThis as typeof globalThis & {
  __todoRepository?: TodoRepository;
};

function readSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  // 서버 전용 코드이므로 service role 키가 있으면 우선 사용한다.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
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
    : createMemoryTodoRepository(SEED_TODOS);

  globalForRepo.__todoRepository = repository;
  return repository;
}

export * from "./todo-repository";
