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

export type {
  Aggregates,
  Paged,
  Todo,
  TodoFilter,
  TodoInput,
  TodoQuery,
  TodoUpdate,
  TodoUpdateInput,
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

  /** 대상이 없으면 `TodoNotFoundError` */
  remove(id: string): Promise<void>;

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
   * (progressNote / progressPct / signal)를 갱신한다.
   * 대상이 없으면 `TodoNotFoundError`.
   */
  addUpdate(todoId: string, input: TodoUpdateInput): Promise<TodoUpdate>;

  /**
   * 이력을 삭제하고 남은 최신 이력으로 부모 상태를 되돌린다.
   * 남은 이력이 없으면 부모의 현재 상태는 그대로 둔다.
   */
  removeUpdate(updateId: string): Promise<void>;
}

export type PersonOption = { name: string; org: string };

export type TodoOptions = {
  meetingBodies: string[];
  orgs: string[];
  people: PersonOption[];
};

export class TodoNotFoundError extends Error {
  constructor(id: string) {
    super(`지시사항을 찾을 수 없습니다: ${id}`);
    this.name = "TodoNotFoundError";
  }
}

export class RepositoryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RepositoryError";
  }
}
