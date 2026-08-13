/**
 * Supabase 어댑터.
 *
 * ⚠️ 이 파일은 프로젝트에서 유일하게 `@supabase/supabase-js`를 import 하는 곳이다.
 * 앱 코드가 Supabase 타입을 직접 만지기 시작하면 MariaDB 이관 비용이 폭증하므로
 * 벤더 의존은 반드시 이 경계 안에 가둔다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { aggregate as aggregateTodos } from "../domain/aggregate";
import type { Paged, Sort, TodoFilter, TodoQuery } from "../domain/query";
import type { Attachment, Category, RemindStatus, Signal, Todo, TodoInput } from "../domain/todo";
import type { TodoUpdate, TodoUpdateInput } from "../domain/todo-update";
import { deriveOptions } from "./memory-todo-repository";
import {
  RepositoryError,
  TodoNotFoundError,
  type TodoOptions,
  type TodoRepository,
} from "./todo-repository";

const TABLE = "todos";
const UPDATES_TABLE = "todo_updates";

type TodoUpdateRow = {
  id: string;
  todo_id: string;
  note: string;
  progress_pct: number;
  signal: string;
  author: string | null;
  created_at: string;
};

function updateToDomain(row: TodoUpdateRow): TodoUpdate {
  return {
    id: row.id,
    todoId: row.todo_id,
    note: row.note,
    progressPct: row.progress_pct,
    signal: row.signal as Signal,
    author: row.author,
    createdAt: row.created_at,
  };
}

/** DB 행 형태 — README "To-do 필드 (DB 컬럼 후보)"를 그대로 따른다. */
type TodoRow = {
  id: string;
  instructed_at: string;
  due_date: string;
  meeting_body: string;
  org: string;
  assignee_name: string;
  category: string;
  detail: string;
  progress_note: string | null;
  progress_pct: number | null;
  signal: string;
  remind_status: string;
  attachment: Attachment | null;
  created_at: string;
  updated_at: string;
};

/** 정렬 키 → 컬럼명 */
const SORT_COLUMNS: Record<Sort["key"], keyof TodoRow> = {
  instructedAt: "instructed_at",
  dueDate: "due_date",
  meetingBody: "meeting_body",
  assigneeName: "assignee_name",
  category: "category",
};

function toDomain(row: TodoRow): Todo {
  return {
    id: row.id,
    instructedAt: row.instructed_at,
    dueDate: row.due_date,
    meetingBody: row.meeting_body,
    org: row.org,
    assigneeName: row.assignee_name,
    category: row.category as Category,
    detail: row.detail,
    progressNote: row.progress_note ?? "",
    progressPct: row.progress_pct ?? 0,
    signal: row.signal as Signal,
    remindStatus: row.remind_status as RemindStatus,
    attachment: row.attachment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(input: TodoInput) {
  return {
    instructed_at: input.instructedAt,
    due_date: input.dueDate,
    meeting_body: input.meetingBody,
    org: input.org,
    assignee_name: input.assigneeName,
    category: input.category,
    detail: input.detail,
    progress_note: input.progressNote,
    progress_pct: input.progressPct,
    signal: input.signal,
    remind_status: input.remindStatus,
    attachment: input.attachment,
  };
}

type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

function withFilter<T extends Query>(query: T, filter: TodoFilter): T {
  let q = query;
  if (filter.meetingBody) q = q.eq("meeting_body", filter.meetingBody) as T;
  if (filter.assigneeName) q = q.eq("assignee_name", filter.assigneeName) as T;
  if (filter.category) q = q.eq("category", filter.category) as T;
  if (filter.signal) q = q.eq("signal", filter.signal) as T;
  if (filter.from) q = q.gte("instructed_at", filter.from) as T;
  if (filter.to) q = q.lte("instructed_at", filter.to) as T;
  return q;
}

export function createSupabaseTodoRepository(
  url: string,
  key: string,
): TodoRepository {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function fetchAll(filter: TodoFilter): Promise<Todo[]> {
    const { data, error } = await withFilter(
      client.from(TABLE).select("*"),
      filter,
    ).order("due_date", { ascending: true });

    if (error) throw new RepositoryError("지시사항 목록을 불러오지 못했습니다.", { cause: error });
    return (data as TodoRow[]).map(toDomain);
  }

  return {
    async list(query: TodoQuery): Promise<Paged<Todo>> {
      const from = (query.page - 1) * query.pageSize;
      const to = from + query.pageSize - 1;

      // 한글 음절은 유니코드 코드포인트 순서가 곧 가나다순이므로
      // Postgres 기본 정렬로 localeCompare(…, "ko")와 동일한 결과가 나온다.
      const { data, error, count } = await withFilter(
        client.from(TABLE).select("*", { count: "exact" }),
        query.filter,
      )
        .order(SORT_COLUMNS[query.sort.key], { ascending: query.sort.dir === "asc" })
        // 동률 시 순서 고정 — 없으면 페이지 간 행이 중복/누락될 수 있다.
        .order("due_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw new RepositoryError("지시사항 목록을 불러오지 못했습니다.", { cause: error });

      return {
        rows: (data as TodoRow[]).map(toDomain),
        total: count ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    },

    listAll(filter: TodoFilter = {}) {
      return fetchAll(filter);
    },

    async findById(id: string): Promise<Todo | null> {
      const { data, error } = await client.from(TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw new RepositoryError("지시사항을 불러오지 못했습니다.", { cause: error });
      return data ? toDomain(data as TodoRow) : null;
    },

    async create(input: TodoInput): Promise<Todo> {
      const { data, error } = await client
        .from(TABLE)
        .insert(toRow(input))
        .select("*")
        .single();

      if (error) throw new RepositoryError("지시사항을 저장하지 못했습니다.", { cause: error });
      return toDomain(data as TodoRow);
    },

    async update(id: string, input: TodoInput): Promise<Todo> {
      const { data, error } = await client
        .from(TABLE)
        .update({ ...toRow(input), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw new RepositoryError("지시사항을 수정하지 못했습니다.", { cause: error });
      if (!data) throw new TodoNotFoundError(id);
      return toDomain(data as TodoRow);
    },

    async remove(id: string): Promise<void> {
      const { data, error } = await client
        .from(TABLE)
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw new RepositoryError("지시사항을 삭제하지 못했습니다.", { cause: error });
      if (!data) throw new TodoNotFoundError(id);
    },

    async aggregate(filter: TodoFilter = {}) {
      // 건수가 커지면 이 부분을 Postgres 함수(RPC) 한 번 호출로 대체할 것.
      return aggregateTodos(await fetchAll(filter));
    },

    async options(): Promise<TodoOptions> {
      return deriveOptions(await fetchAll({}));
    },

    // ── 진행 이력 ──────────────────────────────────────────

    async listUpdates(todoId: string): Promise<TodoUpdate[]> {
      const { data, error } = await client
        .from(UPDATES_TABLE)
        .select("*")
        .eq("todo_id", todoId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (error) throw new RepositoryError("진행 이력을 불러오지 못했습니다.", { cause: error });
      return (data as TodoUpdateRow[]).map(updateToDomain);
    },

    async countUpdates(todoIds: string[]): Promise<Record<string, number>> {
      const counts: Record<string, number> = {};
      for (const id of todoIds) counts[id] = 0;
      if (todoIds.length === 0) return counts;

      // 행마다 count 질의를 던지면 N+1이 되므로 id만 한 번에 받아 접는다.
      const { data, error } = await client
        .from(UPDATES_TABLE)
        .select("todo_id")
        .in("todo_id", todoIds);

      if (error) throw new RepositoryError("진행 이력을 세지 못했습니다.", { cause: error });
      for (const row of data as { todo_id: string }[]) {
        counts[row.todo_id] = (counts[row.todo_id] ?? 0) + 1;
      }
      return counts;
    },

    async addUpdate(todoId: string, input: TodoUpdateInput): Promise<TodoUpdate> {
      const { data, error } = await client
        .from(UPDATES_TABLE)
        .insert({
          todo_id: todoId,
          note: input.note,
          progress_pct: input.progressPct,
          signal: input.signal,
          author: input.author ?? null,
        })
        .select("*")
        .single();

      if (error) {
        // 존재하지 않는 todo_id면 외래키 위반(23503)이 난다.
        if ((error as { code?: string }).code === "23503") throw new TodoNotFoundError(todoId);
        throw new RepositoryError("진행 이력을 저장하지 못했습니다.", { cause: error });
      }

      const created = updateToDomain(data as TodoUpdateRow);
      await syncCurrentState(todoId);
      return created;
    },

    async removeUpdate(updateId: string): Promise<void> {
      const { data, error } = await client
        .from(UPDATES_TABLE)
        .delete()
        .eq("id", updateId)
        .select("todo_id")
        .maybeSingle();

      if (error) throw new RepositoryError("진행 이력을 삭제하지 못했습니다.", { cause: error });
      if (!data) throw new TodoNotFoundError(updateId);
      await syncCurrentState((data as { todo_id: string }).todo_id);
    },
  };

  /**
   * 남아있는 최신 이력을 부모 To-do의 현재 상태로 반영한다.
   *
   * 두 번의 왕복이 필요한 이유: PostgREST로는 트리거 없이 이걸 원자적으로 못 한다.
   * 이력 추가는 Assistant 한 명이 수동으로 하는 저빈도 작업이라 경합 가능성이 낮아
   * 지금은 이 방식으로 둔다. 동시 편집이 생기면 Postgres 트리거로 옮길 것
   * (그러면 MariaDB 이관 시에도 트리거로 대응한다).
   */
  async function syncCurrentState(todoId: string): Promise<void> {
    const { data, error } = await client
      .from(UPDATES_TABLE)
      .select("note, progress_pct, signal")
      .eq("todo_id", todoId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new RepositoryError("현재 상태를 갱신하지 못했습니다.", { cause: error });
    if (!data) return; // 이력이 없으면 기존 상태를 유지한다.

    const latest = data as { note: string; progress_pct: number; signal: string };
    const { error: updateError } = await client
      .from(TABLE)
      .update({
        progress_note: latest.note,
        progress_pct: latest.progress_pct,
        signal: latest.signal,
      })
      .eq("id", todoId);

    if (updateError) {
      throw new RepositoryError("현재 상태를 갱신하지 못했습니다.", { cause: updateError });
    }
  }
}
