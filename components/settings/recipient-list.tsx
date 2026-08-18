"use client";

/**
 * 메일 수신자 마스터 관리.
 *
 * 지시사항마다 받는 사람이 다르므로 여기서 목록을 관리하고,
 * 등록/수정 모달에서 건별로 골라 붙인다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Pencil, Plus, X } from "lucide-react";

import { deleteRecipientAction, saveRecipientAction } from "@/app/actions/settings";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import type { Recipient } from "@/lib/domain/settings";
import { Card, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

const FIELD =
  "w-full rounded-ctl border border-line-field bg-card px-[11px] py-[9px] text-cell text-ink outline-none transition-colors focus:border-line-hover";

type Editing = { id: string; name: string; email: string; org: string } | null;

const BLANK = { id: "", name: "", email: "", org: "" };

export function RecipientList({
  recipients,
  usage,
}: {
  recipients: Recipient[];
  /** 수신자별 연결된 지시사항 수 — 삭제 전 경고에 쓴다 */
  usage: Record<string, number>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Recipient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (formData: FormData) => {
    startTransition(async () => {
      const result = await saveRecipientAction(IDLE_FORM_STATE, formData);
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
      const result = await deleteRecipientAction(IDLE_FORM_STATE, data);
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
            {recipients.length > 0 ? `${recipients.length}명 등록됨` : "등록된 수신자 없음"}
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing({ ...BLANK });
              setError(null);
            }}
            className="flex cursor-pointer items-center gap-[5px] rounded-ctl bg-dark px-[13px] py-[8px] text-cell leading-none font-semibold text-on-dark transition-colors hover:bg-dark-hover"
          >
            <Plus size={13} />
            수신자 추가
          </button>
        </div>

        {recipients.length === 0 ? (
          <EmptyState
            title="등록된 수신자가 없습니다."
            description="자주 메일을 받는 담당자를 등록해 두면 지시사항마다 골라 넣을 수 있습니다."
          />
        ) : (
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_140px_88px] items-center border-b border-line-card bg-surface-alt px-[20px] py-[10px] text-label leading-none font-semibold text-ink-3">
              <div>이름</div>
              <div>이메일</div>
              <div>조직</div>
              <div className="text-right">관리</div>
            </div>
            {recipients.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_140px_88px] items-center border-b border-line-row px-[20px] py-[12px] last:border-b-0 hover:bg-surface-alt"
              >
                <div className="truncate text-body text-ink">{r.name}</div>
                <div className="truncate text-aux text-ink-2">{r.email}</div>
                <div className="truncate text-aux text-ink-3">{r.org || "—"}</div>
                <div className="flex items-center justify-end gap-[8px]">
                  <button
                    type="button"
                    aria-label={`${r.name} 수정`}
                    onClick={() => {
                      setEditing({ id: r.id, name: r.name, email: r.email, org: r.org });
                      setError(null);
                    }}
                    className="cursor-pointer text-ink-4 transition-colors hover:text-dark"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${r.name} 삭제`}
                    onClick={() => setDeleting(r)}
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
            aria-label={editing.id ? "수신자 수정" : "수신자 추가"}
            className="w-[520px] overflow-hidden rounded-modal bg-card shadow-modal"
          >
            <input type="hidden" name="id" value={editing.id} />
            <div className="flex items-center justify-between border-b border-line-card px-[24px] py-[18px]">
              <h2 className="text-modal font-semibold text-ink">
                {editing.id ? "수신자 수정" : "수신자 추가"}
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
              {(
                [
                  ["name", "이름", "예) 박현수 본부장", true],
                  ["email", "이메일", "예) park@company.com", true],
                  ["org", "조직", "예) 영업본부", false],
                ] as const
              ).map(([key, label, placeholder, required]) => (
                <div key={key}>
                  <label
                    className="mb-[6px] block text-label font-medium leading-none text-ink-3"
                    htmlFor={`recipient-${key}`}
                  >
                    {label}
                    {!required ? <span className="font-normal text-ink-5"> (선택)</span> : null}
                  </label>
                  <input
                    id={`recipient-${key}`}
                    name={key}
                    type={key === "email" ? "email" : "text"}
                    required={required}
                    defaultValue={editing[key]}
                    placeholder={placeholder}
                    autoComplete="off"
                    className={FIELD}
                  />
                </div>
              ))}

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
        title="이 수신자를 삭제할까요?"
        description={
          deleting
            ? `${deleting.name} · ${deleting.email}` +
              (usage[deleting.id]
                ? `\n지시사항 ${usage[deleting.id]}건에서 수신자로 지정돼 있습니다. 함께 해제됩니다.`
                : "")
            : undefined
        }
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  );
}
