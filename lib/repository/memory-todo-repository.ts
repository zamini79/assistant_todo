/**
 * 인메모리 어댑터.
 *
 * Supabase 크리덴셜 없이도 앱 전체가 동작하도록 하는 기본 구현이자,
 * 도메인 로직 테스트의 기준 구현이다. 프로세스 재시작 시 시드 상태로 돌아간다.
 */
import { aggregate as aggregateTodos } from "../domain/aggregate";
import {
  applyFilter,
  applySort,
  paginate,
  type Paged,
  type TodoFilter,
  type TodoQuery,
} from "../domain/query";
import type { Todo, TodoInput } from "../domain/todo";
import {
  TodoNotFoundError,
  type TodoOptions,
  type TodoRepository,
} from "./todo-repository";

export function createMemoryTodoRepository(seed: Todo[] = []): TodoRepository {
  // 방어적 복사 — 호출자가 넘긴 배열(SEED_TODOS)이 변형되지 않게 한다.
  let store: Todo[] = seed.map((t) => ({ ...t }));
  let sequence = 0;

  const nextId = () => `todo-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`;

  return {
    async list(query: TodoQuery): Promise<Paged<Todo>> {
      const filtered = applyFilter(store, query.filter);
      const sorted = applySort(filtered, query.sort);
      return {
        rows: paginate(sorted, query.page, query.pageSize).map((t) => ({ ...t })),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },

    async listAll(filter: TodoFilter = {}): Promise<Todo[]> {
      return applyFilter(store, filter).map((t) => ({ ...t }));
    },

    async findById(id: string): Promise<Todo | null> {
      const found = store.find((t) => t.id === id);
      return found ? { ...found } : null;
    },

    async create(input: TodoInput): Promise<Todo> {
      const now = new Date().toISOString();
      const todo: Todo = { ...input, id: nextId(), createdAt: now, updatedAt: now };
      store = [...store, todo];
      return { ...todo };
    },

    async update(id: string, input: TodoInput): Promise<Todo> {
      const index = store.findIndex((t) => t.id === id);
      if (index === -1) throw new TodoNotFoundError(id);

      const updated: Todo = {
        ...store[index],
        ...input,
        id,
        updatedAt: new Date().toISOString(),
      };
      store = store.map((t, i) => (i === index ? updated : t));
      return { ...updated };
    },

    async remove(id: string): Promise<void> {
      const next = store.filter((t) => t.id !== id);
      if (next.length === store.length) throw new TodoNotFoundError(id);
      store = next;
    },

    async aggregate(filter: TodoFilter = {}) {
      return aggregateTodos(applyFilter(store, filter));
    },

    async options(): Promise<TodoOptions> {
      return deriveOptions(store);
    },
  };
}

/**
 * 조직·이름·회의체 선택지를 현재 데이터에서 유도한다.
 * 인사시스템 연동 전까지는 이미 등록된 값이 곧 마스터 역할을 한다.
 */
export function deriveOptions(todos: Todo[]): TodoOptions {
  const meetingBodies = new Set<string>();
  const orgs = new Set<string>();
  const people = new Map<string, string>();

  for (const t of todos) {
    meetingBodies.add(t.meetingBody);
    orgs.add(t.org);
    people.set(t.assigneeName, t.org);
  }

  const ko = (a: string, b: string) => a.localeCompare(b, "ko");

  return {
    meetingBodies: [...meetingBodies].sort(ko),
    orgs: [...orgs].sort(ko),
    people: [...people.entries()]
      .map(([name, org]) => ({ name, org }))
      .sort((a, b) => ko(a.name, b.name)),
  };
}
