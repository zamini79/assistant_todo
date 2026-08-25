"use client";

/**
 * 완료 확인 창.
 *
 * 확인만 받던 자리에 코멘트와 첨부를 얹었다. 둘 다 선택 사항이라
 * 그냥 [완료 처리]를 눌러도 예전과 똑같이 동작한다.
 *
 * 남긴 코멘트·첨부는 진행 이력 한 건이 된다 — 완료 사유를 따로 보관하면
 * 타임라인이 두 갈래가 되고 첨부를 보는 화면도 두 벌이 된다.
 */
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

import { checkFiles } from "@/lib/domain/attachment";
import { OutlineButton } from "@/components/ui/primitives";

import { FilePicker } from "./file-picker";

export function CompleteDialog({
  todoId,
  detail,
  pending,
  storageConfigured,
  onCancel,
  onConfirm,
}: {
  todoId: string;
  /** 어느 지시사항을 끝내는지 확인시켜 준다 */
  detail: string;
  pending: boolean;
  storageConfigured: boolean;
  onCancel: () => void;
  onConfirm: (comment: string, files: File[]) => void;
}) {
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  /*
   * 열려 있을 때만 마운트된다(호출부가 조건부로 렌더한다).
   * 그래서 창을 닫으면 적어 둔 코멘트와 고른 파일도 함께 사라진다 —
   * 다시 열었을 때 지난 입력이 남아 있지 않도록 초기화할 필요가 없다.
   */
  useEffect(() => {
    commentRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const addFiles = (picked: File[]) => {
    const next = [...files, ...picked];
    const check = checkFiles(next.map((f) => ({ name: f.name, size: f.size })));
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    setFiles(next);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-[rgba(42,35,28,.45)] px-5 py-[56px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="완료 처리"
        className="w-[440px] rounded-modal bg-card shadow-modal"
      >
        <div className="px-[24px] pt-[22px] pb-[18px]">
          <p className="text-modal font-semibold text-ink">이 지시사항을 완료 처리할까요?</p>
          <p className="mt-[8px] text-label leading-[1.7] whitespace-pre-line text-ink-3">
            {`“${detail}”\n미결 목록과 임원별 현황, Remind 대상에서 빠집니다. 언제든 되돌릴 수 있습니다.`}
          </p>

          <div className="mt-[18px]">
            <label
              htmlFor={`complete-comment-${todoId}`}
              className="mb-[7px] block text-label leading-none font-medium text-ink-3"
            >
              코멘트 <span className="font-normal text-ink-5">(선택)</span>
            </label>
            <textarea
              ref={commentRef}
              id={`complete-comment-${todoId}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="어떻게 마무리됐는지 적어주세요"
              className="w-full rounded-ctl border border-line-field bg-card px-[11px] py-[10px] text-body leading-[1.6] text-ink outline-none transition-colors focus:border-line-hover"
              style={{ minHeight: 62 }}
            />
          </div>

          <div className="mt-[12px]">
            <p className="mb-[7px] text-label leading-none font-medium text-ink-3">
              첨부 <span className="font-normal text-ink-5">(선택)</span>
            </p>
            <FilePicker
              id={`complete-files-${todoId}`}
              files={files}
              onAdd={addFiles}
              onRemove={(i) => setFiles((prev) => prev.filter((_, at) => at !== i))}
              storageConfigured={storageConfigured}
              label="결과 파일 첨부"
            />
          </div>

          {error ? (
            <p role="alert" className="mt-[9px] text-note leading-[1.6] text-danger-fg">
              {error}
            </p>
          ) : null}

          <p className="mt-[10px] text-note leading-[1.6] text-ink-4">
            남긴 코멘트와 첨부는 진행 이력에 한 건으로 쌓입니다. 비워 두어도 됩니다.
          </p>
        </div>

        <div className="flex justify-end gap-[8px] border-t border-line-card bg-surface-alt px-[24px] py-[14px]">
          <OutlineButton className="px-[16px] py-[10px] text-cell" onClick={onCancel}>
            취소
          </OutlineButton>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm(comment, files)}
            className={clsx(
              "inline-flex cursor-pointer items-center justify-center rounded-ctl bg-dark px-[16px] py-[10px] text-cell font-medium text-on-dark transition-colors",
              "hover:bg-dark-hover disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {pending ? "처리 중…" : "완료 처리"}
          </button>
        </div>
      </div>
    </div>
  );
}
