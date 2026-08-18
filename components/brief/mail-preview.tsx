"use client";

/**
 * 발송될 메일 미리보기.
 *
 * 큐의 "템플릿" 버튼이 여는 화면. 보내기 전에 무엇이 나가는지 확인한다.
 * 템플릿이 순수 함수라 서버 왕복 없이 여기서 바로 렌더한다.
 */
import { useEffect } from "react";

import { buildRemindMail } from "@/lib/mail/remind-template";
import type { Todo } from "@/lib/domain/todo";

export function MailPreview({
  todo,
  today,
  onClose,
}: {
  todo: Todo;
  today: string;
  onClose: () => void;
}) {
  const mail = buildRemindMail(todo, today);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[rgba(42,35,28,.45)] px-5 py-[48px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Remind 메일 미리보기"
        className="w-[720px] overflow-hidden rounded-modal bg-card shadow-modal"
      >
        <div className="border-b border-line-card px-[26px] py-[20px]">
          <h2 className="text-modal font-semibold text-ink">Remind 메일 미리보기</h2>
          <p className="mt-[3px] text-label leading-[1.6] text-ink-4">
            실제로 발송될 내용입니다 · 수신자마다 개별 발송됩니다
          </p>
        </div>

        <div className="px-[26px] py-[22px]">
          <dl className="mb-[16px] grid grid-cols-[64px_minmax(0,1fr)] gap-y-[8px] text-cell">
            <dt className="text-ink-3">받는이</dt>
            <dd className="text-ink">
              {todo.assigneeEmail ?? (
                <span className="text-danger-fg">이메일 미등록 — 발송되지 않습니다</span>
              )}
            </dd>
            <dt className="text-ink-3">제목</dt>
            <dd className="text-ink">{mail.subject}</dd>
          </dl>

          <div
            className="max-h-[420px] overflow-auto rounded-card border border-line-card p-[18px]"
            // 템플릿이 만든 HTML만 넣는다. 사용자 입력은 buildRemindMail에서 이스케이프된다.
            dangerouslySetInnerHTML={{ __html: mail.html }}
          />
        </div>

        <div className="flex justify-end border-t border-line-card bg-surface-alt px-[26px] py-[16px]">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-ctl border border-line-field px-[18px] py-[10px] text-cell leading-none text-ink-3 transition-colors hover:border-line-hover"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
