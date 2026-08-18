/**
 * 인메모리 어댑터가 리포지토리 계약을 지키는지 확인한다.
 * MariaDB 어댑터를 추가할 때 이 파일을 그대로 재사용해 계약 테스트로 돌릴 수 있다.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SORT } from "@/lib/domain/query";
import type { TodoInput } from "@/lib/domain/todo";
import { createMemoryTodoRepository } from "@/lib/repository/memory-todo-repository";
import { TodoNotFoundError, type TodoRepository } from "@/lib/repository/todo-repository";
import { SEED_TODOS } from "@/lib/seed/todos";

const INPUT: TodoInput = {
  instructedAt: "2026-08-12",
  dueDate: "2026-08-20",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "박현수 본부장",
  assigneeEmail: null,
  category: "전략검토",
  detail: "신규 과제",
  progressNote: "미착수",
  signal: "G",
  remindStatus: "wait",
  attachment: null,
};

let repository: TodoRepository;

beforeEach(() => {
  repository = createMemoryTodoRepository(SEED_TODOS);
});

describe("list", () => {
  it("페이지 크기를 지킨다", async () => {
    const page = await repository.list({
      filter: {},
      sort: DEFAULT_SORT,
      page: 1,
      pageSize: 5,
    });
    expect(page.rows).toHaveLength(5);
    expect(page.total).toBe(SEED_TODOS.length);
  });

  it("total은 페이지가 아니라 필터 결과 전체를 센다", async () => {
    const page = await repository.list({
      filter: { assigneeName: "박현수 본부장" },
      sort: DEFAULT_SORT,
      page: 1,
      pageSize: 2,
    });
    const all = await repository.listAll({ assigneeName: "박현수 본부장" });
    expect(page.total).toBe(all.length);
    expect(page.rows.length).toBeLessThanOrEqual(2);
  });
});

describe("create", () => {
  it("id와 타임스탬프를 채워 저장한다", async () => {
    const created = await repository.create(INPUT);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.detail).toBe("신규 과제");

    expect(await repository.findById(created.id)).toMatchObject({ detail: "신규 과제" });
    expect(await repository.listAll()).toHaveLength(SEED_TODOS.length + 1);
  });

  it("연속 생성해도 id가 겹치지 않는다", async () => {
    const a = await repository.create(INPUT);
    const b = await repository.create(INPUT);
    expect(a.id).not.toBe(b.id);
  });
});

describe("update", () => {
  it("필드를 갱신하고 id는 유지한다", async () => {
    const target = SEED_TODOS[0];
    const updated = await repository.update(target.id, {
      ...INPUT,
      detail: "수정된 내용",
    });
    expect(updated.id).toBe(target.id);
    expect(updated.detail).toBe("수정된 내용");
  });

  it("없는 id면 TodoNotFoundError", async () => {
    await expect(repository.update("없는id", INPUT)).rejects.toThrow(TodoNotFoundError);
  });
});

describe("remove", () => {
  it("삭제 후 목록에서 사라진다", async () => {
    await repository.remove(SEED_TODOS[0].id);
    expect(await repository.findById(SEED_TODOS[0].id)).toBeNull();
    expect(await repository.listAll()).toHaveLength(SEED_TODOS.length - 1);
  });

  it("없는 id면 TodoNotFoundError", async () => {
    await expect(repository.remove("없는id")).rejects.toThrow(TodoNotFoundError);
  });
});

describe("격리", () => {
  it("시드 배열을 변형하지 않는다", async () => {
    await repository.update(SEED_TODOS[0].id, { ...INPUT, detail: "덮어쓰기" });
    // 새 리포지토리를 만들면 원래 시드 값이 그대로 나와야 한다.
    const fresh = createMemoryTodoRepository(SEED_TODOS);
    const row = await fresh.findById(SEED_TODOS[0].id);
    expect(row?.detail).not.toBe("덮어쓰기");
  });
});

describe("options", () => {
  it("등록된 데이터에서 선택지를 유도한다", async () => {
    const options = await repository.options();
    expect(options.meetingBodies).toContain("주간 경영회의");
    expect(options.orgs).toContain("영업본부");
    expect(options.people.some((p) => p.name === "박현수 본부장")).toBe(true);
    // 이름은 중복 없이 한 번씩만
    expect(new Set(options.people.map((p) => p.name)).size).toBe(options.people.length);
  });
});
