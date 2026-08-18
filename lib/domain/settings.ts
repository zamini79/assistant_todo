/**
 * 앱 설정 · 메일 수신자.
 *
 * 전략 Assistant는 주기적으로 바뀌므로 코드가 아니라 설정으로 관리한다.
 * 수신자는 지시사항마다 다르므로 마스터 목록을 두고 건별로 골라 붙인다.
 */

export type AppSettings = {
  /** 현재 전략 Assistant */
  assistantName: string;
  /** 발송 메일의 CC 주소. 없으면 CC 없이 보낸다. */
  assistantEmail: string | null;
};

export const EMPTY_SETTINGS: AppSettings = {
  assistantName: "",
  assistantEmail: null,
};

export type Recipient = {
  id: string;
  name: string;
  email: string;
  org: string;
  createdAt: string;
};

export type RecipientInput = {
  name: string;
  email: string;
  org: string;
};

/** 표시용 라벨 — "영업본부 박현수 본부장" */
export function recipientLabel(r: Pick<Recipient, "name" | "org">): string {
  return r.org ? `${r.org} ${r.name}` : r.name;
}

/**
 * 실제 발송 대상을 정한다.
 *
 * 담당자는 항상 포함되고, 여기에 지시사항별 추가 수신자가 더해진다.
 * 같은 주소가 겹치면 한 번만 보낸다 — 담당자가 수신자 목록에도 등록돼 있는 경우가 흔하다.
 * 대소문자만 다른 주소도 같은 사람으로 본다.
 */
export function resolveRecipients(
  assigneeEmail: string | null,
  extras: Pick<Recipient, "email">[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const email of [assigneeEmail, ...extras.map((e) => e.email)]) {
    const trimmed = email?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
