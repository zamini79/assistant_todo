import { describe, expect, it } from "vitest";

import { buildRemindMail } from "@/lib/mail/remind-template";
import { describeSendFailure, readSmtpConfig } from "@/lib/mail/mailer";
import type { Todo } from "@/lib/domain/todo";

const TODO: Todo = {
  id: "t1",
  instructedAt: "2026-08-10",
  dueDate: "2026-08-20",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "박현수",
  assigneeTitle: "본부장",
  assigneeEmail: "park@company.com",
  category: "전략검토",
  detail: "동남아 신규 채널 진입안 <검토>",
  progressNote: "초안 작성 중",
  signal: "Y",
  remindStatus: "wait",
  attachments: [],
  completedAt: null,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

describe("readSmtpConfig", () => {
  const BASE: Record<string, string | undefined> = {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_USER: "a@gmail.com",
    SMTP_PASS: "pw",
    SMTP_FROM: "보내는이 <a@gmail.com>",
  };

  it("필수 값이 갖춰지면 설정을 낸다", () => {
    expect(readSmtpConfig({ ...BASE, SMTP_PORT: "465" })).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
    });
  });

  it("포트를 안 주면 465(implicit TLS)로 본다", () => {
    expect(readSmtpConfig(BASE)?.port).toBe(465);
    expect(readSmtpConfig(BASE)?.secure).toBe(true);
  });

  it("587이면 STARTTLS (secure=false) — 사내 메일서버 전환 케이스", () => {
    expect(readSmtpConfig({ ...BASE, SMTP_PORT: "587" })?.secure).toBe(false);
  });

  it("SMTP_SECURE가 있으면 포트보다 우선한다", () => {
    expect(readSmtpConfig({ ...BASE, SMTP_PORT: "587", SMTP_SECURE: "true" })?.secure).toBe(true);
  });

  it("FROM이 없으면 USER를 발신자로 쓴다", () => {
    expect(readSmtpConfig({ ...BASE, SMTP_FROM: undefined })?.from).toBe("a@gmail.com");
  });

  it.each(["SMTP_HOST", "SMTP_USER", "SMTP_PASS"])("%s가 없으면 null", (key) => {
    const env: Record<string, string | undefined> = { ...BASE };
    delete env[key];
    expect(readSmtpConfig(env)).toBeNull();
  });

  it("빈 문자열은 미설정으로 본다", () => {
    expect(readSmtpConfig({ ...BASE, SMTP_PASS: "   " })).toBeNull();
  });

  it("포트가 숫자가 아니면 null", () => {
    expect(readSmtpConfig({ ...BASE, SMTP_PORT: "abc" })).toBeNull();
  });
});

describe("buildRemindMail", () => {
  it("기한 전이면 D-라벨을 제목·본문에 담는다", () => {
    const mail = buildRemindMail(TODO, "2026-08-18");
    expect(mail.subject).toContain("리마인드");
    expect(mail.text).toContain("D-2");
    expect(mail.text).toContain("박현수 본부장");
  });

  it("지연이면 제목이 '지연'으로 바뀐다", () => {
    const mail = buildRemindMail(TODO, "2026-08-25");
    expect(mail.subject).toContain("지연");
    expect(mail.text).toContain("5일 경과");
  });

  it("HTML을 이스케이프해 태그 주입을 막는다", () => {
    const mail = buildRemindMail(TODO, "2026-08-18");
    expect(mail.html).toContain("&lt;검토&gt;");
    expect(mail.html).not.toContain("<검토>");
  });

  it("진행상황이 비면 '미기재'로 표기한다", () => {
    const mail = buildRemindMail({ ...TODO, progressNote: "" }, "2026-08-18");
    expect(mail.text).toContain("미기재");
  });

  it("본문에 지시 내용과 담당 조직이 들어간다", () => {
    const mail = buildRemindMail(TODO, "2026-08-18");
    expect(mail.text).toContain("동남아 신규 채널 진입안");
    expect(mail.text).toContain("영업본부 박현수 본부장");
  });
});

describe("호칭 · 문구", () => {
  it("이름과 직책을 붙여 부른다", () => {
    const mail = buildRemindMail({ ...TODO, assigneeTitle: "Manager" }, "2026-08-15");
    expect(mail.text.startsWith("박현수 Manager님,")).toBe(true);
    expect(mail.html).toContain("박현수 Manager님,");
  });

  it("직책이 없으면 이름만 쓴다", () => {
    // 옛 데이터는 이름 안에 직책이 섞여 있어("홍길동 실장") 따로 붙이면 겹친다.
    const mail = buildRemindMail({ ...TODO, assigneeTitle: "" }, "2026-08-15");
    expect(mail.text.startsWith("박현수님,")).toBe(true);
  });

  it("확인 요청드립니다 문구를 쓴다", () => {
    const mail = buildRemindMail(TODO, "2026-08-15");
    expect(mail.text).toContain("확인 요청드립니다");
    expect(mail.html).toContain("확인 요청드립니다");
    expect(mail.text).not.toContain("부탁드립니다");
  });

  it("담당 줄에도 직책이 함께 나온다", () => {
    const mail = buildRemindMail({ ...TODO, assigneeTitle: "Manager" }, "2026-08-15");
    expect(mail.text).toContain("영업본부 박현수 Manager");
  });
});

describe("발송 실패 안내", () => {
  it("연결 자체가 안 되면 포트가 막혔을 수 있다고 알린다", () => {
    // "Connection timeout"만 띄우면 사용자가 할 수 있는 일이 없다.
    const msg = describeSendFailure(
      Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" }),
      "smtp.example.com",
      465,
    );
    expect(msg).toContain("smtp.example.com:465");
    expect(msg).toContain("SMTP 포트가 막혀 있을 수 있습니다");
    expect(msg).toContain("Connection timeout");
  });

  it("거부·소켓 오류도 같은 안내로 묶는다", () => {
    for (const code of ["ECONNREFUSED", "ESOCKET", "EDNS"]) {
      const msg = describeSendFailure(
        Object.assign(new Error("nope"), { code }),
        "smtp.example.com",
        587,
      );
      expect(msg).toContain("연결하지 못했습니다");
    }
  });

  it("인증 실패는 원문을 그대로 보여준다", () => {
    // 연결은 됐고 계정이 문제다 — 포트 이야기를 하면 엉뚱한 곳을 뒤지게 된다.
    const msg = describeSendFailure(
      Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"), {
        code: "EAUTH",
      }),
      "smtp.example.com",
      465,
    );
    expect(msg).toBe("Invalid login: 535-5.7.8 Username and Password not accepted");
    expect(msg).not.toContain("포트가 막혀");
  });

  it("Error가 아닌 것도 처리한다", () => {
    expect(describeSendFailure("boom", "h", 25)).toBe("boom");
  });
});
