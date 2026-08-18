/**
 * 오늘의 브리핑 (기본 진입 화면) — README §2.
 * padding 32px 44px 40px · 본문 그리드 `minmax(0,1fr) minmax(380px,440px)`, gap 26px
 */
import { UrgentList } from "@/components/brief/urgent-list";
import { PersonSummary } from "@/components/brief/person-summary";
import { RemindQueue } from "@/components/brief/remind-queue";
import { CategoryDistribution, MeetingSchedule } from "@/components/brief/side-cards";
import { AppShell } from "@/components/shell/app-shell";
import { CreateTodoButton } from "@/components/todo-dialog/triggers";
import { Card, EmptyState, SectionHeading } from "@/components/ui/primitives";
import { daysBetween, toHeaderDate, today as getToday } from "@/lib/domain/date";
import type { Todo } from "@/lib/domain/todo";
import { getTodoRepository } from "@/lib/repository";
import { getMailStatus } from "@/lib/mail";

/** 데이터가 매 요청 최신이어야 하는 운영 화면이라 정적 프리렌더를 쓰지 않는다. */
export const dynamic = "force-dynamic";

/** "오늘 챙겨야 할" 기준: 지연됐거나 완료목표일이 7일 이내인 건 */
const ATTENTION_WINDOW_DAYS = 7;

function needsAttention(todo: Todo, today: string): boolean {
  return daysBetween(today, todo.dueDate) <= ATTENTION_WINDOW_DAYS;
}

export default async function BriefPage() {
  const repository = getTodoRepository();
  const today = getToday();

  const [todos, aggregates] = await Promise.all([
    repository.listAll(),
    repository.aggregate(),
  ]);

  const mailConfigured = getMailStatus().configured;
  const attentionCount = todos.filter((t) => needsAttention(t, today)).length;

  // 완료목표일 오름차순 상위 5건 (README: "정렬: 완료목표일 오름차순 상위 5건")
  const urgent = todos
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const recipientsByTodo = await repository.listTodoRecipientsFor(
    [...new Set([...urgent.map((t) => t.id), ...todos.filter((t) => t.remindStatus === "wait").map((t) => t.id)])],
  );
  const recipientIdsByTodo = Object.fromEntries(
    Object.entries(recipientsByTodo).map(([id, list]) => [id, list.map((r) => r.id)]),
  );

  const queue = todos
    .filter((t) => t.remindStatus === "wait")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <AppShell active="brief">
      <div className="px-[44px] pt-[32px] pb-[40px]">
        <header className="mb-[22px] flex items-end justify-between">
          <div>
            <div className="font-mono text-label leading-none tracking-[0.1em] text-ink-4">
              {toHeaderDate(today)}
            </div>
            <h1 className="mt-[6px] text-title font-semibold tracking-[-0.02em] text-ink">
              오늘 챙겨야 할 지시사항 <span className="text-overdue">{attentionCount}</span>건
            </h1>
          </div>
          <div className="flex gap-[8px]">
            <button
              type="button"
              disabled
              title="준비 중입니다."
              className="cursor-not-allowed rounded-ctl border border-line-field bg-card px-[13px] py-[9px] text-cell leading-none text-ink-field opacity-70"
            >
              주간 리포트
            </button>
            <CreateTodoButton />
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(380px,440px)] items-start gap-[26px]">
          <div>
            <SectionHeading
              title="마감 임박 · 지연"
              hint="완료목표일 순"
              className="mb-[12px]"
            />
            {urgent.length > 0 ? (
              <UrgentList
                todos={urgent}
                today={today}
                recipientIdsByTodo={recipientIdsByTodo}
              />
            ) : (
              <Card>
                <EmptyState
                  title="마감이 임박한 지시사항이 없습니다."
                  description="새 지시사항을 등록하면 완료목표일 순으로 여기에 표시됩니다."
                  action={<CreateTodoButton />}
                />
              </Card>
            )}

            <SectionHeading
              title="임원별 미결 현황"
              hint="사장님 보고용 요약"
              className="mt-[26px] mb-[12px]"
            />
            <PersonSummary people={aggregates.people} />
          </div>

          <div className="flex flex-col gap-[16px]">
            <RemindQueue todos={queue} mailConfigured={mailConfigured} today={today} />
            <CategoryDistribution categories={aggregates.categories} />
            <MeetingSchedule />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
