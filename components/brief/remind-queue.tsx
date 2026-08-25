"use client";

/**
 * Remind 메일 큐 (README §2 우측 레일).
 * 큐 = Remind 상태가 `wait`(발송대기)인 항목.
 *
 * 체크 상태는 README State Management의 `sent: { [todoId]: boolean }`를 따라
 * 로컬 상태로만 둔다 — 실제 발송은 사내 메일서버 연동 후.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";

import { toShortDate } from "@/lib/domain/date";
import type { Todo } from "@/lib/domain/todo";
import { queueDueClass } from "@/lib/ui/signal";
import { sendRemindsAction } from "@/app/actions/remind";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import { useToast } from "@/components/ui/toast";
import { MailPreview } from "./mail-preview";

const SUBJECT_MAX = 22;

export function RemindQueue({
  todos,
  mailConfigured,
  today,
}: {
  todos: Todo[];
  /** SMTP 미설정이면 발송 버튼을 막고 이유를 보여준다. */
  mailConfigured: boolean;
  /** 미리보기에서 D-라벨을 계산할 기준일 */
  today: string;
}) {
  const toast = useToast();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const [previewOf, setPreviewOf] = useState<Todo | null>(null);

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const selected = todos.filter((t) => checked[t.id]);
  const selectedCount = selected.length;
  // 주소가 없으면 보낼 수 없다. 선택은 되지만 발송 대상에서 빠진다.
  const sendable = selected.filter((t) => t.assigneeEmail);
  const missingEmail = selectedCount - sendable.length;

  const send = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("todoIds", sendable.map((t) => t.id).join(","));
      const result = await sendRemindsAction(IDLE_FORM_STATE, data);
      if (result.status === "success") {
        toast(result.message);
        setChecked({});
      } else if (result.status === "error") {
        toast(result.message, "danger");
      }
    });
  };

  return (
    <section className="rounded-card bg-dark px-[18px] pt-[18px] pb-[16px]">
      <div className="mb-[14px] flex items-baseline justify-between">
        <h2 className="text-section leading-none font-semibold text-on-dark">
          Remind 메일 큐
        </h2>
        <span className="font-mono text-label leading-none text-on-dark-3">
          {todos.length} 대기
        </span>
      </div>

      {todos.length === 0 ? (
        <p className="py-[22px] text-center text-label text-on-dark-3">
          발송 대기 중인 Remind가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-[1px]">
          {todos.map((t) => {
            const on = Boolean(checked[t.id]);
            const subject = `[${t.category}] ${
              t.detail.length > SUBJECT_MAX ? `${t.detail.slice(0, SUBJECT_MAX)}…` : t.detail
            }`;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-pressed={on}
                  className="flex w-full cursor-pointer items-center gap-[10px] border-b border-dark-hover py-[11px] text-left"
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-ctl border border-on-dark-label transition-colors",
                      on ? "bg-on-dark text-dark" : "bg-dark-hover text-transparent",
                    )}
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-cell leading-[1.4] text-on-dark">
                      {t.assigneeName}
                      {!t.assigneeEmail ? (
                        <span className="ml-[6px] text-note text-on-dark-danger">
                          이메일 미등록
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-note leading-[1.5] text-on-dark-3">
                      {subject}
                    </span>
                  </span>
                  <span
                    className={clsx(
                      "font-mono text-note leading-none",
                      queueDueClass(t.signal),
                    )}
                  >
                    {toShortDate(t.dueDate)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-[14px] flex gap-[8px]">
        <button
          type="button"
          onClick={send}
          disabled={!mailConfigured || pending || sendable.length === 0}
          title={
            mailConfigured
              ? undefined
              : "메일 발송 환경변수가 설정되지 않았습니다."
          }
          className="flex-1 rounded-ctl bg-on-dark p-[11px] text-center text-cell leading-none font-semibold text-dark transition-opacity enabled:cursor-pointer enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "발송 중…"
            : `선택 발송${sendable.length > 0 ? ` · ${sendable.length}건` : ""}`}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOf(selected[0] ?? todos[0] ?? null)}
          disabled={todos.length === 0}
          title="발송될 메일 내용을 미리 봅니다."
          className="rounded-ctl border border-dark-outline px-[13px] py-[11px] text-cell leading-none text-on-dark-2 transition-colors enabled:cursor-pointer enabled:hover:bg-dark-hover disabled:opacity-40"
        >
          템플릿
        </button>
      </div>

      {previewOf ? (
        <MailPreview todo={previewOf} today={today} onClose={() => setPreviewOf(null)} />
      ) : null}

      <p className="mt-[10px] text-note leading-[1.6] text-on-dark-3">
        {!mailConfigured
          ? "메일 발송 환경변수 미설정 · 설정하면 이 버튼으로 바로 발송됩니다"
          : missingEmail > 0
            ? `${missingEmail}건은 이메일이 없어 발송 대상에서 제외됩니다`
            : "사내 메일서버 전환은 환경변수만 교체하면 됩니다"}
      </p>
    </section>
  );
}
