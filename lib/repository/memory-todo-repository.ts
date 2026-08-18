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
  sortByNewest,
  toCurrentState,
  type TodoUpdate,
  type TodoUpdateInput,
} from "../domain/todo-update";
import {
  TodoNotFoundError,
  type TodoOptions,
  type TodoRepository,
} from "./todo-repository";

export function createMemoryTodoRepository(
  seed: Todo[] = [],
  seedUpdates: TodoUpdate[] = [],
): TodoRepository {
  // 방어적 복사 — 호출자가 넘긴 배열(SEED_TODOS)이 변형되지 않게 한다.
  let store: Todo[] = seed.map((t) => ({ ...t }));
  let updates: TodoUpdate[] = seedUpdates.map((u) => ({ ...u }));
  let sequence = 0;

  const nextId = () => `todo-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`;

  /** 남아있는 최신 이력을 부모 To-do의 현재 상태로 반영한다. */
  const syncCurrentState = (todoId: string) => {
    const current = toCurrentState(updates.filter((u) => u.todoId === todoId));
    if (!current) return;
    store = store.map((t) =>
      t.id === todoId ? { ...t, ...current, updatedAt: new Date().toISOString() } : t,
    );
  };

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
      // DB의 ON DELETE CASCADE와 같은 동작을 맞춘다.
      updates = updates.filter((u) => u.todoId !== id);
    },

    async listUpdates(todoId: string): Promise<TodoUpdate[]> {
      return sortByNewest(updates.filter((u) => u.todoId === todoId)).map((u) => ({ ...u }));
    },

    async countUpdates(todoIds: string[]): Promise<Record<string, number>> {
      const wanted = new Set(todoIds);
      const counts: Record<string, number> = {};
      for (const id of todoIds) counts[id] = 0;
      for (const u of updates) {
        if (wanted.has(u.todoId)) counts[u.todoId] += 1;
      }
      return counts;
    },

    async addUpdate(todoId: string, input: TodoUpdateInput): Promise<TodoUpdate> {
      if (!store.some((t) => t.id === todoId)) throw new TodoNotFoundError(todoId);

      const update: TodoUpdate = {
        id: `upd-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
        todoId,
        note: input.note,
        signal: input.signal,
        author: input.author ?? null,
        createdAt: new Date().toISOString(),
      };
      updates = [...updates, update];
      syncCurrentState(todoId);
      return { ...update };
    },

    async recordRemind(entry) {
      // 인메모리에는 발송 이력 테이블이 없다. 상태만 반영한다.
      store = store.map((t) =>
        t.id === entry.todoId
          ? { ...t, remindStatus: entry.status === "sent" ? "sent" : "wait" }
          : t,
      );
    },

    async removeUpdate(updateId: string): Promise<void> {
      const target = updates.find((u) => u.id === updateId);
      if (!target) throw new TodoNotFoundError(updateId);
      updates = updates.filter((u) => u.id !== updateId);
      syncCurrentState(target.todoId);
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
