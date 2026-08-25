/**
 * 전체 지시사항 표 (README §3).
 *
 * 헤더/행 동일 그리드:
 * `36px 96px 100px 126px 158px 96px minmax(0,1fr) 220px 88px 44px 132px`, 좌우 padding 44px
 * (관리 칸은 완료 토글이 들어가면서 76px에서 넓혔다.)
 */
import Link from "next/link";
import clsx from "clsx";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
} from "lucide-react";

import { isOverdue, toDateOnly, toShortDate } from "@/lib/domain/date";
import type { Sort } from "@/lib/domain/query";
import { isDone, type Todo } from "@/lib/domain/todo";
import type { TodoUpdate } from "@/lib/domain/todo-update";
import type { RemindLog } from "@/lib/repository/todo-repository";
import type { UpdateFile } from "@/lib/domain/attachment";
import type { TodoRecipient } from "@/lib/domain/settings";
import {
  nextSortPatch,
  todosHref,
  toggleOpenHref,
  type TodoSearchParams,
} from "@/lib/ui/search-params";
import { RowActions } from "@/components/todo-dialog/triggers";
import { CategoryBadge, SignalDot } from "@/components/ui/primitives";
import { RemindCell } from "./remind-actions";
import { AttachmentLinks } from "./attachment-links";

import { UpdateCountBadge, UpdateTimeline } from "./update-timeline";

const GRID =
  "grid grid-cols-[36px_96px_100px_126px_158px_96px_minmax(0,1fr)_220px_88px_44px_132px] items-center px-[44px]";

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
  recipientsByTodo,
  openTodoId,
  openUpdates,
  openRemindLogs,
  openUpdateFiles,
  mailConfigured,
  storageConfigured,
}: {
  todos: Todo[];
  today: string;
  params: TodoSearchParams;
  sort: Sort;
  /** 행별 이력 건수 (한 번에 조회해 N+1을 피한다) */
  updateCounts: Record<string, number>;
  /** 행별 추가 수신자 id — 수정 모달로 그대로 넘긴다 */
  recipientsByTodo: Record<string, TodoRecipient[]>;
  /** 펼쳐진 지시사항 id */
  openTodoId?: string;
  /** 펼쳐진 지시사항의 이력만 담는다 */
  openUpdates: TodoUpdate[];
  /** 펼쳐진 지시사항의 Remind 발송 이력 */
  openRemindLogs: RemindLog[];
  /** 펼쳐진 지시사항의 이력별 첨부 */
  openUpdateFiles: Record<string, UpdateFile[]>;
  /** SMTP 미설정이면 행의 발송 버튼을 막는다 */
  mailConfigured: boolean;
  /** 파일 저장소 미설정이면 첨부 칸을 막는다 */
  storageConfigured: boolean;
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
        const done = isDone(t);
        return (
          <div key={t.id}>
            <div
              className={clsx(
                GRID,
                "min-h-[56px] border-b border-line-row py-[10px] transition-colors",
                isOpen ? "bg-surface-alt" : "hover:bg-surface-alt",
                // 완료분은 한 단계 물러나 보이게 한다 — 상태 필터로 같이 볼 때
                // 아직 살아 있는 건과 눈으로 구분되도록.
                done && "opacity-60",
              )}
            >
              <div>
                {done ? (
                  <Check size={13} aria-label="완료" className="text-signal-g-fg" />
                ) : (
                  <SignalDot signal={t.signal} size={9} />
                )}
              </div>

              <div className="font-mono text-aux leading-[1.4] text-ink-2">
                {t.instructedAt}
              </div>

              <div
                className={clsx(
                  "font-mono text-aux leading-[1.4] font-medium",
                  // 끝난 건에 빨간 지연 표시를 남기면 아직 문제가 있는 것처럼 보인다.
                  !done && isOverdue(t.dueDate, today) ? "text-overdue" : "text-ink-2",
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
                    {done ? <DoneBadge completedAt={t.completedAt} /> : null}
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
                <AttachmentLinks todoId={t.id} attachments={t.attachments} />
              </div>

              <RowActions
                todo={t}
                recipients={recipientsByTodo[t.id] ?? []}
                storageConfigured={storageConfigured}
              />
            </div>

            {isOpen ? (
              <UpdateTimeline
                todo={t}
                updates={openUpdates}
                remindLogs={openRemindLogs}
                filesByUpdate={openUpdateFiles}
                storageConfigured={storageConfigured}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** 완료 배지 — 완료일을 함께 보여준다 */
function DoneBadge({ completedAt }: { completedAt: string | null }) {
  return (
    <span className="mr-[6px] inline-block rounded-ctl bg-signal-g-bg px-[6px] py-[2px] align-[1px] text-note leading-none font-medium text-signal-g-fg">
      완료{completedAt ? ` · ${toShortDate(toDateOnly(completedAt))}` : ""}
    </span>
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
