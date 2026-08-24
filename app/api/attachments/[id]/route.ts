/**
 * 이력 첨부 다운로드.
 * 응답 서식은 lib/storage/serve.ts가 지시사항 첨부와 공통으로 담당한다.
 */
import { getTodoRepository } from "@/lib/repository";
import { serveStoredFile } from "@/lib/storage/serve";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const file = await getTodoRepository().findUpdateFile(id);
  if (!file) return new Response("첨부를 찾을 수 없습니다.", { status: 404 });

  return serveStoredFile({
    storageKey: file.storageKey,
    name: file.name,
    contentType: file.contentType,
    label: `update-file ${id}`,
  });
}
