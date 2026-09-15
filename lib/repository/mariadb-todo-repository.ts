/**
 * MariaDB 어댑터 (사내 AWS).
 *
 * ⚠️ 이 파일은 프로젝트에서 유일하게 `mysql2`를 import 하는 곳이다.
 * Supabase 어댑터와 같은 이유로 벤더를 이 경계 안에 가둔다.
 *
 * Supabase 어댑터와 동작이 같아야 한다. 같은 계약 테스트(tests/repository-contract.ts)를
 * 양쪽에 돌려 확인한다.
 *
 * MariaDB 11.4에서 달라지는 것:
 *
 *  1. `UPDATE ... RETURNING`이 없다(13.0.1부터). 갱신 후 다시 SELECT 한다.
 *     그래서 갱신과 재조회를 한 트랜잭션으로 묶는다 — 사이에 다른 요청이
 *     끼면 남의 변경을 내 결과로 돌려주게 된다.
 *
 *  2. 트랜잭션이 있다. Supabase(PostgREST)에는 없어서 "지우고 다시 넣는" 연산이
 *     중간에 실패하면 반쯤 지워진 채 남았다(명부 전량 교체가 대표적).
 *     여기서는 묶어서 처리한다.
 *
 *  3. id를 DB가 만들지 않는다. 애플리케이션이 crypto.randomUUID()로 만들어
 *     넣는다 — INSERT 후 되읽을 필요가 없고 드라이버의 UUID 변환도 피한다.
 *
 * Supabase 어댑터와 마찬가지로 `server-only`를 붙이지 않는다. 서버 전용 경계는
 * 팩토리(lib/repository/index.ts)가 세우고, 어댑터는 계약 테스트에서 직접
 * import 할 수 있어야 한다 — `server-only`가 있으면 Vitest에서 import가 터진다.
 */
import mysql from "mysql2/promise";

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

/**
 * 바인딩에 넣을 수 있는 값.
 *
 * 드라이버가 받는 타입을 그대로 좁혀 둔다 — `unknown[]`으로 두면 객체나
 * 배열을 실수로 넘겨도 타입이 잡아 주지 못하고 런타임에 깨진다.
 */
type Param = string | number | boolean | Date | null;

// ── 행 형태 ────────────────────────────────────────────────

type TodoRow = {
  id: string;
  instructed_at: string | Date;
  due_date: string | Date;
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
  attachments: Attachment[] | string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type TodoUpdateRow = {
  id: string;
  todo_id: string;
  note: string;
  signal: string;
  author: string | null;
  created_at: Date;
};

type UpdateFileRow = {
  id: string;
  update_id: string;
  name: string;
  size: number | string;
  content_type: string | null;
  storage_key: string;
  created_at: Date;
};

type RemindLogRow = {
  id: string;
  todo_id: string;
  recipient: string;
  recipient_name: string | null;
  recipient_title: string | null;
  status: string;
  sent_at: Date | null;
  created_at: Date;
};

type MeetingBodyRow = { id: string; name: string; created_at: Date };

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  title: string | null;
};

// ── 값 변환 ────────────────────────────────────────────────

/**
 * datetime(3) → ISO 문자열.
 *
 * 드라이버가 Date로 주는데, 그 Date는 "UTC로 저장된 값"을 로컬 시각으로 읽은
 * 것이라 그대로 toISOString()하면 타임존만큼 밀린다. 커넥션의 timezone을
 * 'Z'로 고정해(createPool 참고) 드라이버가 UTC로 해석하게 만들고, 여기서는
 * 변환만 한다.
 */
function toIso(value: Date | string | null): string {
  if (value === null) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

/** date 컬럼 → 'YYYY-MM-DD'. 드라이버 설정에 따라 Date 또는 문자열로 온다. */
function toDateOnly(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  // date 컬럼은 시각이 없다. UTC로 읽으면 하루 밀릴 수 있어 로컬 성분을 쓴다.
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** json 컬럼. 드라이버가 파싱해 주기도, 문자열로 주기도 한다. */
function toAttachments(value: Attachment[] | string | null): Attachment[] {
  if (value === null) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Attachment[]) : [];
  } catch {
    return [];
  }
}

function toDomain(row: TodoRow): Todo {
  return {
    id: row.id,
    instructedAt: toDateOnly(row.instructed_at),
    dueDate: toDateOnly(row.due_date),
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
    attachments: toAttachments(row.attachments),
    completedAt: toIsoOrNull(row.completed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function updateToDomain(row: TodoUpdateRow): TodoUpdate {
  return {
    id: row.id,
    todoId: row.todo_id,
    note: row.note,
    signal: row.signal as Signal,
    author: row.author,
    createdAt: toIso(row.created_at),
  };
}

function updateFileToDomain(row: UpdateFileRow): UpdateFile {
  return {
    id: row.id,
    updateId: row.update_id,
    name: row.name,
    // bigint는 드라이버가 문자열로 줄 수 있다.
    size: typeof row.size === "string" ? Number(row.size) : row.size,
    contentType: row.content_type,
    storageKey: row.storage_key,
    createdAt: toIso(row.created_at),
  };
}

function meetingBodyToDomain(row: MeetingBodyRow): MeetingBody {
  return { id: row.id, name: row.name, createdAt: toIso(row.created_at) };
}

function employeeToDomain(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department ?? "",
    title: row.title ?? "",
  };
}

/** 앱이 넣을 컬럼 묶음 — INSERT와 UPDATE가 같은 목록을 쓴다. */
const TODO_COLUMNS = [
  "instructed_at",
  "due_date",
  "meeting_body",
  "org",
  "assignee_name",
  "assignee_title",
  "assignee_email",
  "category",
  "detail",
  "progress_note",
  "signal",
  "remind_status",
  "attachments",
] as const;

function todoValues(input: TodoInput): Param[] {
  return [
    input.instructedAt,
    input.dueDate,
    input.meetingBody,
    input.org,
    input.assigneeName,
    input.assigneeTitle,
    input.assigneeEmail,
    input.category,
    input.detail,
    input.progressNote,
    input.signal,
    input.remindStatus,
    JSON.stringify(input.attachments),
  ];
}

/** 정렬 키 → 컬럼명 */
const SORT_COLUMNS: Record<Sort["key"], string> = {
  instructedAt: "instructed_at",
  dueDate: "due_date",
  meetingBody: "meeting_body",
  assigneeName: "assignee_name",
  category: "category",
};

/**
 * 필터를 WHERE 절과 바인딩으로 바꾼다.
 * 값은 모두 플레이스홀더로 넘긴다 — 문자열을 이어 붙이지 않는다.
 */
function whereOf(filter: TodoFilter): { sql: string; params: Param[] } {
  const parts: string[] = [];
  const params: Param[] = [];

  if (filter.meetingBody) {
    parts.push("meeting_body = ?");
    params.push(filter.meetingBody);
  }
  if (filter.assigneeName) {
    parts.push("assignee_name = ?");
    params.push(filter.assigneeName);
  }
  if (filter.category) {
    parts.push("category = ?");
    params.push(filter.category);
  }
  if (filter.signal) {
    parts.push("signal = ?");
    params.push(filter.signal);
  }
  // 완료 여부는 completed_at의 null 여부로 판정한다.
  if (filter.status === "open") parts.push("completed_at is null");
  if (filter.status === "done") parts.push("completed_at is not null");
  if (filter.from) {
    parts.push("instructed_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    parts.push("instructed_at <= ?");
    params.push(filter.to);
  }

  return { sql: parts.length > 0 ? `where ${parts.join(" and ")}` : "", params };
}

/** `in (?, ?, ...)` 자리표시자 */
const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** 중복 키 위반인지 — 회의체 이름, 첨부 storage_key가 여기 걸린다. */
const isDuplicate = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "ER_DUP_ENTRY";

/** 외래키 위반인지 — 없는 todo_id/update_id로 넣을 때 난다. */
const isForeignKey = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "ER_NO_REFERENCED_ROW_2";

// ── 팩토리 ─────────────────────────────────────────────────

export type MariaDbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** RDS/사내 DB가 TLS를 요구하면 켠다 */
  ssl?: boolean;
  /**
   * 커넥션 상한.
   *
   * Fargate 태스크마다 이만큼 잡는다. 태스크 수 × 이 값이 서버의
   * max_connections를 넘지 않도록 정한다.
   */
  connectionLimit?: number;
};

export function createMariaDbTodoRepository(config: MariaDbConfig): TodoRepository {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
    waitForConnections: true,
    connectionLimit: config.connectionLimit ?? 10,
    // 앱은 ISO(UTC) 문자열을 주고받는다. 세션 타임존이 다르면 시각이 밀린다.
    timezone: "Z",
    // bigint를 수로 내리면 정밀도가 깨질 수 있다. 문자열로 받아 매퍼에서 바꾼다.
    supportBigNumbers: true,
    bigNumberStrings: true,
    // date/datetime을 문자열이 아닌 Date로 받는다(기본값). 매퍼가 이를 전제한다.
    dateStrings: false,
    charset: "utf8mb4",
  });

  /** SELECT — 행 배열을 돌려준다. */
  async function query<Row>(
    sql: string,
    params: Param[],
    failure: string,
  ): Promise<Row[]> {
    try {
      const [rows] = await pool.query(sql, params);
      return rows as Row[];
    } catch (error) {
      throw new RepositoryError(failure, { cause: error });
    }
  }

  /** INSERT/UPDATE/DELETE — 영향받은 행 수를 돌려준다. */
  async function run(
    sql: string,
    params: Param[],
    failure: string,
  ): Promise<number> {
    try {
      const [result] = await pool.execute(sql, params);
      return (result as mysql.ResultSetHeader).affectedRows;
    } catch (error) {
      throw new RepositoryError(failure, { cause: error });
    }
  }

  /**
   * 한 트랜잭션 안에서 실행한다.
   *
   * 실패하면 되돌린다. RepositoryError·TodoNotFoundError 같은 도메인 오류도
   * 롤백 대상이다 — 중간까지 쓴 것을 남기지 않는다.
   */
  async function tx<T>(
    body: (conn: mysql.PoolConnection) => Promise<T>,
    failure: string,
  ): Promise<T> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await body(conn);
      await conn.commit();
      return out;
    } catch (error) {
      await conn.rollback().catch(() => undefined);
      if (error instanceof TodoNotFoundError) throw error;
      if (error instanceof DuplicateMeetingBodyError) throw error;
      if (error instanceof RepositoryError) throw error;
      throw new RepositoryError(failure, { cause: error });
    } finally {
      conn.release();
    }
  }

  const TODO_SELECT = "select * from todos";

  async function findRow(
    conn: mysql.PoolConnection | mysql.Pool,
    id: string,
  ): Promise<TodoRow | null> {
    const [rows] = await conn.query(`${TODO_SELECT} where id = ?`, [id]);
    return ((rows as TodoRow[])[0] as TodoRow | undefined) ?? null;
  }

  /**
   * 필터에 걸리는 지시사항 전량.
   * 브리핑 집계·주간 리포트·엑셀 내려받기가 모두 이 결과를 원본으로 쓴다 —
   * 여기서 잘리면 합계가 조용히 틀어진다. SQL에는 행 상한이 없으므로
   * Supabase 쪽처럼 나눠 읽을 필요가 없다.
   */
  async function fetchAll(filter: TodoFilter): Promise<Todo[]> {
    const { sql, params } = whereOf(filter);
    const rows = await query<TodoRow>(
      `${TODO_SELECT} ${sql} order by due_date asc, id asc`,
      params,
      "지시사항 목록을 불러오지 못했습니다.",
    );
    return rows.map(toDomain);
  }

  /**
   * 남아있는 최신 이력을 부모 To-do의 현재 상태로 반영한다.
   * 호출자의 트랜잭션 안에서 돈다 — 이력 추가/삭제와 같은 원자 단위다.
   */
  async function syncCurrentState(
    conn: mysql.PoolConnection,
    todoId: string,
  ): Promise<void> {
    const [rows] = await conn.query(
      `select note, signal from todo_updates
        where todo_id = ?
        order by created_at desc, id desc
        limit 1`,
      [todoId],
    );
    const latest = (rows as { note: string; signal: string }[])[0];
    if (!latest) return; // 이력이 없으면 기존 상태를 유지한다.

    await conn.execute(
      "update todos set progress_note = ?, signal = ? where id = ?",
      [latest.note, latest.signal, todoId],
    );
  }

  /** 이력들에 딸린 첨부의 스토리지 키 — 지우기 전에 모아 호출자가 정리한다. */
  async function keysForUpdates(
    conn: mysql.PoolConnection,
    updateIds: string[],
  ): Promise<string[]> {
    if (updateIds.length === 0) return [];
    const [rows] = await conn.query(
      `select storage_key from todo_update_files
        where update_id in (${placeholders(updateIds.length)})`,
      updateIds,
    );
    return (rows as { storage_key: string }[]).map((r) => r.storage_key);
  }

  return {
    async list(q: TodoQuery): Promise<Paged<Todo>> {
      const { sql, params } = whereOf(q.filter);
      const dir = q.sort.dir === "asc" ? "asc" : "desc";
      const column = SORT_COLUMNS[q.sort.key];
      const offset = (q.page - 1) * q.pageSize;

      /*
       * 정렬은 collation(utf8mb4_uca1400_ai_ci)이 정한다. 한글은 가나다순,
       * 영문·한글이 섞이면 유니코드 정렬 규칙을 따른다.
       * 동률 시 순서 고정 — 없으면 페이지 간 행이 중복/누락될 수 있다.
       */
      const rows = await query<TodoRow>(
        `${TODO_SELECT} ${sql}
          order by ${column} ${dir}, due_date asc, id asc
          limit ? offset ?`,
        [...params, q.pageSize, offset],
        "지시사항 목록을 불러오지 못했습니다.",
      );

      const counted = await query<{ total: number | string }>(
        `select count(*) as total from todos ${sql}`,
        params,
        "지시사항 목록을 불러오지 못했습니다.",
      );

      return {
        rows: rows.map(toDomain),
        total: Number(counted[0]?.total ?? 0),
        page: q.page,
        pageSize: q.pageSize,
      };
    },

    listAll(filter: TodoFilter = {}) {
      return fetchAll(filter);
    },

    async findById(id: string): Promise<Todo | null> {
      const rows = await query<TodoRow>(
        `${TODO_SELECT} where id = ?`,
        [id],
        "지시사항을 불러오지 못했습니다.",
      );
      return rows[0] ? toDomain(rows[0]) : null;
    },

    async create(input: TodoInput): Promise<Todo> {
      // id를 미리 만들어 넣는다 — INSERT 후 되읽을 필요가 없다.
      const id = crypto.randomUUID();
      await run(
        `insert into todos (id, ${TODO_COLUMNS.join(", ")})
         values (?, ${placeholders(TODO_COLUMNS.length)})`,
        [id, ...todoValues(input)],
        "지시사항을 저장하지 못했습니다.",
      );

      const row = await findRow(pool, id);
      if (!row) throw new RepositoryError("지시사항을 저장하지 못했습니다.");
      return toDomain(row);
    },

    async update(id: string, input: TodoInput): Promise<Todo> {
      /*
       * UPDATE ... RETURNING이 없어 갱신 후 다시 읽는다.
       * 두 문장을 한 트랜잭션으로 묶지 않으면 그 사이의 다른 변경을
       * 내 결과인 것처럼 돌려주게 된다.
       */
      return tx(async (conn) => {
        const [result] = await conn.execute(
          `update todos
              set ${TODO_COLUMNS.map((c) => `${c} = ?`).join(", ")}
            where id = ?`,
          [...todoValues(input), id],
        );
        // affectedRows는 "조건에 맞은 행 수"다. 값이 같아도 1이 된다.
        if ((result as mysql.ResultSetHeader).affectedRows === 0) {
          throw new TodoNotFoundError(id);
        }
        const row = await findRow(conn, id);
        if (!row) throw new TodoNotFoundError(id);
        return toDomain(row);
      }, "지시사항을 수정하지 못했습니다.");
    },

    async remove(id: string): Promise<string[]> {
      /*
       * 지우기 전에 첨부의 스토리지 키를 모아 둔다.
       * todos → todo_updates → todo_update_files는 cascade로 지워지지만
       * 스토리지 객체는 아무도 지워 주지 않아 그대로 남는다.
       */
      return tx(async (conn) => {
        const [updateRows] = await conn.query(
          "select id from todo_updates where todo_id = ?",
          [id],
        );
        const keys = await keysForUpdates(
          conn,
          (updateRows as { id: string }[]).map((r) => r.id),
        );

        const row = await findRow(conn, id);
        if (!row) throw new TodoNotFoundError(id);
        const ownKeys = storageKeysOf(toAttachments(row.attachments));

        await conn.execute("delete from todos where id = ?", [id]);
        return [...keys, ...ownKeys];
      }, "지시사항을 삭제하지 못했습니다.");
    },

    async setCompleted(id: string, done: boolean): Promise<Todo> {
      return tx(async (conn) => {
        /*
         * 이미 같은 상태면 완료 시각을 덮지 않는다 — 두 번 눌러도 완료일이
         * 오늘로 밀리지 않게 한다. 조건에 안 맞으면 0행이 되고, 아래에서
         * 현재 값을 그대로 읽어 돌려준다.
         */
        const guard = done ? "completed_at is null" : "completed_at is not null";
        await conn.execute(
          `update todos set completed_at = ? where id = ? and ${guard}`,
          [done ? new Date() : null, id],
        );

        const row = await findRow(conn, id);
        if (!row) throw new TodoNotFoundError(id);
        return toDomain(row);
      }, done ? "완료 처리하지 못했습니다." : "완료를 취소하지 못했습니다.");
    },

    async aggregate(filter: TodoFilter = {}) {
      // 건수가 커지면 집계 SQL 한 번으로 대체할 것.
      return aggregateTodos(await fetchAll(filter));
    },

    async options(): Promise<TodoOptions> {
      return deriveOptions(await fetchAll({}));
    },

    // ── 진행 이력 ──────────────────────────────────────────

    async listUpdates(todoId: string): Promise<TodoUpdate[]> {
      const rows = await query<TodoUpdateRow>(
        `select * from todo_updates
          where todo_id = ?
          order by created_at desc, id desc`,
        [todoId],
        "진행 이력을 불러오지 못했습니다.",
      );
      return rows.map(updateToDomain);
    },

    async countUpdates(todoIds: string[]): Promise<Record<string, number>> {
      const counts: Record<string, number> = {};
      for (const id of todoIds) counts[id] = 0;
      if (todoIds.length === 0) return counts;

      // 행마다 세면 N+1이 된다. 한 번에 묶어 센다.
      const rows = await query<{ todo_id: string; n: number | string }>(
        `select todo_id, count(*) as n from todo_updates
          where todo_id in (${placeholders(todoIds.length)})
          group by todo_id`,
        todoIds,
        "진행 이력을 세지 못했습니다.",
      );
      for (const row of rows) counts[row.todo_id] = Number(row.n);
      return counts;
    },

    async addUpdate(todoId: string, input: TodoUpdateInput): Promise<TodoUpdate> {
      return tx(async (conn) => {
        const id = crypto.randomUUID();
        try {
          await conn.execute(
            `insert into todo_updates (id, todo_id, note, signal, author)
             values (?, ?, ?, ?, ?)`,
            [id, todoId, input.note, input.signal, input.author ?? null],
          );
        } catch (error) {
          if (isForeignKey(error)) throw new TodoNotFoundError(todoId);
          throw error;
        }

        const [rows] = await conn.query("select * from todo_updates where id = ?", [id]);
        const created = updateToDomain((rows as TodoUpdateRow[])[0]);
        // 이력 추가와 현재 상태 반영은 한 단위다.
        await syncCurrentState(conn, todoId);
        return created;
      }, "진행 이력을 저장하지 못했습니다.");
    },

    async removeUpdate(updateId: string): Promise<string[]> {
      return tx(async (conn) => {
        const keys = await keysForUpdates(conn, [updateId]);

        const [rows] = await conn.query(
          "select todo_id from todo_updates where id = ?",
          [updateId],
        );
        const found = (rows as { todo_id: string }[])[0];
        if (!found) throw new TodoNotFoundError(updateId);

        await conn.execute("delete from todo_updates where id = ?", [updateId]);
        await syncCurrentState(conn, found.todo_id);
        return keys;
      }, "진행 이력을 삭제하지 못했습니다.");
    },

    // ── 이력 첨부 파일 ────────────────────────────────────

    async addUpdateFiles(updateId: string, files: UpdateFileInput[]): Promise<UpdateFile[]> {
      if (files.length === 0) return [];

      return tx(async (conn) => {
        const ids = files.map(() => crypto.randomUUID());
        const values: Param[] = files.flatMap((f, i) => [
          ids[i],
          updateId,
          f.name,
          f.size,
          f.contentType,
          f.storageKey,
        ]);
        try {
          await conn.execute(
            `insert into todo_update_files
               (id, update_id, name, size, content_type, storage_key)
             values ${files.map(() => `(${placeholders(6)})`).join(", ")}`,
            values,
          );
        } catch (error) {
          if (isForeignKey(error)) throw new TodoNotFoundError(updateId);
          throw error;
        }

        const [rows] = await conn.query(
          `select * from todo_update_files
            where id in (${placeholders(ids.length)})
            order by created_at asc, id asc`,
          ids,
        );
        return (rows as UpdateFileRow[]).map(updateFileToDomain);
      }, "첨부 정보를 저장하지 못했습니다.");
    },

    async listUpdateFilesFor(updateIds: string[]): Promise<Record<string, UpdateFile[]>> {
      const out: Record<string, UpdateFile[]> = {};
      for (const id of updateIds) out[id] = [];
      if (updateIds.length === 0) return out;

      const rows = await query<UpdateFileRow>(
        `select * from todo_update_files
          where update_id in (${placeholders(updateIds.length)})
          order by created_at asc`,
        updateIds,
        "첨부 목록을 불러오지 못했습니다.",
      );
      for (const row of rows) (out[row.update_id] ??= []).push(updateFileToDomain(row));
      return out;
    },

    async findUpdateFile(fileId: string): Promise<UpdateFile | null> {
      const rows = await query<UpdateFileRow>(
        "select * from todo_update_files where id = ?",
        [fileId],
        "첨부를 불러오지 못했습니다.",
      );
      return rows[0] ? updateFileToDomain(rows[0]) : null;
    },

    async removeUpdateFile(fileId: string): Promise<string> {
      return tx(async (conn) => {
        const [rows] = await conn.query(
          "select storage_key from todo_update_files where id = ?",
          [fileId],
        );
        const found = (rows as { storage_key: string }[])[0];
        if (!found) throw new TodoNotFoundError(fileId);

        await conn.execute("delete from todo_update_files where id = ?", [fileId]);
        return found.storage_key;
      }, "첨부를 삭제하지 못했습니다.");
    },

    // ── Remind 발송 이력 ──────────────────────────────────

    async recordRemind(entry) {
      await tx(async (conn) => {
        await conn.execute(
          `insert into remind_logs
             (id, todo_id, recipient, recipient_name, recipient_title, status, sent_at)
           values (?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            entry.todoId,
            entry.recipient,
            entry.recipientName ?? "",
            entry.recipientTitle ?? "",
            entry.status,
            entry.status === "sent" ? new Date() : null,
          ],
        );
        // 실패는 wait로 되돌려 재시도할 수 있게 한다.
        await conn.execute("update todos set remind_status = ? where id = ?", [
          entry.status === "sent" ? "sent" : "wait",
          entry.todoId,
        ]);
      }, "발송 이력을 남기지 못했습니다.");
    },

    async listRemindLogs(todoId: string): Promise<RemindLog[]> {
      const rows = await query<RemindLogRow>(
        "select * from remind_logs where todo_id = ? order by created_at desc",
        [todoId],
        "발송 이력을 불러오지 못했습니다.",
      );
      return rows.map((r) => ({
        id: r.id,
        todoId: r.todo_id,
        recipient: r.recipient,
        recipientName: r.recipient_name ?? "",
        recipientTitle: r.recipient_title ?? "",
        status: r.status as RemindLog["status"],
        sentAt: toIsoOrNull(r.sent_at),
        createdAt: toIso(r.created_at),
      }));
    },

    // ── 설정 ──────────────────────────────────────────────

    async getSettings(): Promise<AppSettings> {
      const rows = await query<{
        assistant_name: string | null;
        assistant_email: string | null;
      }>(
        "select assistant_name, assistant_email from app_settings where id = 1",
        [],
        "설정을 불러오지 못했습니다.",
      );
      if (!rows[0]) return { ...EMPTY_SETTINGS };
      return {
        assistantName: rows[0].assistant_name ?? "",
        assistantEmail: rows[0].assistant_email,
      };
    },

    async saveSettings(settings: AppSettings): Promise<void> {
      // 행이 없을 수도 있다. id는 단일 행 고정 키다.
      await run(
        `insert into app_settings (id, assistant_name, assistant_email)
         values (1, ?, ?)
         on duplicate key update
           assistant_name = values(assistant_name),
           assistant_email = values(assistant_email)`,
        [settings.assistantName, settings.assistantEmail],
        "설정을 저장하지 못했습니다.",
      );
    },

    // ── 회의체 마스터 ─────────────────────────────────────

    async listMeetingBodies(): Promise<MeetingBody[]> {
      const rows = await query<MeetingBodyRow>(
        "select * from meeting_bodies order by name, id",
        [],
        "회의체 목록을 불러오지 못했습니다.",
      );
      return rows.map(meetingBodyToDomain);
    },

    async createMeetingBody(input: MeetingBodyInput): Promise<MeetingBody> {
      const name = normalizeMeetingBodyName(input.name);
      const id = crypto.randomUUID();
      try {
        await pool.execute("insert into meeting_bodies (id, name) values (?, ?)", [id, name]);
      } catch (error) {
        if (isDuplicate(error)) throw new DuplicateMeetingBodyError(name);
        throw new RepositoryError("회의체를 저장하지 못했습니다.", { cause: error });
      }

      const rows = await query<MeetingBodyRow>(
        "select * from meeting_bodies where id = ?",
        [id],
        "회의체를 저장하지 못했습니다.",
      );
      return meetingBodyToDomain(rows[0]);
    },

    async updateMeetingBody(id: string, input: MeetingBodyInput): Promise<MeetingBody> {
      const name = normalizeMeetingBodyName(input.name);

      return tx(async (conn) => {
        // 이전 이름을 먼저 읽어둔다 — 지시사항의 표기를 함께 바꿔야 하기 때문.
        const [before] = await conn.query(
          "select name from meeting_bodies where id = ?",
          [id],
        );
        const found = (before as { name: string }[])[0];
        if (!found) throw new TodoNotFoundError(id);
        const previous = found.name;

        try {
          await conn.execute("update meeting_bodies set name = ? where id = ?", [name, id]);
        } catch (error) {
          if (isDuplicate(error)) throw new DuplicateMeetingBodyError(name);
          throw error;
        }

        /*
         * 지시사항은 회의체를 FK가 아니라 텍스트로 들고 있다(필터·집계가 문자열 기준).
         * 마스터만 고치면 기존 건들이 옛 이름으로 남아 사이드바 '회의체별'이
         * 둘로 갈라진다. 이름 변경과 표기 갱신은 한 단위여야 한다.
         */
        if (!isSameMeetingBody(previous, name)) {
          await conn.execute("update todos set meeting_body = ? where meeting_body = ?", [
            name,
            previous,
          ]);
        }

        const [rows] = await conn.query("select * from meeting_bodies where id = ?", [id]);
        return meetingBodyToDomain((rows as MeetingBodyRow[])[0]);
      }, "회의체를 수정하지 못했습니다.");
    },

    async removeMeetingBody(id: string): Promise<void> {
      // 지시사항의 meeting_body는 텍스트라 그대로 남는다 — 과거 기록은 보존한다.
      const affected = await run(
        "delete from meeting_bodies where id = ?",
        [id],
        "회의체를 삭제하지 못했습니다.",
      );
      if (affected === 0) throw new TodoNotFoundError(id);
    },

    async countMeetingBodyUsage(): Promise<Record<string, number>> {
      // "사용 중이라 지울 수 없다"를 판정하는 숫자다. 한 건이라도 빠지면
      // 아직 쓰이는 회의체를 지울 수 있게 되므로 전량을 읽는다.
      const [bodies, todoRows] = await Promise.all([
        query<{ id: string; name: string }>(
          "select id, name from meeting_bodies",
          [],
          "회의체 목록을 불러오지 못했습니다.",
        ),
        query<{ meeting_body: string }>(
          "select meeting_body from todos",
          [],
          "회의체 사용 현황을 세지 못했습니다.",
        ),
      ]);

      // 표기 흔들림을 흡수하려고 정규화 키로 접는다.
      const counts = new Map<string, number>();
      for (const row of todoRows) {
        const key = normalizeMeetingBodyName(row.meeting_body ?? "").toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const out: Record<string, number> = {};
      for (const b of bodies) {
        out[b.id] = counts.get(normalizeMeetingBodyName(b.name).toLowerCase()) ?? 0;
      }
      return out;
    },

    async ensureMeetingBody(name: string): Promise<MeetingBody> {
      const normalized = normalizeMeetingBodyName(name);

      // collation이 대소문자를 무시하므로 = 비교로 찾아진다.
      const found = await query<MeetingBodyRow>(
        "select * from meeting_bodies where name = ? limit 1",
        [normalized],
        "회의체를 조회하지 못했습니다.",
      );
      if (found[0]) return meetingBodyToDomain(found[0]);

      const id = crypto.randomUUID();
      try {
        await pool.execute("insert into meeting_bodies (id, name) values (?, ?)", [
          id,
          normalized,
        ]);
      } catch (error) {
        /*
         * 조회와 삽입 사이에 다른 요청이 같은 이름을 넣었을 수 있다.
         * 이 경로는 지시사항 저장에 딸려 도는 부수 작업이므로,
         * 경합에서 졌다고 저장 자체를 실패시키면 안 된다 — 다시 읽어 돌려준다.
         */
        if (isDuplicate(error)) {
          const retry = await query<MeetingBodyRow>(
            "select * from meeting_bodies where name = ? limit 1",
            [normalized],
            "회의체를 조회하지 못했습니다.",
          );
          if (retry[0]) return meetingBodyToDomain(retry[0]);
        }
        throw new RepositoryError("회의체를 저장하지 못했습니다.", { cause: error });
      }

      const rows = await query<MeetingBodyRow>(
        "select * from meeting_bodies where id = ?",
        [id],
        "회의체를 저장하지 못했습니다.",
      );
      return meetingBodyToDomain(rows[0]);
    },

    // ── 사원 명부 ─────────────────────────────────────────

    async listEmployees(): Promise<Employee[]> {
      // 동명이인이 있으므로 이름만으로는 정렬이 유일하지 않다 — id로 묶어 준다.
      const rows = await query<EmployeeRow>(
        "select id, name, email, department, title from employees order by name, id",
        [],
        "사원 명부를 불러오지 못했습니다.",
      );
      return rows.map(employeeToDomain);
    },

    async replaceEmployees(rows: EmployeeInput[]): Promise<number> {
      /*
       * 전량 교체 — 지우고 넣는다. 한 트랜잭션으로 묶는 것이 핵심이다.
       * Supabase 어댑터는 트랜잭션이 없어 중간 청크가 실패하면 명부가
       * 반쯤 지워진 채 남았다. 여기서는 전부 되돌아간다.
       */
      return tx(async (conn) => {
        await conn.execute("delete from employees");
        if (rows.length === 0) return 0;

        // 한 문장에 다 넣으면 max_allowed_packet에 걸린다. 나눠 넣되 같은 트랜잭션이다.
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK);
          await conn.execute(
            `insert into employees (id, name, email, department, title)
             values ${slice.map(() => `(${placeholders(5)})`).join(", ")}`,
            slice.flatMap((r) => [
              crypto.randomUUID(),
              r.name,
              r.email,
              r.department,
              r.title,
            ]),
          );
        }
        return rows.length;
      }, "명부를 저장하지 못했습니다.");
    },

    async clearEmployees(): Promise<void> {
      await run("delete from employees", [], "명부를 비우지 못했습니다.");
    },

    // ── 지시사항별 추가 수신자 ────────────────────────────

    async listTodoRecipients(todoId: string): Promise<TodoRecipient[]> {
      const rows = await query<{ email: string; name: string }>(
        "select email, name from todo_recipients where todo_id = ? order by name, email",
        [todoId],
        "수신자를 불러오지 못했습니다.",
      );
      return rows.map((r) => ({ email: r.email, name: r.name }));
    },

    async listTodoRecipientsFor(
      todoIds: string[],
    ): Promise<Record<string, TodoRecipient[]>> {
      const out: Record<string, TodoRecipient[]> = {};
      for (const id of todoIds) out[id] = [];
      if (todoIds.length === 0) return out;

      const rows = await query<{ todo_id: string; email: string; name: string }>(
        `select todo_id, email, name from todo_recipients
          where todo_id in (${placeholders(todoIds.length)})`,
        todoIds,
        "수신자를 불러오지 못했습니다.",
      );
      for (const row of rows) {
        (out[row.todo_id] ??= []).push({ email: row.email, name: row.name });
      }
      return out;
    },

    async setTodoRecipients(todoId: string, recipients: TodoRecipient[]): Promise<void> {
      await tx(async (conn) => {
        await conn.execute("delete from todo_recipients where todo_id = ?", [todoId]);
        if (recipients.length === 0) return;

        // 같은 주소를 두 번 넣으면 복합 PK에 걸린다 — 미리 접는다.
        const seen = new Set<string>();
        const rows: Param[][] = recipients.flatMap((r) => {
          const email = r.email.trim();
          const key = email.toLowerCase();
          if (!email || seen.has(key)) return [];
          seen.add(key);
          return [[todoId, email, r.name.trim()]];
        });
        if (rows.length === 0) return;

        await conn.execute(
          `insert into todo_recipients (todo_id, email, name)
           values ${rows.map(() => `(${placeholders(3)})`).join(", ")}`,
          rows.flat(),
        );
      }, "수신자를 저장하지 못했습니다.");
    },
  };
}
