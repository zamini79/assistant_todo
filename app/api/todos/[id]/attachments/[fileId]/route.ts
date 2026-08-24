/**
 * 지시사항 본문 첨부 다운로드.
 *
 * 첨부는 todos.attachments 배열에 있으므로 지시사항 id + 첨부 id로 찾는다.
 * 실물 저장 이전에 등록된 건은 이름만 있고 파일이 없어 404로 답한다 —
 * 없는 파일을 502로 감추면 원인을 찾기 어렵다.
 */
import { getTodoRepository } from "@/lib/repository";
import { isStored } from "@/lib/domain/todo";
import { serveStoredFile } from "@/lib/storage/serve";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;

  const todo = await getTodoRepository().findById(id);
  if (!todo) return new Response("지시사항을 찾을 수 없습니다.", { status: 404 });

  const attachment = todo.attachments.find((a) => a.id === fileId);
  if (!attachment) return new Response("첨부를 찾을 수 없습니다.", { status: 404 });

  if (!isStored(attachment)) {
    return new Response("이 첨부는 파일명만 등록돼 있어 내려받을 수 없습니다.", {
      status: 404,
    });
  }

  return serveStoredFile({
    storageKey: attachment.storageKey,
    name: attachment.name,
    contentType: attachment.contentType,
    label: `todo ${id} / file ${fileId}`,
  });
}
