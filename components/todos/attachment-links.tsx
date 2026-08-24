/**
 * 지시사항 본문 첨부 — 표·브리핑의 클립 아이콘.
 *
 * 실물이 저장된 건만 링크를 건다. 옛 데이터는 이름만 있어 클릭하면 404가 나므로
 * 아이콘만 흐리게 보여준다.
 */
import clsx from "clsx";
import { Paperclip } from "lucide-react";

import { isStored, type Attachment } from "@/lib/domain/todo";

export function AttachmentLinks({
  todoId,
  attachments,
  size = 13,
  className,
}: {
  todoId: string;
  attachments: Attachment[];
  size?: number;
  className?: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <span className={clsx("inline-flex items-center gap-[4px]", className)}>
      {attachments.map((a) =>
        isStored(a) ? (
          <a
            key={a.id}
            href={`/api/todos/${todoId}/attachments/${a.id}`}
            title={`${a.name} 내려받기`}
            aria-label={`첨부 내려받기: ${a.name}`}
            className="inline-block transition-colors hover:text-dark"
          >
            <Paperclip size={size} />
          </a>
        ) : (
          <Paperclip
            key={a.id}
            size={size}
            className="opacity-50"
            aria-label={`첨부(파일명만): ${a.name}`}
          />
        ),
      )}
    </span>
  );
}
