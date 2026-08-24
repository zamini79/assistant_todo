/**
 * 리포지토리 포트 (interface).
 *
 * README 기술 전제: "초기 GitHub + Supabase + Vercel → 최종 AWS(CodeCommit / MariaDB / ECS).
 * 따라서 DB 접근은 특정 벤더 SDK에 직접 의존하지 말고 리포지토리 계층으로 감쌀 것."
 *
 * 앱 코드(페이지·서버 액션)는 오직 이 인터페이스만 안다.
 * Supabase SDK import는 supabase-todo-repository.ts 한 파일에만 존재한다.
 * MariaDB 전환 시 이 인터페이스를 구현한 어댑터 하나를 추가하고
 * index.ts의 팩토리 분기만 바꾸면 된다.
 */
import type { Aggregates } from "../domain/aggregate";
import type { Paged, TodoFilter, TodoQuery } from "../domain/query";
import type { Todo, TodoInput } from "../domain/todo";
import type { TodoUpdate, TodoUpdateInput } from "../domain/todo-update";
import type { UpdateFile, UpdateFileInput } from "../domain/attachment";
import type {
  AppSettings,
  MeetingBody,
  MeetingBodyInput,
  Recipient,
  RecipientInput,
} from "../domain/settings";

export type {
  AppSettings,
  MeetingBody,
  MeetingBodyInput,
  Recipient,
  RecipientInput,
  Aggregates,
  Paged,
  Todo,
  TodoFilter,
  TodoInput,
  TodoQuery,
  TodoUpdate,
  TodoUpdateInput,
  UpdateFile,
  UpdateFileInput,
};

export interface TodoRepository {
  /** 필터·정렬·페이지네이션이 모두 적용된 목록 (서버 사이드 처리) */
  list(query: TodoQuery): Promise<Paged<Todo>>;

  /** 필터만 적용된 전체 목록 — 브리핑 화면과 집계 계산에 사용 */
  listAll(filter?: TodoFilter): Promise<Todo[]>;

  findById(id: string): Promise<Todo | null>;

  create(input: TodoInput): Promise<Todo>;

  /** 대상이 없으면 `TodoNotFoundError` */
  update(id: string, input: TodoInput): Promise<Todo>;

  /**
   * 대상이 없으면 `TodoNotFoundError`.
   *
   * 이력에 딸린 첨부의 스토리지 키를 돌려준다 — DB는 cascade로 지워지지만
   * 스토리지 객체는 누가 지워 주지 않으면 그대로 남는다.
   * 호출자가 이 키들을 스토리지에서 지워야 한다.
   */
  remove(id: string): Promise<string[]>;

  /**
   * 완료 처리 / 완료 취소.
   *
   * update()와 나눠 둔다 — 완료는 등록 폼이 다루는 값이 아니라 별도 상태 전이라서,
   * 폼 저장 경로에 섞으면 수정할 때마다 완료가 풀릴 위험이 생긴다.
   * 이미 같은 상태면 시각을 다시 찍지 않는다.
   * 대상이 없으면 `TodoNotFoundError`.
   */
  setCompleted(id: string, done: boolean): Promise<Todo>;

  /**
   * 집계. 현재 두 어댑터 모두 행을 읽어 도메인 함수로 접지만,
   * 건수가 커지면 이 메서드만 SQL GROUP BY로 대체하면 된다.
   */
  aggregate(filter?: TodoFilter): Promise<Aggregates>;

  /** 필터 드롭다운에 채울 선택지 (조직·이름·회의체) */
  options(): Promise<TodoOptions>;

  // ── 진행 이력 ────────────────────────────────────────────

  /** 한 지시사항의 이력 (최신순) */
  listUpdates(todoId: string): Promise<TodoUpdate[]>;

  /**
   * 여러 지시사항의 이력 건수를 한 번에 센다.
   * 표의 각 행에 이력 개수를 보여줄 때 행마다 질의하면 N+1이 되므로 묶어서 받는다.
   */
  countUpdates(todoIds: string[]): Promise<Record<string, number>>;

  /**
   * 이력을 추가하고, 그 값으로 부모 To-do의 현재 상태
   * (progressNote / signal)를 갱신한다.
   * 대상이 없으면 `TodoNotFoundError`.
   */
  addUpdate(todoId: string, input: TodoUpdateInput): Promise<TodoUpdate>;

  /**
   * 이력을 삭제하고 남은 최신 이력으로 부모 상태를 되돌린다.
   * 남은 이력이 없으면 부모의 현재 상태는 그대로 둔다.
   *
   * 첨부의 스토리지 키를 돌려준다 (remove와 같은 이유).
   */
  removeUpdate(updateId: string): Promise<string[]>;

  // ── 이력 첨부 파일 ───────────────────────────────────────

  /** 업로드를 마친 파일의 메타데이터를 이력에 붙인다 */
  addUpdateFiles(updateId: string, files: UpdateFileInput[]): Promise<UpdateFile[]>;

  /**
   * 여러 이력의 첨부를 한 번에 읽는다.
   * 타임라인이 이력마다 질의하면 N+1이 된다.
   */
  listUpdateFilesFor(updateIds: string[]): Promise<Record<string, UpdateFile[]>>;

  /** 다운로드 라우트가 서명 URL을 만들기 위해 하나만 집어 온다 */
  findUpdateFile(fileId: string): Promise<UpdateFile | null>;

  /** 첨부 한 건만 떼어낸다. 스토리지에서 지울 키를 돌려준다. */
  removeUpdateFile(fileId: string): Promise<string>;

  // ── Remind 발송 ──────────────────────────────────────────

  /**
   * 발송 결과를 이력에 남기고 지시사항의 Remind 상태를 갱신한다.
   * 성공하면 `sent`, 실패하면 `wait`로 남겨 다시 시도할 수 있게 한다.
   */
  recordRemind(entry: RemindLogEntry): Promise<void>;

  /** 한 지시사항의 발송 이력 (최신순) */
  listRemindLogs(todoId: string): Promise<RemindLog[]>;

  // ── 설정 ────────────────────────────────────────────────

  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;

  // ── 회의체 마스터 ────────────────────────────────────────

  /** 이름 가나다순 */
  listMeetingBodies(): Promise<MeetingBody[]>;
  /** 같은 이름이 이미 있으면 `DuplicateMeetingBodyError` */
  createMeetingBody(input: MeetingBodyInput): Promise<MeetingBody>;
  /**
   * 이름을 바꾸면 이미 등록된 지시사항의 회의체 표기도 함께 바꾼다.
   * 마스터만 고치면 기존 건들이 옛 이름으로 남아 사이드바 집계가 둘로 갈라진다.
   */
  updateMeetingBody(id: string, input: MeetingBodyInput): Promise<MeetingBody>;
  /**
   * 선택지에서만 뺀다 — 이미 이 회의체로 등록된 지시사항은 그대로 둔다.
   * 해산한 회의체의 과거 기록까지 지울 이유는 없다.
   */
  removeMeetingBody(id: string): Promise<void>;
  /** 회의체별로 몇 건의 지시사항이 걸려 있는지 — 삭제 전 경고에 쓴다 */
  countMeetingBodyUsage(): Promise<Record<string, number>>;
  /**
   * 이름으로 찾고 없으면 만든다.
   * 등록 화면에서 '직접 입력'한 회의체를 마스터에 자동 편입시키는 경로다.
   */
  ensureMeetingBody(name: string): Promise<MeetingBody>;

  // ── 메일 수신자 마스터 ───────────────────────────────────

  /** 이름 가나다순 */
  listRecipients(): Promise<Recipient[]>;
  /** 같은 주소가 이미 있으면 `DuplicateRecipientError` */
  createRecipient(input: RecipientInput): Promise<Recipient>;
  updateRecipient(id: string, input: RecipientInput): Promise<Recipient>;
  removeRecipient(id: string): Promise<void>;
  /** 수신자별로 몇 개의 지시사항에 연결돼 있는지 — 삭제 전 경고에 쓴다 */
  countRecipientUsage(): Promise<Record<string, number>>;

  // ── 지시사항별 추가 수신자 ───────────────────────────────

  listTodoRecipients(todoId: string): Promise<Recipient[]>;
  /**
   * 여러 지시사항의 추가 수신자를 한 번에 읽는다.
   * 표의 각 행이 수정 모달에 기존 수신자를 넘겨야 하는데,
   * 행마다 질의하면 N+1이 된다.
   */
  listTodoRecipientsFor(todoIds: string[]): Promise<Record<string, Recipient[]>>;
  /** 목록을 통째로 교체한다 (없는 것은 지우고 새것은 넣는다) */
  setTodoRecipients(todoId: string, recipientIds: string[]): Promise<void>;
}

export type PersonOption = { name: string; org: string };

export type TodoOptions = {
  meetingBodies: string[];
  orgs: string[];
  people: PersonOption[];
};

/** 저장된 발송 이력 한 건 */
export type RemindLog = {
  id: string;
  todoId: string;
  recipient: string;
  status: "queued" | "sent" | "failed";
  sentAt: string | null;
  createdAt: string;
};

export type RemindLogEntry = {
  todoId: string;
  recipient: string;
  status: "sent" | "failed";
  /** 실패 사유 — 성공이면 없음 */
  error?: string;
};

export class TodoNotFoundError extends Error {
  constructor(id: string) {
    super(`지시사항을 찾을 수 없습니다: ${id}`);
    this.name = "TodoNotFoundError";
  }
}

export class DuplicateRecipientError extends Error {
  constructor(email: string) {
    super(`이미 등록된 이메일입니다: ${email}`);
    this.name = "DuplicateRecipientError";
  }
}

export class DuplicateMeetingBodyError extends Error {
  constructor(name: string) {
    super(`이미 등록된 회의체입니다: ${name}`);
    this.name = "DuplicateMeetingBodyError";
  }
}

export class RepositoryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RepositoryError";
  }
}
