/**
 * 목록 조회 파라미터. 리포지토리 포트가 그대로 받아들이는 형태이며,
 * 인메모리 어댑터는 이 파일의 `applyFilter`/`applySort`를 재사용한다.
 * (Supabase·MariaDB 어댑터는 같은 의미를 SQL로 옮긴다.)
 */
import { isDone, type Signal, type Todo } from "./todo";

/** 완료 여부 필터. 지정하지 않으면 완료·미결을 모두 본다. */
export const TODO_STATUSES = ["open", "done"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value);
}

export const SORT_KEYS = [
  "instructedAt",
  "dueDate",
  "meetingBody",
  "assigneeName",
  "category",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export type Sort = { key: SortKey; dir: SortDir };

export const DEFAULT_SORT: Sort = { key: "dueDate", dir: "asc" };
export const DEFAULT_PAGE_SIZE = 12;

/** 값이 없거나 `undefined`인 항목은 "전체"를 뜻한다. */
export type TodoFilter = {
  meetingBody?: string;
  assigneeName?: string;
  category?: string;
  signal?: Signal;
  /** 완료 여부. 없으면 완료·미결 모두. */
  status?: TodoStatus;
  /** 지시일 범위 (포함) */
  from?: string;
  to?: string;
};

export type TodoQuery = {
  filter: TodoFilter;
  sort: Sort;
  page: number;
  pageSize: number;
};

export type Paged<T> = {
  rows: T[];
  /** 필터 적용 후 총 건수 */
  total: number;
  page: number;
  pageSize: number;
};

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

/**
 * 사용자가 직접 건 필터가 하나도 없는지.
 *
 * status는 일부러 뺀다 — 기본값이 '미결'이라 항상 채워져 있어서,
 * 포함시키면 빈 목록이 늘 "필터를 조정해 보세요"로 안내돼 신규 사용자를 헷갈리게 한다.
 * 완료 여부에 따른 안내는 호출부가 따로 처리한다.
 */
export function isFilterEmpty(filter: TodoFilter): boolean {
  return (
    !filter.meetingBody &&
    !filter.assigneeName &&
    !filter.category &&
    !filter.signal &&
    !filter.from &&
    !filter.to
  );
}

export function applyFilter(todos: Todo[], filter: TodoFilter): Todo[] {
  return todos.filter((t) => {
    if (filter.meetingBody && t.meetingBody !== filter.meetingBody) return false;
    if (filter.assigneeName && t.assigneeName !== filter.assigneeName) return false;
    if (filter.category && t.category !== filter.category) return false;
    if (filter.signal && t.signal !== filter.signal) return false;
    if (filter.status === "open" && isDone(t)) return false;
    if (filter.status === "done" && !isDone(t)) return false;
    if (filter.from && t.instructedAt < filter.from) return false;
    if (filter.to && t.instructedAt > filter.to) return false;
    return true;
  });
}

/**
 * 정렬. 날짜 키는 `YYYY-MM-DD`라 사전순=시간순이므로 문자열 비교로 충분하고,
 * 한국어 텍스트 키는 `localeCompare(…, "ko")`로 자모 순서를 맞춘다 (README 요구).
 * 동률일 때는 완료목표일 → id 순으로 깨서 페이지네이션이 안정적으로 동작하게 한다.
 */
export function applySort(todos: Todo[], sort: Sort): Todo[] {
  const isText = sort.key === "meetingBody" || sort.key === "assigneeName" || sort.key === "category";
  const sign = sort.dir === "desc" ? -1 : 1;

  return todos.slice().sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const primary = isText ? av.localeCompare(bv, "ko") : av < bv ? -1 : av > bv ? 1 : 0;
    if (primary !== 0) return primary * sign;

    const byDue = a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    if (byDue !== 0) return byDue;
    return a.id.localeCompare(b.id);
  });
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return rows.slice(start, start + pageSize);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
