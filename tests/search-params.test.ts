import { describe, expect, it } from "vitest";

import {
  exportHref,
  filterSummary,
  nextSortPatch,
  normalizeSearchParams,
  toFilter,
  toPage,
  toSort,
  toTab,
  todosHref,
} from "@/lib/ui/search-params";

describe("normalizeSearchParams", () => {
  it("배열로 들어와도 첫 값만 취한다", () => {
    expect(normalizeSearchParams({ person: ["A", "B"] })).toEqual({ person: "A" });
  });

  it("빈 문자열과 공백은 버린다", () => {
    expect(normalizeSearchParams({ person: "", meeting: "  " })).toEqual({});
  });

  it("모르는 키는 무시한다", () => {
    expect(normalizeSearchParams({ evil: "x", person: "A" })).toEqual({ person: "A" });
  });
});

describe("toFilter", () => {
  it("파라미터를 도메인 필터로 옮긴다", () => {
    expect(toFilter({ person: "박현수 본부장", meeting: "임원 조회", signal: "R" })).toEqual({
      // status를 안 주면 '미결'이 기본으로 붙는다.
      status: "open",
      assigneeName: "박현수 본부장",
      meetingBody: "임원 조회",
      signal: "R",
    });
  });

  it("기본 상태는 미결 — 완료된 건은 목록에서 빠진다", () => {
    expect(toFilter({}).status).toBe("open");
    expect(toFilter({ status: "done" }).status).toBe("done");
  });

  it("status=all이면 완료 여부로 거르지 않는다", () => {
    expect(toFilter({ status: "all" }).status).toBeUndefined();
  });

  it("알 수 없는 status는 기본값(미결)으로 되돌린다", () => {
    expect(toFilter({ status: "몰라" }).status).toBe("open");
  });

  it("잘못된 신호등 값은 버린다", () => {
    expect(toFilter({ signal: "Z" }).signal).toBeUndefined();
  });

  it("형식이 어긋난 날짜는 버린다", () => {
    expect(toFilter({ from: "어제" }).from).toBeUndefined();
  });
});

describe("toSort / toPage / toTab", () => {
  it("기본값은 완료목표일 오름차순", () => {
    expect(toSort({})).toEqual({ key: "dueDate", dir: "asc" });
  });

  it("허용되지 않은 정렬 키는 기본값으로 되돌린다", () => {
    expect(toSort({ sort: "drop table" }).key).toBe("dueDate");
  });

  it("잘못된 page 값은 1로", () => {
    expect(toPage({ page: "0" })).toBe(1);
    expect(toPage({ page: "abc" })).toBe(1);
    expect(toPage({ page: "3" })).toBe(3);
  });

  it("모르는 탭은 전체로", () => {
    expect(toTab({ tab: "이상한탭" })).toBe("전체");
    expect(toTab({ tab: "개인별" })).toBe("개인별");
  });
});

describe("todosHref", () => {
  it("기존 파라미터를 보존하며 patch를 얹는다", () => {
    const href = todosHref({ person: "A" }, { category: "전략검토" });
    expect(href).toContain("person=A");
    expect(href).toContain("category=%EC%A0%84%EB%9E%B5%EA%B2%80%ED%86%A0");
  });

  it("null은 해당 키를 지운다", () => {
    expect(todosHref({ person: "A", meeting: "M" }, { person: null })).not.toContain("person");
  });

  it("필터가 바뀌면 page를 1로 되돌린다", () => {
    expect(todosHref({ page: "5" }, { person: "A" })).not.toContain("page");
  });

  it("page를 명시하면 그대로 유지한다", () => {
    expect(todosHref({ person: "A" }, { page: "3" })).toContain("page=3");
  });

  it("파라미터가 없으면 물음표 없는 경로", () => {
    expect(todosHref({}, {})).toBe("/todos");
  });
});

describe("nextSortPatch", () => {
  it("같은 열을 다시 누르면 desc로 뒤집는다", () => {
    expect(nextSortPatch({ sort: "dueDate", dir: "asc" }, "dueDate")).toEqual({
      sort: "dueDate",
      dir: "desc",
    });
  });

  it("desc 상태에서 누르면 asc로 돌아온다", () => {
    expect(nextSortPatch({ sort: "dueDate", dir: "desc" }, "dueDate").dir).toBe("asc");
  });

  it("다른 열은 asc로 시작한다", () => {
    expect(nextSortPatch({ sort: "dueDate", dir: "desc" }, "category")).toEqual({
      sort: "category",
      dir: "asc",
    });
  });
});

describe("filterSummary", () => {
  it("필터가 없어도 기본 상태(미결)는 늘 보여준다", () => {
    // 완료분이 왜 목록에 없는지 화면에서 알 수 있어야 한다.
    expect(filterSummary({})).toBe("필터: 미결");
  });

  it("여러 필터를 가운뎃점으로 잇는다", () => {
    expect(filterSummary({ person: "박현수 본부장", category: "전략검토" })).toBe(
      "필터: 미결 · 박현수 본부장 · 전략검토",
    );
  });

  it("완료·전체 보기도 문구에 드러난다", () => {
    expect(filterSummary({ status: "done" })).toBe("필터: 완료");
    expect(filterSummary({ status: "all" })).toBe("필터: 미결 + 완료");
  });

  it("신호등은 라벨로 바꾼다", () => {
    expect(filterSummary({ signal: "R" })).toContain("Red");
  });
});

describe("exportHref", () => {
  it("현재 필터를 물려주되 페이지는 뺀다", () => {
    const href = exportHref({ person: "A", page: "3" });
    expect(href.startsWith("/api/todos/export?")).toBe(true);
    expect(href).toContain("person=A");
    expect(href).not.toContain("page");
  });
});
