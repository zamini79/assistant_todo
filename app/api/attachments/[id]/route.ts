/**
 * 첨부 다운로드.
 *
 * 스토리지 URL을 화면에 박거나 서명 URL로 리다이렉트하지 않고, 서버가 내용을 읽어
 * 직접 내려준다. 이유는 두 가지다.
 *  1. Supabase의 download 파라미터는 파일명을 이중 인코딩해서
 *     한글 이름이 `%EC%A0%84…`로 저장된다.
 *  2. 스토리지 URL이 브라우저에 아예 노출되지 않는다 — 링크가 새도 열 수 없다.
 */
import { getTodoRepository } from "@/lib/repository";
import { getFileStorage } from "@/lib/storage";

/** 브라우저가 인라인으로 렌더하지 않도록 항상 첨부로 내려준다 */
function contentDisposition(name: string): string {
  // 한글 파일명은 RFC 5987 형식으로 전달해야 브라우저가 제대로 받는다 (CSV 내보내기와 동일).
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const file = await getTodoRepository().findUpdateFile(id);
  if (!file) {
    return new Response("첨부를 찾을 수 없습니다.", { status: 404 });
  }

  const storage = getFileStorage();
  if (!storage) {
    return new Response("파일 저장소가 설정되지 않았습니다.", { status: 503 });
  }

  try {
    const object = await storage.get(file.storageKey);
    return new Response(object.body, {
      headers: {
        // 업로드된 HTML이 우리 출처에서 실행되지 않도록 octet-stream으로 고정한다.
        "Content-Type": file.contentType ?? object.contentType ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(file.name),
        "Content-Length": String(object.body.byteLength),
        "X-Content-Type-Options": "nosniff",
        // 사내 문서라 중간 캐시에 남지 않게 한다.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("첨부 다운로드 실패", id, error);
    return new Response("파일을 내려받지 못했습니다.", { status: 502 });
  }
}
