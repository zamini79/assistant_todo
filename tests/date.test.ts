import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  dueLabel,
  isOverdue,
  toHeaderDate,
  toShortDate,
  today,
} from "@/lib/domain/date";

describe("daysBetween", () => {
  it("같은 달 안의 차이를 센다", () => {
    expect(daysBetween("2026-08-12", "2026-08-14")).toBe(2);
  });

  it("월·연을 넘어가도 정확하다", () => {
    expect(daysBetween("2026-07-29", "2026-08-08")).toBe(10);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("윤년 2월을 처리한다", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("과거는 음수", () => {
    expect(daysBetween("2026-08-12", "2026-08-08")).toBe(-4);
  });
});

describe("dueLabel", () => {
  it("미래는 D-n", () => {
    expect(dueLabel("2026-08-14", "2026-08-12")).toBe("D-2");
  });

  it("당일은 D-DAY", () => {
    expect(dueLabel("2026-08-12", "2026-08-12")).toBe("D-DAY");
  });

  it("과거는 경과일 (프로토타입 '4일 경과'와 동일)", () => {
    expect(dueLabel("2026-08-08", "2026-08-12")).toBe("4일 경과");
  });
});

describe("isOverdue", () => {
  it("완료목표일 당일은 아직 지연이 아니다", () => {
    expect(isOverdue("2026-08-12", "2026-08-12")).toBe(false);
    expect(isOverdue("2026-08-11", "2026-08-12")).toBe(true);
  });
});

describe("toHeaderDate", () => {
  it("프로토타입 헤더 문자열을 재현한다", () => {
    // 프로토타입 마크업: "2026. 08. 12 &nbsp;WED" — 일반 공백 + 비분리 공백
    expect(toHeaderDate("2026-08-12")).toBe("2026. 08. 12 \u00a0WED");
  });

  it("요일 계산이 다른 날짜에서도 맞다", () => {
    expect(toHeaderDate("2026-01-01")).toContain("THU");
    expect(toHeaderDate("2026-08-16")).toContain("SUN");
  });
});

describe("보조 함수", () => {
  it("toShortDate는 MM-DD를 낸다", () => {
    expect(toShortDate("2026-08-14")).toBe("08-14");
  });

  it("addDays는 월 경계를 넘는다", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("today는 YYYY-MM-DD 형식", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("today는 서울 기준이다", () => {
    // UTC로는 2026-08-11T23:00Z 이지만 서울은 이미 8/12 08:00
    expect(today(new Date("2026-08-11T23:00:00Z"))).toBe("2026-08-12");
  });
});
