import { describe, expect, it } from "vitest";

import { applyFilter, applySort, pageCount, paginate } from "@/lib/domain/query";
import type { Todo } from "@/lib/domain/todo";
import { SEED_TODOS } from "@/lib/seed/todos";

function ids(todos: Todo[]): string[] {
  return todos.map((t) => t.id);
}

describe("applyFilter", () => {
  it("빈 필터는 전체를 통과시킨다", () => {
    expect(applyFilter(SEED_TODOS, {})).toHaveLength(SEED_TODOS.length);
  });

  it("단일 조건", () => {
    const rows = applyFilter(SEED_TODOS, { assigneeName: "박현수 본부장" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.assigneeName === "박현수 본부장")).toBe(true);
  });

  it("여러 조건은 AND로 결합된다", () => {
    const rows = applyFilter(SEED_TODOS, {
      assigneeName: "박현수 본부장",
      category: "이행점검",
    });
    expect(
      rows.every((t) => t.assigneeName === "박현수 본부장" && t.category === "이행점검"),
    ).toBe(true);
  });

  it("지시일 범위는 양끝을 포함한다", () => {
    const rows = applyFilter(SEED_TODOS, { from: "2026-08-05", to: "2026-08-05" });
    expect(rows.every((t) => t.instructedAt === "2026-08-05")).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("일치하는 항목이 없으면 빈 배열", () => {
    expect(applyFilter(SEED_TODOS, { assigneeName: "없는사람" })).toEqual([]);
  });
});

describe("applySort", () => {
  it("완료목표일 오름차순", () => {
    const rows = applySort(SEED_TODOS, { key: "dueDate", dir: "asc" });
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].dueDate <= rows[i].dueDate).toBe(true);
    }
  });

  it("내림차순은 오름차순의 역순 관계를 만족한다", () => {
    const asc = applySort(SEED_TODOS, { key: "dueDate", dir: "asc" });
    const desc = applySort(SEED_TODOS, { key: "dueDate", dir: "desc" });
    expect(desc[0].dueDate).toBe(asc[asc.length - 1].dueDate);
  });

  it("한국어 이름은 가나다순으로 정렬된다", () => {
    const rows = applySort(SEED_TODOS, { key: "assigneeName", dir: "asc" });
    const names = [...new Set(rows.map((t) => t.assigneeName))];
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ko")));
  });

  it("원본 배열을 변형하지 않는다", () => {
    const before = ids(SEED_TODOS);
    applySort(SEED_TODOS, { key: "category", dir: "desc" });
    expect(ids(SEED_TODOS)).toEqual(before);
  });

  it("동률 항목의 순서가 안정적이다 — 페이지 간 중복/누락 방지", () => {
    const a = applySort(SEED_TODOS, { key: "category", dir: "asc" });
    const b = applySort(SEED_TODOS.slice().reverse(), { key: "category", dir: "asc" });
    expect(ids(a)).toEqual(ids(b));
  });
});

describe("paginate", () => {
  it("페이지를 잘라낸다", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });

  it("범위를 넘어가면 빈 배열", () => {
    expect(paginate([1, 2, 3], 9, 2)).toEqual([]);
  });

  it("모든 페이지를 이으면 원본이 된다", () => {
    const rows = applySort(SEED_TODOS, { key: "dueDate", dir: "asc" });
    const size = 12;
    const joined = Array.from({ length: pageCount(rows.length, size) }, (_, i) =>
      paginate(rows, i + 1, size),
    ).flat();
    expect(ids(joined)).toEqual(ids(rows));
  });

  it("0건이어도 페이지는 1", () => {
    expect(pageCount(0, 12)).toBe(1);
  });
});
