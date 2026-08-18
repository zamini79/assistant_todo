/**
 * 전체 지시사항 표 (README §3).
 *
 * 헤더/행 동일 그리드:
 * `36px 96px 100px 126px 158px 96px minmax(0,1fr) 220px 88px 44px 76px`, 좌우 padding 44px
 */
import Link from "next/link";
import clsx from "clsx";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Paperclip,
} from "lucide-react";

import { isOverdue } from "@/lib/domain/date";
import type { Sort } from "@/lib/domain/query";
import type { Todo } from "@/lib/domain/todo";
import type { TodoUpdate } from "@/lib/domain/todo-update";
import type { RemindLog } from "@/lib/repository/todo-repository";
import {
  nextSortPatch,
  todosHref,
  toggleOpenHref,
  type TodoSearchParams,
} from "@/lib/ui/search-params";
import { RowActions } from "@/components/todo-dialog/triggers";
import { CategoryBadge, SignalDot } from "@/components/ui/primitives";
import { RemindCell } from "./remind-actions";

import { UpdateCountBadge, UpdateTimeline } from "./update-timeline";

const GRID =
  "grid grid-cols-[36px_96px_100px_126px_158px_96px_minmax(0,1fr)_220px_88px_44px_76px] items-center px-[44px]";

const SORTABLE: { key: Sort["key"]; label: string }[] = [
  { key: "instructedAt", label: "지시일" },
  { key: "dueDate", label: "완료목표일" },
  { key: "meetingBody", label: "회의체" },
  { key: "assigneeName", label: "조직 / 이름" },
  { key: "category", label: "구분" },
];

export function TodoTable({
  todos,
  today,
  params,
  sort,
  updateCounts,
  openTodoId,
  openUpdates,
  openRemindLogs,
  mailConfigured,
}: {
  todos: Todo[];
  today: string;
  params: TodoSearchParams;
  sort: Sort;
  /** 행별 이력 건수 (한 번에 조회해 N+1을 피한다) */
  updateCounts: Record<string, number>;
  /** 펼쳐진 지시사항 id */
  openTodoId?: string;
  /** 펼쳐진 지시사항의 이력만 담는다 */
  openUpdates: TodoUpdate[];
  /** 펼쳐진 지시사항의 Remind 발송 이력 */
  openRemindLogs: RemindLog[];
  /** SMTP 미설정이면 행의 발송 버튼을 막는다 */
  mailConfigured: boolean;
}) {
  return (
    <div>
      <div
        className={clsx(
          GRID,
          "h-[40px] border-b border-line-card bg-surface-alt text-label leading-none font-semibold text-ink-3",
        )}
      >
        <div>신호</div>
        {SORTABLE.map((col) => (
          <SortHeader key={col.key} column={col} params={params} sort={sort} />
        ))}
        <div>지시사항 세부 내용</div>
        <div>진행상황</div>
        <div>Remind</div>
        <div>첨부</div>
        <div className="text-right">관리</div>
      </div>

      {todos.map((t) => {
        const isOpen = openTodoId === t.id;
        return (
          <div key={t.id}>
            <div
              className={clsx(
                GRID,
                "min-h-[56px] border-b border-line-row py-[10px] transition-colors",
                isOpen ? "bg-surface-alt" : "hover:bg-surface-alt",
              )}
            >
              <div>
                <SignalDot signal={t.signal} size={9} />
              </div>

              <div className="font-mono text-aux leading-[1.4] text-ink-2">
                {t.instructedAt}
              </div>

              <div
                className={clsx(
                  "font-mono text-aux leading-[1.4] font-medium",
                  isOverdue(t.dueDate, today) ? "text-overdue" : "text-ink-2",
                )}
              >
                {t.dueDate}
              </div>

              <div className="pr-[10px] text-aux leading-[1.4] text-ink-2">
                {t.meetingBody}
              </div>

              <div className="pr-[10px] text-aux leading-[1.5] text-ink">
                {t.org}
                <br />
                <span className="text-ink-4">{t.assigneeName}</span>
              </div>

              <div>
                <CategoryBadge category={t.category} />
              </div>

              {/* 세부 내용 칸이 펼치기 버튼을 겸한다 — 가장 넓고 자연스러운 클릭 지점 */}
              <div className="pr-[18px]">
                <Link
                  href={toggleOpenHref(params, t.id)}
                  scroll={false}
                  aria-expanded={isOpen}
                  className="group flex items-start gap-[6px] text-left text-cell leading-[1.5] text-ink"
                >
                  <ChevronRight
                    size={13}
                    aria-hidden
                    className={clsx(
                      "mt-[3px] shrink-0 text-ink-5 transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  <span className="group-hover:underline">
                    {t.detail}
                    <UpdateCountBadge count={updateCounts[t.id] ?? 0} />
                  </span>
                </Link>
              </div>

              <div className="pr-[14px] text-label leading-[1.5] text-ink-3">
                {t.progressNote || "—"}
              </div>

              <div>
                <RemindCell todo={t} mailConfigured={mailConfigured} />
              </div>

              <div className="text-ink-5">
                {t.attachment ? (
                  <Paperclip
                    size={13}
                    aria-label={`첨부: ${t.attachment.name}`}
                  />
                ) : null}
              </div>

              <RowActions todo={t} />
            </div>

            {isOpen ? (
              <UpdateTimeline
                todo={t}
                updates={openUpdates}
                remindLogs={openRemindLogs}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SortHeader({
  column,
  params,
  sort,
}: {
  column: { key: Sort["key"]; label: string };
  params: TodoSearchParams;
  sort: Sort;
}) {
  const active = sort.key === column.key;
  return (
    <Link
      href={todosHref(params, nextSortPatch(params, column.key))}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={clsx(
        "flex items-center gap-[3px] transition-colors hover:text-ink",
        active && "text-ink",
      )}
    >
      {column.label}
      {/* 비활성 열은 정렬 가능함을 알리고, 활성 열은 현재 방향을 표시 */}
      {active ? (
        sort.dir === "asc" ? (
          <ChevronUp size={12} aria-hidden />
        ) : (
          <ChevronDown size={12} aria-hidden />
        )
      ) : (
        <ChevronsUpDown size={12} aria-hidden className="text-ink-5" />
      )}
    </Link>
  );
}
