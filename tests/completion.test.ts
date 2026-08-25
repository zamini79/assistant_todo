/**
 * 완료 처리 — 도메인 판정, 필터, 집계 제외, 리포지토리 계약.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { aggregate } from "@/lib/domain/aggregate";
import { applyFilter } from "@/lib/domain/query";
import { isDone, isOpen, openOnly, type Todo, type TodoInput } from "@/lib/domain/todo";
import { toDateOnly } from "@/lib/domain/date";
import {
  completionNote,
  COMPLETION_NOTE_FALLBACK,
  toCurrentState,
} from "@/lib/domain/todo-update";
import { createMemoryTodoRepository } from "@/lib/repository/memory-todo-repository";
import { TodoNotFoundError, type TodoRepository } from "@/lib/repository/todo-repository";

const INPUT: TodoInput = {
  instructedAt: "2026-08-12",
  dueDate: "2026-08-20",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "박현수",
  assigneeTitle: "본부장",
  assigneeEmail: null,
  category: "전략검토",
  detail: "신규 과제",
  progressNote: "",
  signal: "G",
  remindStatus: "wait",
  attachments: [],
};

const todo = (over: Partial<Todo> = {}): Todo => ({
  ...INPUT,
  id: "t1",
  completedAt: null,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
  ...over,
});

describe("완료 판정", () => {
  it("completedAt이 있으면 완료", () => {
    expect(isDone(todo({ completedAt: "2026-08-24T01:00:00.000Z" }))).toBe(true);
    expect(isOpen(todo({ completedAt: "2026-08-24T01:00:00.000Z" }))).toBe(false);
  });

  it("completedAt이 null이면 미결", () => {
    expect(isDone(todo())).toBe(false);
    expect(isOpen(todo())).toBe(true);
  });

  it("openOnly는 완료분을 걷어낸다", () => {
    const list = [todo({ id: "a" }), todo({ id: "b", completedAt: "2026-08-24T01:00:00.000Z" })];
    expect(openOnly(list).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("상태 필터", () => {
  const list = [
    todo({ id: "open1" }),
    todo({ id: "done1", completedAt: "2026-08-24T01:00:00.000Z" }),
  ];

  it("open은 미결만", () => {
    expect(applyFilter(list, { status: "open" }).map((t) => t.id)).toEqual(["open1"]);
  });

  it("done은 완료만", () => {
    expect(applyFilter(list, { status: "done" }).map((t) => t.id)).toEqual(["done1"]);
  });

  it("지정하지 않으면 둘 다", () => {
    expect(applyFilter(list, {})).toHaveLength(2);
  });
});

describe("집계는 완료를 제외한다", () => {
  it("완료된 건은 임원별 미결·회의체·구분 집계에서 빠진다", () => {
    const list = [
      todo({ id: "a" }),
      todo({ id: "b", completedAt: "2026-08-24T01:00:00.000Z" }),
    ];
    const agg = aggregate(list);

    expect(agg.total).toBe(1);
    expect(agg.signalCounts.G).toBe(1);
    expect(agg.people[0].open).toBe(1);
    expect(agg.meetings[0].count).toBe(1);
    expect(agg.categories.find((c) => c.name === "전략검토")?.count).toBe(1);
  });

  it("전부 완료되면 인물 목록 자체가 비고, 사이드바에 미결이 남지 않는다", () => {
    const agg = aggregate([todo({ completedAt: "2026-08-24T01:00:00.000Z" })]);
    expect(agg.people).toEqual([]);
    expect(agg.total).toBe(0);
  });
});

describe("setCompleted (인메모리 어댑터)", () => {
  let repository: TodoRepository;

  beforeEach(() => {
    repository = createMemoryTodoRepository();
  });

  it("새 지시사항은 미결로 시작한다", async () => {
    const created = await repository.create(INPUT);
    expect(created.completedAt).toBeNull();
  });

  it("완료하면 시각이 찍히고, 취소하면 지워진다", async () => {
    const created = await repository.create(INPUT);

    const done = await repository.setCompleted(created.id, true);
    expect(done.completedAt).not.toBeNull();

    const reopened = await repository.setCompleted(created.id, false);
    expect(reopened.completedAt).toBeNull();
  });

  it("두 번 완료해도 완료 시각이 밀리지 않는다", async () => {
    const created = await repository.create(INPUT);
    const first = await repository.setCompleted(created.id, true);
    const second = await repository.setCompleted(created.id, true);
    expect(second.completedAt).toBe(first.completedAt);
  });

  it("완료된 건을 수정 저장해도 완료가 풀리지 않는다", async () => {
    // TodoInput에 completedAt이 없다는 계약을 실제로 검증한다.
    const created = await repository.create(INPUT);
    await repository.setCompleted(created.id, true);

    const edited = await repository.update(created.id, { ...INPUT, detail: "내용 수정" });

    expect(edited.detail).toBe("내용 수정");
    expect(edited.completedAt).not.toBeNull();
  });

  it("목록 조회에서 상태로 거를 수 있다", async () => {
    const a = await repository.create(INPUT);
    await repository.create({ ...INPUT, detail: "두 번째" });
    await repository.setCompleted(a.id, true);

    expect(await repository.listAll({ status: "open" })).toHaveLength(1);
    expect(await repository.listAll({ status: "done" })).toHaveLength(1);
    expect(await repository.listAll()).toHaveLength(2);
  });

  it("없는 지시사항이면 TodoNotFoundError", async () => {
    await expect(repository.setCompleted("없음", true)).rejects.toBeInstanceOf(
      TodoNotFoundError,
    );
  });
});

describe("toDateOnly", () => {
  it("ISO 타임스탬프에서 서울 기준 날짜만 뽑는다", () => {
    // 2026-08-24T15:30Z = 서울 2026-08-25 00:30
    expect(toDateOnly("2026-08-24T15:30:00.000Z")).toBe("2026-08-25");
  });

  it("자정 직전도 날짜가 밀리지 않는다", () => {
    expect(toDateOnly("2026-08-24T01:00:00.000Z")).toBe("2026-08-24");
  });
});

describe("완료하며 남기는 이력의 내용", () => {
  it("코멘트를 그대로 쓴다", () => {
    expect(completionNote("최종 보고서 제출 완료")).toBe("최종 보고서 제출 완료");
  });

  it("앞뒤 공백은 떼어낸다", () => {
    expect(completionNote("  마무리  ")).toBe("마무리");
  });

  it("코멘트가 없으면 빈 값 대신 기본 문구를 쓴다", () => {
    // 빈 문자열이 그대로 들어가면 이 이력이 현재 상태가 되면서
    // 지시사항의 진행상황 칸이 지워진다 (toCurrentState).
    expect(completionNote("")).toBe(COMPLETION_NOTE_FALLBACK);
    expect(completionNote("   ")).toBe(COMPLETION_NOTE_FALLBACK);
  });

  it("기본 문구를 넣어도 진행상황이 비지 않는다", () => {
    const state = toCurrentState([
      {
        id: "u1",
        todoId: "t1",
        note: completionNote(""),
        signal: "G",
        author: null,
        createdAt: "2026-08-25T00:00:00.000Z",
      },
    ]);
    expect(state?.progressNote).not.toBe("");
  });
});
