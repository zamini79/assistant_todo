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
  category: Category;
  detail: string;
  progressNote: string;
  signal: Signal;
  remindStatus: RemindStatus;
  attachment: Attachment | null;
  createdAt: string;
  updatedAt: string;
};

/** 생성·수정 시 클라이언트가 제출하는 필드 집합 */
export type TodoInput = Omit<Todo, "id" | "createdAt" | "updatedAt">;

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
 * 완료 상태가 없다.
 *
 * 예전에는 진척률 100%를 완료로 봤지만 진척률을 걷어내면서 판정 기준이 사라졌다
 * (프로토타입에도 완료 상태는 없었다). 따라서 집계상 모든 지시사항이 미결이다.
 * 완료 개념이 필요해지면 여기에 명시적인 상태 필드를 추가할 것.
 */

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
