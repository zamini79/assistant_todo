/**
 * 전체 지시사항 뷰의 URL 상태.
 *
 * 프로토타입은 필터·정렬·탭을 컴포넌트 useState로 들고 있었지만,
 * 실제 구현은 전부 searchParams에 둔다. 서버 사이드 필터링(README 권장)과
 * 자연스럽게 맞물리고, 링크 공유·뒤로가기가 그대로 동작한다.
 */
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  isSortKey,
  type Sort,
  type SortDir,
  type TodoFilter,
  type TodoQuery,
} from "../domain/query";
import { isDateString } from "../domain/date";
import { isSignal } from "../domain/todo";

export const TABS = ["전체", "개인별", "회의체별", "구분별"] as const;
export type Tab = (typeof TABS)[number];

export const TAB_LABELS: Record<Tab, string> = {
  전체: "전체 To-do",
  개인별: "개인별",
  회의체별: "회의체별",
  구분별: "지시사항 구분별",
};

/** Next의 searchParams는 배열도 줄 수 있으므로 원시 형태를 그대로 받는다. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export type TodoSearchParams = {
  tab?: string;
  /** 펼쳐진 지시사항 id — 이력 추가 후 서버 왕복에도 펼침이 유지되도록 URL에 둔다. */
  open?: string;
  person?: string;
  meeting?: string;
  category?: string;
  signal?: string;
  sort?: string;
  dir?: string;
  page?: string;
  from?: string;
  to?: string;
};

const KEYS = [
  "tab",
  "person",
  "meeting",
  "category",
  "signal",
  "sort",
  "dir",
  "page",
  "from",
  "to",
  "open",
] as const;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : undefined;
}

/** 원시 searchParams → 정규화된 평면 객체 (클라이언트 컴포넌트로 넘길 수 있는 형태) */
export function normalizeSearchParams(raw: RawSearchParams): TodoSearchParams {
  const out: TodoSearchParams = {};
  for (const key of KEYS) {
    const value = first(raw[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function toTab(params: TodoSearchParams): Tab {
  return (TABS as readonly string[]).includes(params.tab ?? "")
    ? (params.tab as Tab)
    : "전체";
}

export function toFilter(params: TodoSearchParams): TodoFilter {
  const filter: TodoFilter = {};
  if (params.meeting) filter.meetingBody = params.meeting;
  if (params.person) filter.assigneeName = params.person;
  if (params.category) filter.category = params.category;
  if (isSignal(params.signal)) filter.signal = params.signal;
  if (isDateString(params.from)) filter.from = params.from;
  if (isDateString(params.to)) filter.to = params.to;
  return filter;
}

export function toSort(params: TodoSearchParams): Sort {
  if (!isSortKey(params.sort)) return DEFAULT_SORT;
  const dir: SortDir = params.dir === "desc" ? "desc" : "asc";
  return { key: params.sort, dir };
}

export function toPage(params: TodoSearchParams): number {
  const n = Number(params.page);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function toQuery(
  params: TodoSearchParams,
  pageSize: number = DEFAULT_PAGE_SIZE,
): TodoQuery {
  return {
    filter: toFilter(params),
    sort: toSort(params),
    page: toPage(params),
    pageSize,
  };
}

/** 필터 요약 문구 — "필터: 박현수 본부장 · 전략검토" / "필터 없음 · 전체 보기" */
export function filterSummary(params: TodoSearchParams): string {
  const parts: string[] = [];
  if (params.person) parts.push(params.person);
  if (params.meeting) parts.push(params.meeting);
  if (params.category) parts.push(params.category);
  if (isSignal(params.signal)) {
    parts.push({ G: "Green", Y: "Yellow", R: "Red" }[params.signal]);
  }
  if (params.from || params.to) {
    parts.push(`${params.from ?? "…"} ~ ${params.to ?? "…"}`);
  }
  return parts.length ? `필터: ${parts.join(" · ")}` : "필터 없음 · 전체 보기";
}

export type Patch = Partial<Record<keyof TodoSearchParams, string | null>>;

/**
 * 현재 파라미터에 patch를 얹은 `/todos` 링크를 만든다.
 * 값이 `null`이면 해당 키를 제거한다.
 * 필터·정렬이 바뀌면 페이지는 항상 1로 되돌린다 (patch에 page가 없을 때).
 */
export function todosHref(current: TodoSearchParams, patch: Patch = {}): string {
  const next: TodoSearchParams = { ...current };

  for (const [key, value] of Object.entries(patch) as [keyof TodoSearchParams, string | null][]) {
    if (value === null || value === "") delete next[key];
    else next[key] = value;
  }

  if (!("page" in patch)) delete next.page;

  const search = new URLSearchParams();
  for (const key of KEYS) {
    const value = next[key];
    if (value) search.set(key, value);
  }

  const qs = search.toString();
  return qs ? `/todos?${qs}` : "/todos";
}

/** 현재 필터·정렬을 그대로 물려주는 CSV 내보내기 링크 */
export function exportHref(current: TodoSearchParams): string {
  const qs = todosHref(current, { page: null, open: null }).split("?")[1] ?? "";
  return qs ? `/api/todos/export?${qs}` : "/api/todos/export";
}

/**
 * 행 펼치기/접기 링크. 이미 열려 있으면 닫는다.
 * page를 유지해야 펼친 뒤 목록이 1페이지로 튀지 않는다.
 */
export function toggleOpenHref(current: TodoSearchParams, todoId: string): string {
  const open = current.open === todoId ? null : todoId;
  return todosHref(current, { open, page: current.page ?? null });
}

/** 표 헤더 클릭 시의 다음 정렬 상태 — 같은 열이면 asc/desc 토글 (README 권장) */
export function nextSortPatch(current: TodoSearchParams, key: string): Patch {
  const active = toSort(current);
  const dir = active.key === key && active.dir === "asc" ? "desc" : "asc";
  return { sort: key, dir };
}
