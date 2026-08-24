"use client";

/**
 * 주간 리포트 메일 발송.
 *
 * 사장님·경영진에게 나가는 메일이라 되돌릴 수 없다.
 * 받는 사람을 명시적으로 고르게 하고, 무엇이 실리는지 요약을 보여준 뒤 보낸다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Mail, X } from "lucide-react";

import { sendWeeklyReportAction } from "@/app/actions/report";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import { recipientLabel, type Recipient } from "@/lib/domain/settings";
import { useToast } from "@/components/ui/toast";

export function SendReportButton({
  recipients,
  mailConfigured,
  baseDate,
  summary,
}: {
  /** 설정의 수신자 마스터 */
  recipients: Recipient[];
  mailConfigured: boolean;
  /** 화면이 보고 있는 주. 서버가 오늘로 다시 계산하지 않도록 그대로 넘긴다. */
  baseDate: string;
  /** 발송 전에 보여줄 한 줄 요약 */
  summary: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const blocked = !mailConfigured
    ? "SMTP 환경변수가 설정되지 않았습니다."
    : recipients.length === 0
      ? "설정 → 메일 수신자에서 받는 사람을 먼저 등록하세요."
      : undefined;

  const send = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("recipientIds", picked.join(","));
      data.set("baseDate", baseDate);
      const result = await sendWeeklyReportAction(IDLE_FORM_STATE, data);
      if (result.status === "success") {
        toast(result.message);
        setOpen(false);
        setPicked([]);
      } else if (result.status === "error") {
        toast(result.message, "danger");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={Boolean(blocked)}
        title={blocked ?? "주간 리포트를 메일로 보냅니다"}
        className={clsx(
          "flex items-center gap-[6px] rounded-ctl bg-dark px-[15px] py-[9px] text-cell leading-none font-semibold text-on-dark transition-colors",
          "enabled:cursor-pointer enabled:hover:bg-dark-hover disabled:opacity-50",
        )}
      >
        <Mail size={13} />
        메일 발송
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-[rgba(42,35,28,.45)] px-5 py-[64px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="주간 리포트 발송"
            className="w-[520px] overflow-hidden rounded-modal bg-card shadow-modal"
          >
            <div className="flex items-center justify-between border-b border-line-card px-[24px] py-[18px]">
              <h2 className="text-modal font-semibold text-ink">주간 리포트 발송</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="cursor-pointer p-[4px] text-ink-4 hover:text-ink-2"
              >
                <X size={17} />
              </button>
            </div>

            <div className="px-[24px] py-[20px]">
              <p className="rounded-ctl bg-surface-alt px-[12px] py-[10px] text-label leading-[1.7] text-ink-3">
                {summary}
              </p>

              <p className="mt-[16px] mb-[8px] text-label font-medium leading-none text-ink-3">
                받는 사람{" "}
                <span className="font-normal text-ink-5">
                  (전략 Assistant는 참조로 함께 받습니다)
                </span>
              </p>
              <div className="flex flex-wrap gap-[6px]">
                {recipients.map((r) => {
                  const on = picked.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      title={r.email}
                      onClick={() =>
                        setPicked((prev) =>
                          prev.includes(r.id)
                            ? prev.filter((id) => id !== r.id)
                            : [...prev, r.id],
                        )
                      }
                      className={clsx(
                        "cursor-pointer rounded-chip border px-[11px] py-[7px] text-note leading-none font-medium transition-colors",
                        on
                          ? "border-dark bg-dark text-on-dark"
                          : "border-line-field bg-card text-ink-2 hover:border-line-hover",
                      )}
                    >
                      {recipientLabel(r)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-[8px] border-t border-line-card bg-surface-alt px-[24px] py-[14px]">
              <button
                type="button"
                onClick={send}
                disabled={pending || picked.length === 0}
                className={clsx(
                  "rounded-ctl bg-dark px-[20px] py-[10px] text-cell leading-none font-semibold text-on-dark",
                  "enabled:cursor-pointer enabled:hover:bg-dark-hover disabled:opacity-50",
                )}
              >
                {pending
                  ? "발송 중…"
                  : picked.length > 0
                    ? `${picked.length}명에게 발송`
                    : "발송"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-ctl border border-line-field px-[16px] py-[10px] text-cell leading-none text-ink-3 hover:border-line-hover"
              >
                취소
              </button>
              {picked.length === 0 ? (
                <span className="text-note text-ink-5">받는 사람을 골라 주세요</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
