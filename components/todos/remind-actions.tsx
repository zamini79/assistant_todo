"use client";

/**
 * 표 행에서 Remind 메일을 보내는 버튼.
 *
 * 서버가 대신 보내지 않고, 설치된 메일 앱(Outlook)의 새 메일 창을 채워서 연다.
 * 사용자 계정에서 나가므로 수신자에게 사내 발신자로 보이고, 호스팅이 SMTP
 * 포트를 막아도 영향을 받지 않는다.
 *
 * 대신 시스템은 "정말 보냈는지"를 알 수 없다. 창을 연 뒤 확인을 받아
 * 발송 이력에 남긴다 — 안 남기면 발송대기/발송완료 뱃지가 무의미해진다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Mail } from "lucide-react";

import { recordManualRemindAction } from "@/app/actions/remind";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import { today as getToday } from "@/lib/domain/date";
import { buildRemindMail } from "@/lib/mail/remind-template";
import { buildMailtoLink } from "@/lib/mail/mailto";
import { resolveRecipients, type TodoRecipient } from "@/lib/domain/settings";
import { isDone, REMIND_LABELS, type Todo } from "@/lib/domain/todo";
import { REMIND_BADGE } from "@/lib/ui/signal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function RemindCell({
  todo,
  recipients,
  assistantName,
  assistantEmail,
}: {
  todo: Todo;
  /** 이 지시사항에 지정된 추가 수신자 */
  recipients: TodoRecipient[];
  /** 메일 서명에 쓴다 */
  assistantName: string;
  /** 참조(CC)로 함께 받는다 */
  assistantEmail: string | null;
}) {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 메일 창을 연 뒤 "보냈는지" 물어보는 두 번째 단계
  const [askRecord, setAskRecord] = useState(false);
  const [pending, startTransition] = useTransition();

  /*
   * 완료된 건은 보내지 않는다 — 끝난 일로 담당자를 재촉하게 된다.
   * 버튼이 살아 있으면 눌러 보고 나서야 알게 되므로 이유를 툴팁으로 미리 알려 준다.
   */
  const done = isDone(todo);
  const targets = resolveRecipients(todo.assigneeEmail, recipients);
  const canSend = targets.length > 0 && !done;
  const reason = done
    ? "완료된 지시사항입니다."
    : targets.length === 0
      ? "담당자 이메일이 등록되지 않았습니다."
      : undefined;

  const openMailApp = () => {
    const mail = buildRemindMail(todo, getToday(), assistantName);
    const { url, trimmed } = buildMailtoLink({
      to: targets,
      cc: assistantEmail ? [assistantEmail] : [],
      subject: mail.subject,
      // 메일 앱은 서식 없는 본문만 받는다. HTML 쪽은 쓰지 않는다.
      body: mail.text,
    });

    // 사용자 클릭에서 바로 이동해야 브라우저가 막지 않는다.
    window.location.href = url;
    if (trimmed) {
      toast("본문이 길어 일부만 담았습니다. 메일 창에서 확인해 주세요.", "danger");
    }
    setConfirmOpen(false);
    setAskRecord(true);
  };

  const record = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("todoId", todo.id);
      data.set("recipients", targets.join(","));
      const result = await recordManualRemindAction(IDLE_FORM_STATE, data);
      if (result.status !== "idle") {
        toast(result.message, result.status === "error" ? "danger" : "default");
      }
      if (result.status !== "error") setAskRecord(false);
    });
  };

  const others = targets.length - 1;
  const who = `${targets[0] ?? ""}${others > 0 ? ` 외 ${others}명` : ""}`;

  return (
    <>
      <div className="flex items-center gap-[5px]">
        <span
          className={clsx(
            "inline-block rounded-ctl px-[7px] py-[5px] text-note leading-none font-medium",
            REMIND_BADGE[todo.remindStatus],
            // 끝난 건의 '발송대기'는 남은 할 일이 아니다.
            done && "opacity-60",
          )}
        >
          {REMIND_LABELS[todo.remindStatus]}
        </span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={!canSend}
          title={reason ?? `${who}에게 보낼 메일 창을 엽니다`}
          aria-label="Remind 메일 작성"
          className="rounded-ctl p-[3px] text-ink-5 transition-colors enabled:cursor-pointer enabled:hover:bg-surface enabled:hover:text-dark disabled:opacity-30"
        >
          <Mail size={12} />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="메일 창을 열까요?"
        description={[
          `받는 사람: ${who}`,
          ...(assistantEmail ? [`참조: ${assistantEmail}`] : []),
          "",
          `“${todo.detail}”`,
          "",
          "내용이 채워진 채로 메일 앱이 열립니다. 보내기는 메일 앱에서 직접 누르세요.",
        ].join("\n")}
        confirmLabel="메일 창 열기"
        tone="default"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={openMailApp}
      />

      {/*
        시스템은 사용자가 실제로 보냈는지 알 수 없다. 답을 받아 그대로 적는다.
        [닫기]를 고르면 아무것도 남기지 않는다 — 안 보낸 건을 발송완료로
        표시하면 이력이 거짓말을 하게 된다.
      */}
      <ConfirmDialog
        open={askRecord}
        pending={pending}
        title="메일을 보내셨나요?"
        description={`보내셨다면 발송 이력에 남깁니다.\n${who}\n\n아직이라면 닫으세요 — 기록은 남지 않습니다.`}
        confirmLabel="발송 기록 남기기"
        tone="default"
        onCancel={() => setAskRecord(false)}
        onConfirm={record}
      />
    </>
  );
}
