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
  describeSendFailure,
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
        /*
         * 붙지 못하면 빨리 포기한다.
         *
         * 기본값은 연결 2분·인사 30초라, 포트가 막힌 환경에서는 화면이 몇 분씩
         * "처리 중…"에 멈춘 채 아무 것도 알려주지 않는다. 사용자는 실패한 줄도
         * 모르고 기다린다. 못 보낼 상황이면 몇 초 안에 이유를 띄우는 편이 낫다.
         * 전송 자체(socketTimeout)는 첨부가 큰 경우를 감안해 넉넉히 둔다.
         */
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 60_000,
      });
    }
    return transport;
  };

  return {
    async send(message: MailMessage) {
      try {
        await open().sendMail({
          from: config.from,
          to: message.to,
          cc: message.cc,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (error) {
        // 원인을 사람이 읽을 수 있는 문장으로 바꿔 던진다. 호출자가 그대로 화면에 띄운다.
        throw new Error(describeSendFailure(error, config.host, config.port), {
          cause: error,
        });
      }
    },
    async close() {
      transport?.close();
      transport = null;
    },
  };
}

export { MailNotConfiguredError, readSmtpConfig };
export type { SmtpConfig };
