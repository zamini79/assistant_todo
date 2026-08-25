"use client";

/**
 * 파일 고르기 — 진행 이력 기록과 완료 처리에서 함께 쓴다.
 *
 * 고른 파일을 input이 아니라 부모의 state로 들고 있게 한다.
 * input[type=file]의 값은 통째로 비울 수만 있고 개별 항목을 뺄 수 없어서,
 * input에만 맡기면 "이 파일만 취소"가 불가능하다.
 */
import { useRef } from "react";
import clsx from "clsx";
import { Paperclip, X } from "lucide-react";

import {
  formatBytes,
  MAX_FILES_PER_UPDATE,
  MAX_FILE_BYTES,
} from "@/lib/domain/attachment";

export function FilePicker({
  id,
  files,
  onAdd,
  onRemove,
  storageConfigured,
  label = "파일 첨부",
}: {
  /** 라벨과 input을 잇는 값 — 한 화면에 여러 개가 놓이므로 호출부가 정한다 */
  id: string;
  files: File[];
  onAdd: (picked: File[]) => void;
  onRemove: (index: number) => void;
  /** 파일 저장소가 없으면 칸을 막고 이유를 알린다 */
  storageConfigured: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        className="sr-only"
        disabled={!storageConfigured}
        onChange={(e) => {
          onAdd([...(e.target.files ?? [])]);
          // 같은 파일을 다시 고를 수 있게 비운다.
          e.target.value = "";
        }}
      />
      <label
        htmlFor={id}
        title={
          storageConfigured
            ? `한 파일 ${formatBytes(MAX_FILE_BYTES)}까지 · 최대 ${MAX_FILES_PER_UPDATE}개`
            : "파일 저장소가 설정되지 않았습니다."
        }
        className={clsx(
          "flex items-center justify-center gap-[5px] rounded-ctl border border-dashed py-[8px] text-note leading-none transition-colors",
          storageConfigured
            ? "cursor-pointer border-line-field text-ink-4 hover:border-line-hover hover:text-ink-3"
            : "cursor-not-allowed border-line-field text-ink-5 opacity-60",
        )}
      >
        <Paperclip size={11} />
        {label}
      </label>

      {files.length > 0 ? (
        <ul className="mt-[7px] flex flex-col gap-[4px]">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-[6px] rounded-ctl bg-surface-alt px-[8px] py-[6px] text-note leading-none"
            >
              <Paperclip size={10} aria-hidden className="shrink-0 text-ink-5" />
              <span className="min-w-0 flex-1 truncate text-ink-2">{f.name}</span>
              <span className="shrink-0 font-mono text-ink-5">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`${f.name} 첨부 취소`}
                className="shrink-0 cursor-pointer text-ink-5 hover:text-danger-fg"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
