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
import { deriveOptions } from "./memory-todo-repository";
import {
  RepositoryError,
  TodoNotFoundError,
  type TodoOptions,
  type TodoRepository,
} from "./todo-repository";

const TABLE = "todos";

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
  };
}
