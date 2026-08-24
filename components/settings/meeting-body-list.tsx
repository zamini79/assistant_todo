"use client";

/**
 * 회의체 마스터 관리.
 *
 * 지시사항 등록 화면의 회의체 선택지가 여기서 나온다.
 * 등록 화면에서 '직접 입력'한 회의체도 저장 시점에 이 목록으로 자동 편입된다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Pencil, Plus, X } from "lucide-react";

import { deleteMeetingBodyAction, saveMeetingBodyAction } from "@/app/actions/settings";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import type { MeetingBody } from "@/lib/domain/settings";
import { Card, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

const FIELD =
  "w-full rounded-ctl border border-line-field bg-card px-[11px] py-[9px] text-cell text-ink outline-none transition-colors focus:border-line-hover";

type Editing = { id: string; name: string } | null;

export function MeetingBodyList({
  meetingBodies,
  usage,
}: {
  meetingBodies: MeetingBody[];
  /** 회의체별 등록된 지시사항 수 — 삭제 전 경고에 쓴다 */
  usage: Record<string, number>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<MeetingBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (formData: FormData) => {
    startTransition(async () => {
      const result = await saveMeetingBodyAction(IDLE_FORM_STATE, formData);
      if (result.status === "success") {
        toast(result.message);
        setEditing(null);
        setError(null);
      } else if (result.status === "error") {
        setError(result.message);
      }
    });
  };

  const remove = () => {
    if (!deleting) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("id", deleting.id);
      const result = await deleteMeetingBodyAction(IDLE_FORM_STATE, data);
      if (result.status !== "idle") {
        toast(result.message, result.status === "error" ? "danger" : "default");
      }
      setDeleting(null);
    });
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line-card px-[20px] py-[14px]">
          <span className="text-label text-ink-3">
            {meetingBodies.length > 0
              ? `${meetingBodies.length}개 등록됨`
              : "등록된 회의체 없음"}
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing({ id: "", name: "" });
              setError(null);
            }}
            className="flex cursor-pointer items-center gap-[5px] rounded-ctl bg-dark px-[13px] py-[8px] text-cell leading-none font-semibold text-on-dark transition-colors hover:bg-dark-hover"
          >
            <Plus size={13} />
            회의체 추가
          </button>
        </div>

        {meetingBodies.length === 0 ? (
          <EmptyState
            title="등록된 회의체가 없습니다."
            description="여기서 등록해 두면 지시사항 등록 화면에서 골라 쓸 수 있습니다. 등록 화면에서 직접 입력한 회의체도 자동으로 추가됩니다."
          />
        ) : (
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_120px_88px] items-center border-b border-line-card bg-surface-alt px-[20px] py-[10px] text-label leading-none font-semibold text-ink-3">
              <div>회의체</div>
              <div className="text-right">지시사항</div>
              <div className="text-right">관리</div>
            </div>
            {meetingBodies.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[minmax(0,1fr)_120px_88px] items-center border-b border-line-row px-[20px] py-[12px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="truncate text-body text-ink">{m.name}</div>
                <div className="text-right font-mono text-aux text-ink-3">
                  {usage[m.id] ?? 0}건
                </div>
                <div className="flex items-center justify-end gap-[8px]">
                  <button
                    type="button"
                    aria-label={`${m.name} 수정`}
                    onClick={() => {
                      setEditing({ id: m.id, name: m.name });
                      setError(null);
                    }}
                    className="cursor-pointer text-ink-4 transition-colors hover:text-dark"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${m.name} 삭제`}
                    onClick={() => setDeleting(m)}
                    className="cursor-pointer text-label text-ink-4 transition-colors hover:text-danger-fg"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[rgba(42,35,28,.45)] px-5 py-[48px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <form
            action={save}
            role="dialog"
            aria-modal="true"
            aria-label={editing.id ? "회의체 수정" : "회의체 추가"}
            className="w-[460px] overflow-hidden rounded-modal bg-card shadow-modal"
          >
            <input type="hidden" name="id" value={editing.id} />
            <div className="flex items-center justify-between border-b border-line-card px-[24px] py-[18px]">
              <h2 className="text-modal font-semibold text-ink">
                {editing.id ? "회의체 수정" : "회의체 추가"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="닫기"
                className="cursor-pointer p-[4px] text-ink-4 hover:text-ink-2"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex flex-col gap-[12px] px-[24px] py-[20px]">
              <div>
                <label
                  className="mb-[6px] block text-label font-medium leading-none text-ink-3"
                  htmlFor="meeting-body-name"
                >
                  회의체 이름
                </label>
                <input
                  id="meeting-body-name"
                  name="name"
                  type="text"
                  required
                  autoFocus
                  defaultValue={editing.name}
                  placeholder="예) 주간 경영회의"
                  autoComplete="off"
                  className={FIELD}
                />
              </div>

              {editing.id ? (
                <p className="text-note leading-[1.6] text-ink-4">
                  이름을 바꾸면 이 회의체로 등록된 지시사항 {usage[editing.id] ?? 0}건의 표기도
                  함께 바뀝니다.
                </p>
              ) : null}

              {error ? (
                <p role="alert" className="text-note leading-[1.6] text-danger-fg">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex gap-[8px] border-t border-line-card bg-surface-alt px-[24px] py-[14px]">
              <button
                type="submit"
                disabled={pending}
                className={clsx(
                  "rounded-ctl bg-dark px-[20px] py-[10px] text-cell leading-none font-semibold text-on-dark",
                  "enabled:cursor-pointer enabled:hover:bg-dark-hover disabled:opacity-60",
                )}
              >
                {pending ? "저장 중…" : "저장"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="cursor-pointer rounded-ctl border border-line-field px-[16px] py-[10px] text-cell leading-none text-ink-3 hover:border-line-hover"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        pending={pending}
        title="이 회의체를 삭제할까요?"
        description={
          deleting
            ? deleting.name +
              (usage[deleting.id]
                ? `\n지시사항 ${usage[deleting.id]}건이 이 회의체로 등록돼 있습니다. 기록은 그대로 두고 등록 화면의 선택지에서만 빠집니다.`
                : "")
            : undefined
        }
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  );
}
