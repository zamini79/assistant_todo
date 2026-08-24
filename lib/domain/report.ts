/**
 * 주간 리포트 — 사장님 보고용 한 주 요약.
 *
 * 순수 함수로 둔다. 화면(app/report)과 메일 본문(lib/mail/report-template)이
 * 같은 결과를 써야 "화면에서 본 것과 다른 내용이 발송되는" 사고가 안 난다.
 */
import { daysBetween, isWithin, toDateOnly, type DateRange } from "./date";
import { isDone, isOpen, openOnly, type Signal, type Todo } from "./todo";
import { signalCounts, type SignalCounts } from "./aggregate";

/** 마감 임박 기준 — 브리핑 화면과 같은 7일 */
export const DUE_SOON_DAYS = 7;

export type PersonLine = {
  assigneeName: string;
  org: string;
  open: number;
  overdue: number;
  doneThisWeek: number;
  worst: Signal;
};

export type WeeklyReport = {
  range: DateRange;
  /** 리포트를 만든 기준일 — 지연·임박 판정의 기준 */
  today: string;

  /** 기간과 무관한 현재 상태 */
  openTotal: number;
  signalCounts: SignalCounts;

  /** 이 주에 일어난 일 */
  createdThisWeek: Todo[];
  completedThisWeek: Todo[];

  /** 지금 손봐야 하는 것 — 완료된 건은 들어오지 않는다 */
  overdue: Todo[];
  dueSoon: Todo[];

  people: PersonLine[];
};

/** 완료일(ISO)이 이 주에 속하는가. 서울 기준 날짜로 접어서 비교한다. */
function completedWithin(todo: Todo, range: DateRange): boolean {
  return todo.completedAt !== null && isWithin(toDateOnly(todo.completedAt), range);
}

const byDueDate = (a: Todo, b: Todo) => a.dueDate.localeCompare(b.dueDate);

function worstOf(counts: SignalCounts): Signal {
  if (counts.R > 0) return "R";
  if (counts.Y > 0) return "Y";
  return "G";
}

/**
 * 한 주치 리포트를 만든다.
 *
 * `todos`는 완료분까지 포함한 전체를 넘겨야 한다 —
 * "이번 주 완료" 항목이 완료된 건에서만 나오기 때문이다.
 */
export function buildWeeklyReport(
  todos: Todo[],
  range: DateRange,
  today: string,
): WeeklyReport {
  const open = openOnly(todos);

  const overdue = open.filter((t) => daysBetween(today, t.dueDate) < 0).sort(byDueDate);
  const dueSoon = open
    .filter((t) => {
      const d = daysBetween(today, t.dueDate);
      return d >= 0 && d <= DUE_SOON_DAYS;
    })
    .sort(byDueDate);

  const completedThisWeek = todos
    .filter((t) => completedWithin(t, range))
    // 완료가 있는 건만 모였으므로 completedAt은 항상 존재한다.
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));

  const createdThisWeek = todos
    .filter((t) => isWithin(t.instructedAt, range))
    .sort((a, b) => a.instructedAt.localeCompare(b.instructedAt));

  /*
   * 인물별 한 줄.
   * 미결이 하나도 없어도 이번 주에 뭔가 끝냈으면 남긴다 — 성과가 사라지면
   * "이 사람은 한 주 동안 아무것도 안 했다"로 읽힌다.
   */
  const names = new Map<string, { org: string; items: Todo[] }>();
  for (const t of [...open, ...completedThisWeek]) {
    const entry = names.get(t.assigneeName) ?? { org: t.org, items: [] };
    entry.org = t.org;
    entry.items.push(t);
    names.set(t.assigneeName, entry);
  }

  const people: PersonLine[] = [...names.entries()]
    .map(([assigneeName, { org, items }]) => {
      const openItems = items.filter(isOpen);
      return {
        assigneeName,
        org,
        open: openItems.length,
        overdue: openItems.filter((t) => daysBetween(today, t.dueDate) < 0).length,
        doneThisWeek: items.filter((t) => isDone(t) && completedWithin(t, range)).length,
        worst: worstOf(signalCounts(openItems)),
      };
    })
    .sort(
      (a, b) =>
        b.overdue - a.overdue ||
        b.open - a.open ||
        a.assigneeName.localeCompare(b.assigneeName, "ko"),
    );

  return {
    range,
    today,
    openTotal: open.length,
    signalCounts: signalCounts(open),
    createdThisWeek,
    completedThisWeek,
    overdue,
    dueSoon,
    people,
  };
}

/** 보고서 상단 수치 — 화면과 메일이 같은 순서로 쓴다 */
export function reportHighlights(
  report: WeeklyReport,
): { label: string; value: number }[] {
  return [
    { label: "미결", value: report.openTotal },
    { label: "지연", value: report.overdue.length },
    { label: `마감임박 (${DUE_SOON_DAYS}일)`, value: report.dueSoon.length },
    { label: "이번 주 신규", value: report.createdThisWeek.length },
    { label: "이번 주 완료", value: report.completedThisWeek.length },
  ];
}
