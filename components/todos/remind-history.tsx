/**
 * Remind 발송 이력 — 펼침 패널에서 진행 이력 아래에 붙는다.
 *
 * 뱃지는 "지금 어떤 상태인가"만 알려준다. 언제 누구에게 보냈는지,
 * 실패한 적이 있는지는 이 목록이 답한다.
 */
import clsx from "clsx";

import { toDateTime } from "@/lib/domain/date";
import type { RemindLog } from "@/lib/repository/todo-repository";

const STATUS_LABEL: Record<RemindLog["status"], string> = {
  sent: "발송 성공",
  failed: "발송 실패",
  queued: "발송 대기",
};

const STATUS_CLASS: Record<RemindLog["status"], string> = {
  sent: "bg-signal-g-bg text-signal-g-fg",
  failed: "bg-signal-r-bg text-signal-r-fg",
  queued: "bg-signal-y-bg text-signal-y-fg",
};

export function RemindHistory({ logs }: { logs: RemindLog[] }) {
  return (
    <div className="mt-[20px]">
      <div className="mb-[10px] flex items-baseline gap-[9px]">
        <h3 className="text-section leading-none font-semibold text-ink">Remind 발송 이력</h3>
        <span className="text-label text-ink-4">
          {logs.length > 0 ? `${logs.length}건 · 최신순` : "발송한 적 없음"}
        </span>
      </div>

      {logs.length > 0 ? (
        <ul className="flex max-w-[760px] flex-col gap-[1px]">
          {logs.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-[10px] border-b border-line-row py-[8px] last:border-b-0"
            >
              <span
                className={clsx(
                  "rounded-ctl px-[6px] py-[3px] text-note leading-none font-medium",
                  STATUS_CLASS[l.status],
                )}
              >
                {STATUS_LABEL[l.status]}
              </span>
              <span className="font-mono text-note leading-none text-ink-3">
                {toDateTime(l.sentAt ?? l.createdAt)}
              </span>
              <span className="truncate text-label text-ink-2">{l.recipient}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="max-w-[760px] text-label text-ink-4">
          아직 이 지시사항으로 발송한 Remind가 없습니다.
        </p>
      )}
    </div>
  );
}
