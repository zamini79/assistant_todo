/**
 * 사원 명부 — 검색 규칙과 엑셀 파싱.
 */
import { describe, expect, it } from "vitest";

import {
  employeeLabel,
  matchesEmployee,
  normalizeQuery,
  parseRoster,
  searchEmployees,
  toAssignee,
  type Employee,
} from "@/lib/domain/employee";

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: "1",
  name: "홍길동",
  email: "hong@example.com",
  department: "가상1팀",
  title: "Manager",
  ...over,
});

describe("normalizeQuery", () => {
  it("공백을 걷고 소문자로 접는다", () => {
    // 사내 부서 표기가 띄어쓰기가 들쭉날쭉해서 그대로 비교하면 못 찾는다.
    expect(normalizeQuery(" DP2 팀 ")).toBe("dp2팀");
  });
});

describe("matchesEmployee", () => {
  it("이름으로 찾는다", () => {
    expect(matchesEmployee(emp(), "길동")).toBe(true);
  });

  it("부서로도 찾는다", () => {
    expect(matchesEmployee(emp(), "가상1")).toBe(true);
    expect(matchesEmployee(emp(), "가상1팀")).toBe(true);
  });

  it("띄어쓰기가 달라도 찾는다", () => {
    expect(matchesEmployee(emp({ department: "운영지원실 부" }), "운영지원실부")).toBe(true);
  });

  it("직책·이메일로는 찾지 않는다", () => {
    // "Manager"만 쳐도 수백 명이 걸리면 목록이 쓸모없어진다.
    expect(matchesEmployee(emp(), "Manager")).toBe(false);
    expect(matchesEmployee(emp(), "hong")).toBe(false);
  });

  it("빈 검색어는 아무도 걸리지 않는다", () => {
    expect(matchesEmployee(emp(), "  ")).toBe(false);
  });
});

describe("searchEmployees", () => {
  const list = [
    emp({ id: "1", name: "김영업", department: "영업1팀" }),
    emp({ id: "2", name: "박기획", department: "영업1팀" }),
    emp({ id: "3", name: "이영업", department: "생산팀" }),
  ];

  it("이름이 걸린 사람이 부서 일치보다 위로 온다", () => {
    // 이름을 치는 경우가 대부분이라 부서 일치가 위에 오면 원하는 사람이 묻힌다.
    const found = searchEmployees(list, "영업");
    expect(found[0].name).toBe("김영업");
    expect(found[1].name).toBe("이영업");
    expect(found[2].name).toBe("박기획");
  });

  it("빈 검색어는 빈 결과", () => {
    expect(searchEmployees(list, "")).toEqual([]);
  });

  it("상한을 넘지 않는다", () => {
    const many = Array.from({ length: 100 }, (_, i) => emp({ id: `${i}`, name: `김${i}` }));
    expect(searchEmployees(many, "김", 30)).toHaveLength(30);
  });
});

describe("employeeLabel / toAssignee", () => {
  it("부서·이름·직책을 잇는다", () => {
    expect(employeeLabel(emp())).toBe("가상1팀 홍길동 Manager");
  });

  it("지시사항에는 값으로 복사한다", () => {
    // 명부를 FK로 참조하지 않는다 — 연동 시 명부를 비워도 담당자가 남아야 한다.
    expect(toAssignee(emp())).toEqual({
      org: "가상1팀",
      assigneeName: "홍길동",
      assigneeTitle: "Manager",
      assigneeEmail: "hong@example.com",
    });
  });
});

describe("parseRoster", () => {
  const HEADER = ["이름", "email", "부서", "직책"];

  it("헤더 이름으로 열을 찾는다", () => {
    const { rows } = parseRoster([HEADER, ["홍길동", "a@example.com", "가상1팀", "Manager"]]);
    expect(rows).toEqual([
      { name: "홍길동", email: "a@example.com", department: "가상1팀", title: "Manager" },
    ]);
  });

  it("열 순서가 바뀌어도 읽는다", () => {
    // 내보내기 도구가 바뀌어 순서만 달라졌다고 실패하면 안 된다.
    const { rows } = parseRoster([
      ["부서", "이름", "직책", "이메일"],
      ["가상1팀", "홍길동", "Manager", "a@example.com"],
    ]);
    expect(rows[0]).toMatchObject({ name: "홍길동", email: "a@example.com", department: "가상1팀" });
  });

  it("이메일을 소문자로 접는다", () => {
    const { rows } = parseRoster([HEADER, ["홍길동", "A@Example.com", "", ""]]);
    expect(rows[0].email).toBe("a@example.com");
  });

  it("이름·이메일이 없는 줄은 건너뛰고 사유를 남긴다", () => {
    // 한 줄이 잘못됐다고 1천 명짜리 업로드를 통째로 막지 않는다.
    const { rows, skipped } = parseRoster([
      HEADER,
      ["홍길동", "a@example.com", "가상1팀", "Manager"],
      ["", "b@example.com", "", ""],
      ["박기획", "잘못된주소", "", ""],
    ]);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(2);
    expect(skipped[0].reason).toContain("이름");
  });

  it("완전히 빈 줄은 사유를 남기지 않는다", () => {
    // 엑셀 끝에 흔히 붙는다.
    const { rows, skipped } = parseRoster([HEADER, ["", "", "", ""], ["", ""]]);
    expect(rows).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });

  it("중복 이메일은 뒤엣것을 버린다", () => {
    // DB의 unique 인덱스에 걸려 업로드 전체가 실패하는 것보다 낫다.
    const { rows, skipped } = parseRoster([
      HEADER,
      ["홍길동", "a@example.com", "", ""],
      ["다른사람", "A@example.com", "", ""],
    ]);
    expect(rows).toHaveLength(1);
    expect(skipped[0].reason).toContain("중복");
  });

  it("이름·email 열이 없으면 사유를 남기고 아무것도 읽지 않는다", () => {
    const { rows, skipped } = parseRoster([["부서", "직책"], ["가상1팀", "Manager"]]);
    expect(rows).toEqual([]);
    expect(skipped[0].reason).toContain("찾지 못했습니다");
  });

  it("빈 파일", () => {
    expect(parseRoster([]).rows).toEqual([]);
  });
});
