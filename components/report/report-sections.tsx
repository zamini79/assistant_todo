/**
 * 주간 리포트 본문 — 서버 컴포넌트.
 * 메일 본문(lib/mail/report-template)과 같은 WeeklyReport를 받아 같은 순서로 보여준다.
 */
import clsx from "clsx";

import { dueLabel, toDateOnly, toShortDate } from "@/lib/domain/date";
import { reportHighlights, type PersonLine, type WeeklyReport } from "@/lib/domain/report";
import type { Todo } from "@/lib/domain/todo";
import { SIGNAL_DOT } from "@/lib/ui/signal";
import { Card, EmptyState, SectionHeading } from "@/components/ui/primitives";

export function Highlights({ report }: { report: WeeklyReport }) {
  const items = reportHighlights(report);
  return (
    <div className="grid grid-cols-5 gap-[12px]">
      {items.map((h) => (
        <Card key={h.label} className="px-[18px] py-[16px]">
          <div className="text-label leading-none text-ink-4">{h.label}</div>
          <div
            className={clsx(
              "mt-[8px] font-mono text-title leading-none font-semibold",
              h.label === "지연" && h.value > 0 ? "text-overdue" : "text-ink",
            )}
          >
            {h.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** 지연·마감임박·신규처럼 "앞으로 할 일" 목록 */
export function TodoSection({
  title,
  hint,
  todos,
  today,
  emptyText,
  tone = "default",
}: {
  title: string;
  hint?: string;
  todos: Todo[];
  today: string;
  emptyText: string;
  tone?: "default" | "danger";
}) {
  return (
    <section className="mt-[26px]">
      <SectionHeading
        title={title}
        hint={hint ?? `${todos.length}건`}
        className="mb-[10px]"
      />
      <Card className="overflow-hidden">
        {todos.length === 0 ? (
          <EmptyState title={emptyText} />
        ) : (
          todos.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[92px_150px_minmax(0,1fr)_120px] items-center gap-[14px] border-b border-line-row px-[20px] py-[12px] last:border-b-0"
            >
              <div
                className={clsx(
                  "font-mono text-aux leading-none",
                  tone === "danger" ? "text-overdue" : "text-ink-2",
                )}
              >
                {toShortDate(t.dueDate)}
                <div className="mt-[4px] text-note leading-none text-ink-4">
                  {dueLabel(t.dueDate, today)}
                </div>
              </div>
              <div className="truncate text-aux leading-[1.5] text-ink-2">
                {t.org}
                <br />
                <span className="text-ink-4">{t.assigneeName}</span>
              </div>
              <div className="min-w-0">
                <p className="text-body leading-[1.5] text-ink">{t.detail}</p>
                <p className="mt-[3px] text-note leading-none text-ink-4">
                  {t.meetingBody} · {t.category}
                </p>
              </div>
              <div className="flex items-center justify-end gap-[6px] text-note text-ink-4">
                <span
                  aria-hidden
                  className={clsx("h-[7px] w-[7px] rounded-full", SIGNAL_DOT[t.signal])}
                />
                {t.progressNote ? "진행중" : "미기재"}
              </div>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}

/** 이번 주 완료 — 완료일 기준이라 별도 서식 */
export function CompletedSection({ todos }: { todos: Todo[] }) {
  return (
    <section className="mt-[26px]">
      <SectionHeading
        title="이번 주 완료"
        hint={`${todos.length}건`}
        className="mb-[10px]"
      />
      <Card className="overflow-hidden">
        {todos.length === 0 ? (
          <EmptyState title="이번 주에 완료된 지시사항이 없습니다." />
        ) : (
          todos.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[92px_150px_minmax(0,1fr)] items-center gap-[14px] border-b border-line-row px-[20px] py-[12px] last:border-b-0"
            >
              <div className="font-mono text-aux leading-none text-signal-g-fg">
                {t.completedAt ? toShortDate(toDateOnly(t.completedAt)) : "—"}
                <div className="mt-[4px] text-note leading-none text-ink-4">완료</div>
              </div>
              <div className="truncate text-aux leading-[1.5] text-ink-2">
                {t.org}
                <br />
                <span className="text-ink-4">{t.assigneeName}</span>
              </div>
              <div className="min-w-0">
                <p className="text-body leading-[1.5] text-ink">{t.detail}</p>
                <p className="mt-[3px] text-note leading-none text-ink-4">
                  {t.meetingBody} · {t.category}
                </p>
              </div>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}

export function PeopleTable({ people }: { people: PersonLine[] }) {
  return (
    <section className="mt-[26px]">
      <SectionHeading
        title="담당자별"
        hint="지연 많은 순"
        className="mb-[10px]"
      />
      <Card className="overflow-hidden">
        {people.length === 0 ? (
          <EmptyState title="집계할 담당자가 없습니다." />
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_110px] items-center border-b border-line-card bg-surface-alt px-[20px] py-[10px] text-label leading-none font-semibold text-ink-3">
              <div>담당</div>
              <div className="text-right">미결</div>
              <div className="text-right">지연</div>
              <div className="text-right">이번 주 완료</div>
            </div>
            {people.map((p) => (
              <div
                key={p.assigneeName}
                className="grid grid-cols-[minmax(0,1fr)_90px_90px_110px] items-center border-b border-line-row px-[20px] py-[12px] last:border-b-0"
              >
                <div className="flex items-center gap-[8px] truncate text-body text-ink">
                  <span
                    aria-hidden
                    className={clsx("h-[7px] w-[7px] shrink-0 rounded-full", SIGNAL_DOT[p.worst])}
                  />
                  <span className="truncate">
                    {p.org} <span className="text-ink-3">{p.assigneeName}</span>
                  </span>
                </div>
                <div className="text-right font-mono text-aux text-ink-2">{p.open}</div>
                <div
                  className={clsx(
                    "text-right font-mono text-aux",
                    p.overdue > 0 ? "font-semibold text-overdue" : "text-ink-4",
                  )}
                >
                  {p.overdue}
                </div>
                <div className="text-right font-mono text-aux text-signal-g-fg">
                  {p.doneThisWeek || "—"}
                </div>
              </div>
            ))}
          </>
        )}
      </Card>
    </section>
  );
}
