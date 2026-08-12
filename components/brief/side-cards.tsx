/**
 * 우측 레일의 나머지 두 카드 — 구분별 분포 · 이번 주 회의 일정 (README §2).
 */
import Link from "next/link";

import { barWidth, type NamedCount } from "@/lib/domain/aggregate";
import { toShortDate } from "@/lib/domain/date";
import { MEETING_SCHEDULE } from "@/lib/seed/todos";
import { todosHref } from "@/lib/ui/search-params";
import { Card } from "@/components/ui/primitives";

/** 지시사항 구분별 분포 — 항목 그리드 `76px minmax(0,1fr) 30px`, 막대 높이 6px */
export function CategoryDistribution({ categories }: { categories: NamedCount[] }) {
  return (
    <Card className="p-[18px]">
      <h2 className="mb-[14px] text-section leading-none font-semibold text-ink">
        지시사항 구분별 분포
      </h2>
      <div className="flex flex-col gap-[11px]">
        {categories.map((c) => (
          <Link
            key={c.name}
            href={todosHref({}, { category: c.name, tab: "구분별" })}
            className="grid grid-cols-[76px_minmax(0,1fr)_30px] items-center gap-[12px]"
          >
            <span className="text-aux leading-none text-ink-2">{c.name}</span>
            <span className="block h-[6px] rounded-bar bg-surface">
              <span
                className="block h-[6px] rounded-bar bg-dark"
                style={{ width: `${barWidth(c.count, categories)}%` }}
              />
            </span>
            <span className="text-right font-mono text-label leading-none text-ink-3">
              {c.count}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * 이번 주 회의 일정.
 * 회의 일정 테이블이 아직 없어 정적 데이터를 쓴다 (lib/seed/todos.ts 주석 참고).
 */
export function MeetingSchedule() {
  return (
    <Card className="p-[18px]">
      <h2 className="mb-[12px] text-section leading-none font-semibold text-ink">
        이번 주 회의 일정
      </h2>
      <div className="flex flex-col gap-[10px]">
        {MEETING_SCHEDULE.map((m) => (
          <div key={`${m.date}-${m.name}`} className="flex items-baseline gap-[12px]">
            <span className="w-[52px] shrink-0 font-mono text-label leading-[1.4] font-medium text-ink-3">
              {toShortDate(m.date)}
            </span>
            <span className="text-cell leading-[1.4] text-ink">
              {m.name}
              {m.note ? <span className="text-ink-4"> · {m.note}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
