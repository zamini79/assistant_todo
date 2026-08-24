/**
 * 날짜 유틸. 모든 날짜는 `YYYY-MM-DD` 문자열로만 다룬다.
 *
 * Date 객체를 경유하지 않고 문자열/정수로 계산하므로 서버·클라이언트의
 * 타임존 차이로 D-day가 하루 어긋나는 하이드레이션 오류가 발생하지 않는다.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 사내 기준 타임존 */
const TZ = "Asia/Seoul";

/**
 * `YYYY-MM-DD`이면서 실제로 존재하는 날짜인가.
 *
 * 형태만 보면 `2026-13-99`도 통과하는데, Date가 이를 2027년으로 굴려 버려
 * 필터·리포트가 엉뚱한 기간을 조용히 가리킨다. 되돌려 만든 문자열이
 * 원본과 같은지 확인해 굴러간 값을 걸러낸다.
 */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.toISOString().slice(0, 10) === value;
}

/** `YYYY-MM-DD` → 1970-01-01 기준 일수. 유효하지 않으면 NaN. */
export function toEpochDay(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) return Number.NaN;
  const [, y, mo, d] = m;
  return Math.floor(Date.UTC(Number(y), Number(mo) - 1, Number(d)) / 86_400_000);
}

/** b - a (일). 양수면 b가 미래. */
export function daysBetween(a: string, b: string): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** 서울 기준 오늘 (`YYYY-MM-DD`) */
export function today(now: Date = new Date()): string {
  // en-CA 로케일은 YYYY-MM-DD 형식을 그대로 내준다.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

export function addDays(date: string, days: number): string {
  const ms = (toEpochDay(date) + days) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 완료목표일 기준 D-라벨.
 * 미래는 `D-3`, 당일은 `D-DAY`, 과거는 `4일 경과`.
 */
export function dueLabel(dueDate: string, base: string): string {
  const diff = daysBetween(base, dueDate);
  if (!Number.isFinite(diff)) return "";
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `${-diff}일 경과`;
}

/** 완료목표일이 기준일보다 과거인가 */
export function isOverdue(dueDate: string, base: string): boolean {
  return daysBetween(base, dueDate) < 0;
}

/** `2026-08-14` → `08-14` (Remind 큐 등 짧은 표기용) */
export function toShortDate(date: string): string {
  return isDateString(date) ? date.slice(5) : date;
}

/**
 * ISO 타임스탬프 → `2026-08-13 14:30` (서울 기준).
 *
 * 진행 이력 타임라인 표시용. 서버에서만 렌더하지만, 서버·클라이언트가 갈려도
 * 같은 문자열이 나오도록 타임존을 고정한다 (하이드레이션 불일치 방지).
 */
export function toDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // en-CA는 24시 표기에서 자정을 "24"로 낼 수 있어 "00"으로 보정한다.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}

/**
 * ISO 타임스탬프 → `2026-08-24` (서울 기준).
 *
 * completedAt처럼 시각까지 들고 있지만 화면에는 날짜만 보이면 되는 값에 쓴다.
 * toShortDate는 `YYYY-MM-DD`만 받으므로 ISO를 그대로 넣으면 원문이 그대로 나온다 —
 * 반드시 이 함수를 거칠 것.
 */
export function toDateOnly(iso: string): string {
  const at = toDateTime(iso);
  return at.length >= 10 ? at.slice(0, 10) : at;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/**
 * `2026-08-12` → `2026. 08. 12 <NBSP>WED` (브리핑 헤더용).
 *
 * 날짜와 요일 사이는 프로토타입의 `&nbsp;`를 따라 일반 공백 + 비분리 공백(U+00A0)이다.
 * 일반 공백 두 개로 두면 HTML이 하나로 합쳐 간격이 좁아진다.
 */
export function toHeaderDate(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  // 1970-01-01은 목요일이므로 THU(index 4)를 기준으로 요일을 센다.
  const weekday = WEEKDAYS[(((toEpochDay(date) + 4) % 7) + 7) % 7];
  return `${y}. ${mo}. ${d} \u00a0${weekday}`;
}

/**
 * 그 날짜가 속한 주의 월요일 (`YYYY-MM-DD`).
 *
 * 주간 리포트의 기간 기준이다. 사내 보고는 월~일 한 주로 끊으므로 월요일 시작으로 둔다.
 * 1970-01-01(epochDay 0)이 목요일이라, 월요일을 0으로 놓으면 목요일이 3이 된다.
 */
export function weekStart(date: string): string {
  const day = toEpochDay(date);
  if (!Number.isFinite(day)) return date;
  const mondayIndex = (((day + 3) % 7) + 7) % 7;
  return addDays(date, -mondayIndex);
}

export type DateRange = { start: string; end: string };

/** 그 날짜가 속한 주(월~일) */
export function weekRange(date: string): DateRange {
  const start = weekStart(date);
  return { start, end: addDays(start, 6) };
}

/** from ≤ date ≤ to (모두 `YYYY-MM-DD`, 경계 포함) */
export function isWithin(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** `2026-08-24` → `8월 24일` */
export function toKoreanDate(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) return date;
  const [, , mo, d] = m;
  return `${Number(mo)}월 ${Number(d)}일`;
}

/** `{2026-08-24, 2026-08-30}` → `2026년 8월 24일 ~ 8월 30일` */
export function formatRange(range: DateRange): string {
  const y = range.start.slice(0, 4);
  return `${y}년 ${toKoreanDate(range.start)} ~ ${toKoreanDate(range.end)}`;
}
