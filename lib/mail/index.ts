import "server-only";

/**
 * 메일러 팩토리 — 앱 코드가 구현체를 고르는 유일한 지점.
 * 리포지토리 팩토리와 같은 형태를 유지한다.
 *
 * HTTP API(Resend)가 설정돼 있으면 그쪽을 먼저 쓴다. 호스팅이 SMTP 포트를
 * 막는 경우가 있어서다(Render 무료 플랜은 25·465·587을 차단한다).
 * 둘 다 있으면 HTTP가 이긴다 — SMTP 설정을 지우지 않고도 옮겨 갈 수 있고,
 * 사내 메일서버로 이관할 때 RESEND_API_KEY만 빼면 SMTP로 되돌아온다.
 */
import { readHttpMailConfig, readSmtpConfig, type Mailer } from "./mailer";
import { createHttpMailer } from "./http-mailer";
import { createSmtpMailer } from "./smtp-mailer";

export type MailStatus =
  | { configured: true; transport: "http" | "smtp"; host: string; from: string }
  | { configured: false };

/** 설정 여부와 발신 정보 — UI가 "설정 필요"를 안내할 때 쓴다. 키·비밀번호는 절대 노출하지 않는다. */
export function getMailStatus(): MailStatus {
  const http = readHttpMailConfig();
  if (http) {
    return {
      configured: true,
      transport: "http",
      host: "Resend (HTTP API)",
      from: http.from,
    };
  }

  const smtp = readSmtpConfig();
  return smtp
    ? { configured: true, transport: "smtp", host: smtp.host, from: smtp.from }
    : { configured: false };
}

/** 설정이 없으면 null. 호출자가 "발송 불가"로 처리한다. */
export function getMailer(): Mailer | null {
  const http = readHttpMailConfig();
  if (http) return createHttpMailer(http);

  const smtp = readSmtpConfig();
  return smtp ? createSmtpMailer(smtp) : null;
}

export * from "./mailer";
