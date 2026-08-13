import Link from "next/link";
import clsx from "clsx";

import type { RemindStatus, Signal } from "@/lib/domain/todo";
import { REMIND_LABELS } from "@/lib/domain/todo";
import { REMIND_BADGE, SIGNAL_DOT } from "@/lib/ui/signal";

/** 신호등 점. README: 6px(사이드바) / 7px(카드·칩) / 9px(표) / radius 50% */
export function SignalDot({
  signal,
  size = 7,
  className,
}: {
  signal: Signal;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx("block shrink-0 rounded-full", SIGNAL_DOT[signal], className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Remind 상태 뱃지 */
export function RemindBadge({ status }: { status: RemindStatus }) {
  return (
    <span
      className={clsx(
        "inline-block rounded-ctl px-[7px] py-[5px] text-note leading-none font-medium",
        REMIND_BADGE[status],
      )}
    >
      {REMIND_LABELS[status]}
    </span>
  );
}

/** 지시사항 구분 뱃지 */
export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-block rounded-ctl bg-surface px-[7px] py-[4px] text-note leading-none font-medium text-ink-2">
      {category}
    </span>
  );
}

/** 다크 배경의 주 버튼 — [+ 지시사항 등록], [저장] */
const PRIMARY =
  "inline-flex items-center justify-center rounded-ctl bg-dark font-semibold text-on-dark transition-colors hover:bg-dark-hover disabled:opacity-60";

/** 흰 배경 + 보더의 보조 버튼 — [주간 리포트], [Excel 다운로드], [취소] */
const OUTLINE =
  "inline-flex items-center justify-center rounded-ctl border border-line-field bg-card text-ink-field transition-colors hover:border-line-hover disabled:opacity-60";

export function PrimaryButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return <button type="button" {...props} className={clsx(PRIMARY, className)} />;
}

export function OutlineButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return <button type="button" {...props} className={clsx(OUTLINE, className)} />;
}

export function PrimaryLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return <Link {...props} className={clsx(PRIMARY, className)} />;
}

export function OutlineLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return <Link {...props} className={clsx(OUTLINE, className)} />;
}

/** 섹션 제목 + 보조 문구 */
export function SectionHeading({
  title,
  hint,
  className,
}: {
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-baseline gap-[9px]", className)}>
      <h2 className="text-section font-semibold text-ink">{title}</h2>
      {hint ? <span className="text-label text-ink-4">{hint}</span> : null}
    </div>
  );
}

/** 흰 카드 — README: #fff, 1px solid #eae4db, radius 4px */
export function Card({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={clsx("rounded-card border border-line-card bg-card", className)}
    />
  );
}

/**
 * 결과 0건 안내. 프로토타입에는 없던 상태로, README "구현 시 추가로 필요한 것"에 해당한다.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-[10px] px-6 py-[56px] text-center">
      <p className="text-body font-medium text-ink-3">{title}</p>
      {description ? <p className="text-label text-ink-4">{description}</p> : null}
      {action ? <div className="mt-[6px]">{action}</div> : null}
    </div>
  );
}
