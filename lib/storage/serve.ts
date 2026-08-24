import "server-only";

/**
 * 저장된 파일을 브라우저로 내려주는 공통 응답.
 *
 * 지시사항 첨부와 이력 첨부가 같은 규칙을 쓴다 — 한쪽만 고쳐서
 * 파일명이 깨지거나 인라인으로 렌더되는 일이 생기지 않게 한 곳에 모은다.
 */
import { getFileStorage } from "./index";

/** 브라우저가 인라인으로 렌더하지 않도록 항상 첨부로 내려준다 */
function contentDisposition(name: string): string {
  // 한글 파일명은 RFC 5987 형식으로 전달해야 브라우저가 제대로 받는다 (CSV 내보내기와 동일).
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function serveStoredFile(input: {
  storageKey: string;
  name: string;
  contentType?: string | null;
  /** 로그에 남길 식별자 */
  label: string;
}): Promise<Response> {
  const storage = getFileStorage();
  if (!storage) {
    return new Response("파일 저장소가 설정되지 않았습니다.", { status: 503 });
  }

  try {
    const object = await storage.get(input.storageKey);
    return new Response(object.body, {
      headers: {
        "Content-Type":
          input.contentType ?? object.contentType ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(input.name),
        "Content-Length": String(object.body.byteLength),
        // Content-Type을 브라우저가 멋대로 추측해 렌더하지 않게 한다.
        "X-Content-Type-Options": "nosniff",
        // 사내 문서라 중간 캐시에 남지 않게 한다.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("첨부 다운로드 실패", input.label, error);
    return new Response("파일을 내려받지 못했습니다.", { status: 502 });
  }
}
