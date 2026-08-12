"use client";

/**
 * 삭제 확인 다이얼로그.
 * README "구현 시 추가로 필요한 것 — 삭제 확인 다이얼로그" (프로토타입 미포함).
 */
import { useEffect, useRef } from "react";

import { OutlineButton } from "./primitives";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "삭제",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(42,35,28,.45)] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-[380px] rounded-modal bg-card shadow-modal"
      >
        <div className="px-[24px] pt-[22px] pb-[18px]">
          <p className="text-modal font-semibold text-ink">{title}</p>
          {description ? (
            <p className="mt-[8px] text-label leading-[1.7] text-ink-3">{description}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-[8px] border-t border-line-card bg-surface-alt px-[24px] py-[14px]">
          <OutlineButton className="px-[16px] py-[10px] text-cell" onClick={onCancel}>
            취소
          </OutlineButton>
          <button
            ref={confirmRef}
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex items-center justify-center rounded-ctl border border-danger-line bg-card px-[16px] py-[10px] text-cell font-medium text-danger-fg transition-colors hover:bg-signal-r-bg disabled:opacity-60"
          >
            {pending ? "처리 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
