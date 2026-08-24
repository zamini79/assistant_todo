/**
 * 이력에 붙은 첨부 목록 — 서버 컴포넌트.
 *
 * 링크는 스토리지가 아니라 우리 라우트를 가리킨다. 요청할 때마다 짧은 서명 URL을
 * 새로 만들어 리다이렉트하므로, 이 HTML이 캐시돼도 유효한 링크가 남지 않는다.
 */
import { Download, Paperclip } from "lucide-react";

import { formatBytes, type UpdateFile } from "@/lib/domain/attachment";

import { DeleteFileButton } from "./update-form";

export function UpdateFiles({ files }: { files: UpdateFile[] }) {
  if (files.length === 0) return null;

  return (
    <ul className="mt-[7px] flex flex-wrap gap-[6px]">
      {files.map((f) => (
        <li
          key={f.id}
          className="flex max-w-[320px] items-center gap-[6px] rounded-ctl border border-line-field bg-card px-[8px] py-[6px] text-note leading-none"
        >
          <Paperclip size={10} aria-hidden className="shrink-0 text-ink-5" />
          <a
            href={`/api/attachments/${f.id}`}
            className="flex min-w-0 items-center gap-[5px] text-ink-2 hover:text-dark hover:underline"
            title={`${f.name} · ${formatBytes(f.size)}`}
          >
            <span className="truncate">{f.name}</span>
            <Download size={10} aria-hidden className="shrink-0" />
          </a>
          <span className="shrink-0 font-mono text-ink-5">{formatBytes(f.size)}</span>
          <DeleteFileButton fileId={f.id} fileName={f.name} />
        </li>
      ))}
    </ul>
  );
}
