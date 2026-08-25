/**
 * HTTP 메일 API 설정 읽기.
 *
 * 어댑터 본체는 `server-only` 경계 안이라 여기서 부르지 못한다.
 * 대신 "어느 경로로 나가는가"를 정하는 순수 함수를 고정해 둔다.
 */
import { describe, expect, it } from "vitest";

import { readHttpMailConfig, readSmtpConfig } from "@/lib/mail/mailer";

describe("readHttpMailConfig", () => {
  it("키와 발신 주소가 있으면 설정으로 본다", () => {
    expect(
      readHttpMailConfig({ RESEND_API_KEY: "re_x", MAIL_FROM: "봇 <no-reply@example.com>" }),
    ).toEqual({ apiKey: "re_x", from: "봇 <no-reply@example.com>" });
  });

  it("발신 주소가 없으면 SMTP 쪽 값을 재사용한다", () => {
    // 이미 SMTP로 보내던 곳이 키만 추가해 옮겨갈 수 있어야 한다.
    expect(
      readHttpMailConfig({ RESEND_API_KEY: "re_x", SMTP_FROM: "봇 <no-reply@example.com>" }),
    ).toEqual({ apiKey: "re_x", from: "봇 <no-reply@example.com>" });
  });

  it("MAIL_FROM이 SMTP_FROM보다 우선한다", () => {
    expect(
      readHttpMailConfig({
        RESEND_API_KEY: "re_x",
        MAIL_FROM: "new@example.com",
        SMTP_FROM: "old@example.com",
      })?.from,
    ).toBe("new@example.com");
  });

  it("키가 없으면 미설정", () => {
    expect(readHttpMailConfig({ MAIL_FROM: "a@example.com" })).toBeNull();
  });

  it("발신 주소가 없으면 미설정", () => {
    // 주소 없이 보내면 API가 거절한다. 여기서 걸러 "설정됨"으로 보이지 않게 한다.
    expect(readHttpMailConfig({ RESEND_API_KEY: "re_x" })).toBeNull();
  });

  it("공백만 있는 값은 없는 것으로 본다", () => {
    expect(readHttpMailConfig({ RESEND_API_KEY: "  ", MAIL_FROM: "a@example.com" })).toBeNull();
  });

  it("SMTP 설정과 서로 간섭하지 않는다", () => {
    // 둘 다 둘 수 있어야 한다 — 사내 이관 때 키만 빼면 SMTP로 되돌아온다.
    const env = {
      RESEND_API_KEY: "re_x",
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "u@example.com",
      SMTP_PASS: "p",
      SMTP_FROM: "봇 <no-reply@example.com>",
    };
    expect(readHttpMailConfig(env)).not.toBeNull();
    expect(readSmtpConfig(env)).not.toBeNull();
  });
});
