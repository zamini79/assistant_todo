/**
 * 마감 임박 · 지연 (README §2 좌측 컬럼).
 * 카드 내부 그리드 `86px minmax(0,1fr) 150px`, gap 18px.
 */
import clsx from "clsx";
import { Paperclip } from "lucide-react";

import { dueLabel, isOverdue } from "@/lib/domain/date";
import type { Todo } from "@/lib/domain/todo";
import { EditTodoLink } from "@/components/todo-dialog/triggers";
import { RemindBadge, SignalDot } from "@/components/ui/primitives";

export function UrgentList({
  todos,
  today,
  recipientIdsByTodo,
}: {
  todos: Todo[];
  today: string;
  recipientIdsByTodo: Record<string, string[]>;
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      {todos.map((t) => {
        const overdue = isOverdue(t.dueDate, today);
        return (
          <article
            key={t.id}
            className="grid grid-cols-[86px_minmax(0,1fr)_150px] items-center gap-[18px] rounded-card border border-line-card bg-card px-[20px] py-[16px] transition-colors hover:border-line-hover"
          >
            <div>
              <div
                className={clsx(
                  "font-mono text-cell leading-[1.2] font-medium",
                  overdue ? "text-overdue" : "text-ink-2",
                )}
              >
                {t.dueDate}
              </div>
              <div className="mt-[3px] text-note leading-[1.4] text-ink-4">
                {dueLabel(t.dueDate, today)}
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-[6px] flex items-center gap-[7px]">
                <SignalDot signal={t.signal} size={7} />
                <span className="text-note leading-none font-medium text-ink-2">
                  {t.category}
                </span>
                <span className="text-note leading-none text-ink-4">{t.meetingBody}</span>
                {t.attachment ? (
                  <Paperclip
                    size={11}
                    className="text-ink-4"
                    aria-label={`첨부: ${t.attachment.name}`}
                  />
                ) : null}
              </div>
              <p className="text-body leading-[1.5] text-ink">{t.detail}</p>
              <p className="mt-[4px] text-label leading-[1.5] text-ink-3">
                {t.assigneeName} · {t.org} — {t.progressNote || "진행상황 미기재"}
              </p>
            </div>

            <div className="flex flex-col items-end gap-[7px]">
              <RemindBadge status={t.remindStatus} />
              <EditTodoLink todo={t} recipientIds={recipientIdsByTodo[t.id] ?? []} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
