"use client";

/**
 * 필터 바 (README §3).
 * padding 16px 44px · 하단선 #eae4db · flex-wrap · gap 8px
 *
 * 필터 상태는 URL searchParams에만 산다. 현재 값은 서버 페이지가 prop으로 내려주므로
 * `useSearchParams`를 쓰지 않고, 따라서 별도 Suspense 경계가 필요 없다.
 */
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

import type { SignalCounts } from "@/lib/domain/aggregate";
import { SIGNALS, SIGNAL_LABELS, type Signal } from "@/lib/domain/todo";
import type { PersonOption } from "@/lib/repository/todo-repository";
import { SIGNAL_CHIP_OFF, SIGNAL_CHIP_ON, SIGNAL_DOT } from "@/lib/ui/signal";
import {
  STATUS_LABELS,
  todosHref,
  toStatus,
  type Patch,
  type TodoSearchParams,
} from "@/lib/ui/search-params";

const CONTROL =
  "flex items-center gap-[8px] rounded-ctl border border-line-field bg-card px-[10px] py-[7px] text-cell leading-none text-ink-field";

export function FilterBar({
  params,
  meetingBodies,
  people,
  categories,
  signalCounts,
}: {
  params: TodoSearchParams;
  meetingBodies: string[];
  people: PersonOption[];
  categories: readonly string[];
  signalCounts: SignalCounts;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (patch: Patch) => {
    startTransition(() => router.push(todosHref(params, patch)));
  };

  return (
    <div
      className={clsx(
        "flex flex-wrap items-center gap-[8px] border-b border-line-card px-[44px] py-[16px] transition-opacity",
        pending && "opacity-60",
      )}
    >
      <StatusControl
        value={toStatus(params)}
        onChange={(v) => go({ status: v === "open" ? null : v })}
      />

      <div className={CONTROL}>
        <span>지시일</span>
        <input
          type="date"
          aria-label="지시일 시작"
          value={params.from ?? ""}
          max={params.to || undefined}
          onChange={(e) => go({ from: e.target.value || null })}
          className="w-[122px] font-mono text-cell text-ink-3 outline-none"
        />
        <span className="text-ink-5">~</span>
        <input
          type="date"
          aria-label="지시일 종료"
          value={params.to ?? ""}
          min={params.from || undefined}
          onChange={(e) => go({ to: e.target.value || null })}
          className="w-[122px] font-mono text-cell text-ink-3 outline-none"
        />
      </div>

      <SelectControl
        label="회의체"
        value={params.meeting ?? ""}
        options={meetingBodies}
        onChange={(v) => go({ meeting: v || null })}
      />

      <SelectControl
        label="조직/이름"
        value={params.person ?? ""}
        options={people.map((p) => p.name)}
        renderOption={(name) => {
          const org = people.find((p) => p.name === name)?.org;
          return org ? `${org} · ${name}` : name;
        }}
        onChange={(v) => go({ person: v || null })}
      />

      <SelectControl
        label="구분"
        value={params.category ?? ""}
        options={[...categories]}
        onChange={(v) => go({ category: v || null })}
      />

      {SIGNALS.map((s) => {
        const on = params.signal === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => go({ signal: on ? null : s })}
            className={clsx(
              "flex cursor-pointer items-center gap-[5px] rounded-chip px-[10px] py-[6px] text-aux leading-none font-medium transition-colors",
              on ? SIGNAL_CHIP_ON[s] : SIGNAL_CHIP_OFF,
            )}
          >
            <span
              aria-hidden
              className={clsx("h-[7px] w-[7px] rounded-full", SIGNAL_DOT[s])}
            />
            {SIGNAL_LABELS[s]} {signalCounts[s as Signal]}
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() =>
          startTransition(() =>
            router.push(todosHref({}, { tab: params.tab ?? null })),
          )
        }
        className="cursor-pointer border-b border-line-field text-aux leading-none text-ink-3"
      >
        필터 초기화
      </button>
    </div>
  );
}

/**
 * 완료 여부. 기본값이 '미결'이라 아무것도 안 건드려도 항상 값이 보인다 —
 * 완료분이 왜 목록에 없는지 화면에서 바로 알 수 있어야 하기 때문이다.
 */
function StatusControl({
  value,
  onChange,
}: {
  value: "open" | "done" | "all";
  onChange: (value: "open" | "done" | "all") => void;
}) {
  return (
    <div className={clsx(CONTROL, "relative gap-[10px] pr-[24px]")}>
      <span className="shrink-0">상태:</span>
      <select
        aria-label="완료 여부"
        value={value}
        onChange={(e) => onChange(e.target.value as "open" | "done" | "all")}
        className="cursor-pointer bg-transparent text-cell text-ink-field outline-none"
      >
        {(["open", "done", "all"] as const).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-[8px] -translate-y-1/2 text-ink-5"
      />
    </div>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
  renderOption,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  renderOption?: (value: string) => string;
}) {
  return (
    <div className={clsx(CONTROL, "relative gap-[10px] pr-[24px]")}>
      <span className="shrink-0">{label}:</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent text-cell text-ink-field outline-none"
      >
        <option value="">전체</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {renderOption ? renderOption(o) : o}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-[8px] -translate-y-1/2 text-ink-5"
      />
    </div>
  );
}
