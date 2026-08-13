/**
 * 날짜 유틸. 모든 날짜는 `YYYY-MM-DD` 문자열로만 다룬다.
 *
 * Date 객체를 경유하지 않고 문자열/정수로 계산하므로 서버·클라이언트의
 * 타임존 차이로 D-day가 하루 어긋나는 하이드레이션 오류가 발생하지 않는다.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 사내 기준 타임존 */
const TZ = "Asia/Seoul";

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
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
