import "server-only";

/**
 * SMTP 어댑터 (nodemailer).
 *
 * ⚠️ 이 파일이 유일하게 nodemailer를 import 하는 곳이다.
 *
 * 호스트를 env로 받으므로 Gmail과 사내 메일서버 모두 같은 코드로 동작한다.
 * Gmail:  SMTP_HOST=smtp.gmail.com SMTP_PORT=465  (앱 비밀번호 필요)
 * 사내:   SMTP_HOST=mail.사내도메인 SMTP_PORT=587 등
 */
import nodemailer, { type Transporter } from "nodemailer";

import {
  MailNotConfiguredError,
  readSmtpConfig,
  type Mailer,
  type MailMessage,
  type SmtpConfig,
} from "./mailer";

export function createSmtpMailer(config: SmtpConfig): Mailer {
  let transport: Transporter | null = null;

  // 배치 발송이 매번 인증을 다시 하지 않도록 연결을 재사용한다.
  const open = (): Transporter => {
    if (!transport) {
      transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        pool: true,
        maxConnections: 1,
      });
    }
    return transport;
  };

  return {
    async send(message: MailMessage) {
      await open().sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
    async close() {
      transport?.close();
      transport = null;
    },
  };
}

export { MailNotConfiguredError, readSmtpConfig };
export type { SmtpConfig };
