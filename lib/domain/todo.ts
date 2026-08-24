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
 * 지시사항 첨부 파일.
 *
 * 실물은 스토리지(lib/storage)에, 메타데이터만 여기에 둔다 — 이력 첨부와 같은 방식이다.
 *
 * 별도 테이블이 아니라 todos.attachments(jsonb 배열)에 담는다.
 * 표·브리핑·CSV가 이미 지시사항 행에서 첨부를 바로 읽고 있어서,
 * 테이블로 빼면 화면마다 조인이나 별도 조회(N+1)가 붙는다.
 *
 * storageKey가 없는 건은 실물 저장 이전에 등록된 옛 데이터다.
 * 이름만 알고 파일은 없으므로 다운로드 링크를 걸어서는 안 된다 (isStored로 가른다).
 */
export type Attachment = {
  /** 배열 안에서 한 건을 가리키는 키 — 다운로드·삭제에 쓴다 */
  id: string;
  name: string;
  size: number;
  contentType?: string | null;
  storageKey?: string | null;
};

/** 실제 파일이 저장돼 있어 내려받을 수 있는 첨부인가 */
/**
 * 메일 호칭 — "홍길동 팀장님".
 * 직책이 없으면 이름만 쓴다 (옛 데이터·직책 미상).
 */
export function assigneeSalutation(
  todo: Pick<Todo, "assigneeName" | "assigneeTitle">,
): string {
  const title = todo.assigneeTitle.trim();
  return title ? `${todo.assigneeName} ${title}님` : `${todo.assigneeName}님`;
}

export function isStored(
  attachment: Attachment | null | undefined,
): attachment is Attachment & { storageKey: string } {
  return Boolean(attachment?.storageKey);
}

/** 지시사항이 안고 있는 첨부의 스토리지 키 (실물 있는 것만) */
export function storageKeysOf(attachments: Attachment[]): string[] {
  return attachments.map((a) => a.storageKey).filter((k): k is string => Boolean(k));
}

export type Todo = {
  id: string;
  /** 지시일 (YYYY-MM-DD) */
  instructedAt: string;
  /** 완료목표일 (YYYY-MM-DD) */
  dueDate: string;
  meetingBody: string;
  org: string;
  assigneeName: string;
  /**
   * 담당자 직책. 사원 명부에서 복사한 값.
   *
   * 옛 데이터는 비어 있다 — 이름 안에 이미 직책이 섞여 있는 경우가 있어
   * (예: "홍길동 실장") 기계적으로 쪼개지 않았다.
   */
  assigneeTitle: string;
  /** Remind 메일 수신 주소. 모르면 null — 등록은 되지만 발송 대상에서 빠진다. */
  assigneeEmail: string | null;
  category: Category;
  detail: string;
  progressNote: string;
  signal: Signal;
  remindStatus: RemindStatus;
  attachments: Attachment[];
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
