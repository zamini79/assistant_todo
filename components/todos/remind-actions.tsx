"use client";

/**
 * 표 행에서 바로 Remind를 보내는 버튼.
 *
 * 큐(브리핑)는 여러 건을 골라 보내는 자리고, 여기는 눈앞의 한 건을 즉시 보내는 자리다.
 * 두 경로 모두 같은 서버 액션을 쓴다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Send } from "lucide-react";

import { sendRemindsAction } from "@/app/actions/remind";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import type { Todo } from "@/lib/domain/todo";
import { REMIND_LABELS } from "@/lib/domain/todo";
import { REMIND_BADGE } from "@/lib/ui/signal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function RemindCell({
  todo,
  mailConfigured,
}: {
  todo: Todo;
  mailConfigured: boolean;
}) {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const canSend = mailConfigured && Boolean(todo.assigneeEmail);
  const reason = !mailConfigured
    ? "SMTP 환경변수가 설정되지 않았습니다."
    : !todo.assigneeEmail
      ? "담당자 이메일이 등록되지 않았습니다."
      : undefined;

  const send = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("todoIds", todo.id);
      const result = await sendRemindsAction(IDLE_FORM_STATE, data);
      if (result.status === "success") toast(result.message);
      else if (result.status === "error") toast(result.message, "danger");
      setConfirmOpen(false);
    });
  };

  return (
    <>
      <div className="flex items-center gap-[5px]">
        <span
          className={clsx(
            "inline-block rounded-ctl px-[7px] py-[5px] text-note leading-none font-medium",
            REMIND_BADGE[todo.remindStatus],
          )}
        >
          {REMIND_LABELS[todo.remindStatus]}
        </span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!canSend || pending}
          title={reason ?? `${todo.assigneeEmail}로 Remind 발송`}
          aria-label="Remind 메일 발송"
          className="rounded-ctl p-[3px] text-ink-5 transition-colors enabled:cursor-pointer enabled:hover:bg-surface enabled:hover:text-dark disabled:opacity-30"
        >
          <Send size={12} />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        pending={pending}
        title="Remind 메일을 보낼까요?"
        description={`${todo.assigneeName} · ${todo.assigneeEmail ?? ""}\n"${todo.detail}"`}
        confirmLabel="발송"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={send}
      />
    </>
  );
}
