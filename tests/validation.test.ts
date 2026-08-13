import { describe, expect, it } from "vitest";

import { validateTodoInput } from "@/lib/domain/validation";

const VALID = {
  instructedAt: "2026-08-12",
  dueDate: "2026-08-20",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "박현수 본부장",
  category: "전략검토",
  detail: "동남아 신규 채널 진입안",
  progressNote: "초안 작성 중",
  signal: "Y",
  remindStatus: "wait",
  attachment: null,
};

describe("validateTodoInput", () => {
  it("정상 입력을 통과시킨다", () => {
    const result = validateTodoInput(VALID);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["instructedAt", "지시일"],
    ["dueDate", "완료목표일"],
    ["meetingBody", "회의체"],
    ["org", "조직"],
    ["assigneeName", "이름"],
    ["detail", "지시사항 세부 내용"],
  ])("필수 항목 %s 누락 시 실패한다", (field) => {
    const result = validateTodoInput({ ...VALID, [field]: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field as keyof typeof result.errors]).toBeTruthy();
  });

  it("공백만 있는 값은 빈 값으로 본다", () => {
    const result = validateTodoInput({ ...VALID, detail: "   " });
    expect(result.ok).toBe(false);
  });

  it("완료목표일이 지시일보다 빠르면 실패한다", () => {
    const result = validateTodoInput({
      ...VALID,
      instructedAt: "2026-08-20",
      dueDate: "2026-08-12",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dueDate).toContain("빠를 수 없습니다");
  });

  it("같은 날짜는 허용한다", () => {
    expect(
      validateTodoInput({ ...VALID, instructedAt: "2026-08-12", dueDate: "2026-08-12" }).ok,
    ).toBe(true);
  });

  it("허용되지 않은 구분·신호등을 막는다", () => {
    expect(validateTodoInput({ ...VALID, category: "기타" }).ok).toBe(false);
    expect(validateTodoInput({ ...VALID, signal: "X" }).ok).toBe(false);
  });

  it("잘못된 날짜 형식을 막는다", () => {
    expect(validateTodoInput({ ...VALID, instructedAt: "2026/08/12" }).ok).toBe(false);
  });

  it("첨부 메타데이터를 받아들인다", () => {
    const result = validateTodoInput({
      ...VALID,
      attachment: { name: "보고서.pdf", size: 1024 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.attachment?.name).toBe("보고서.pdf");
  });
});
