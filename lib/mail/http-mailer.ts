import "server-only";

/**
 * HTTP 메일 API 어댑터 (Resend).
 *
 * ⚠️ 이 파일이 유일하게 Resend의 요청 형태를 아는 곳이다.
 *
 * SMTP 어댑터와 같은 `Mailer` 포트를 구현하므로 앱 코드는 어느 쪽이 쓰이는지
 * 모른다. 호스팅이 SMTP 포트를 막아도 443은 열려 있어 이 경로로는 나간다.
 *
 * SDK를 쓰지 않고 fetch로 직접 부른다 — 요청이 한 종류뿐이라 의존성을 하나
 * 늘릴 만큼의 이득이 없고, 사내 이관 때 걷어내기도 쉽다.
 */
import type { HttpMailConfig, Mailer, MailMessage } from "./mailer";

const ENDPOINT = "https://api.resend.com/emails";

/** 붙지 못하는 상황에서 화면이 오래 멈추지 않도록 — SMTP 쪽과 같은 기준. */
const TIMEOUT_MS = 15_000;

/** 응답 본문에서 사람이 읽을 부분만 꺼낸다. 형태가 달라도 터지지 않게 한다. */
function describeError(status: number, body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null) {
      const o = parsed as Record<string, unknown>;
      const message = typeof o.message === "string" ? o.message : "";
      if (message) return `메일 API가 거절했습니다 (${status}): ${message}`;
    }
  } catch {
    // JSON이 아니면 아래에서 원문을 쓴다.
  }
  return `메일 API가 거절했습니다 (${status}): ${body.slice(0, 200) || "본문 없음"}`;
}

export function createHttpMailer(config: HttpMailConfig): Mailer {
  return {
    async send(message: MailMessage) {
      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            // 참조가 없을 때 빈 배열을 보내지 않는다 — 일부 응답이 이를 오류로 본다.
            ...(message.cc ? { cc: [message.cc] } : {}),
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        throw new Error(`메일 API에 연결하지 못했습니다. (${raw})`, { cause: error });
      }

      if (!response.ok) {
        /*
         * 본문을 읽어 이유를 그대로 전한다.
         * 여기서 흔한 거절은 "발신 도메인 미인증"이다 — 상태 코드만 띄우면
         * 무엇을 고쳐야 할지 알 수 없다.
         */
        const body = await response.text().catch(() => "");
        throw new Error(describeError(response.status, body));
      }
    },

    // HTTP는 유지할 연결이 없다. 포트를 맞추기 위해 둔다.
    async close() {},
  };
}
