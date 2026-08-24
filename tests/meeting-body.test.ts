/**
 * 회의체 마스터 — 이름 정규화 규칙과 인메모리 어댑터의 계약.
 * Supabase 어댑터도 같은 규칙(정규화 후 저장 · lower(btrim) unique)을 따른다.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  findMeetingBody,
  isSameMeetingBody,
  normalizeMeetingBodyName,
} from "@/lib/domain/settings";
import { validateMeetingBody, validateTodoInput } from "@/lib/domain/validation";
import { createMemoryTodoRepository } from "@/lib/repository/memory-todo-repository";
import {
  DuplicateMeetingBodyError,
  TodoNotFoundError,
  type TodoRepository,
} from "@/lib/repository/todo-repository";
import type { TodoInput } from "@/lib/domain/todo";

const INPUT: TodoInput = {
  instructedAt: "2026-08-12",
  dueDate: "2026-08-20",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "박현수 본부장",
  assigneeEmail: null,
  category: "전략검토",
  detail: "신규 과제",
  progressNote: "",
  signal: "G",
  remindStatus: "wait",
  attachment: null,
};

describe("normalizeMeetingBodyName", () => {
  it("앞뒤 공백을 없앤다", () => {
    expect(normalizeMeetingBodyName("  주간 경영회의  ")).toBe("주간 경영회의");
  });

  it("중간의 연속 공백을 하나로 접는다", () => {
    expect(normalizeMeetingBodyName("주간   경영회의")).toBe("주간 경영회의");
  });

  it("탭·줄바꿈도 공백으로 본다", () => {
    expect(normalizeMeetingBodyName("주간\t경영\n회의")).toBe("주간 경영 회의");
  });
});

describe("isSameMeetingBody", () => {
  it("공백 차이는 무시한다", () => {
    expect(isSameMeetingBody("주간 경영회의", " 주간  경영회의 ")).toBe(true);
  });

  it("영문 대소문자 차이도 무시한다", () => {
    expect(isSameMeetingBody("CEO Review", "ceo review")).toBe(true);
  });

  it("다른 회의체는 구분한다", () => {
    expect(isSameMeetingBody("주간 경영회의", "월간 경영회의")).toBe(false);
  });
});

describe("findMeetingBody", () => {
  const list = [
    { id: "1", name: "주간 경영회의", createdAt: "" },
    { id: "2", name: "CEO Review", createdAt: "" },
  ];

  it("표기가 흔들려도 찾아낸다", () => {
    expect(findMeetingBody(list, " 주간  경영회의 ")?.id).toBe("1");
    expect(findMeetingBody(list, "ceo review")?.id).toBe("2");
  });

  it("없으면 undefined", () => {
    expect(findMeetingBody(list, "임원회의")).toBeUndefined();
  });
});

describe("validateMeetingBody", () => {
  it("정규화된 이름을 돌려준다", () => {
    const result = validateMeetingBody({ name: "  주간   경영회의 " });
    expect(result.ok && result.value.name).toBe("주간 경영회의");
  });

  it("빈 이름은 거부한다", () => {
    const result = validateMeetingBody({ name: "   " });
    expect(result.ok).toBe(false);
  });
});

describe("todoInputSchema — 회의체 정규화", () => {
  it("지시사항의 회의체도 마스터와 같은 규칙으로 접힌다", () => {
    const result = validateTodoInput({ ...INPUT, meetingBody: " 주간   경영회의 " });
    expect(result.ok && result.value.meetingBody).toBe("주간 경영회의");
  });
});

describe("회의체 마스터 (인메모리 어댑터)", () => {
  let repository: TodoRepository;

  beforeEach(() => {
    repository = createMemoryTodoRepository();
  });

  it("추가한 회의체를 가나다순으로 돌려준다", async () => {
    await repository.createMeetingBody({ name: "임원회의" });
    await repository.createMeetingBody({ name: "간부회의" });

    const list = await repository.listMeetingBodies();
    expect(list.map((m) => m.name)).toEqual(["간부회의", "임원회의"]);
  });

  it("이름을 정규화해 저장한다", async () => {
    const created = await repository.createMeetingBody({ name: "  주간   경영회의 " });
    expect(created.name).toBe("주간 경영회의");
  });

  it("표기만 다른 같은 회의체는 중복으로 막는다", async () => {
    await repository.createMeetingBody({ name: "주간 경영회의" });
    await expect(
      repository.createMeetingBody({ name: " 주간  경영회의 " }),
    ).rejects.toBeInstanceOf(DuplicateMeetingBodyError);
  });

  it("이름을 바꾸면 기존 지시사항의 표기도 함께 바뀐다", async () => {
    const created = await repository.createMeetingBody({ name: "주간 경영회의" });
    const todo = await repository.create(INPUT);

    await repository.updateMeetingBody(created.id, { name: "주간 전략회의" });

    const after = await repository.findById(todo.id);
    expect(after?.meetingBody).toBe("주간 전략회의");
  });

  it("수정 시 다른 회의체와 이름이 겹치면 막는다", async () => {
    await repository.createMeetingBody({ name: "주간 경영회의" });
    const second = await repository.createMeetingBody({ name: "임원회의" });

    await expect(
      repository.updateMeetingBody(second.id, { name: "주간 경영회의" }),
    ).rejects.toBeInstanceOf(DuplicateMeetingBodyError);
  });

  it("삭제해도 이미 등록된 지시사항은 남는다 — 선택지에서만 빠진다", async () => {
    const created = await repository.createMeetingBody({ name: "주간 경영회의" });
    const todo = await repository.create(INPUT);

    await repository.removeMeetingBody(created.id);

    expect(await repository.listMeetingBodies()).toEqual([]);
    expect((await repository.findById(todo.id))?.meetingBody).toBe("주간 경영회의");
  });

  it("없는 회의체를 수정·삭제하면 TodoNotFoundError", async () => {
    await expect(repository.removeMeetingBody("없음")).rejects.toBeInstanceOf(
      TodoNotFoundError,
    );
    await expect(
      repository.updateMeetingBody("없음", { name: "임원회의" }),
    ).rejects.toBeInstanceOf(TodoNotFoundError);
  });

  it("회의체별 지시사항 건수를 센다", async () => {
    const weekly = await repository.createMeetingBody({ name: "주간 경영회의" });
    const exec = await repository.createMeetingBody({ name: "임원회의" });
    await repository.create(INPUT);
    await repository.create({ ...INPUT, meetingBody: "주간 경영회의" });

    const usage = await repository.countMeetingBodyUsage();
    expect(usage[weekly.id]).toBe(2);
    expect(usage[exec.id]).toBe(0);
  });

  it("ensureMeetingBody는 없으면 만들고 있으면 기존 것을 준다", async () => {
    const first = await repository.ensureMeetingBody("주간 경영회의");
    // 표기가 흔들려도 새로 만들지 않는다 — 마스터가 갈라지면 사이드바 집계가 쪼개진다.
    const again = await repository.ensureMeetingBody(" 주간  경영회의 ");

    expect(again.id).toBe(first.id);
    expect(await repository.listMeetingBodies()).toHaveLength(1);
  });
});
