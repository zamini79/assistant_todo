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
    quote(t.category),
    quote(t.detail),
    quote(t.progressNote),
    String(t.progressPct),
    quote(t.signal),
    quote(t.remindStatus),
    t.attachment ? `${quote(JSON.stringify(t.attachment))}::jsonb` : "null",
  ].join(", "),
);

const sql = `-- 자동 생성 파일 — 직접 수정하지 말 것.
-- 원본: lib/seed/todos.ts · 재생성: npm run db:generate-seed
--
-- README: "샘플 데이터(인물·회의체·지시 내용)는 전부 가상입니다. 실제 데이터로 교체하세요."

truncate table public.todos cascade;

insert into public.todos
  (instructed_at, due_date, meeting_body, org, assignee_name,
   category, detail, progress_note, progress_pct, signal, remind_status, attachment)
values
${rows.map((r) => `  (${r})`).join(",\n")};
`;

const outPath = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "seed.sql");
writeFileSync(outPath, sql, "utf8");
console.log(`seed.sql 생성 완료 — ${SEED_TODOS.length}건`);
