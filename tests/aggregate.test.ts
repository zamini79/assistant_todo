import { describe, expect, it } from "vitest";

import {
  aggregate,
  barWidth,
  categoryCounts,
  meetingCounts,
  personStats,
  signalCounts,
} from "@/lib/domain/aggregate";
import { CATEGORIES, type Todo } from "@/lib/domain/todo";
import { SEED_TODOS } from "@/lib/seed/todos";

function make(over: Partial<Todo>): Todo {
  return {
    id: "x",
    instructedAt: "2026-08-01",
    dueDate: "2026-08-10",
    meetingBody: "주간 경영회의",
    org: "영업본부",
    assigneeName: "홍길동",
    category: "전략검토",
    detail: "내용",
    progressNote: "",
    signal: "G",
    remindStatus: "none",
    attachment: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

describe("signalCounts", () => {
  it("신호등별 합이 전체 건수와 같다", () => {
    const counts = signalCounts(SEED_TODOS);
    expect(counts.G + counts.Y + counts.R).toBe(SEED_TODOS.length);
  });

  it("빈 입력은 0으로 채운다", () => {
    expect(signalCounts([])).toEqual({ G: 0, Y: 0, R: 0 });
  });
});

describe("personStats", () => {
  it("완료 상태가 없으므로 모든 건이 집계된다", () => {
    const todos = [
      make({ id: "a", assigneeName: "홍길동" }),
      make({ id: "b", assigneeName: "홍길동" }),
    ];
    const [stat] = personStats(todos);
    expect(stat.open).toBe(2);
  });

  it("누적 막대 폭의 합이 정확히 100이다", () => {
    // 3등분은 반올림하면 33+33+33=99가 되므로 보정이 필요한 대표 케이스
    const todos = [
      make({ id: "a", signal: "G" }),
      make({ id: "b", signal: "Y" }),
      make({ id: "c", signal: "R" }),
    ];
    const [stat] = personStats(todos);
    expect(stat.widths.G + stat.widths.Y + stat.widths.R).toBe(100);
  });

  it("시드 전원의 막대 폭 합이 100이다", () => {
    for (const p of personStats(SEED_TODOS)) {
      expect(p.widths.G + p.widths.Y + p.widths.R).toBe(100);
    }
  });

  it("대표 신호는 가장 나쁜 쪽을 고른다", () => {
    const withRed = personStats([
      make({ id: "a", signal: "G" }),
      make({ id: "b", signal: "R" }),
    ]);
    expect(withRed[0].worst).toBe("R");

    const onlyGreen = personStats([make({ id: "a", signal: "G" })]);
    expect(onlyGreen[0].worst).toBe("G");
  });

  it("미결 건수 내림차순으로 정렬된다", () => {
    const stats = personStats(SEED_TODOS);
    for (let i = 1; i < stats.length; i += 1) {
      expect(stats[i - 1].open >= stats[i].open).toBe(true);
    }
  });

  it("인물별 합계가 전체 건수와 일치한다", () => {
    const total = personStats(SEED_TODOS).reduce((sum, p) => sum + p.open, 0);
    expect(total).toBe(SEED_TODOS.length);
  });
});

describe("categoryCounts", () => {
  it("0건인 구분도 자리를 지킨다", () => {
    const result = categoryCounts([make({ category: "전략검토" })]);
    expect(result).toHaveLength(CATEGORIES.length);
    expect(result.find((c) => c.name === "대외대응")?.count).toBe(0);
  });

  it("합이 전체 건수와 같다", () => {
    const sum = categoryCounts(SEED_TODOS).reduce((s, c) => s + c.count, 0);
    expect(sum).toBe(SEED_TODOS.length);
  });
});

describe("meetingCounts", () => {
  it("회의체별로 센다", () => {
    const todos = [
      make({ id: "a", meetingBody: "임원 조회" }),
      make({ id: "b", meetingBody: "임원 조회" }),
    ];
    expect(meetingCounts(todos)).toEqual([{ name: "임원 조회", count: 2 }]);
  });
});

describe("barWidth", () => {
  it("최대값이 100%가 된다", () => {
    const items = [
      { name: "a", count: 14 },
      { name: "b", count: 7 },
    ];
    expect(barWidth(14, items)).toBe(100);
    expect(barWidth(7, items)).toBe(50);
  });

  it("전부 0이면 0%로 (0 나누기 방지)", () => {
    expect(barWidth(0, [{ name: "a", count: 0 }])).toBe(0);
  });
});

describe("aggregate", () => {
  it("네 종류의 집계를 한 번에 낸다", () => {
    const result = aggregate(SEED_TODOS);
    expect(result.total).toBe(SEED_TODOS.length);
    expect(result.people.length).toBeGreaterThan(0);
    expect(result.meetings.length).toBeGreaterThan(0);
    expect(result.categories).toHaveLength(CATEGORIES.length);
  });
});
