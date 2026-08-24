/**
 * 사원 명부.
 *
 * 사내 인사정보 연동 전까지 쓰는 임시 마스터다. 엑셀 명부를 올려 통째로 갈아끼우고,
 * 연동이 되면 이 테이블을 비우고 연동 소스로 대체한다 —
 * 그래서 지시사항은 사원을 FK로 참조하지 않고 이름·조직·이메일을 값으로 복사해 둔다.
 * (명부가 사라져도 과거 지시사항의 담당자 정보가 날아가지 않는다.)
 */

export type Employee = {
  id: string;
  name: string;
  email: string;
  /** 부서 */
  department: string;
  /** 직책 */
  title: string;
};

/** 명부에 올릴 한 줄 (id는 저장 시 부여) */
export type EmployeeInput = Omit<Employee, "id">;

/** 목록에 보여줄 한 줄 — "영업1팀 홍길동 Manager" */
export function employeeLabel(e: Pick<Employee, "name" | "department" | "title">): string {
  return [e.department, e.name, e.title].filter(Boolean).join(" ");
}

/**
 * 검색용 정규화.
 *
 * 공백을 걷어내고 소문자로 접는다 — "영업 1팀"으로 쳐도 "영업1팀"이 걸리게 하기 위함이다.
 * 사내 부서 표기가 띄어쓰기가 들쭉날쭉해서, 그대로 비교하면 못 찾는 경우가 잦다.
 */
export function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/**
 * 이름 또는 부서로 찾는다.
 *
 * 이메일·직책은 대상이 아니다 — 요청이 "이름/부서 둘 중 아무거나"였고,
 * 직책까지 넣으면 "Manager"만 쳐도 수백 명이 걸려 목록이 쓸모없어진다.
 */
export function matchesEmployee(e: Employee, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return false;
  return (
    normalizeQuery(e.name).includes(q) || normalizeQuery(e.department).includes(q)
  );
}

/**
 * 검색 결과. 이름이 먼저 걸린 사람을 위로 올린다 —
 * 이름을 치는 경우가 대부분이라 부서 일치가 위에 오면 원하는 사람이 묻힌다.
 */
export function searchEmployees(
  employees: Employee[],
  query: string,
  limit = 30,
): Employee[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const byName: Employee[] = [];
  const byDepartment: Employee[] = [];

  for (const e of employees) {
    if (normalizeQuery(e.name).includes(q)) byName.push(e);
    else if (normalizeQuery(e.department).includes(q)) byDepartment.push(e);
    if (byName.length >= limit) break;
  }

  const ko = (a: Employee, b: Employee) => a.name.localeCompare(b.name, "ko");
  return [...byName.sort(ko), ...byDepartment.sort(ko)].slice(0, limit);
}

/** 지시사항에 복사해 넣을 담당자 정보 */
export type AssigneeSelection = {
  org: string;
  assigneeName: string;
  assigneeTitle: string;
  assigneeEmail: string | null;
};

export function toAssignee(e: Employee): AssigneeSelection {
  return {
    org: e.department,
    assigneeName: e.name,
    assigneeTitle: e.title,
    assigneeEmail: e.email || null,
  };
}

/** 이력에 남길 사람 — 이름과 직책만 */
export type PersonRef = { name: string; title: string };

/**
 * 이메일로 사람을 찾는 조회표.
 *
 * 앞에 온 출처가 이긴다. 칸별로 따로 채우므로, 이름만 아는 출처(지시사항별
 * 수신자)와 직책만 아는 출처(명부)를 이어 붙이면 둘 다 채워진다.
 */
export function personLookup(
  sources: Iterable<{ email: string | null; name: string; title: string }>,
): Map<string, PersonRef> {
  const map = new Map<string, PersonRef>();
  for (const s of sources) {
    const key = s.email?.trim().toLowerCase();
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, {
      name: prev?.name || s.name.trim(),
      title: prev?.title || s.title.trim(),
    });
  }
  return map;
}

/**
 * 사람을 화면에 적는 표기 — "홍길동 매니저".
 *
 * 이름을 모르면 이메일로 대신한다. 발송 이력에서 수신자 칸이 비어 보이면
 * 누구에게 갔는지 확인할 길이 없어지기 때문이다.
 */
export function personLabel(
  name: string,
  title: string,
  fallback = "",
): string {
  const n = name.trim();
  if (!n) return fallback.trim();
  const t = title.trim();
  return t ? `${n} ${t}` : n;
}

// ── 엑셀 명부 읽기 ────────────────────────────────────────

/** 헤더 이름 후보 — 표기가 흔들려도 알아본다 */
const HEADER_ALIASES: Record<keyof EmployeeInput, string[]> = {
  name: ["이름", "성명", "name"],
  email: ["email", "이메일", "e-mail", "메일"],
  department: ["부서", "조직", "소속", "department", "dept"],
  title: ["직책", "직위", "직급", "title", "position"],
};

function headerKey(cell: string): keyof EmployeeInput | null {
  const v = normalizeQuery(cell);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => normalizeQuery(a) === v)) return key as keyof EmployeeInput;
  }
  return null;
}

export type ParsedRoster = {
  rows: EmployeeInput[];
  /** 건너뛴 줄 수와 사유 — 올린 사람이 무엇이 빠졌는지 알 수 있어야 한다 */
  skipped: { row: number; reason: string }[];
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * 엑셀에서 읽은 문자열 표 → 명부.
 *
 * 열 순서를 고정하지 않고 헤더 이름으로 찾는다 — 내보내기 도구가 바뀌어도
 * 열 순서만 달라졌다고 실패하지 않게 하기 위함이다.
 * 이름·이메일이 없는 줄은 건너뛰고 사유를 남긴다. 한 줄이 잘못됐다고
 * 1천 명짜리 업로드를 통째로 막지 않는다.
 */
export function parseRoster(table: string[][]): ParsedRoster {
  if (table.length === 0) {
    return { rows: [], skipped: [{ row: 0, reason: "빈 파일입니다." }] };
  }

  const header = table[0] ?? [];
  const columns: Partial<Record<keyof EmployeeInput, number>> = {};
  header.forEach((cell, i) => {
    const key = headerKey(cell ?? "");
    if (key && columns[key] === undefined) columns[key] = i;
  });

  if (columns.name === undefined || columns.email === undefined) {
    return {
      rows: [],
      skipped: [{ row: 1, reason: "첫 줄에서 '이름'과 'email' 열을 찾지 못했습니다." }],
    };
  }

  const at = (cells: string[], key: keyof EmployeeInput) => {
    const index = columns[key];
    return index === undefined ? "" : (cells[index] ?? "").trim();
  };

  const rows: EmployeeInput[] = [];
  const skipped: ParsedRoster["skipped"] = [];
  // 같은 주소가 두 번 나오면 뒤엣것을 버린다 — DB의 unique 인덱스에 걸려
  // 업로드 전체가 실패하는 것보다 낫다.
  const seen = new Set<string>();

  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i] ?? [];
    const line = i + 1;

    const name = at(cells, "name");
    const email = at(cells, "email").toLowerCase();

    // 완전히 빈 줄은 사유를 남기지 않는다 (엑셀 끝에 흔히 붙는다).
    if (!name && !email) continue;

    if (!name) {
      skipped.push({ row: line, reason: "이름 없음" });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      skipped.push({ row: line, reason: email ? `이메일 형식 오류: ${email}` : "이메일 없음" });
      continue;
    }
    if (seen.has(email)) {
      skipped.push({ row: line, reason: `중복 이메일: ${email}` });
      continue;
    }

    seen.add(email);
    rows.push({
      name,
      email,
      department: at(cells, "department"),
      title: at(cells, "title"),
    });
  }

  return { rows, skipped };
}
