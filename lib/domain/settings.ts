/**
 * 앱 설정 · 지시사항별 수신자 · 회의체.
 *
 * 전략 Assistant는 주기적으로 바뀌므로 코드가 아니라 설정으로 관리한다.
 * 수신자는 지시사항마다 다르므로 사원 명부에서 골라 건별로 붙인다.
 * 회의체도 같은 이유로 마스터를 두되, 등록 화면에서 '직접 입력'한 값은 자동으로 마스터에 편입된다.
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

/**
 * 지시사항별 추가 수신자.
 *
 * 사원 명부를 FK로 참조하지 않고 이메일·이름을 값으로 복사해 둔다 —
 * 인사정보 연동 시 명부를 비울 예정인데, FK로 묶여 있으면 그때 지정이 함께 날아간다.
 */
export type TodoRecipient = {
  email: string;
  name: string;
};

/**
 * 실제 발송 대상을 정한다.
 *
 * 담당자는 항상 포함되고, 여기에 지시사항별 추가 수신자가 더해진다.
 * 같은 주소가 겹치면 한 번만 보낸다 — 담당자가 수신자 목록에도 등록돼 있는 경우가 흔하다.
 * 대소문자만 다른 주소도 같은 사람으로 본다.
 */
export function resolveRecipients(
  assigneeEmail: string | null,
  extras: Pick<TodoRecipient, "email">[],
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

// ── 회의체 ────────────────────────────────────────────────

export type MeetingBody = {
  id: string;
  name: string;
  createdAt: string;
};

export type MeetingBodyInput = { name: string };

/**
 * 회의체 이름 표기를 하나로 맞춘다.
 *
 * 앞뒤 공백과 중간의 연속 공백을 정리한다 — "주간  경영회의"와 "주간 경영회의"가
 * 서로 다른 회의체로 갈라지면 사이드바 집계가 둘로 쪼개지기 때문이다.
 * DB의 unique 인덱스는 `lower(btrim(name))`라 공백 축약까지는 막지 못하므로,
 * 저장 경로가 항상 이 함수를 거치게 해서 앱 쪽에서 먼저 맞춘다.
 */
export function normalizeMeetingBodyName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** 같은 회의체인지 — 대소문자·공백 차이는 무시한다 */
export function isSameMeetingBody(a: string, b: string): boolean {
  return normalizeMeetingBodyName(a).toLowerCase() === normalizeMeetingBodyName(b).toLowerCase();
}

/** 마스터 목록에서 이름으로 찾는다. 없으면 undefined. */
export function findMeetingBody(
  list: MeetingBody[],
  name: string,
): MeetingBody | undefined {
  return list.find((m) => isSameMeetingBody(m.name, name));
}
