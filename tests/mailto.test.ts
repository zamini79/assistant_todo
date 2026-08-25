/**
 * mailto 링크 — 메일 앱(Outlook)의 새 메일 창을 채워서 연다.
 *
 * 여기서 틀리면 엉뚱한 사람에게 가거나 본문이 뭉개진 채 열린다.
 */
import { describe, expect, it } from "vitest";

import { buildMailtoLink, MAILTO_MAX } from "@/lib/mail/mailto";

const decodeParam = (url: string, key: string) => {
  const m = new RegExp(`[?&]${key}=([^&]*)`).exec(url);
  return m ? decodeURIComponent(m[1]) : null;
};

describe("buildMailtoLink", () => {
  it("받는 사람·참조·제목·본문을 채운다", () => {
    const { url, trimmed } = buildMailtoLink({
      to: ["a@example.com"],
      cc: ["assistant@example.com"],
      subject: "[지시사항 리마인드] 전략검토",
      body: "홍길동 매니저님,\n확인 요청드립니다.",
    });
    expect(url.startsWith("mailto:a%40example.com?")).toBe(true);
    expect(decodeParam(url, "cc")).toBe("assistant@example.com");
    expect(decodeParam(url, "subject")).toBe("[지시사항 리마인드] 전략검토");
    expect(decodeParam(url, "body")).toContain("홍길동 매니저님,");
    expect(trimmed).toBe(false);
  });

  it("줄바꿈을 CRLF로 바꾼다", () => {
    // LF만 주면 Outlook에서 줄이 뭉쳐 한 문단으로 보인다.
    const { url } = buildMailtoLink({ to: ["a@example.com"], subject: "s", body: "1\n2" });
    expect(decodeParam(url, "body")).toBe("1\r\n2");
  });

  it("여러 명은 쉼표로 잇는다", () => {
    const { url } = buildMailtoLink({
      to: ["a@example.com", "b@example.com"],
      subject: "s",
      body: "b",
    });
    expect(url.startsWith("mailto:a%40example.com,b%40example.com?")).toBe(true);
  });

  it("받는 사람에 이미 있는 주소는 참조에서 뺀다", () => {
    // 담당자가 수신자 목록에도 등록돼 있는 경우가 흔하다. 두 번 넣으면 중복 수신된다.
    const { url } = buildMailtoLink({
      to: ["a@example.com"],
      cc: ["A@Example.com", "c@example.com"],
      subject: "s",
      body: "b",
    });
    expect(decodeParam(url, "cc")).toBe("c@example.com");
  });

  it("참조가 없으면 cc 항목 자체를 넣지 않는다", () => {
    const { url } = buildMailtoLink({ to: ["a@example.com"], subject: "s", body: "b" });
    expect(url).not.toContain("cc=");
  });

  it("중복·빈 주소를 걸러낸다", () => {
    const { url } = buildMailtoLink({
      to: ["a@example.com", " ", "A@example.com"],
      subject: "s",
      body: "b",
    });
    expect(url.startsWith("mailto:a%40example.com?")).toBe(true);
  });

  it("특수문자가 파라미터를 깨뜨리지 않는다", () => {
    // 제목의 &가 그대로 들어가면 뒤가 다른 항목으로 읽혀 본문이 사라진다.
    const { url } = buildMailtoLink({
      to: ["a@example.com"],
      subject: "A & B ? C #1",
      body: "본문 & 내용",
    });
    expect(decodeParam(url, "subject")).toBe("A & B ? C #1");
    expect(decodeParam(url, "body")).toBe("본문 & 내용");
  });

  describe("길이 상한", () => {
    const LONG = "가".repeat(3000);

    it("상한을 넘기지 않는다", () => {
      // Windows가 2048자쯤에서 잘라 버려 본문 끝이 소리 없이 사라진다.
      const { url, trimmed } = buildMailtoLink({
        to: ["a@example.com"],
        subject: "s",
        body: LONG,
      });
      expect(url.length).toBeLessThanOrEqual(MAILTO_MAX);
      expect(trimmed).toBe(true);
    });

    it("줄였으면 그 사실을 본문에 남긴다", () => {
      const { url } = buildMailtoLink({ to: ["a@example.com"], subject: "s", body: LONG });
      expect(decodeParam(url, "body")).toContain("내용이 길어 일부만");
    });

    it("본문을 줄이지 받는 사람·제목은 건드리지 않는다", () => {
      // 주소가 잘리면 엉뚱한 곳으로 가고, 제목이 잘리면 무슨 건인지 알 수 없다.
      const subject = "[지시사항 지연] 전략검토 · 아주 긴 제목".repeat(3);
      const { url } = buildMailtoLink({
        to: ["a@example.com", "b@example.com"],
        subject,
        body: LONG,
      });
      expect(url.startsWith("mailto:a%40example.com,b%40example.com?")).toBe(true);
      expect(decodeParam(url, "subject")).toBe(subject);
    });

    it("짧은 본문은 그대로 둔다", () => {
      const { url, trimmed } = buildMailtoLink({
        to: ["a@example.com"],
        subject: "s",
        body: "짧은 본문",
      });
      expect(trimmed).toBe(false);
      expect(decodeParam(url, "body")).toBe("짧은 본문");
    });
  });
});
