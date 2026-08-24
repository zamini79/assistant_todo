/**
 * 집계 — README "데이터 요구" 절의 4종:
 * 신호등별 건수 / 인물별 미결·GYR 비율 / 회의체별 건수 / 구분별 건수.
 *
 * 순수 함수로 두어 어떤 어댑터에서든 재사용 가능하게 하고, 건수가 커지면
 * 어댑터가 동일한 결과를 SQL GROUP BY로 대체할 수 있게 형태를 고정한다.
 */
import {
  CATEGORIES,
  SIGNALS,
  openOnly,
  type Category,
  type Signal,
  type Todo,
} from "./todo";

export type SignalCounts = Record<Signal, number>;

export type PersonStat = {
  assigneeName: string;
  org: string;
  /** 미결 건수 */
  open: number;
  counts: SignalCounts;
  /** 누적 막대용 폭 (%) — 합이 100이 되도록 보정됨 */
  widths: Record<Signal, number>;
  /** 사이드바 신호등 점에 쓰는 대표 신호 (가장 나쁜 쪽) */
  worst: Signal;
};

export type NamedCount = { name: string; count: number };

export type Aggregates = {
  signalCounts: SignalCounts;
  people: PersonStat[];
  meetings: NamedCount[];
  categories: NamedCount[];
  total: number;
};

function emptySignalCounts(): SignalCounts {
  return { G: 0, Y: 0, R: 0 };
}

export function signalCounts(todos: Todo[]): SignalCounts {
  const acc = emptySignalCounts();
  for (const t of todos) acc[t.signal] += 1;
  return acc;
}

/**
 * 누적 막대 폭. 반올림 오차를 마지막 항목에 몰아 합계를 정확히 100%로 맞춘다.
 * (그러지 않으면 트랙 끝에 1px 틈이 생긴다.)
 */
function toWidths(counts: SignalCounts): Record<Signal, number> {
  const total = counts.G + counts.Y + counts.R;
  if (total === 0) return { G: 0, Y: 0, R: 0 };

  const g = Math.round((counts.G / total) * 100);
  const y = Math.round((counts.Y / total) * 100);
  return { G: g, Y: y, R: 100 - g - y };
}

function worstSignal(counts: SignalCounts): Signal {
  if (counts.R > 0) return "R";
  if (counts.Y > 0) return "Y";
  return "G";
}

/**
 * 인물별 통계. 정렬은 미결 건수 내림차순 → 이름 가나다순.
 * 완료 제외는 aggregate()에서 이미 걸러진 상태로 들어온다.
 */
export function personStats(todos: Todo[]): PersonStat[] {
  const map = new Map<string, { org: string; counts: SignalCounts }>();

  for (const t of todos) {
    const entry = map.get(t.assigneeName) ?? { org: t.org, counts: emptySignalCounts() };
    entry.org = t.org;
    entry.counts[t.signal] += 1;
    map.set(t.assigneeName, entry);
  }

  return [...map.entries()]
    .map(([assigneeName, { org, counts }]) => ({
      assigneeName,
      org,
      open: counts.G + counts.Y + counts.R,
      counts,
      widths: toWidths(counts),
      worst: worstSignal(counts),
    }))
    .sort((a, b) => b.open - a.open || a.assigneeName.localeCompare(b.assigneeName, "ko"));
}

/** 회의체별 건수. 건수 내림차순. */
export function meetingCounts(todos: Todo[]): NamedCount[] {
  const map = new Map<string, number>();
  for (const t of todos) {
    map.set(t.meetingBody, (map.get(t.meetingBody) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}

/** 구분별 건수. 0건인 구분도 자리를 지키도록 전체 구분을 항상 포함한다. */
export function categoryCounts(todos: Todo[]): NamedCount[] {
  const map = new Map<Category, number>(CATEGORIES.map((c) => [c, 0]));
  for (const t of todos) map.set(t.category, (map.get(t.category) ?? 0) + 1);
  return CATEGORIES.map((name) => ({ name, count: map.get(name) ?? 0 })).sort(
    (a, b) => b.count - a.count,
  );
}

/**
 * 사이드바·브리핑이 쓰는 집계.
 *
 * 완료된 건은 모두 뺀다. 이 수치들은 "지금 남은 일"을 보여주는 자리라
 * 끝난 건이 섞이면 임원별 미결 현황도, 회의체별 건수도 실제보다 부풀려진다.
 * 완료분까지 보려면 표에서 상태 필터를 쓴다.
 */
export function aggregate(todos: Todo[]): Aggregates {
  const open = openOnly(todos);
  return {
    signalCounts: signalCounts(open),
    people: personStats(open),
    meetings: meetingCounts(open),
    categories: categoryCounts(open),
    total: open.length,
  };
}

/** 막대 차트 스케일 — 최대값을 100%로 잡는다 (README "최대값 기준 100% 스케일"). */
export function barWidth(count: number, items: NamedCount[]): number {
  const max = items.reduce((m, i) => Math.max(m, i.count), 0);
  return max === 0 ? 0 : Math.round((count / max) * 100);
}

export { SIGNALS };
