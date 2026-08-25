/**
 * 사이드바 (모든 화면 공통) — README §1.
 * 배경 #3b3128 · padding 26px 22px 30px · 폭 264px(그리드 트랙)
 */
import Link from "next/link";
import clsx from "clsx";

import type { Aggregates } from "@/lib/domain/aggregate";
import type { AppSettings } from "@/lib/domain/settings";
import { SidebarCreateItem } from "@/components/todo-dialog/triggers";
import { SignalDot } from "@/components/ui/primitives";
import { todosHref } from "@/lib/ui/search-params";

const ITEM = "rounded-ctl px-[11px] py-[9px] text-body leading-none transition-colors";

export function Sidebar({
  aggregates,
  active,
  activePerson,
  activeMeeting,
  settings,
}: {
  aggregates: Aggregates;
  /** 현재 전략 Assistant — 하단에 표시한다 */
  settings: AppSettings;
  /** 현재 뷰 */
  active: "brief" | "all" | "settings" | "report";
  activePerson?: string;
  activeMeeting?: string;
}) {
  return (
    <nav className="bg-dark px-[22px] pt-[26px] pb-[30px]">
      <div className="text-section leading-[1.4] font-semibold tracking-[-0.01em] text-on-dark">
        전략 Assistant
      </div>
      <div className="mt-[3px] font-mono text-note leading-[1.4] text-on-dark-3">
        TO-DO MANAGEMENT
      </div>

      <div className="mt-[24px] flex flex-col gap-[2px]">
        <Link
          href="/"
          className={clsx(
            ITEM,
            active === "brief"
              ? "bg-dark-hover font-medium text-on-dark"
              : "text-on-dark-2 hover:bg-dark-hover",
          )}
        >
          오늘의 브리핑
        </Link>
        <Link
          href="/todos"
          className={clsx(
            ITEM,
            active === "all"
              ? "bg-dark-hover font-medium text-on-dark"
              : "text-on-dark-2 hover:bg-dark-hover",
          )}
        >
          전체 지시사항
        </Link>
        <SidebarCreateItem />
        <Link
          href="/report"
          className={clsx(
            ITEM,
            active === "report"
              ? "bg-dark-hover font-medium text-on-dark"
              : "text-on-dark-2 hover:bg-dark-hover",
          )}
        >
          주간 리포트
        </Link>
        <Link
          href="/settings"
          className={clsx(
            ITEM,
            active === "settings"
              ? "bg-dark-hover font-medium text-on-dark"
              : "text-on-dark-2 hover:bg-dark-hover",
          )}
        >
          설정
        </Link>
      </div>

      <SectionLabel className="mt-[26px]">개인별</SectionLabel>
      <div className="mt-[10px] flex flex-col gap-[1px]">
        {aggregates.people.map((p) => (
          <Link
            key={p.assigneeName}
            href={todosHref({}, { person: p.assigneeName, tab: "개인별" })}
            title={`${p.org} · 미결 ${p.open}건`}
            className={clsx(
              "flex items-center gap-[8px] rounded-ctl px-[11px] py-[7px] text-cell leading-none text-on-dark-item transition-colors hover:bg-dark-hover",
              activePerson === p.assigneeName && "bg-dark-hover",
            )}
          >
            <SignalDot signal={p.worst} size={6} />
            <span className="flex-1 truncate">{p.assigneeName}</span>
            <span className="font-mono text-label leading-none text-on-dark-3">{p.open}</span>
          </Link>
        ))}
        {aggregates.people.length === 0 ? <EmptyHint>등록된 지시사항 없음</EmptyHint> : null}
      </div>

      <SectionLabel className="mt-[24px]">회의체별</SectionLabel>
      <div className="mt-[10px] flex flex-col gap-[1px]">
        {aggregates.meetings.map((m) => (
          <Link
            key={m.name}
            href={todosHref({}, { meeting: m.name, tab: "회의체별" })}
            className={clsx(
              "flex items-center rounded-ctl px-[11px] py-[7px] text-cell leading-none text-on-dark-item transition-colors hover:bg-dark-hover",
              activeMeeting === m.name && "bg-dark-hover",
            )}
          >
            <span className="flex-1 truncate">{m.name}</span>
            <span className="font-mono text-label leading-none text-on-dark-3">{m.count}</span>
          </Link>
        ))}
        {aggregates.meetings.length === 0 ? <EmptyHint>등록된 회의체 없음</EmptyHint> : null}
      </div>

      <div className="mt-[28px] rounded-ctl border border-dark-border p-[12px]">
        <div className="font-mono text-mono-label leading-none font-semibold tracking-[0.1em] text-on-dark-label">
          담당 ASSISTANT
        </div>
        <p className="mt-[7px] text-cell leading-[1.4] text-on-dark-2">
          {settings.assistantName || (
            <Link href="/settings" className="underline decoration-dark-outline">
              설정에서 지정
            </Link>
          )}
        </p>
        {settings.assistantEmail ? (
          <p className="mt-[3px] truncate font-mono text-note leading-[1.4] text-on-dark-3">
            {settings.assistantEmail}
          </p>
        ) : null}
        <p className="mt-[9px] text-note leading-[1.6] text-on-dark-3">
          사원 명부는 임시 · 사내 인사정보 연동 예정
        </p>
      </div>
    </nav>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "font-mono text-mono-label leading-none font-semibold tracking-[0.1em] text-on-dark-label",
        className,
      )}
    >
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="px-[11px] py-[7px] text-label text-on-dark-label">{children}</p>;
}
