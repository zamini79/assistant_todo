/**
 * Excel 다운로드 (README "구현 시 추가로 필요한 것").
 *
 * 외부 의존성 없이 CSV로 내보낸다. UTF-8 BOM을 붙여야 Excel이 한글을 깨뜨리지 않는다.
 * 현재 화면의 필터가 그대로 적용된다.
 */
import { REMIND_LABELS, SIGNAL_LABELS } from "@/lib/domain/todo";
import { applySort } from "@/lib/domain/query";
import { getTodoRepository } from "@/lib/repository";
import { normalizeSearchParams, toFilter, toSort } from "@/lib/ui/search-params";

const HEADERS = [
  "지시일",
  "완료목표일",
  "회의체",
  "조직",
  "이름",
  "지시사항 구분",
  "지시사항 세부 내용",
  "진행상황",
  "진행률(%)",
  "신호등",
  "Remind",
  "첨부",
] as const;

/** RFC 4180 — 큰따옴표는 두 번, 값 전체를 큰따옴표로 감싼다. */
function escapeCsv(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const raw = Object.fromEntries(new URL(request.url).searchParams);
  const params = normalizeSearchParams(raw);

  const todos = applySort(
    await getTodoRepository().listAll(toFilter(params)),
    toSort(params),
  );

  const lines = [
    HEADERS.map(escapeCsv).join(","),
    ...todos.map((t) =>
      [
        t.instructedAt,
        t.dueDate,
        t.meetingBody,
        t.org,
        t.assigneeName,
        t.category,
        t.detail,
        t.progressNote,
        t.progressPct,
        SIGNAL_LABELS[t.signal],
        REMIND_LABELS[t.remindStatus],
        t.attachment?.name ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  const body = `﻿${lines.join("\r\n")}`;
  const filename = `지시사항_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // 한글 파일명은 RFC 5987 형식으로 전달해야 브라우저가 제대로 받는다.
      "Content-Disposition": `attachment; filename="todos.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
