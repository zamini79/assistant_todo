/**
 * Supabase → MariaDB · S3 데이터 이관 (일회성).
 *
 *   npm run migrate:to-mariadb            미리보기 — 아무것도 쓰지 않는다
 *   npm run migrate:to-mariadb -- --commit  실제 이관
 *
 * 양쪽 환경변수가 모두 있어야 한다:
 *   읽기  SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 *   쓰기  MARIADB_HOST · MARIADB_USER · MARIADB_PASSWORD · MARIADB_DATABASE
 *         S3_BUCKET · S3_REGION  (첨부가 있을 때만)
 *
 * 설계상 지키는 것:
 *
 *  · id를 그대로 옮긴다. 리포지토리 포트의 create()는 새 id를 만들어 버리므로
 *    여기서는 SQL로 직접 넣는다. 이관은 앱 코드가 아니라 일회성 도구다.
 *
 *  · 대상이 비어 있을 때만 쓴다. 두 번 돌리면 중복이 생기는 대신 거부된다.
 *
 *  · 한 트랜잭션이다. 중간에 실패하면 아무것도 남지 않는다.
 *
 *  · 파일은 DB보다 먼저 옮긴다. DB에만 있고 실물이 없는 상태가 사용자에게는
 *    "열리지 않는 첨부"로 보인다. 반대(실물만 있고 DB에 없음)는 보이지 않는
 *    쓰레기일 뿐이라 덜 나쁘다.
 */
import mysql from "mysql2/promise";

import { storageKeysOf } from "../lib/domain/todo";
import { createSupabaseTodoRepository } from "../lib/repository/supabase-todo-repository";
import { createS3Storage } from "../lib/storage/s3-storage";
import { createSupabaseStorage } from "../lib/storage/supabase-storage";

const COMMIT = process.argv.includes("--commit");

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`환경변수 ${name} 가 없습니다.`);
    process.exit(1);
  }
  return value;
}

/** 비어 있어야 하는 테이블 — app_settings는 스키마가 기본 행을 만들어 두므로 뺀다. */
const MUST_BE_EMPTY = [
  "todos",
  "todo_updates",
  "todo_update_files",
  "todo_recipients",
  "remind_logs",
  "meeting_bodies",
  "employees",
];

async function main() {
  const source = createSupabaseTodoRepository(
    need("SUPABASE_URL"),
    need("SUPABASE_SERVICE_ROLE_KEY"),
  );

  console.log("Supabase에서 읽는 중…");
  const todos = await source.listAll({});
  const settings = await source.getSettings();
  const meetingBodies = await source.listMeetingBodies();
  const employees = await source.listEmployees();

  // 건수가 적어 지시사항마다 따로 읽어도 된다.
  const updatesByTodo = new Map<string, Awaited<ReturnType<typeof source.listUpdates>>>();
  const logsByTodo = new Map<string, Awaited<ReturnType<typeof source.listRemindLogs>>>();
  const recipientsByTodo = await source.listTodoRecipientsFor(todos.map((t) => t.id));
  for (const todo of todos) {
    updatesByTodo.set(todo.id, await source.listUpdates(todo.id));
    logsByTodo.set(todo.id, await source.listRemindLogs(todo.id));
  }

  const allUpdateIds = [...updatesByTodo.values()].flat().map((u) => u.id);
  const filesByUpdate = await source.listUpdateFilesFor(allUpdateIds);
  const updateFiles = Object.values(filesByUpdate).flat();

  // 옮겨야 할 실물 — 본문 첨부 + 이력 첨부.
  const storageKeys = [
    ...todos.flatMap((t) => storageKeysOf(t.attachments)),
    ...updateFiles.map((f) => f.storageKey),
  ];

  console.log("");
  console.log("옮길 것");
  console.log(`  지시사항        ${todos.length}`);
  console.log(`  진행 이력       ${allUpdateIds.length}`);
  console.log(`  이력 첨부       ${updateFiles.length}`);
  console.log(`  발송 이력       ${[...logsByTodo.values()].flat().length}`);
  console.log(`  추가 수신자     ${Object.values(recipientsByTodo).flat().length}`);
  console.log(`  회의체          ${meetingBodies.length}`);
  console.log(`  사원 명부       ${employees.length}`);
  console.log(`  첨부 실물       ${storageKeys.length}`);
  console.log(`  담당 Assistant  ${settings.assistantName || "(없음)"}`);
  console.log("");

  if (!COMMIT) {
    console.log("미리보기입니다. 실제로 옮기려면 --commit 을 붙이세요.");
    return;
  }

  const pool = mysql.createPool({
    host: need("MARIADB_HOST"),
    port: Number(process.env.MARIADB_PORT?.trim() || 3306),
    user: need("MARIADB_USER"),
    password: process.env.MARIADB_PASSWORD ?? "",
    database: need("MARIADB_DATABASE"),
    ...(process.env.MARIADB_SSL?.trim() === "true"
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
    timezone: "Z",
    connectionLimit: 2,
  });

  try {
    // 두 번 돌려 중복을 만드는 대신 여기서 멈춘다.
    for (const table of MUST_BE_EMPTY) {
      const [rows] = await pool.query(`select count(*) as n from \`${table}\``);
      const n = Number((rows as { n: number | string }[])[0].n);
      if (n > 0) {
        console.error(`${table} 에 이미 ${n}행이 있습니다. 비운 뒤 다시 실행하세요.`);
        process.exit(1);
      }
    }

    // 파일부터. DB에만 있고 실물이 없으면 "열리지 않는 첨부"가 된다.
    if (storageKeys.length > 0) {
      const from = createSupabaseStorage(
        need("SUPABASE_URL"),
        need("SUPABASE_SERVICE_ROLE_KEY"),
      );
      const to = createS3Storage({
        bucket: need("S3_BUCKET"),
        region: process.env.S3_REGION?.trim() || need("AWS_REGION"),
      });

      console.log(`첨부 ${storageKeys.length}건 복사 중…`);
      for (const [i, key] of storageKeys.entries()) {
        const object = await from.get(key);
        await to.put({ key, body: object.body, contentType: object.contentType });
        console.log(`  [${i + 1}/${storageKeys.length}] ${key}`);
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const t of todos) {
        await conn.execute(
          `insert into todos
             (id, instructed_at, due_date, meeting_body, org, assignee_name,
              assignee_title, assignee_email, category, detail, progress_note,
              signal, remind_status, attachments, completed_at, created_at, updated_at)
           values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            t.id,
            t.instructedAt,
            t.dueDate,
            t.meetingBody,
            t.org,
            t.assigneeName,
            t.assigneeTitle,
            t.assigneeEmail,
            t.category,
            t.detail,
            t.progressNote,
            t.signal,
            t.remindStatus,
            JSON.stringify(t.attachments),
            t.completedAt ? new Date(t.completedAt) : null,
            new Date(t.createdAt),
            new Date(t.updatedAt),
          ],
        );
      }

      for (const [todoId, updates] of updatesByTodo) {
        for (const u of updates) {
          await conn.execute(
            `insert into todo_updates (id, todo_id, note, signal, author, created_at)
             values (?,?,?,?,?,?)`,
            [u.id, todoId, u.note, u.signal, u.author, new Date(u.createdAt)],
          );
        }
      }

      for (const f of updateFiles) {
        await conn.execute(
          `insert into todo_update_files
             (id, update_id, name, size, content_type, storage_key, created_at)
           values (?,?,?,?,?,?,?)`,
          [f.id, f.updateId, f.name, f.size, f.contentType, f.storageKey, new Date(f.createdAt)],
        );
      }

      for (const [todoId, logs] of logsByTodo) {
        for (const l of logs) {
          await conn.execute(
            `insert into remind_logs
               (id, todo_id, recipient, recipient_name, recipient_title,
                status, sent_at, created_at)
             values (?,?,?,?,?,?,?,?)`,
            [
              l.id,
              todoId,
              l.recipient,
              l.recipientName,
              l.recipientTitle,
              l.status,
              l.sentAt ? new Date(l.sentAt) : null,
              new Date(l.createdAt),
            ],
          );
        }
      }

      for (const [todoId, list] of Object.entries(recipientsByTodo)) {
        for (const r of list) {
          await conn.execute(
            "insert into todo_recipients (todo_id, email, name) values (?,?,?)",
            [todoId, r.email, r.name],
          );
        }
      }

      for (const b of meetingBodies) {
        await conn.execute(
          "insert into meeting_bodies (id, name, created_at) values (?,?,?)",
          [b.id, b.name, new Date(b.createdAt)],
        );
      }

      for (const e of employees) {
        await conn.execute(
          "insert into employees (id, name, email, department, title) values (?,?,?,?,?)",
          [e.id, e.name, e.email, e.department, e.title],
        );
      }

      await conn.execute(
        `insert into app_settings (id, assistant_name, assistant_email)
         values (1, ?, ?)
         on duplicate key update
           assistant_name = values(assistant_name),
           assistant_email = values(assistant_email)`,
        [settings.assistantName, settings.assistantEmail],
      );

      await conn.commit();
      console.log("");
      console.log("완료했습니다.");
    } catch (error) {
      await conn.rollback().catch(() => undefined);
      throw error;
    } finally {
      conn.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("이관 실패:", error);
  process.exit(1);
});
