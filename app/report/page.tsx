/**
 * 주간 리포트 — 사장님 보고용 한 주 요약.
 *
 * 화면과 메일 본문이 같은 buildWeeklyReport 결과를 쓴다.
 * 기간은 `?week=YYYY-MM-DD`가 속한 주(월~일), 없으면 이번 주.
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import {
  CompletedSection,
  Highlights,
  PeopleTable,
  TodoSection,
} from "@/components/report/report-sections";
import { SendReportButton } from "@/components/report/send-report";
import { OutlineLink } from "@/components/ui/primitives";
import {
  addDays,
  formatRange,
  isDateString,
  today as getToday,
  weekRange,
} from "@/lib/domain/date";
import { buildWeeklyReport, DUE_SOON_DAYS } from "@/lib/domain/report";
import { getTodoRepository } from "@/lib/repository";
import { getMailStatus } from "@/lib/mail";

export const dynamic = "force-dynamic";

const NAV =
  "flex items-center gap-[4px] rounded-ctl border border-line-field bg-card px-[11px] py-[8px] text-cell leading-none text-ink-3 transition-colors hover:border-line-hover";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const weekParam = Array.isArray(raw.week) ? raw.week[0] : raw.week;

  const today = getToday();
  // 잘못된 값이 들어오면 조용히 이번 주로 되돌린다.
  const base = isDateString(weekParam) ? weekParam : today;
  const range = weekRange(base);

  const repository = getTodoRepository();
  const todos = await repository.listAll();

  const report = buildWeeklyReport(todos, range, today);
  const mailConfigured = getMailStatus().configured;

  const thisWeek = weekRange(today);
  const isCurrentWeek = range.start === thisWeek.start;

  const summary = `${formatRange(range)} · 미결 ${report.openTotal}건 · 지연 ${report.overdue.length}건 · 이번 주 완료 ${report.completedThisWeek.length}건`;

  return (
    <AppShell active="report">
      <div className="min-h-screen bg-card px-[44px] pt-[26px] pb-[40px]">
        <header className="mb-[22px] flex items-end justify-between">
          <div>
            <div className="font-mono text-label leading-none tracking-[0.1em] text-ink-4">
              WEEKLY REPORT
            </div>
            <h1 className="mt-[6px] text-title font-semibold tracking-[-0.02em] text-ink">
              {formatRange(range)}
            </h1>
            <p className="mt-[4px] text-aux leading-[1.6] text-ink-4">
              {isCurrentWeek
                ? `이번 주 기준 · 지연·마감임박은 ${today} 기준으로 계산합니다`
                : "지난 주 보기 · 지연·마감임박은 오늘 기준으로 계산합니다"}
            </p>
          </div>

          <div className="flex items-center gap-[8px]">
            <Link href={`/report?week=${addDays(range.start, -7)}`} className={NAV}>
              <ChevronLeft size={13} />
              이전 주
            </Link>
            {isCurrentWeek ? (
              <span className={`${NAV} cursor-not-allowed opacity-50`}>
                다음 주
                <ChevronRight size={13} />
              </span>
            ) : (
              <Link href={`/report?week=${addDays(range.start, 7)}`} className={NAV}>
                다음 주
                <ChevronRight size={13} />
              </Link>
            )}
            <OutlineLink
              href="/todos"
              className="px-[13px] py-[9px] text-cell leading-none"
            >
              전체 지시사항
            </OutlineLink>
            <SendReportButton
              mailConfigured={mailConfigured}
              baseDate={range.start}
              summary={summary}
            />
          </div>
        </header>

        <div className="max-w-[1100px]">
          <Highlights report={report} />

          <TodoSection
            title="지연"
            todos={report.overdue}
            today={today}
            tone="danger"
            emptyText="지연된 지시사항이 없습니다."
          />

          <TodoSection
            title="마감 임박"
            hint={`${DUE_SOON_DAYS}일 이내 · ${report.dueSoon.length}건`}
            todos={report.dueSoon}
            today={today}
            emptyText="마감이 임박한 지시사항이 없습니다."
          />

          <CompletedSection todos={report.completedThisWeek} />

          <TodoSection
            title="이번 주 신규 지시"
            todos={report.createdThisWeek}
            today={today}
            emptyText="이번 주에 등록된 지시사항이 없습니다."
          />

          <PeopleTable people={report.people} />
        </div>
      </div>
    </AppShell>
  );
}
