/**
 * lib/seed/todos.ts의 시드 데이터를 supabase/seed.sql로 옮긴다.
 * 시드를 고친 뒤 `npm run db:generate-seed`로 다시 만들면 두 곳이 어긋나지 않는다.
 *
 * Node 24의 기본 타입 스트리핑으로 실행되므로 런타임 import는 두지 않는다
 * (seed 모듈이 값 import 없이 타입만 참조하는 이유).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SEED_TODOS } from "../lib/seed/todos.ts";

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

const rows = SEED_TODOS.map((t) =>
  [
    quote(t.instructedAt),
    quote(t.dueDate),
    quote(t.meetingBody),
    quote(t.org),
    quote(t.assigneeName),
    quote(t.assigneeTitle),
    t.assigneeEmail ? quote(t.assigneeEmail) : "null",
    quote(t.category),
    quote(t.detail),
    quote(t.progressNote),
    quote(t.signal),
    quote(t.remindStatus),
    `${quote(JSON.stringify(t.attachments))}::jsonb`,
  ].join(", "),
);

const sql = `-- 자동 생성 파일 — 직접 수정하지 말 것.
-- 원본: lib/seed/todos.ts · 재생성: npm run db:generate-seed
--
-- ⚠️ 운영 DB에서 실행하지 말 것.
--    아래 truncate가 등록된 지시사항과 진행 이력을 전부 삭제한다.
--    이 파일은 빈 개발 환경을 가상 데이터로 채우는 용도다.

truncate table public.todos cascade;

insert into public.todos
  (instructed_at, due_date, meeting_body, org, assignee_name, assignee_title, assignee_email,
   category, detail, progress_note, signal, remind_status, attachments)
values
${rows.map((r) => `  (${r})`).join(",\n")};
`;

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "seed.sql");
writeFileSync(outPath, sql, "utf8");
console.log(`seed.sql 생성 완료 — ${SEED_TODOS.length}건`);
