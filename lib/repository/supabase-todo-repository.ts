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
import {
  storageKeysOf,
  type Attachment,
  type Category,
  type RemindStatus,
  type Signal,
  type Todo,
  type TodoInput,
} from "../domain/todo";
import type { TodoUpdate, TodoUpdateInput } from "../domain/todo-update";
import type { UpdateFile, UpdateFileInput } from "../domain/attachment";
import type { Employee, EmployeeInput } from "../domain/employee";
import {
  EMPTY_SETTINGS,
  isSameMeetingBody,
  normalizeMeetingBodyName,
  type AppSettings,
  type MeetingBody,
  type MeetingBodyInput,
  type TodoRecipient,
} from "../domain/settings";
import { deriveOptions } from "./memory-todo-repository";
import {
  DuplicateMeetingBodyError,
  RepositoryError,
  TodoNotFoundError,
  type RemindLog,
  type TodoOptions,
  type TodoRepository,
} from "./todo-repository";

type MeetingBodyRow = {
  id: string;
  name: string;
  created_at: string;
};

function meetingBodyToDomain(row: MeetingBodyRow): MeetingBody {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

type RemindLogRow = {
  id: string;
  todo_id: string;
  recipient: string;
  recipient_name: string | null;
  recipient_title: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
};

const TABLE = "todos";
const EMPLOYEES_TABLE = "employees";

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  title: string | null;
};

function employeeToDomain(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department ?? "",
    title: row.title ?? "",
  };
}

const UPDATES_TABLE = "todo_updates";
const UPDATE_FILES_TABLE = "todo_update_files";

type UpdateFileRow = {
  id: string;
  update_id: string;
  name: string;
  size: number | string;
  content_type: string | null;
  storage_key: string;
  created_at: string;
};

function updateFileToDomain(row: UpdateFileRow): UpdateFile {
  return {
    id: row.id,
    updateId: row.update_id,
    name: row.name,
    // bigint는 드라이버가 문자열로 줄 수 있다.
    size: typeof row.size === "string" ? Number(row.size) : row.size,
    contentType: row.content_type,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  };
}

type TodoUpdateRow = {
  id: string;
  todo_id: string;
  note: string;
  signal: string;
  author: string | null;
  created_at: string;
};

function updateToDomain(row: TodoUpdateRow): TodoUpdate {
  return {
    id: row.id,
    todoId: row.todo_id,
    note: row.note,
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
  assignee_title: string | null;
  assignee_email: string | null;
  category: string;
  detail: string;
  progress_note: string | null;
  signal: string;
  remind_status: string;
  attachments: Attachment[] | null;
  completed_at: string | null;
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
    assigneeTitle: row.assignee_title ?? "",
    assigneeEmail: row.assignee_email,
    category: row.category as Category,
    detail: row.detail,
    progressNote: row.progress_note ?? "",
    signal: row.signal as Signal,
    remindStatus: row.remind_status as RemindStatus,
    // 컬럼 기본값이 있어도 옛 행이 null일 수 있다.
    attachments: row.attachments ?? [],
    completedAt: row.completed_at,
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
    assignee_title: input.assigneeTitle,
    assignee_email: input.assigneeEmail,
    category: input.category,
    detail: input.detail,
    progress_note: input.progressNote,
    signal: input.signal,
    remind_status: input.remindStatus,
    attachments: input.attachments,
  };
}

type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

function withFilter<T extends Query>(query: T, filter: TodoFilter): T {
  let q = query;
  if (filter.meetingBody) q = q.eq("meeting_body", filter.meetingBody) as T;
  if (filter.assigneeName) q = q.eq("assignee_name", filter.assigneeName) as T;
  if (filter.category) q = q.eq("category", filter.category) as T;
  if (filter.signal) q = q.eq("signal", filter.signal) as T;
  // 완료 여부는 completed_at의 null 여부로 판정한다.
  if (filter.status === "open") q = q.is("completed_at", null) as T;
  if (filter.status === "done") q = q.not("completed_at", "is", null) as T;
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

  /**
   * 이력들에 딸린 첨부의 스토리지 키.
   *
   * DB는 cascade로 지워지지만 스토리지 객체는 남는다. 삭제 직전에 모아 두고
   * 호출자가 스토리지에서 지운다.
   */
  async function collectStorageKeysForUpdates(updateIds: string[]): Promise<string[]> {
    if (updateIds.length === 0) return [];
    const { data, error } = await client
      .from(UPDATE_FILES_TABLE)
      .select("storage_key")
      .in("update_id", updateIds);

    // 정리용 조회라 실패해도 삭제 자체를 막지 않는다 — 못 지운 파일은 남지만
    // 사용자가 지우려던 이력은 지워진다.
    if (error) return [];
    return (data as { storage_key: string }[]).map((r) => r.storage_key);
  }

  /**
   * 한 지시사항이 안고 있는 모든 첨부 키.
   * 이력 첨부 + 지시사항 본문 첨부를 함께 모은다.
   */
  async function collectStorageKeysForTodo(todoId: string): Promise<string[]> {
    const [updateRows, todoRow] = await Promise.all([
      client.from(UPDATES_TABLE).select("id").eq("todo_id", todoId),
      client.from(TABLE).select("attachments").eq("id", todoId).maybeSingle(),
    ]);

    const keys = updateRows.error
      ? []
      : await collectStorageKeysForUpdates(
          (updateRows.data as { id: string }[]).map((r) => r.id),
        );

    const ownKeys = todoRow.error
      ? []
      : storageKeysOf(
          (todoRow.data as { attachments: Attachment[] | null } | null)?.attachments ?? [],
        );

    return [...keys, ...ownKeys];
  }

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

    async remove(id: string): Promise<string[]> {
      /*
       * 지우기 전에 첨부의 스토리지 키를 모아 둔다.
       * todos → todo_updates → todo_update_files는 cascade로 지워지지만
       * 스토리지 객체는 아무도 지워 주지 않아 그대로 남는다.
       */
      const keys = await collectStorageKeysForTodo(id);

      const { data, error } = await client
        .from(TABLE)
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw new RepositoryError("지시사항을 삭제하지 못했습니다.", { cause: error });
      if (!data) throw new TodoNotFoundError(id);
      return keys;
    },

    async setCompleted(id: string, done: boolean): Promise<Todo> {
      const now = new Date().toISOString();
      /*
       * 이미 같은 상태면 완료 시각을 덮지 않는다.
       * `is`/`not is` 조건을 걸어 두면 두 번 눌러도 완료일이 오늘로 밀리지 않고,
       * 조건에 안 맞으면 0행이 돌아와 아래에서 현재 값을 그대로 읽어 준다.
       */
      const query = client
        .from(TABLE)
        .update({ completed_at: done ? now : null, updated_at: now })
        .eq("id", id);

      const { data, error } = await (
        done ? query.is("completed_at", null) : query.not("completed_at", "is", null)
      )
        .select("*")
        .maybeSingle();

      if (error) {
        throw new RepositoryError(
          done ? "완료 처리하지 못했습니다." : "완료를 취소하지 못했습니다.",
          { cause: error },
        );
      }
      if (data) return toDomain(data as TodoRow);

      // 0행 = 이미 그 상태였거나, 아예 없는 건. 어느 쪽인지 확인해서 갈라준다.
      const { data: current, error: readError } = await client
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (readError) {
        throw new RepositoryError("지시사항을 불러오지 못했습니다.", { cause: readError });
      }
      if (!current) throw new TodoNotFoundError(id);
      return toDomain(current as TodoRow);
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

    async recordRemind(entry) {
      // 이력을 먼저 남긴다 — 상태 갱신이 실패해도 발송 사실은 보존된다.
      const { error: logError } = await client.from("remind_logs").insert({
        todo_id: entry.todoId,
        recipient: entry.recipient,
        recipient_name: entry.recipientName ?? "",
        recipient_title: entry.recipientTitle ?? "",
        status: entry.status,
        sent_at: entry.status === "sent" ? new Date().toISOString() : null,
      });
      if (logError) {
        throw new RepositoryError("발송 이력을 남기지 못했습니다.", { cause: logError });
      }

      // 실패는 wait로 되돌려 재시도할 수 있게 한다.
      const { error } = await client
        .from(TABLE)
        .update({ remind_status: entry.status === "sent" ? "sent" : "wait" })
        .eq("id", entry.todoId);
      if (error) {
        throw new RepositoryError("Remind 상태를 갱신하지 못했습니다.", { cause: error });
      }
    },

    async listRemindLogs(todoId: string): Promise<RemindLog[]> {
      const { data, error } = await client
        .from("remind_logs")
        .select("*")
        .eq("todo_id", todoId)
        .order("created_at", { ascending: false });

      if (error) throw new RepositoryError("발송 이력을 불러오지 못했습니다.", { cause: error });
      return (data as RemindLogRow[]).map((r) => ({
        id: r.id,
        todoId: r.todo_id,
        recipient: r.recipient,
        recipientName: r.recipient_name ?? "",
        recipientTitle: r.recipient_title ?? "",
        status: r.status as RemindLog["status"],
        sentAt: r.sent_at,
        createdAt: r.created_at,
      }));
    },

    // ── 설정 ──────────────────────────────────────────────

    async getSettings(): Promise<AppSettings> {
      const { data, error } = await client
        .from("app_settings")
        .select("assistant_name, assistant_email")
        .maybeSingle();

      if (error) throw new RepositoryError("설정을 불러오지 못했습니다.", { cause: error });
      if (!data) return { ...EMPTY_SETTINGS };
      const row = data as { assistant_name: string | null; assistant_email: string | null };
      return {
        assistantName: row.assistant_name ?? "",
        assistantEmail: row.assistant_email,
      };
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      // 행이 없을 수도 있으므로 upsert. id는 단일 행 고정 키다.
      const { error } = await client.from("app_settings").upsert({
        id: true,
        assistant_name: settings.assistantName,
        assistant_email: settings.assistantEmail,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new RepositoryError("설정을 저장하지 못했습니다.", { cause: error });
    },

    // ── 회의체 마스터 ─────────────────────────────────────

    async listMeetingBodies(): Promise<MeetingBody[]> {
      const { data, error } = await client.from("meeting_bodies").select("*").order("name");
      if (error) throw new RepositoryError("회의체 목록을 불러오지 못했습니다.", { cause: error });
      return (data as MeetingBodyRow[]).map(meetingBodyToDomain);
    },

    async createMeetingBody(input: MeetingBodyInput): Promise<MeetingBody> {
      const name = normalizeMeetingBodyName(input.name);
      const { data, error } = await client
        .from("meeting_bodies")
        .insert({ name })
        .select("*")
        .single();

      if (error) {
        // 23505 = unique 위반 (meeting_bodies_name_unique)
        if ((error as { code?: string }).code === "23505") {
          throw new DuplicateMeetingBodyError(name);
        }
        throw new RepositoryError("회의체를 저장하지 못했습니다.", { cause: error });
      }
      return meetingBodyToDomain(data as MeetingBodyRow);
    },

    async updateMeetingBody(id: string, input: MeetingBodyInput): Promise<MeetingBody> {
      const name = normalizeMeetingBodyName(input.name);

      // 이전 이름을 먼저 읽어둔다 — 지시사항의 표기를 함께 바꿔야 하기 때문.
      const { data: before, error: readError } = await client
        .from("meeting_bodies")
        .select("name")
        .eq("id", id)
        .maybeSingle();
      if (readError) {
        throw new RepositoryError("회의체를 불러오지 못했습니다.", { cause: readError });
      }
      if (!before) throw new TodoNotFoundError(id);
      const previous = (before as { name: string }).name;

      const { data, error } = await client
        .from("meeting_bodies")
        .update({ name })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new DuplicateMeetingBodyError(name);
        }
        throw new RepositoryError("회의체를 수정하지 못했습니다.", { cause: error });
      }
      if (!data) throw new TodoNotFoundError(id);

      /*
       * 지시사항은 회의체를 FK가 아니라 텍스트로 들고 있다(필터·집계가 문자열 기준).
       * 마스터만 고치면 기존 건들이 옛 이름으로 남아 사이드바 '회의체별'이 둘로 갈라지므로
       * 여기서 같이 갱신한다. 마스터를 FK로 바꾸는 편이 정석이지만
       * 그 이관은 필터/집계/시드까지 함께 손대야 해서 별건으로 둔다.
       */
      if (!isSameMeetingBody(previous, name)) {
        const { error: renameError } = await client
          .from(TABLE)
          .update({ meeting_body: name })
          .eq("meeting_body", previous);
        if (renameError) {
          throw new RepositoryError("지시사항의 회의체 표기를 바꾸지 못했습니다.", {
            cause: renameError,
          });
        }
      }
      return meetingBodyToDomain(data as MeetingBodyRow);
    },

    async removeMeetingBody(id: string): Promise<void> {
      // 지시사항의 meeting_body는 텍스트라 그대로 남는다 — 과거 기록은 보존한다.
      const { data, error } = await client
        .from("meeting_bodies")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw new RepositoryError("회의체를 삭제하지 못했습니다.", { cause: error });
      if (!data) throw new TodoNotFoundError(id);
    },

    async countMeetingBodyUsage(): Promise<Record<string, number>> {
      const [bodies, todos] = await Promise.all([
        client.from("meeting_bodies").select("id, name"),
        client.from(TABLE).select("meeting_body"),
      ]);
      if (bodies.error) {
        throw new RepositoryError("회의체 목록을 불러오지 못했습니다.", { cause: bodies.error });
      }
      if (todos.error) {
        throw new RepositoryError("회의체 사용 현황을 세지 못했습니다.", { cause: todos.error });
      }

      // 표기 흔들림을 흡수하려고 정규화 키로 접는다.
      const counts = new Map<string, number>();
      for (const row of todos.data as { meeting_body: string }[]) {
        const key = normalizeMeetingBodyName(row.meeting_body ?? "").toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const out: Record<string, number> = {};
      for (const b of bodies.data as { id: string; name: string }[]) {
        out[b.id] = counts.get(normalizeMeetingBodyName(b.name).toLowerCase()) ?? 0;
      }
      return out;
    },

    async ensureMeetingBody(name: string): Promise<MeetingBody> {
      const normalized = normalizeMeetingBodyName(name);

      // 이미 있으면 그대로 쓴다. ilike의 와일드카드로 해석되지 않게 이스케이프한다.
      const { data: found, error: findError } = await client
        .from("meeting_bodies")
        .select("*")
        .ilike("name", normalized.replace(/[%_\\]/g, "\\$&"))
        .maybeSingle();
      if (findError) {
        throw new RepositoryError("회의체를 조회하지 못했습니다.", { cause: findError });
      }
      if (found) return meetingBodyToDomain(found as MeetingBodyRow);

      const { data, error } = await client
        .from("meeting_bodies")
        .insert({ name: normalized })
        .select("*")
        .single();

      if (error) {
        /*
         * 조회와 삽입 사이에 다른 요청이 같은 이름을 넣었을 수 있다.
         * 이 경로는 지시사항 저장에 딸려 도는 부수 작업이므로,
         * 경합에서 졌다고 저장 자체를 실패시키면 안 된다 — 다시 읽어 돌려준다.
         */
        if ((error as { code?: string }).code === "23505") {
          const { data: retry } = await client
            .from("meeting_bodies")
            .select("*")
            .ilike("name", normalized.replace(/[%_\\]/g, "\\$&"))
            .maybeSingle();
          if (retry) return meetingBodyToDomain(retry as MeetingBodyRow);
        }
        throw new RepositoryError("회의체를 저장하지 못했습니다.", { cause: error });
      }
      return meetingBodyToDomain(data as MeetingBodyRow);
    },

    // ── 사원 명부 ─────────────────────────────────────────

    async listEmployees(): Promise<Employee[]> {
      /*
       * 전량을 한 번에 읽는다. PostgREST 기본 상한이 1000행이라
       * 1천 명 넘는 명부가 조용히 잘린다 — 범위를 넉넉히 지정해 막는다.
       */
      const { data, error } = await client
        .from(EMPLOYEES_TABLE)
        .select("id, name, email, department, title")
        .order("name")
        .range(0, 49_999);

      if (error) throw new RepositoryError("사원 명부를 불러오지 못했습니다.", { cause: error });
      return (data as EmployeeRow[]).map(employeeToDomain);
    },

    async replaceEmployees(rows: EmployeeInput[]): Promise<number> {
      // 전량 교체 — 지우고 넣는다. 지시사항은 명부를 FK로 참조하지 않아 영향이 없다.
      const { error: deleteError } = await client
        .from(EMPLOYEES_TABLE)
        .delete()
        .not("id", "is", null);
      if (deleteError) {
        throw new RepositoryError("기존 명부를 비우지 못했습니다.", { cause: deleteError });
      }
      if (rows.length === 0) return 0;

      // 한 번에 다 넣으면 요청이 너무 커진다. 나눠 넣는다.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await client.from(EMPLOYEES_TABLE).insert(rows.slice(i, i + CHUNK));
        if (error) {
          throw new RepositoryError(
            `명부를 저장하지 못했습니다 (${i + 1}번째 이후).`,
            { cause: error },
          );
        }
      }
      return rows.length;
    },

    async clearEmployees(): Promise<void> {
      const { error } = await client.from(EMPLOYEES_TABLE).delete().not("id", "is", null);
      if (error) throw new RepositoryError("명부를 비우지 못했습니다.", { cause: error });
    },

    // ── 지시사항별 추가 수신자 ────────────────────────────

    async listTodoRecipients(todoId: string): Promise<TodoRecipient[]> {
      const { data, error } = await client
        .from("todo_recipients")
        .select("email, name")
        .eq("todo_id", todoId)
        .order("name");

      if (error) throw new RepositoryError("수신자를 불러오지 못했습니다.", { cause: error });
      return data as TodoRecipient[];
    },

    async listTodoRecipientsFor(
      todoIds: string[],
    ): Promise<Record<string, TodoRecipient[]>> {
      const out: Record<string, TodoRecipient[]> = {};
      for (const id of todoIds) out[id] = [];
      if (todoIds.length === 0) return out;

      const { data, error } = await client
        .from("todo_recipients")
        .select("todo_id, email, name")
        .in("todo_id", todoIds);

      if (error) throw new RepositoryError("수신자를 불러오지 못했습니다.", { cause: error });
      for (const row of data as { todo_id: string; email: string; name: string }[]) {
        (out[row.todo_id] ??= []).push({ email: row.email, name: row.name });
      }
      return out;
    },

    async setTodoRecipients(todoId: string, recipients: TodoRecipient[]): Promise<void> {
      const { error: clearError } = await client
        .from("todo_recipients")
        .delete()
        .eq("todo_id", todoId);
      if (clearError) {
        throw new RepositoryError("기존 수신자를 정리하지 못했습니다.", { cause: clearError });
      }
      if (recipients.length === 0) return;

      // 같은 주소를 두 번 넣으면 복합 PK에 걸린다 — 미리 접는다.
      const seen = new Set<string>();
      const rows = recipients.flatMap((r) => {
        const email = r.email.trim();
        const key = email.toLowerCase();
        if (!email || seen.has(key)) return [];
        seen.add(key);
        return [{ todo_id: todoId, email, name: r.name.trim() }];
      });
      if (rows.length === 0) return;

      const { error } = await client.from("todo_recipients").insert(rows);
      if (error) throw new RepositoryError("수신자를 저장하지 못했습니다.", { cause: error });
    },

    async removeUpdate(updateId: string): Promise<string[]> {
      const keys = await collectStorageKeysForUpdates([updateId]);

      const { data, error } = await client
        .from(UPDATES_TABLE)
        .delete()
        .eq("id", updateId)
        .select("todo_id")
        .maybeSingle();

      if (error) throw new RepositoryError("진행 이력을 삭제하지 못했습니다.", { cause: error });
      if (!data) throw new TodoNotFoundError(updateId);
      await syncCurrentState((data as { todo_id: string }).todo_id);
      return keys;
    },

    // ── 이력 첨부 파일 ────────────────────────────────────

    async addUpdateFiles(updateId: string, files: UpdateFileInput[]): Promise<UpdateFile[]> {
      if (files.length === 0) return [];

      const { data, error } = await client
        .from(UPDATE_FILES_TABLE)
        .insert(
          files.map((f) => ({
            update_id: updateId,
            name: f.name,
            size: f.size,
            content_type: f.contentType,
            storage_key: f.storageKey,
          })),
        )
        .select("*");

      if (error) {
        // 존재하지 않는 update_id면 외래키 위반(23503)이 난다.
        if ((error as { code?: string }).code === "23503") {
          throw new TodoNotFoundError(updateId);
        }
        throw new RepositoryError("첨부 정보를 저장하지 못했습니다.", { cause: error });
      }
      return (data as UpdateFileRow[]).map(updateFileToDomain);
    },

    async listUpdateFilesFor(updateIds: string[]): Promise<Record<string, UpdateFile[]>> {
      const out: Record<string, UpdateFile[]> = {};
      for (const id of updateIds) out[id] = [];
      if (updateIds.length === 0) return out;

      const { data, error } = await client
        .from(UPDATE_FILES_TABLE)
        .select("*")
        .in("update_id", updateIds)
        .order("created_at", { ascending: true });

      if (error) throw new RepositoryError("첨부 목록을 불러오지 못했습니다.", { cause: error });
      for (const row of data as UpdateFileRow[]) {
        (out[row.update_id] ??= []).push(updateFileToDomain(row));
      }
      return out;
    },

    async findUpdateFile(fileId: string): Promise<UpdateFile | null> {
      const { data, error } = await client
        .from(UPDATE_FILES_TABLE)
        .select("*")
        .eq("id", fileId)
        .maybeSingle();

      if (error) throw new RepositoryError("첨부를 불러오지 못했습니다.", { cause: error });
      return data ? updateFileToDomain(data as UpdateFileRow) : null;
    },

    async removeUpdateFile(fileId: string): Promise<string> {
      const { data, error } = await client
        .from(UPDATE_FILES_TABLE)
        .delete()
        .eq("id", fileId)
        .select("storage_key")
        .maybeSingle();

      if (error) throw new RepositoryError("첨부를 삭제하지 못했습니다.", { cause: error });
      if (!data) throw new TodoNotFoundError(fileId);
      return (data as { storage_key: string }).storage_key;
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
      .select("note, signal")
      .eq("todo_id", todoId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new RepositoryError("현재 상태를 갱신하지 못했습니다.", { cause: error });
    if (!data) return; // 이력이 없으면 기존 상태를 유지한다.

    const latest = data as { note: string; signal: string };
    const { error: updateError } = await client
      .from(TABLE)
      .update({
        progress_note: latest.note,
        signal: latest.signal,
      })
      .eq("id", todoId);

    if (updateError) {
      throw new RepositoryError("현재 상태를 갱신하지 못했습니다.", { cause: updateError });
    }
  }
}
