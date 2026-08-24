import { describe, expect, it } from "vitest";

import { resolveRecipients } from "@/lib/domain/settings";
import { validateAppSettings } from "@/lib/domain/validation";

const r = (email: string) => ({ email });

describe("resolveRecipients", () => {
  it("담당자가 항상 첫 수신자다", () => {
    expect(resolveRecipients("a@x.com", [r("b@x.com")])).toEqual(["a@x.com", "b@x.com"]);
  });

  it("담당자가 수신자 목록에도 있으면 한 번만 보낸다", () => {
    expect(resolveRecipients("a@x.com", [r("a@x.com"), r("b@x.com")])).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("대소문자만 다른 주소는 같은 사람으로 본다", () => {
    expect(resolveRecipients("A@X.com", [r("a@x.com")])).toEqual(["A@X.com"]);
  });

  it("담당자 주소가 없어도 추가 수신자에게는 보낸다", () => {
    expect(resolveRecipients(null, [r("b@x.com")])).toEqual(["b@x.com"]);
  });

  it("아무도 없으면 빈 배열 — 호출자가 발송을 건너뛴다", () => {
    expect(resolveRecipients(null, [])).toEqual([]);
    expect(resolveRecipients("  ", [])).toEqual([]);
  });

  it("추가 수신자끼리 중복도 제거한다", () => {
    expect(resolveRecipients(null, [r("b@x.com"), r("b@x.com")])).toEqual(["b@x.com"]);
  });
});


describe("validateAppSettings", () => {
  it("이름만 있어도 통과한다 — 이메일은 선택", () => {
    const result = validateAppSettings({ assistantName: "홍길동", assistantEmail: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.assistantEmail).toBeNull();
  });

  it("이메일 형식을 검사한다", () => {
    expect(validateAppSettings({ assistantName: "a", assistantEmail: "not-an-email" }).ok).toBe(
      false,
    );
  });

  it("둘 다 비어도 통과한다 — 미지정 상태를 허용", () => {
    expect(validateAppSettings({ assistantName: "", assistantEmail: "" }).ok).toBe(true);
  });
});

