/**
 * 메일 발송 포트.
 *
 * 리포지토리 계층과 같은 이유로 벤더를 가둔다 — 지금은 Gmail SMTP를 쓰지만
 * 사내 메일서버로 바꿀 때 앱 코드가 아니라 어댑터/설정만 건드리면 되게 한다.
 * (현재 SMTP 어댑터는 호스트를 env로 받으므로 사내 전환은 env 변경만으로 끝난다.)
 */

export type MailMessage = {
  to: string;
  /** 참조 — 전략 Assistant 주소가 들어간다 */
  cc?: string;
  subject: string;
  text: string;
  html?: string;
};

export interface Mailer {
  /** 한 통을 보낸다. 실패하면 throw. */
  send(message: MailMessage): Promise<void>;
  /** 연결 풀 정리 — 배치 발송이 끝난 뒤 호출한다. */
  close(): Promise<void>;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("메일 발송이 설정되지 않았습니다. SMTP 환경변수를 확인해 주세요.");
    this.name = "MailNotConfiguredError";
  }
}

/**
 * 메일서버에 붙지 못했을 때의 안내.
 *
 * 원래 메시지("Connection timeout", "ETIMEDOUT")만 띄우면 사용자가 할 수 있는
 * 일이 없다. 이 단계에서 막히는 이유는 대개 호스팅·사내 방화벽이 SMTP 포트를
 * 막은 것이다 — 실제로 Render 무료 플랜은 25·465·587을 차단한다.
 * 계정이나 비밀번호 문제라면 연결은 되고 인증에서 거절당하므로 여기 오지 않는다.
 */
export function describeSendFailure(error: unknown, host: string, port: number): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const raw = error instanceof Error ? error.message : String(error);

  const unreachable =
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ESOCKET" ||
    code === "EDNS" ||
    /timeout/i.test(raw);

  return unreachable
    ? `메일서버(${host}:${port})에 연결하지 못했습니다. 서버에서 SMTP 포트가 막혀 있을 수 있습니다. (${raw})`
    : raw;
}

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
};

/**
 * env에서 SMTP 설정을 읽는다. 하나라도 비면 null — 호출자가 "미설정"으로 처리한다.
 * `SMTP_SECURE`를 안 주면 465는 implicit TLS, 나머지는 STARTTLS로 본다.
 *
 * 순수 함수라 서버 전용 모듈에 두지 않는다 — 그래야 테스트에서 바로 부를 수 있다.
 */
export function readSmtpConfig(
  env: Record<string, string | undefined> = process.env,
): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  const from = env.SMTP_FROM?.trim() || user;
  const port = Number(env.SMTP_PORT?.trim() || 465);

  if (!host || !user || !pass || !from) return null;
  if (!Number.isFinite(port) || port <= 0) return null;

  const secureEnv = env.SMTP_SECURE?.trim();
  const secure = secureEnv ? secureEnv === "true" : port === 465;

  return { host, port, user, pass, from, secure };
}
