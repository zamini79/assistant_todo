"use client";

/**
 * Remind 메일 큐 (README §2 우측 레일).
 * 큐 = Remind 상태가 `wait`(발송대기)인 항목.
 *
 * 체크 상태는 README State Management의 `sent: { [todoId]: boolean }`를 따라
 * 로컬 상태로만 둔다 — 실제 발송은 사내 메일서버 연동 후.
 */
import { useState } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";

import { toShortDate } from "@/lib/domain/date";
import type { Todo } from "@/lib/domain/todo";
import { queueDueClass } from "@/lib/ui/signal";

const SUBJECT_MAX = 22;

export function RemindQueue({ todos }: { todos: Todo[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const selectedCount = todos.filter((t) => checked[t.id]).length;

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
          disabled
          title="사내 메일서버 연동 후 활성화됩니다."
          className="flex-1 cursor-not-allowed rounded-ctl bg-on-dark p-[11px] text-center text-cell leading-none font-semibold text-dark opacity-90"
        >
          선택 발송 (준비중){selectedCount > 0 ? ` · ${selectedCount}건` : ""}
        </button>
        <button
          type="button"
          disabled
          title="사내 메일서버 연동 후 활성화됩니다."
          className="cursor-not-allowed rounded-ctl border border-dark-outline px-[13px] py-[11px] text-cell leading-none text-on-dark-2"
        >
          템플릿
        </button>
      </div>

      <p className="mt-[10px] text-note leading-[1.6] text-on-dark-3">
        사내 메일서버 구축 후 실제 발송 · 현재는 발송 예약만 기록
      </p>
    </section>
  );
}
