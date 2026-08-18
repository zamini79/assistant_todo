/**
 * 전체 지시사항 (표 뷰) — README §3.
 * 배경 #fff, min-height 100vh
 */
import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { CreateTodoButton } from "@/components/todo-dialog/triggers";
import { FilterBar } from "@/components/todos/filter-bar";
import { Pagination } from "@/components/todos/pagination";
import { TodoTable } from "@/components/todos/todo-table";
import { EmptyState, OutlineLink } from "@/components/ui/primitives";
import { today as getToday } from "@/lib/domain/date";
import { DEFAULT_PAGE_SIZE, isFilterEmpty } from "@/lib/domain/query";
import { CATEGORIES } from "@/lib/domain/todo";
import { getTodoRepository } from "@/lib/repository";
import { getMailStatus } from "@/lib/mail";
import {
  exportHref,
  filterSummary,
  normalizeSearchParams,
  toFilter,
  toQuery,
  toSort,
  toTab,
  todosHref,
  TABS,
  TAB_LABELS,
  type RawSearchParams,
  type Tab,
} from "@/lib/ui/search-params";
import clsx from "clsx";

export const dynamic = "force-dynamic";

/**
 * 탭이 고르는 기본 정렬.
 * 프로토타입에서 탭은 강조 표시만 했지만, 실제 구현에서는
 * "무엇을 기준으로 묶어 보는가"를 정렬로 반영한다.
 */
const TAB_SORT: Record<Tab, string | null> = {
  전체: null,
  개인별: "assigneeName",
  회의체별: "meetingBody",
  구분별: "category",
};

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = normalizeSearchParams(await searchParams);
  const repository = getTodoRepository();
  const today = getToday();

  const query = toQuery(params, DEFAULT_PAGE_SIZE);
  const [page, aggregates] = await Promise.all([
    repository.list(query),
    // 신호등 칩의 건수는 필터와 무관한 전체 기준 (프로토타입과 동일)
    repository.aggregate(),
  ]);

  const options = await repository.options();
  const activeTab = toTab(params);
  const filtered = !isFilterEmpty(toFilter(params));

  // 펼침 대상이 현재 페이지에 실제로 있을 때만 이력을 읽는다.
  // (필터를 바꿔 사라진 id가 URL에 남아 있어도 헛질의를 하지 않는다.)
  const openTodo = params.open
    ? page.rows.find((t) => t.id === params.open)
    : undefined;

  const [updateCounts, openUpdates, openRemindLogs] = await Promise.all([
    repository.countUpdates(page.rows.map((t) => t.id)),
    openTodo ? repository.listUpdates(openTodo.id) : Promise.resolve([]),
    openTodo ? repository.listRemindLogs(openTodo.id) : Promise.resolve([]),
  ]);
  const mailConfigured = getMailStatus().configured;

  return (
    <AppShell
      active="all"
      activePerson={params.person}
      activeMeeting={params.meeting}
    >
      <div className="min-h-screen bg-card pb-[24px]">
        <header className="flex items-center justify-between px-[44px] pt-[26px]">
          <div>
            <h1 className="text-view font-semibold tracking-[-0.02em] text-ink">
              전체 지시사항
            </h1>
            <p className="mt-[4px] text-aux leading-[1.6] text-ink-4">
              {filterSummary(params)}
            </p>
          </div>
          <div className="flex items-center gap-[8px]">
            <OutlineLink
              href={exportHref(params)}
              prefetch={false}
              className="px-[13px] py-[9px] text-cell leading-none"
            >
              Excel 다운로드
            </OutlineLink>
            <CreateTodoButton />
          </div>
        </header>

        <div className="flex items-stretch gap-[22px] border-b border-line-card px-[44px] pt-[16px]">
          {TABS.map((tab) => {
            const active = activeTab === tab;
            return (
              <Link
                key={tab}
                href={todosHref(params, { tab, sort: TAB_SORT[tab], dir: null })}
                className={clsx(
                  "px-[2px] pt-[8px] pb-[12px] text-section",
                  active
                    ? "border-b-2 border-dark font-semibold text-ink"
                    : "border-b-2 border-transparent text-ink-3",
                )}
              >
                {TAB_LABELS[tab]}
              </Link>
            );
          })}
        </div>

        <FilterBar
          params={params}
          meetingBodies={options.meetingBodies}
          people={options.people}
          categories={CATEGORIES}
          signalCounts={aggregates.signalCounts}
        />

        {page.rows.length > 0 ? (
          <TodoTable
            todos={page.rows}
            today={today}
            params={params}
            sort={toSort(params)}
            updateCounts={updateCounts}
            openTodoId={openTodo?.id}
            openUpdates={openUpdates}
            openRemindLogs={openRemindLogs}
            mailConfigured={mailConfigured}
          />
        ) : (
          <EmptyState
            title={filtered ? "조건에 맞는 지시사항이 없습니다." : "등록된 지시사항이 없습니다."}
            description={
              filtered
                ? "필터를 조정하거나 초기화해 보세요."
                : "첫 지시사항을 등록해 보세요."
            }
            action={
              filtered ? (
                <OutlineLink
                  href={todosHref({}, { tab: params.tab ?? null })}
                  className="px-[13px] py-[9px] text-cell leading-none"
                >
                  필터 초기화
                </OutlineLink>
              ) : (
                <CreateTodoButton />
              )
            }
          />
        )}

        <Pagination
          params={params}
          shown={page.rows.length}
          total={page.total}
          page={page.page}
          pageSize={page.pageSize}
        />
      </div>
    </AppShell>
  );
}
