/**
 * 파일 스토리지 포트 (interface).
 *
 * 리포지토리와 같은 이유로 벤더를 감싼다 — README 기술 전제가
 * "초기 Supabase → 최종 AWS"이므로 S3 어댑터를 하나 더 붙이면 끝나게 둔다.
 * 앱 코드는 이 인터페이스만 알고, Supabase Storage SDK는 어댑터 한 파일에만 있다.
 */

export interface FileStorage {
  /** 파일을 올린다. 같은 키가 이미 있으면 실패한다 — 남의 파일을 조용히 덮지 않는다. */
  put(input: {
    key: string;
    body: ArrayBuffer;
    contentType?: string | null;
  }): Promise<void>;

  /**
   * 파일 내용을 읽어 온다.
   *
   * 서명 URL로 리다이렉트하지 않고 우리 라우트가 직접 내려주는 이유:
   *  1. Supabase의 download 파라미터를 쓰면 파일명이 이중 인코딩돼
   *     한글 이름이 `%EC%A0%84…`로 저장된다 (실제로 겪었다).
   *  2. 스토리지 URL이 브라우저에 아예 노출되지 않는다.
   * 첨부 상한이 10MB라 서버를 거쳐도 부담이 크지 않다.
   */
  get(key: string): Promise<{ body: ArrayBuffer; contentType: string | null }>;

  /** 없는 키가 섞여 있어도 오류로 보지 않는다 (이미 지워진 경우) */
  remove(keys: string[]): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
  }
}
