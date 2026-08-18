import "server-only";

/**
 * 메일러 팩토리 — 앱 코드가 구현체를 고르는 유일한 지점.
 * 리포지토리 팩토리와 같은 형태를 유지한다.
 */
import { readSmtpConfig, type Mailer } from "./mailer";
import { createSmtpMailer } from "./smtp-mailer";

export type MailStatus =
  | { configured: true; host: string; from: string }
  | { configured: false };

/** 설정 여부와 발신 정보 — UI가 "설정 필요"를 안내할 때 쓴다. 비밀번호는 절대 노출하지 않는다. */
export function getMailStatus(): MailStatus {
  const config = readSmtpConfig();
  return config
    ? { configured: true, host: config.host, from: config.from }
    : { configured: false };
}

/** 설정이 없으면 null. 호출자가 "발송 불가"로 처리한다. */
export function getMailer(): Mailer | null {
  const config = readSmtpConfig();
  return config ? createSmtpMailer(config) : null;
}

export * from "./mailer";
