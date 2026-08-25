/**
 * mailto: 링크 만들기 — 설치된 메일 앱(Outlook)의 새 메일 창을 채워서 연다.
 *
 * 서버가 직접 보내는 대신 사용자가 자기 계정으로 보내는 경로다.
 * 회사 계정에서 나가므로 수신자에게 낯선 발신자로 보이지 않고,
 * 호스팅이 SMTP 포트를 막아도 영향을 받지 않는다.
 *
 * 순수 함수라 서버 전용 모듈에 두지 않는다 — 테스트에서 바로 부를 수 있다.
 */

/**
 * URL 길이 상한.
 *
 * Windows가 mailto를 명령줄로 넘기면서 2048자쯤에서 자른다. 잘리면 본문 끝이
 * 소리 없이 사라지므로, 여유를 두고 우리가 먼저 줄이고 그 사실을 알린다.
 */
export const MAILTO_MAX = 1800;

/** 본문을 줄였을 때 끝에 붙이는 안내 */
const TRIMMED_NOTICE = "\r\n\r\n(내용이 길어 일부만 담았습니다. 전체 내용은 시스템에서 확인해 주세요.)";

export type MailtoInput = {
  to: string[];
  cc?: string[];
  subject: string;
  /** 본문. 줄바꿈은 \n으로 줘도 된다 — 메일 앱이 알아보는 \r\n으로 바꾼다. */
  body: string;
};

export type MailtoLink = {
  url: string;
  /** 본문이 길어 줄였는지 — 화면이 알려 줘야 한다 */
  trimmed: boolean;
};

/** 메일 앱은 CRLF를 기대한다. LF만 주면 Outlook에서 줄바꿈이 뭉친다. */
const toCrlf = (s: string) => s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");

const clean = (list: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const email = raw.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
};

export function buildMailtoLink(input: MailtoInput): MailtoLink {
  const to = clean(input.to);
  // 받는 사람에 이미 있는 주소는 참조에서 뺀다 — 같은 사람이 두 번 들어간다.
  const inTo = new Set(to.map((e) => e.toLowerCase()));
  const cc = clean(input.cc ?? []).filter((e) => !inTo.has(e.toLowerCase()));

  const head = `mailto:${to.map(encodeURIComponent).join(",")}`;
  const params: string[] = [];
  if (cc.length > 0) params.push(`cc=${cc.map(encodeURIComponent).join(",")}`);
  params.push(`subject=${encodeURIComponent(input.subject)}`);

  const prefix = `${head}?${params.join("&")}&body=`;
  const body = toCrlf(input.body);

  const full = prefix + encodeURIComponent(body);
  if (full.length <= MAILTO_MAX) return { url: full, trimmed: false };

  /*
   * 넘치면 본문만 줄인다. 받는 사람·제목은 건드리지 않는다 —
   * 주소가 잘리면 엉뚱한 곳으로 가고, 제목이 잘리면 무슨 건인지 알 수 없다.
   *
   * 인코딩하면 한 글자가 최대 9바이트(한글 %XX%XX%XX)까지 늘어난다. 글자 수로는
   * 계산할 수 없어 잘라 보고 재는 수밖에 없는데, 한 글자씩 줄이면 긴 본문에서
   * 제곱으로 느려지므로 이분 탐색으로 맞춘다.
   */
  const notice = encodeURIComponent(TRIMMED_NOTICE);
  const room = MAILTO_MAX - prefix.length - notice.length;
  if (room <= 0) {
    // 주소와 제목만으로 이미 상한이라면 본문을 비운다. 창은 열려야 한다.
    return { url: prefix + notice, trimmed: true };
  }

  let low = 0;
  let high = body.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (encodeURIComponent(body.slice(0, mid)).length <= room) low = mid;
    else high = mid - 1;
  }
  return { url: prefix + encodeURIComponent(body.slice(0, low)) + notice, trimmed: true };
}
