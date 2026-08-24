/**
 * To-do 도메인 모델.
 *
 * 이 파일은 어떤 DB 벤더도 알지 못한다. Supabase → MariaDB 이관 시에도
 * 그대로 남는 계층이므로 SDK 타입을 import 하지 말 것.
 * 컬럼 매핑은 lib/repository/* 어댑터가 담당한다.
 */

export const SIGNALS = ["G", "Y", "R"] as const;
export type Signal = (typeof SIGNALS)[number];

export const REMIND_STATUSES = ["sent", "wait", "none"] as const;
export type RemindStatus = (typeof REMIND_STATUSES)[number];

export const CATEGORIES = [
  "전략검토",
  "자료요청",
  "이행점검",
  "의사결정",
  "대외대응",
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * 첨부 파일 — 현재 범위는 메타데이터만 저장한다.
 * 실제 업로드는 스토리지 계층(추후 S3) 연동 시 `storageKey`를 채워 사용한다.
 */
export type Attachment = {
  name: string;
  size: number;
  storageKey?: string | null;
};

export type Todo = {
  id: string;
  /** 지시일 (YYYY-MM-DD) */
  instructedAt: string;
  /** 완료목표일 (YYYY-MM-DD) */
  dueDate: string;
  meetingBody: string;
  org: string;
  assigneeName: string;
  /** Remind 메일 수신 주소. 모르면 null — 등록은 되지만 발송 대상에서 빠진다. */
  assigneeEmail: string | null;
  category: Category;
  detail: string;
  progressNote: string;
  signal: Signal;
  remindStatus: RemindStatus;
  attachment: Attachment | null;
  /**
   * 완료 시각 (ISO). null이면 미결.
   *
   * 불리언이 아니라 시각으로 두는 이유: "언제 끝났는지"가 보고에 필요하고,
   * 나중에 기간별 완료 건수를 뽑을 때 컬럼을 새로 만들지 않아도 된다.
   */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * 생성·수정 시 클라이언트가 제출하는 필드 집합.
 *
 * completedAt은 일부러 뺐다. 완료는 등록 폼이 아니라 전용 액션으로만 바뀐다 —
 * 폼에 넣으면 완료된 건을 수정 저장할 때 completedAt이 null로 덮여
 * 조용히 미결로 되돌아간다.
 */
export type TodoInput = Omit<Todo, "id" | "createdAt" | "updatedAt" | "completedAt">;

export const SIGNAL_LABELS: Record<Signal, string> = {
  G: "Green",
  Y: "Yellow",
  R: "Red",
};

export const REMIND_LABELS: Record<RemindStatus, string> = {
  sent: "발송완료",
  wait: "발송대기",
  none: "미발송",
};

/*
 * 완료 판정은 completedAt 하나로 한다.
 *
 * 신호등(G/Y/R)은 "지금 잘 굴러가는가"라 완료와 축이 다르고,
 * Remind 상태는 메일을 보냈는지일 뿐이다. 둘 다 완료의 기준이 될 수 없어
 * 별도 필드를 둔다.
 */

export function isDone(todo: Pick<Todo, "completedAt">): boolean {
  return todo.completedAt !== null;
}

export function isOpen(todo: Pick<Todo, "completedAt">): boolean {
  return todo.completedAt === null;
}

/** 미결만 남긴다 — 집계·브리핑·Remind 큐가 공통으로 쓰는 기준 */
export function openOnly<T extends Pick<Todo, "completedAt">>(todos: T[]): T[] {
  return todos.filter(isOpen);
}

export function isSignal(value: unknown): value is Signal {
  return typeof value === "string" && (SIGNALS as readonly string[]).includes(value);
}

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)
  );
}

export function isRemindStatus(value: unknown): value is RemindStatus {
  return (
    typeof value === "string" &&
    (REMIND_STATUSES as readonly string[]).includes(value)
  );
}
