import { beforeEach, describe, expect, it } from "vitest";

import { toDateTime } from "@/lib/domain/date";
import {
  signalChanges,
  sortByNewest,
  toCurrentState,
  type TodoUpdate,
} from "@/lib/domain/todo-update";
import { validateTodoUpdateInput } from "@/lib/domain/validation";
import { createMemoryTodoRepository } from "@/lib/repository/memory-todo-repository";
import { TodoNotFoundError, type TodoRepository } from "@/lib/repository/todo-repository";
import { SEED_TODOS, SEED_TODO_UPDATES } from "@/lib/seed/todos";

function upd(over: Partial<TodoUpdate>): TodoUpdate {
  return {
    id: "u1",
    todoId: "t1",
    note: "메모",
    progressPct: 10,
    signal: "G",
    author: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

describe("sortByNewest", () => {
  it("최신이 먼저 온다", () => {
    const rows = sortByNewest([
      upd({ id: "a", createdAt: "2026-08-01T00:00:00.000Z" }),
      upd({ id: "c", createdAt: "2026-08-03T00:00:00.000Z" }),
      upd({ id: "b", createdAt: "2026-08-02T00:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("같은 시각이면 id로 순서를 고정한다", () => {
    const same = "2026-08-01T00:00:00.000Z";
    const a = sortByNewest([upd({ id: "x", createdAt: same }), upd({ id: "y", createdAt: same })]);
    const b = sortByNewest([upd({ id: "y", createdAt: same }), upd({ id: "x", createdAt: same })]);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it("원본을 변형하지 않는다", () => {
    const input = [upd({ id: "a" }), upd({ id: "b", createdAt: "2026-09-01T00:00:00.000Z" })];
    sortByNewest(input);
    expect(input.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("toCurrentState", () => {
  it("가장 최근 이력을 현재 상태로 접는다", () => {
    const state = toCurrentState([
      upd({ id: "old", createdAt: "2026-08-01T00:00:00.000Z", note: "옛것", progressPct: 10, signal: "G" }),
      upd({ id: "new", createdAt: "2026-08-05T00:00:00.000Z", note: "최신", progressPct: 80, signal: "R" }),
    ]);
    expect(state).toEqual({ progressNote: "최신", progressPct: 80, signal: "R" });
  });

  it("이력이 없으면 null (호출자가 기존 값을 유지)", () => {
    expect(toCurrentState([])).toBeNull();
  });
});

describe("signalChanges", () => {
  it("신호등이 바뀐 지점만 남긴다", () => {
    const changes = signalChanges([
      upd({ id: "1", createdAt: "2026-08-01T00:00:00.000Z", signal: "G" }),
      upd({ id: "2", createdAt: "2026-08-02T00:00:00.000Z", signal: "G" }),
      upd({ id: "3", createdAt: "2026-08-03T00:00:00.000Z", signal: "Y" }),
      upd({ id: "4", createdAt: "2026-08-04T00:00:00.000Z", signal: "R" }),
      upd({ id: "5", createdAt: "2026-08-05T00:00:00.000Z", signal: "R" }),
    ]);
    expect(changes.map((c) => `${c.id}:${c.signal}`)).toEqual(["1:G", "3:Y", "4:R"]);
  });
});

describe("toDateTime", () => {
  it("서울 기준으로 포매팅한다", () => {
    // UTC 05:30 → 서울 14:30
    expect(toDateTime("2026-08-13T05:30:00.000Z")).toBe("2026-08-13 14:30");
  });

  it("날짜 경계를 넘긴다", () => {
    expect(toDateTime("2026-08-12T23:00:00.000Z")).toBe("2026-08-13 08:00");
  });

  it("자정을 00시로 낸다", () => {
    expect(toDateTime("2026-08-12T15:00:00.000Z")).toBe("2026-08-13 00:00");
  });

  it("깨진 값은 그대로 돌려준다", () => {
    expect(toDateTime("이상한값")).toBe("이상한값");
  });
});

describe("validateTodoUpdateInput", () => {
  it("정상 입력을 통과시킨다", () => {
    const r = validateTodoUpdateInput({ note: "진행함", progressPct: "45", signal: "Y" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.progressPct).toBe(45);
  });

  it("빈 내용을 막는다", () => {
    expect(validateTodoUpdateInput({ note: "  ", progressPct: "0", signal: "G" }).ok).toBe(false);
  });

  it("진행률 범위를 강제한다", () => {
    expect(validateTodoUpdateInput({ note: "x", progressPct: "101", signal: "G" }).ok).toBe(false);
  });

  it("허용되지 않은 신호등을 막는다", () => {
    expect(validateTodoUpdateInput({ note: "x", progressPct: "0", signal: "X" }).ok).toBe(false);
  });
});

describe("리포지토리 이력 계약", () => {
  let repository: TodoRepository;
  const todoId = SEED_TODOS[0].id;

  beforeEach(() => {
    repository = createMemoryTodoRepository(SEED_TODOS, SEED_TODO_UPDATES);
  });

  it("시드는 진행상황이 있는 건마다 첫 이력을 갖는다", async () => {
    const updates = await repository.listUpdates(todoId);
    expect(updates).toHaveLength(1);
    expect(updates[0].note).toBe(SEED_TODOS[0].progressNote);
  });

  it("이력을 추가하면 최신순 맨 앞에 온다", async () => {
    await repository.addUpdate(todoId, { note: "두 번째", progressPct: 60, signal: "Y" });
    const updates = await repository.listUpdates(todoId);
    expect(updates).toHaveLength(2);
    expect(updates[0].note).toBe("두 번째");
  });

  it("이력 추가가 지시사항의 현재 상태를 갱신한다", async () => {
    await repository.addUpdate(todoId, { note: "재무 협의 완료", progressPct: 90, signal: "G" });
    const todo = await repository.findById(todoId);
    expect(todo).toMatchObject({
      progressNote: "재무 협의 완료",
      progressPct: 90,
      signal: "G",
    });
  });

  it("이력을 지우면 남은 최신 이력으로 현재 상태가 되돌아간다", async () => {
    const first = await repository.addUpdate(todoId, { note: "1차", progressPct: 30, signal: "Y" });
    const second = await repository.addUpdate(todoId, { note: "2차", progressPct: 70, signal: "R" });

    expect((await repository.findById(todoId))?.progressNote).toBe("2차");

    await repository.removeUpdate(second.id);
    expect(await repository.findById(todoId)).toMatchObject({
      progressNote: "1차",
      progressPct: 30,
      signal: "Y",
    });

    // 첫 이력을 지워도 시드 이력이 남아 있으므로 상태는 유지된다.
    await repository.removeUpdate(first.id);
    expect((await repository.findById(todoId))?.progressNote).toBe(
      SEED_TODOS[0].progressNote,
    );
  });

  it("없는 지시사항에는 이력을 못 붙인다", async () => {
    await expect(
      repository.addUpdate("없는id", { note: "x", progressPct: 0, signal: "G" }),
    ).rejects.toThrow(TodoNotFoundError);
  });

  it("없는 이력 삭제는 실패한다", async () => {
    await expect(repository.removeUpdate("없는id")).rejects.toThrow(TodoNotFoundError);
  });

  it("지시사항을 지우면 이력도 함께 사라진다 (ON DELETE CASCADE와 동일)", async () => {
    await repository.addUpdate(todoId, { note: "곧 사라짐", progressPct: 10, signal: "G" });
    await repository.remove(todoId);
    expect(await repository.listUpdates(todoId)).toEqual([]);
  });

  it("countUpdates는 요청한 id를 빠짐없이 채운다", async () => {
    const ids = SEED_TODOS.slice(0, 3).map((t) => t.id);
    const counts = await repository.countUpdates(ids);
    expect(Object.keys(counts).sort()).toEqual(ids.slice().sort());
    expect(counts[todoId]).toBe(1);
  });

  it("countUpdates는 이력 없는 건을 0으로 낸다", async () => {
    const noNote = SEED_TODOS.find((t) => t.progressNote.trim() === "");
    if (noNote) expect((await repository.countUpdates([noNote.id]))[noNote.id]).toBe(0);
    expect(await repository.countUpdates([])).toEqual({});
  });

  it("시드 배열을 변형하지 않는다", async () => {
    await repository.addUpdate(todoId, { note: "변경", progressPct: 99, signal: "R" });
    const fresh = createMemoryTodoRepository(SEED_TODOS, SEED_TODO_UPDATES);
    expect((await fresh.listUpdates(todoId))).toHaveLength(1);
    expect((await fresh.findById(todoId))?.progressPct).toBe(SEED_TODOS[0].progressPct);
  });
});
