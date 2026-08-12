/**
 * 임원별 미결 현황 (README §2 좌측 컬럼 하단).
 * 행 그리드 `172px minmax(0,1fr) 60px`, G·Y·R 누적 막대(높이 8px).
 */
import Link from "next/link";

import type { PersonStat } from "@/lib/domain/aggregate";
import { SIGNAL_FILL } from "@/lib/ui/signal";
import { todosHref } from "@/lib/ui/search-params";
import { Card, EmptyState } from "@/components/ui/primitives";

export function PersonSummary({ people }: { people: PersonStat[] }) {
  if (people.length === 0) {
    return (
      <Card>
        <EmptyState title="미결 지시사항이 없습니다." />
      </Card>
    );
  }

  return (
    <Card className="px-[16px] py-[6px]">
      {people.map((p, i) => (
        <Link
          key={p.assigneeName}
          href={todosHref({}, { person: p.assigneeName, tab: "개인별" })}
          className="grid grid-cols-[172px_minmax(0,1fr)_60px] items-center gap-[18px] py-[12px] transition-colors hover:bg-surface-alt"
          style={{
            borderBottom:
              i === people.length - 1 ? "none" : "1px solid var(--color-line-row)",
          }}
        >
          <div className="min-w-0">
            <div className="truncate text-body leading-[1.4] text-ink">{p.assigneeName}</div>
            <div className="mt-[2px] truncate text-note leading-[1.4] text-ink-4">
              {p.org}
            </div>
          </div>

          <div
            className="flex h-[8px] overflow-hidden rounded-bar bg-surface"
            title={`Green ${p.counts.G} · Yellow ${p.counts.Y} · Red ${p.counts.R}`}
          >
            <span className={SIGNAL_FILL.G} style={{ width: `${p.widths.G}%` }} />
            <span className={SIGNAL_FILL.Y} style={{ width: `${p.widths.Y}%` }} />
            <span className={SIGNAL_FILL.R} style={{ width: `${p.widths.R}%` }} />
          </div>

          <div className="text-right font-mono text-cell leading-none font-medium text-ink-2">
            {p.open}건
          </div>
        </Link>
      ))}
    </Card>
  );
}
