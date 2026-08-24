/**
 * 진행 이력 첨부 파일.
 *
 * 지시사항 본문의 첨부(todos.attachment)와 달리 실제 파일을 저장한다.
 * 이력에 붙는 첨부는 "그때 무엇을 받았는지"가 증빙이라 파일명만으로는 쓸모가 없다.
 *
 * 파일 바이트는 스토리지(lib/storage)에, 메타데이터는 DB에 둔다.
 * DB에는 storageKey만 들고 있어 스토리지 벤더가 바뀌어도 스키마는 그대로다.
 */

/** 저장된 첨부 한 건 */
export type UpdateFile = {
  id: string;
  updateId: string;
  /** 사용자가 올린 원래 파일명 — 다운로드 시 이 이름으로 내려준다 */
  name: string;
  size: number;
  contentType: string | null;
  /** 스토리지 내부 경로. 앱 화면에는 노출하지 않는다. */
  storageKey: string;
  createdAt: string;
};

/** 업로드를 마치고 DB에 남길 메타데이터 */
export type UpdateFileInput = {
  name: string;
  size: number;
  contentType: string | null;
  storageKey: string;
};

/** 한 파일 최대 크기 (10MB) */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** 이력 한 건당 첨부 개수 */
export const MAX_FILES_PER_UPDATE = 5;
/** 한 번에 올릴 수 있는 합계 (서버 액션 본문 한도보다 낮게 잡는다) */
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** 제어문자 — 파일명에 섞여 들어오면 경로를 깨뜨린다 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
/** 스토리지 경로에서 의미를 갖는 문자들 */
const RESERVED_CHARS = /[?%*:|"<>#]/g;

/**
 * 스토리지 경로용으로 파일명을 안전하게 만든다.
 *
 * 경로 구분자·상위 디렉터리 표기·제어문자를 걷어낸다. 한글은 살린다 —
 * 사내 문서 이름이 대부분 한글이라 죽이면 무슨 파일인지 알 수 없다.
 * 원본 이름은 DB(name)에 그대로 보관하므로 다운로드 시에는 원래 이름이 쓰인다.
 */
export function toSafeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(CONTROL_CHARS, "")
    .replace(RESERVED_CHARS, "_")
    // `..`를 남기면 상위 디렉터리로 빠져나갈 수 있다.
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "file";
}

export type FileCheck = { ok: true } | { ok: false; message: string };

/** 업로드 전 검증 — 서버와 클라이언트가 같은 규칙을 쓴다 */
export function checkFiles(
  files: { name: string; size: number }[],
  alreadyAttached = 0,
): FileCheck {
  if (files.length === 0) return { ok: true };

  if (alreadyAttached + files.length > MAX_FILES_PER_UPDATE) {
    return {
      ok: false,
      message: `첨부는 이력당 ${MAX_FILES_PER_UPDATE}개까지입니다.`,
    };
  }

  const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
  if (tooBig) {
    return {
      ok: false,
      message: `${tooBig.name}: 한 파일은 ${formatBytes(MAX_FILE_BYTES)}까지입니다.`,
    };
  }

  const empty = files.find((f) => f.size === 0);
  if (empty) {
    return { ok: false, message: `${empty.name}: 빈 파일은 올릴 수 없습니다.` };
  }

  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      message: `한 번에 올릴 수 있는 합계는 ${formatBytes(MAX_TOTAL_BYTES)}까지입니다.`,
    };
  }
  return { ok: true };
}

/**
 * 확장자만 뽑는다 (ASCII·소문자). 없으면 빈 문자열.
 * 스토리지 경로에 남겨 두면 파일 브라우저에서 종류를 바로 알 수 있다.
 */
export function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(name.trim());
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * 스토리지 저장 경로.
 *
 * 파일명을 경로에 넣지 않는다 — Supabase Storage는 키에 ASCII만 허용해서
 * 한글 이름을 그대로 쓰면 InvalidKey로 반려된다(실제로 겪었다).
 * 원본 이름은 DB(name)에 있고 다운로드 시 그 이름으로 내려주므로
 * 경로는 고유 id + 확장자만으로 충분하다.
 *
 * 이력 id로 묶어 두면 이력이 지워질 때 무엇을 함께 지워야 하는지 경로만 봐도 알 수 있다.
 */
export function buildStorageKey(
  updateId: string,
  fileName: string,
  unique: string,
): string {
  return `updates/${updateId}/${unique}${extensionOf(fileName)}`;
}
